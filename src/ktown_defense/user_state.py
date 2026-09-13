"""Account-scoped persistence for the modern product UI state."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .infrastructure.models import UserGameStateModel, UserModel, utc_now


class UserStateApplication:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, platform_subject: str) -> UserGameStateModel | None:
        return await self._session.scalar(
            select(UserGameStateModel)
            .join(UserModel, UserModel.id == UserGameStateModel.user_id)
            .where(UserModel.platform_subject == platform_subject)
        )

    async def upsert(
        self, platform_subject: str, payload: dict[str, object]
    ) -> UserGameStateModel | None:
        user = await self._session.scalar(
            select(UserModel).where(UserModel.platform_subject == platform_subject)
        )
        if user is None:
            return None

        state = await self._session.get(UserGameStateModel, user.id)
        if state is None:
            state = UserGameStateModel(
                user_id=user.id,
                payload=payload,
                updated_at=utc_now(),
            )
            self._session.add(state)
        else:
            state.payload = payload
            state.updated_at = utc_now()

        await self._session.commit()
        await self._session.refresh(state)
        return state
