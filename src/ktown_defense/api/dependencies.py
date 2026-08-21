"""Request-scoped dependencies."""

from collections.abc import AsyncIterator

from fastapi import Header, Request
from sqlalchemy.ext.asyncio import AsyncSession


async def get_session(request: Request) -> AsyncIterator[AsyncSession]:
    async with request.app.state.session_factory() as session:
        yield session


async def get_user_id(
    user_id: str | None = Header(default=None, alias="X-KTown-User-Id"),
) -> str:
    from .errors import ApiError

    if user_id is None or not user_id.strip() or len(user_id) > 200:
        raise ApiError(401, "IDENTITY_REQUIRED", "사용자 인증이 필요합니다.")
    return user_id.strip()
