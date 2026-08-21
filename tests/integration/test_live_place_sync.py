from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4

from sqlalchemy import select

from ktown_defense.infrastructure.models import CatalogSyncRunModel, PlaceModel
from ktown_defense.ktour_area import KTourAreaPlace
from ktown_defense.place_sync import KTourPlaceSyncService


def area_place(content_id: str, name: str) -> KTourAreaPlace:
    return KTourAreaPlace(
        content_id=content_id,
        name_ko=name,
        address_ko="부산광역시 중구",
        latitude=35.1,
        longitude=129.0,
        region_code="6",
        content_type_id="12",
        category_code="A01010100",
        description_ko="공식 설명",
        image_url="https://images.example/place.jpg",
        source_modified_at=datetime(2026, 8, 21, 9, tzinfo=timezone.utc),
    )


class FakeAreaClient:
    def __init__(self, snapshots):
        self.snapshots = list(snapshots)

    def fetch_places(self, *, area_code: str, limit: int):
        result = self.snapshots.pop(0)
        if isinstance(result, Exception):
            raise result
        return result


async def test_sync_upserts_reuses_ids_and_deactivates_only_missing_ktour_rows(
    session_factory,
) -> None:
    operator = PlaceModel(
        id=uuid4(),
        content_id="operator-1",
        name_ko="운영 장소",
        address_ko="부산",
        latitude=Decimal("35.1"),
        longitude=Decimal("129.0"),
        region_code="6",
        description_ko="운영 설명",
        source="operator",
        is_public=True,
        is_active=True,
    )
    async with session_factory() as session:
        session.add(operator)
        await session.commit()

    client = FakeAreaClient(
        [
            (area_place("101", "첫 장소"), area_place("102", "둘째 장소")),
            (area_place("101", "수정된 첫 장소"),),
        ]
    )
    service = KTourPlaceSyncService(session_factory, client)

    first = await service.sync("6", 100)
    async with session_factory() as session:
        original_id = (
            await session.scalar(select(PlaceModel).where(PlaceModel.content_id == "101"))
        ).id
    second = await service.sync("6", 100)

    async with session_factory() as session:
        rows = list((await session.scalars(select(PlaceModel))).all())
    by_content = {row.content_id: row for row in rows}
    assert first.status == second.status == "succeeded"
    assert by_content["101"].id == original_id
    assert by_content["101"].name_ko == "수정된 첫 장소"
    assert by_content["102"].is_active is False
    assert by_content["operator-1"].is_active is True


async def test_failed_sync_records_failure_without_mutating_last_good(session_factory) -> None:
    service = KTourPlaceSyncService(
        session_factory,
        FakeAreaClient([(area_place("101", "첫 장소"),), RuntimeError("secret URL")]),
    )
    await service.sync("6", 100)

    result = await service.sync("6", 100)

    async with session_factory() as session:
        place = await session.scalar(select(PlaceModel).where(PlaceModel.content_id == "101"))
        run = await session.get(CatalogSyncRunModel, result.run_id)
    assert result.status == "failed"
    assert place is not None and place.is_active is True
    assert run is not None and run.error_code == "TOUR_API_FAILED"
    assert "secret" not in (run.error_code or "")
