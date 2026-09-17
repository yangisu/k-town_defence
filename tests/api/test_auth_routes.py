async def test_social_upsert_creates_a_user_on_first_login(api_client) -> None:
    response = await api_client.post(
        "/api/v1/auth/social/upsert",
        json={
            "platformSubject": "kakao:1234",
            "displayName": "아미",
            "avatarUrl": "https://example.com/avatar.png",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["platformSubject"] == "kakao:1234"
    assert body["displayName"] == "아미"
    assert body["avatarUrl"] == "https://example.com/avatar.png"
    assert body["userId"]


async def test_social_upsert_is_idempotent_and_refreshes_the_profile(api_client) -> None:
    first = await api_client.post(
        "/api/v1/auth/social/upsert",
        json={"platformSubject": "kakao:5678", "displayName": "예전닉네임"},
    )
    second = await api_client.post(
        "/api/v1/auth/social/upsert",
        json={"platformSubject": "kakao:5678", "displayName": "새닉네임"},
    )

    assert first.status_code == second.status_code == 200
    assert first.json()["userId"] == second.json()["userId"]
    assert second.json()["displayName"] == "새닉네임"


async def test_social_upsert_rejects_a_blank_subject(api_client) -> None:
    response = await api_client.post(
        "/api/v1/auth/social/upsert", json={"platformSubject": "   "}
    )

    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_ERROR"
