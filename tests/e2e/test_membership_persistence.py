from sqlalchemy import select

from ktown_defense.infrastructure.models import SeasonMembershipModel, UserModel


async def test_membership_selection_creates_one_user_and_one_membership(
    member_client, session_factory
) -> None:
    response = await member_client.put(
        "/api/v1/me/season-membership",
        json={"fandomId": "10000000-0000-4000-8000-000000000001"},
    )

    assert response.status_code == 200
    async with session_factory() as session:
        users = list((await session.scalars(select(UserModel))).all())
        memberships = list(
            (await session.scalars(select(SeasonMembershipModel))).all()
        )
    assert [user.platform_subject for user in users] == ["member-1"]
    assert len(memberships) == 1
    assert str(memberships[0].user_id) == response.json()["userId"]
