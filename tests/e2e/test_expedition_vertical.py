from datetime import date, datetime, timezone
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from ktown_defense.infrastructure.models import CheckInSessionModel


NOW = datetime(2026, 8, 22, 3, 0, tzinfo=timezone.utc)


async def test_recommended_open_data_place_starts_a_persisted_checkin(
    member_client,
    place_factory,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    anchor = await place_factory(
        source="KTOUR_API",
        content_id="tourapi-anchor",
        name_ko="감천문화마을",
        content_type_id="12",
        discovery_keywords=["BTS"],
        source_operations=["searchKeyword2", "detailCommon2"],
        synced_at=NOW,
    )
    await place_factory(
        source="KTOUR_API",
        content_id="tourapi-food",
        name_ko="부산 로컬 식당",
        content_type_id="39",
        latitude=35.0980,
        longitude=129.0110,
        synced_at=NOW,
    )
    await place_factory(
        source="KTOUR_API",
        content_id="tourapi-festival",
        name_ko="부산 여름 축제",
        content_type_id="15",
        latitude=35.0990,
        longitude=129.0120,
        festival_start_date=date(2026, 8, 20),
        festival_end_date=date(2026, 8, 25),
        synced_at=NOW,
    )

    recommended = await member_client.get(
        "/api/v1/expeditions/recommended",
        params={
            "regionCode": "6",
            "keyword": "BTS",
            "travelDate": "2026-08-22",
            "limit": 3,
        },
    )
    assert recommended.status_code == 200
    selected_place_id = recommended.json()["stops"][0]["place"]["id"]
    assert selected_place_id == str(anchor.id)

    created = await member_client.post(
        "/api/v1/checkins",
        json={"placeId": selected_place_id},
    )
    assert created.status_code == 201
    assert created.json()["status"] == "collecting"

    async with session_factory() as session:
        persisted = await session.get(CheckInSessionModel, UUID(created.json()["id"]))
        assert persisted is not None
        assert str(persisted.place_id) == selected_place_id
        assert persisted.status == "collecting"
