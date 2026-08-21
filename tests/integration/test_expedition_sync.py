from datetime import date, datetime, timezone

from sqlalchemy import select

from ktown_defense.expedition_sync import TourismExpeditionSyncService
from ktown_defense.infrastructure.models import OpenApiCallLogModel, PlaceModel
from ktown_defense.ktour_expedition import TourismExpeditionSnapshot, TourismPlaceDetail
from ktown_defense.open_data_observability import OpenApiCallObservation


NOW = datetime(2026, 8, 22, 3, 0, tzinfo=timezone.utc)
OPERATIONS = {
    "areaBasedSyncList2",
    "areaBasedList2",
    "searchKeyword2",
    "locationBasedList2",
    "detailCommon2",
    "detailIntro2",
    "detailInfo2",
    "detailImage2",
    "searchFestival2",
}


def tourism_place(name: str = "감천문화마을") -> TourismPlaceDetail:
    return TourismPlaceDetail(
        content_id="101",
        content_type_id="12",
        name_ko=name,
        address_ko="부산광역시 사하구",
        latitude=35.0975,
        longitude=129.0106,
        region_code="6",
        category_code="A02030600",
        description_ko="부산 산복도로의 문화마을",
        image_url="https://images.example/101.jpg",
        homepage_url="https://example.com/101",
        telephone="051-000-0000",
        open_time="09:00~18:00",
        rest_date="연중무휴",
        parking="공영주차장",
        intro={"usetime": "09:00~18:00"},
        info=({"infoname": "체험", "infotext": "골목 투어"},),
        image_urls=("https://images.example/101.jpg",),
        festival_start_date=date(2026, 8, 20),
        festival_end_date=date(2026, 8, 25),
        discovery_keywords=("BTS",),
        source_operations=tuple(sorted(OPERATIONS)),
        source_modified_at=NOW,
    )


def observations(status: str = "succeeded") -> tuple[OpenApiCallObservation, ...]:
    return tuple(
        OpenApiCallObservation(
            operation=operation,
            feature="competition_feature",
            status=status,
            response_count=1 if status == "succeeded" else 0,
            error_code=None if status == "succeeded" else "UPSTREAM_UNAVAILABLE",
            started_at=NOW,
            completed_at=NOW,
        )
        for operation in sorted(OPERATIONS)
    )


class FakeExpeditionClient:
    def __init__(self, results):
        self.results = list(results)
        self.observations: tuple[OpenApiCallObservation, ...] = ()

    def fetch_snapshot(self, **kwargs) -> TourismExpeditionSnapshot:
        result = self.results.pop(0)
        if isinstance(result, Exception):
            self.observations = observations("failed")
            raise result
        self.observations = result.observations
        return result


async def test_sync_publishes_enrichment_and_call_evidence(session_factory) -> None:
    snapshot = TourismExpeditionSnapshot(
        places=(tourism_place(),),
        observations=observations(),
        changed_content_ids=("101",),
    )
    service = TourismExpeditionSyncService(
        session_factory, FakeExpeditionClient([snapshot]), clock=lambda: NOW
    )

    result = await service.sync(
        area_code="6",
        keywords=("BTS", "K-POP"),
        start_date=date(2026, 8, 22),
        end_date=date(2026, 9, 21),
        limit=100,
    )

    async with session_factory() as session:
        place = await session.scalar(
            select(PlaceModel).where(PlaceModel.content_id == "101")
        )
        logs = list(
            (
                await session.scalars(
                    select(OpenApiCallLogModel).where(
                        OpenApiCallLogModel.sync_run_id == result.run_id
                    )
                )
            ).all()
        )
    assert result.status == "succeeded"
    assert place is not None
    assert place.discovery_keywords == ["BTS"]
    assert place.image_urls == ["https://images.example/101.jpg"]
    assert place.info_json == [{"infoname": "체험", "infotext": "골목 투어"}]
    assert set(place.source_operations) == OPERATIONS
    assert {log.operation for log in logs} == OPERATIONS
    assert all(log.status == "succeeded" for log in logs)


async def test_sync_reuses_place_id_and_failure_preserves_last_good(session_factory) -> None:
    first = TourismExpeditionSnapshot(
        places=(tourism_place(),), observations=observations(), changed_content_ids=("101",)
    )
    second = TourismExpeditionSnapshot(
        places=(tourism_place("수정된 감천문화마을"),),
        observations=observations(),
        changed_content_ids=("101",),
    )
    client = FakeExpeditionClient([first, second, RuntimeError("secret request URL")])
    service = TourismExpeditionSyncService(session_factory, client, clock=lambda: NOW)
    await service.sync(
        area_code="6", keywords=("BTS",), start_date=date(2026, 8, 22),
        end_date=date(2026, 9, 21), limit=100,
    )
    async with session_factory() as session:
        original = await session.scalar(select(PlaceModel).where(PlaceModel.content_id == "101"))
        assert original is not None
        original_id = original.id
    await service.sync(
        area_code="6", keywords=("BTS",), start_date=date(2026, 8, 22),
        end_date=date(2026, 9, 21), limit=100,
    )
    failed = await service.sync(
        area_code="6", keywords=("BTS",), start_date=date(2026, 8, 22),
        end_date=date(2026, 9, 21), limit=100,
    )

    async with session_factory() as session:
        place = await session.scalar(select(PlaceModel).where(PlaceModel.content_id == "101"))
        failed_logs = list(
            (await session.scalars(select(OpenApiCallLogModel).where(
                OpenApiCallLogModel.sync_run_id == failed.run_id
            ))).all()
        )
    assert failed.status == "failed"
    assert place is not None and place.id == original_id
    assert place.name_ko == "수정된 감천문화마을"
    assert place.is_active is True
    assert {log.error_code for log in failed_logs} == {"UPSTREAM_UNAVAILABLE"}
    assert "secret" not in repr(failed_logs)

