"""Upsert a user's profile from a verified social-login provider.

The caller (the Next.js gateway, never the browser) has already exchanged an
OAuth code and verified the provider profile before reaching this use case;
this module only persists the result under the same opaque
``platform_subject`` identity every other route already trusts.
"""

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .infrastructure.models import UserModel


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class SocialProfileApplication:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def upsert(
        self,
        platform_subject: str,
        *,
        display_name: str | None,
        avatar_url: str | None,
    ) -> UserModel:
        user = await self._session.scalar(
            select(UserModel).where(UserModel.platform_subject == platform_subject)
        )
        if user is None:
            user = UserModel(
                id=uuid4(),
                platform_subject=platform_subject,
                display_name=display_name,
                avatar_url=avatar_url,
                created_at=utc_now(),
            )
            self._session.add(user)
        else:
            if display_name is not None:
                user.display_name = display_name
            if avatar_url is not None:
                user.avatar_url = avatar_url

        await self._session.commit()
        await self._session.refresh(user)
        return user
