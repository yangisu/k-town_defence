"""Authenticated storage for the modern K-Town product state."""

import json
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ..user_state import UserStateApplication
from .dependencies import get_session, get_user_id
from .errors import ApiError


router = APIRouter(prefix="/api/v1/me/game-state", tags=["game-state"])
Session = Annotated[AsyncSession, Depends(get_session)]
Subject = Annotated[str, Depends(get_user_id)]
MAX_STATE_BYTES = 1_000_000


class GameStateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    state: dict[str, object]


class GameStateResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    state: dict[str, object]
    updated_at: str = Field(serialization_alias="updatedAt")


@router.get("", response_model=GameStateResponse | None)
async def get_game_state(session: Session, subject: Subject) -> GameStateResponse | None:
    state = await UserStateApplication(session).get(subject)
    if state is None:
        return None
    return GameStateResponse(state=state.payload, updated_at=state.updated_at.isoformat())


@router.put("", response_model=GameStateResponse)
async def put_game_state(
    payload: GameStateRequest, session: Session, subject: Subject
) -> GameStateResponse:
    encoded = json.dumps(payload.state, ensure_ascii=False, separators=(",", ":")).encode()
    if len(encoded) > MAX_STATE_BYTES:
        raise ApiError(413, "GAME_STATE_TOO_LARGE", "저장할 사용자 상태가 너무 큽니다.")
    state = await UserStateApplication(session).upsert(subject, payload.state)
    if state is None:
        raise ApiError(404, "USER_NOT_FOUND", "로그인 사용자를 찾을 수 없습니다.")
    return GameStateResponse(state=state.payload, updated_at=state.updated_at.isoformat())
