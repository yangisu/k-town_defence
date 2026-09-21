"""Read-only territory projections backed by persisted check-in results."""

from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .infrastructure.models import (
    FandomModel,
    SeasonModel,
    SubmissionModel,
)


@dataclass(frozen=True)
class TerritoryDefinition:
    id: str
    name_ko: str
    name_en: str
    latitude: float
    longitude: float
    address_token: str
    population_decline: bool = False


TERRITORIES = (
    TerritoryDefinition("busan", "부산", "Busan", 35.1796, 129.0756, "부산"),
    TerritoryDefinition("daegu", "대구", "Daegu", 35.8714, 128.6014, "대구"),
    TerritoryDefinition("gwangju", "광주", "Gwangju", 35.1595, 126.8526, "광주"),
    TerritoryDefinition("gunpo", "군포", "Gunpo", 37.3617, 126.9352, "군포"),
    TerritoryDefinition("seongnam", "성남", "Seongnam", 37.4200, 127.1267, "성남"),
    TerritoryDefinition("geoje", "거제", "Geoje", 34.8806, 128.6211, "거제"),
    TerritoryDefinition("suwon", "수원", "Suwon", 37.2636, 127.0286, "수원"),
    TerritoryDefinition("gyeongju", "경주", "Gyeongju", 35.8562, 129.2247, "경주"),
    TerritoryDefinition("daejeon", "대전", "Daejeon", 36.3504, 127.3845, "대전"),
    TerritoryDefinition("seoul", "서울", "Seoul", 37.5665, 126.9780, "서울"),
    TerritoryDefinition("yongin", "용인", "Yongin", 37.2411, 127.1776, "용인"),
    TerritoryDefinition("goyang", "고양", "Goyang", 37.6584, 126.8320, "고양"),
    TerritoryDefinition("incheon", "인천", "Incheon", 37.4563, 126.7052, "인천"),
    TerritoryDefinition("jeju", "제주", "Jeju", 33.4996, 126.5312, "제주"),
    TerritoryDefinition("ulsan", "울산", "Ulsan", 35.5384, 129.3114, "울산"),
    TerritoryDefinition("siheung", "시흥", "Siheung", 37.3800, 126.8029, "시흥"),
    TerritoryDefinition("cheonan", "천안", "Cheonan", 36.8151, 127.1139, "천안"),
    TerritoryDefinition("pohang", "포항", "Pohang", 36.0190, 129.3435, "포항"),
    TerritoryDefinition("wonju", "원주", "Wonju", 37.3422, 127.9202, "원주"),
    TerritoryDefinition("chuncheon", "춘천", "Chuncheon", 37.8813, 127.7300, "춘천"),
    TerritoryDefinition("uijeongbu", "의정부", "Uijeongbu", 37.7381, 127.0337, "의정부"),
    TerritoryDefinition("namyangju", "남양주", "Namyangju", 37.6360, 127.2165, "남양주"),
    TerritoryDefinition("yeongwol", "영월", "Yeongwol", 37.1836, 128.4618, "영월", True),
)


def territory_id_for(address: str) -> str | None:
    return next((item.id for item in TERRITORIES if item.address_token in address), None)


def stronghold_stage(points: int) -> str:
    if points >= 2000:
        return "landmark"
    if points >= 1000:
        return "tree"
    return "seed"


class TerritoryApplication:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_scores(self) -> tuple[list[FandomModel], dict[tuple[str, UUID], int]]:
        fandoms = list((await self._session.scalars(
            select(FandomModel).where(FandomModel.is_active.is_(True)).order_by(FandomModel.id)
        )).all())
        now = datetime.now(timezone.utc)
        season = await self._session.scalar(
            select(SeasonModel)
            .where(SeasonModel.starts_at <= now, SeasonModel.ends_at > now)
            .order_by(SeasonModel.starts_at.desc())
            .limit(1)
        )
        if season is None:
            return fandoms, {}

        rows = (await self._session.execute(
            select(
                SubmissionModel.territory_id,
                FandomModel.id,
                func.coalesce(func.sum(SubmissionModel.awarded_points), 0),
            )
            .join(FandomModel, FandomModel.id == SubmissionModel.fandom_id)
            .where(
                SubmissionModel.decision == "approved",
                SubmissionModel.season_id == season.id,
                SubmissionModel.territory_id.is_not(None),
            )
            .group_by(SubmissionModel.territory_id, FandomModel.id)
        )).all()
        scores: dict[tuple[str, UUID], int] = {}
        for territory_id, fandom_id, points in rows:
            key = (territory_id, fandom_id)
            scores[key] = scores.get(key, 0) + int(points)
        return fandoms, scores
