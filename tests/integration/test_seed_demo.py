from sqlalchemy import func, select

from ktown_defense.infrastructure.models import PlaceModel
from ktown_defense.seed_demo import seed_demo_places


async def test_demo_place_seed_is_idempotent(session_factory) -> None:
    await seed_demo_places(session_factory)
    await seed_demo_places(session_factory)

    async with session_factory() as session:
        count = await session.scalar(select(func.count(PlaceModel.id)))
        place = await session.scalar(
            select(PlaceModel).where(PlaceModel.content_id == "demo-busan-gamcheon")
        )

    assert count == 3
    assert place is not None
    assert place.name_ko == "감천문화마을"
    assert place.is_public is True
    async with session_factory() as session:
        anchors = (
            await session.scalars(
                select(PlaceModel)
                .where(PlaceModel.content_id.like("operator:%"))
                .order_by(PlaceModel.content_id)
            )
        ).all()
    assert {item.content_id for item in anchors} == {
        "operator:bts-busan-asiad", "operator:busan-gamcheon"
    }
    assert all(item.source_operations == ["operator_verified_anchor"] for item in anchors)
