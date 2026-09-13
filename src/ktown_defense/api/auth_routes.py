"""Social-login profile upsert.

This route is reachable only from the network position that can already
impersonate any user via ``X-KTown-User-Id`` (see ``dependencies.get_user_id``):
the trusted Next.js gateway process, never the browser directly. It does not
widen that existing trust boundary, it only lets the gateway persist a
provider-supplied display name and avatar under the same opaque
``platform_subject`` identity every other route already accepts.
"""

from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ..infrastructure.models import UserModel
from ..social_profile import SocialProfileApplication
from .dependencies import get_session
from .errors import ApiError

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])
Session = Annotated[AsyncSession, Depends(get_session)]


class SocialUpsertRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    platform_subject: str = Field(alias="platformSubject", min_length=1, max_length=200)
    display_name: str | None = Field(default=None, alias="displayName", max_length=120)
    avatar_url: str | None = Field(default=None, alias="avatarUrl", max_length=500)


class SocialUpsertResponse(BaseModel):
    user_id: str = Field(serialization_alias="userId")
    platform_subject: str = Field(serialization_alias="platformSubject")
    display_name: str | None = Field(serialization_alias="displayName")
    avatar_url: str | None = Field(serialization_alias="avatarUrl")

    @classmethod
    def from_model(cls, model: UserModel) -> "SocialUpsertResponse":
        return cls(
            user_id=str(model.id),
            platform_subject=model.platform_subject,
            display_name=model.display_name,
            avatar_url=model.avatar_url,
        )


@router.post("/social/upsert", response_model=SocialUpsertResponse)
async def upsert_social_profile(
    payload: SocialUpsertRequest, session: Session
) -> SocialUpsertResponse:
    subject = payload.platform_subject.strip()
    if not subject:
        raise ApiError(422, "VALIDATION_ERROR", "platformSubject는 비어 있을 수 없습니다.")
    user = await SocialProfileApplication(session).upsert(
        subject,
        display_name=payload.display_name,
        avatar_url=payload.avatar_url,
    )
    return SocialUpsertResponse.from_model(user)
