"""Persistent fandom membership use cases."""

from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .api.errors import ApiError
from .infrastructure.models import (
    FandomModel,
    SeasonMembershipModel,
    SeasonModel,
    UserModel,
)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class MembershipApplication:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_fandoms(self) -> list[FandomModel]:
        result = await self._session.scalars(
            select(FandomModel)
            .where(FandomModel.is_active.is_(True))
            .order_by(FandomModel.id)
        )
        return list(result.all())

    async def get_current(self, platform_subject: str) -> SeasonMembershipModel | None:
        season = await self._current_season()
        user_id = await self._session.scalar(
            select(UserModel.id).where(UserModel.platform_subject == platform_subject)
        )
        if user_id is None:
            return None
        return await self._session.scalar(
            select(SeasonMembershipModel).where(
                SeasonMembershipModel.user_id == user_id,
                SeasonMembershipModel.season_id == season.id,
            )
        )

    async def select_fandom(
        self, platform_subject: str, fandom_id: UUID
    ) -> SeasonMembershipModel:
        now = utc_now()
        season = await self._current_season()
        fandom = await self._session.scalar(
            select(FandomModel).where(
                FandomModel.id == fandom_id,
                FandomModel.is_active.is_(True),
            )
        )
        if fandom is None:
            raise ApiError(404, "FANDOM_NOT_FOUND", "팬덤을 찾을 수 없습니다.")

        user = await self._session.scalar(
            select(UserModel).where(UserModel.platform_subject == platform_subject)
        )
        if user is None:
            user = UserModel(id=uuid4(), platform_subject=platform_subject, created_at=now)
            self._session.add(user)
            await self._session.flush()

        membership = await self._session.scalar(
            select(SeasonMembershipModel).where(
                SeasonMembershipModel.user_id == user.id,
                SeasonMembershipModel.season_id == season.id,
            )
        )
        if membership is not None:
            if membership.fandom_id != fandom_id:
                raise ApiError(422, "FANDOM_LOCKED", "이번 시즌 팬덤은 변경할 수 없습니다.")
            return membership

        membership = SeasonMembershipModel(
            id=uuid4(),
            user_id=user.id,
            season_id=season.id,
            fandom_id=fandom.id,
            locked_at=now,
            created_at=now,
            updated_at=now,
        )
        self._session.add(membership)
        await self._session.commit()
        await self._session.refresh(membership)
        return membership

    async def _current_season(self) -> SeasonModel:
        now = utc_now()
        season = await self._session.scalar(
            select(SeasonModel)
            .where(SeasonModel.starts_at <= now, SeasonModel.ends_at > now)
            .order_by(SeasonModel.starts_at.desc())
            .limit(1)
        )
        if season is None:
            raise ApiError(
                503,
                "CURRENT_SEASON_NOT_CONFIGURED",
                "현재 진행 중인 시즌이 없습니다.",
            )
        return season
