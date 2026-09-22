ARMY_ID = "10000000-0000-4000-8000-000000000001"
BLINK_ID = "10000000-0000-4000-8000-000000000002"


async def test_membership_routes_require_a_trusted_identity(api_client) -> None:
    response = await api_client.get("/api/v1/me/season-membership")

    assert response.status_code == 401
    assert response.json()["code"] == "AUTHENTICATION_REQUIRED"


async def test_active_fandoms_are_listed_for_selection(api_client) -> None:
    response = await api_client.get("/api/v1/fandoms")

    assert response.status_code == 200
    items = response.json()["items"]
    assert items[:3] == [
        {"id": ARMY_ID, "name": "ARMY", "artistName": "방탄소년단"},
        {"id": BLINK_ID, "name": "BLINK", "artistName": "BLACKPINK"},
        {
            "id": "10000000-0000-4000-8000-000000000003",
            "name": "CARAT",
            "artistName": "SEVENTEEN",
        },
    ]
    # Every artist the web roster offers has to appear here by name: the app
    # matches an artist to a fandom on this name, and one that is missing is an
    # artist a member can pick but never actually join.
    assert [item["name"] for item in items] == [
        "ARMY", "BLINK", "CARAT", "REMINE", "COER", "MELODY", "DIVE", "TiiiKiii",
        "BRIIZE", "ZEROSE", "ONEDOOR", "FEARNOT", "MY", "Bunnies", "UAENA",
    ]


async def test_member_can_select_once_and_read_the_persisted_membership(
    member_client,
) -> None:
    empty = await member_client.get("/api/v1/me/season-membership")
    selected = await member_client.put(
        "/api/v1/me/season-membership", json={"fandomId": ARMY_ID}
    )
    repeated = await member_client.put(
        "/api/v1/me/season-membership", json={"fandomId": ARMY_ID}
    )
    restored = await member_client.get("/api/v1/me/season-membership")

    assert empty.status_code == 200
    assert empty.json() is None
    assert selected.status_code == repeated.status_code == restored.status_code == 200
    assert repeated.json() == selected.json() == restored.json()
    assert selected.json()["userId"]
    assert selected.json()["seasonId"] == "20000000-0000-4000-8000-000000000001"
    assert selected.json()["fandomId"] == ARMY_ID
    assert selected.json()["lockedAt"] is not None


async def test_member_can_change_to_a_different_fandom(member_client) -> None:
    await member_client.put(
        "/api/v1/me/season-membership", json={"fandomId": ARMY_ID}
    )

    response = await member_client.put(
        "/api/v1/me/season-membership", json={"fandomId": BLINK_ID}
    )

    assert response.status_code == 200
    assert response.json()["fandomId"] == BLINK_ID


async def test_unknown_fandom_is_rejected(member_client) -> None:
    response = await member_client.put(
        "/api/v1/me/season-membership",
        json={"fandomId": "90000000-0000-4000-8000-000000000009"},
    )

    assert response.status_code == 404
    assert response.json()["code"] == "FANDOM_NOT_FOUND"


async def test_member_can_name_an_artist_the_catalog_does_not_carry(
    member_client, session_factory
) -> None:
    from sqlalchemy import text

    created = await member_client.post(
        "/api/v1/fandoms", json={"name": "MOONLIGHT", "artistName": "달빛소년단"}
    )
    try:
        assert created.status_code == 201
        body = created.json()
        assert body["name"] == "MOONLIGHT"
        assert body["artistName"] == "달빛소년단"

        # It is listed like any other, so it can be joined straight away.
        listed = await member_client.get("/api/v1/fandoms")
        assert "MOONLIGHT" in [item["name"] for item in listed.json()["items"]]

        joined = await member_client.put(
            "/api/v1/me/season-membership", json={"fandomId": body["id"]}
        )
        assert joined.status_code == 200
        assert joined.json()["fandomId"] == body["id"]

        duplicate = await member_client.post(
            "/api/v1/fandoms", json={"name": "MOONLIGHT", "artistName": "달빛소년단"}
        )
        assert duplicate.status_code == 409
        assert duplicate.json()["code"] == "FANDOM_ALREADY_EXISTS"
    finally:
        # The seeded catalog is shared across tests and never truncated.
        async with session_factory() as session:
            await session.execute(
                text("DELETE FROM season_memberships WHERE fandom_id = :id"),
                {"id": created.json()["id"]},
            )
            await session.execute(
                text("DELETE FROM fandoms WHERE name_ko = 'MOONLIGHT'")
            )
            await session.commit()


async def test_naming_an_artist_requires_an_identity(api_client) -> None:
    response = await api_client.post(
        "/api/v1/fandoms", json={"name": "NOBODY", "artistName": "익명"}
    )

    assert response.status_code == 401
    assert response.json()["code"] == "AUTHENTICATION_REQUIRED"


async def test_leaving_the_season_puts_the_fandom_choice_back(member_client) -> None:
    await member_client.put(
        "/api/v1/me/season-membership", json={"fandomId": ARMY_ID}
    )

    left = await member_client.delete("/api/v1/me/season-membership")
    after = await member_client.get("/api/v1/me/season-membership")

    assert left.status_code == 204
    assert after.status_code == 200
    assert after.json() is None
    # Leaving twice is the same as leaving once.
    assert (await member_client.delete("/api/v1/me/season-membership")).status_code == 204
