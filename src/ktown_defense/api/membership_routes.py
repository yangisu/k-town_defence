"""Fandom discovery and current-season membership HTTP contracts."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ..infrastructure.models import FandomModel, SeasonMembershipModel
from ..membership_application import MembershipApplication
from .dependencies import get_session
from .errors import ApiError


router = APIRouter(prefix="/api/v1", tags=["membership"])
Session = Annotated[AsyncSession, Depends(get_session)]


async def get_membership_subject(
    subject: Annotated[str | None, Header(alias="X-KTown-User-Id")] = None,
) -> str:
    if subject is None or not subject.strip() or len(subject) > 200:
        raise ApiError(401, "AUTHENTICATION_REQUIRED", "사용자 인증이 필요합니다.")
    return subject.strip()


MembershipSubject = Annotated[str, Depends(get_membership_subject)]


class FandomResponse(BaseModel):
    id: UUID
    name: str
    artist_name: str | None = Field(serialization_alias="artistName")

    @classmethod
    def from_model(cls, model: FandomModel) -> "FandomResponse":
        return cls(id=model.id, name=model.name_ko, artist_name=model.artist_name_ko)


class FandomListResponse(BaseModel):
    items: list[FandomResponse]


class SelectMembershipRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    fandom_id: UUID = Field(alias="fandomId")


class MembershipResponse(BaseModel):
    user_id: UUID = Field(serialization_alias="userId")
    season_id: UUID = Field(serialization_alias="seasonId")
    fandom_id: UUID = Field(serialization_alias="fandomId")
    locked_at: str | None = Field(serialization_alias="lockedAt")

    @classmethod
    def from_model(cls, model: SeasonMembershipModel) -> "MembershipResponse":
        return cls(
            user_id=model.user_id,
            season_id=model.season_id,
            fandom_id=model.fandom_id,
            locked_at=(
                model.locked_at.isoformat().replace("+00:00", "Z")
                if model.locked_at is not None
                else None
            ),
        )


@router.get("/fandoms", response_model=FandomListResponse)
async def list_fandoms(session: Session) -> FandomListResponse:
    fandoms = await MembershipApplication(session).list_fandoms()
    return FandomListResponse(items=[FandomResponse.from_model(item) for item in fandoms])


@router.get(
    "/me/season-membership",
    response_model=MembershipResponse | None,
)
async def get_membership(
    session: Session, subject: MembershipSubject
) -> MembershipResponse | None:
    membership = await MembershipApplication(session).get_current(subject)
    return MembershipResponse.from_model(membership) if membership is not None else None


@router.put("/me/season-membership", response_model=MembershipResponse)
async def select_membership(
    payload: SelectMembershipRequest,
    session: Session,
    subject: MembershipSubject,
) -> MembershipResponse:
    membership = await MembershipApplication(session).select_fandom(
        subject, payload.fandom_id
    )
    return MembershipResponse.from_model(membership)
