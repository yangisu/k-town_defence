"""Territory board contract backed by approved check-in scores."""

from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ..territory_application import TERRITORIES, TerritoryApplication, stronghold_stage
from .dependencies import get_session


router = APIRouter(prefix="/api/v1/territories", tags=["territories"])
Session = Annotated[AsyncSession, Depends(get_session)]


class TerritoryStandingResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    fandom_id: UUID = Field(serialization_alias="fandomId")
    fandom_name: str = Field(serialization_alias="fandomName")
    artist_name: str | None = Field(serialization_alias="artistName")
    valid_points: int = Field(serialization_alias="validPoints")


class TerritoryResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: str
    name_ko: str = Field(serialization_alias="nameKo")
    name_en: str = Field(serialization_alias="nameEn")
    latitude: float
    longitude: float
    population_decline: bool = Field(serialization_alias="populationDecline")
    balance_multiplier: Literal[1, 1.8] = Field(serialization_alias="balanceMultiplier")
    balance_reason_ko: str = Field(serialization_alias="balanceReasonKo")
    balance_reason_en: str = Field(serialization_alias="balanceReasonEn")
    owner_fandom_id: UUID = Field(serialization_alias="ownerFandomId")
    stronghold_stage: Literal["seed", "tree", "landmark"] = Field(serialization_alias="strongholdStage")
    standings: list[TerritoryStandingResponse]


class TerritoryListResponse(BaseModel):
    items: list[TerritoryResponse]


@router.get("", response_model=TerritoryListResponse)
async def list_territories(session: Session) -> TerritoryListResponse:
    fandoms, scores = await TerritoryApplication(session).list_scores()
    if not fandoms:
        return TerritoryListResponse(items=[])

    items: list[TerritoryResponse] = []
    for territory in TERRITORIES:
        standings = [
            TerritoryStandingResponse(
                fandom_id=fandom.id,
                fandom_name=fandom.name_ko,
                artist_name=fandom.artist_name_ko,
                valid_points=scores.get((territory.id, fandom.id), 0),
            )
            for fandom in fandoms
        ]
        owner = sorted(standings, key=lambda item: (-item.valid_points, str(item.fandom_id)))[0]
        items.append(TerritoryResponse(
            id=territory.id,
            name_ko=territory.name_ko,
            name_en=territory.name_en,
            latitude=territory.latitude,
            longitude=territory.longitude,
            population_decline=territory.population_decline,
            balance_multiplier=1.8 if territory.population_decline else 1,
            balance_reason_ko=("행정안전부 인구감소지역 지정에 따른 지역균형 보너스" if territory.population_decline else "기본 지역균형 배율"),
            balance_reason_en=("Regional-balance bonus for a population-decline designation" if territory.population_decline else "Standard regional-balance multiplier"),
            owner_fandom_id=owner.fandom_id,
            stronghold_stage=stronghold_stage(owner.valid_points),
            standings=standings,
        ))
    return TerritoryListResponse(items=items)
