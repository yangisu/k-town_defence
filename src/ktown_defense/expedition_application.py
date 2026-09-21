"""Persistent expedition lifecycle built from server-verified recommendations."""

from datetime import date, datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .api.errors import ApiError
from .expedition_recommendation import ExpeditionRecommendationService
from .infrastructure.models import (
    ExpeditionModel,
    ExpeditionStopModel,
    PlaceModel,
    SeasonMembershipModel,
    SeasonModel,
    UserModel,
)
from .territory_application import territory_id_for


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class ExpeditionApplication:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(
        self,
        platform_subject: str,
        *,
        recommendation_id: str,
        region_code: str,
        keyword: str | None,
        travel_date: date,
        limit: int,
        route_key: str | None = None,
        route_version: str | None = None,
        selected_recommendation_place_ids: list[UUID] | None = None,
    ) -> ExpeditionModel:
        if route_key is not None and route_key != "bts-busan":
            raise ValueError("route not supported")
        user, membership = await self._membership(platform_subject)
        active = await self._active_for_user(user.id)
        if active is not None:
            if active.recommendation_id == recommendation_id:
                if route_key == "bts-busan":
                    if active.route_version != route_version:
                        raise ApiError(409, "EXPEDITION_RECOMMENDATION_CHANGED", "추천 경로가 갱신되었습니다. 다시 확인해 주세요.")
                    stored = set(
                        await self._session.scalars(
                            select(ExpeditionStopModel.place_id).where(
                                ExpeditionStopModel.expedition_id == active.id,
                                ExpeditionStopModel.stop_kind == "recommendation",
                            )
                        )
                    )
                    if stored != set(selected_recommendation_place_ids or []):
                        raise ApiError(409, "ACTIVE_EXPEDITION_EXISTS", "진행 중인 원정의 선택 장소와 다릅니다.")
                return active
            raise ApiError(409, "ACTIVE_EXPEDITION_EXISTS", "진행 중인 원정을 먼저 종료해 주세요.")

        recommendation, places = await ExpeditionRecommendationService().recommend(
            self._session,
            region_code=region_code,
            keyword=keyword,
            travel_date=travel_date,
            limit=limit,
            route_key=route_key,
        )
        if recommendation.id != recommendation_id or (
            route_key == "bts-busan" and recommendation.route_version != route_version
        ):
            raise ApiError(409, "EXPEDITION_RECOMMENDATION_CHANGED", "추천 경로가 갱신되었습니다. 다시 확인해 주세요.")

        chosen_ids = set(selected_recommendation_place_ids or [])
        recommendation_ids = {
            stop.candidate.id for stop in recommendation.stops if not stop.required
        }
        anchor_ids = {stop.candidate.id for stop in recommendation.stops if stop.required}
        if route_key == "bts-busan" and (
            not chosen_ids <= recommendation_ids or bool(chosen_ids & anchor_ids)
        ):
            raise ApiError(409, "EXPEDITION_SELECTION_INVALID", "현재 추천에 포함된 선택 장소만 추가할 수 있습니다.")

        now = utc_now()
        first_stop = next(stop for stop in recommendation.stops if stop.required)
        first_place = places[first_stop.candidate.id]
        expedition = ExpeditionModel(
            id=uuid4(),
            user_id=user.id,
            season_id=membership.season_id,
            fandom_id=membership.fandom_id,
            recommendation_id=recommendation.id,
            route_key=recommendation.route_key,
            route_version=recommendation.route_version,
            region_code=recommendation.region_code,
            territory_id=territory_id_for(first_place.address_ko),
            title="부산 로컬 원정" if region_code == "6" else "지역 로컬 원정",
            keyword=recommendation.keyword,
            travel_date=recommendation.travel_date,
            status="active",
            created_at=now,
            updated_at=now,
        )
        self._session.add(expedition)
        await self._session.flush()
        persisted_stops = [
            stop for stop in recommendation.stops
            if stop.required or stop.candidate.id in chosen_ids or route_key is None
        ]
        for order, stop in enumerate(persisted_stops, start=1):
            evidence = stop.evidence or {}
            self._session.add(ExpeditionStopModel(
                id=uuid4(),
                expedition_id=expedition.id,
                place_id=stop.candidate.id,
                stop_order=order,
                distance_km=stop.distance_km,
                reasons=list(stop.reasons),
                stop_kind=stop.kind,
                is_required=stop.required,
                placement=stop.placement,
                recommendation_source=(str(evidence.get("source")) if evidence else None),
                recommendation_reason=(str(evidence.get("reason")) if evidence else None),
                recommendation_metadata=evidence,
            ))
        await self._session.commit()
        await self._session.refresh(expedition)
        return expedition

    async def current(self, platform_subject: str) -> ExpeditionModel | None:
        user_id = await self._session.scalar(
            select(UserModel.id).where(UserModel.platform_subject == platform_subject)
        )
        return None if user_id is None else await self._active_for_user(user_id)

    async def get_owned(self, platform_subject: str, expedition_id: UUID) -> ExpeditionModel:
        expedition = await self._session.scalar(
            select(ExpeditionModel)
            .join(UserModel, UserModel.id == ExpeditionModel.user_id)
            .where(ExpeditionModel.id == expedition_id, UserModel.platform_subject == platform_subject)
        )
        if expedition is None:
            raise ApiError(404, "EXPEDITION_NOT_FOUND", "원정을 찾을 수 없습니다.")
        return expedition

    async def finish(self, platform_subject: str, expedition_id: UUID, status: str) -> ExpeditionModel:
        expedition = await self.get_owned(platform_subject, expedition_id)
        if expedition.status != "active":
            return expedition
        if status == "completed":
            incomplete = int(
                await self._session.scalar(
                    select(func.count(ExpeditionStopModel.id)).where(
                        ExpeditionStopModel.expedition_id == expedition.id,
                        ExpeditionStopModel.completed_at.is_(None),
                        ExpeditionStopModel.is_required.is_(True),
                    )
                )
                or 0
            )
            if incomplete:
                raise ApiError(409, "EXPEDITION_STOPS_INCOMPLETE", "남은 원정 장소를 먼저 체크인해 주세요.")
        now = utc_now()
        expedition.status = status
        expedition.updated_at = now
        expedition.completed_at = now
        await self._session.commit()
        await self._session.refresh(expedition)
        return expedition

    async def stops(self, expedition_id: UUID) -> list[tuple[ExpeditionStopModel, PlaceModel]]:
        rows = (await self._session.execute(
            select(ExpeditionStopModel, PlaceModel)
            .join(PlaceModel, PlaceModel.id == ExpeditionStopModel.place_id)
            .where(ExpeditionStopModel.expedition_id == expedition_id)
            .order_by(ExpeditionStopModel.stop_order)
        )).all()
        return list(rows)

    async def _active_for_user(self, user_id: UUID) -> ExpeditionModel | None:
        return await self._session.scalar(
            select(ExpeditionModel).where(
                ExpeditionModel.user_id == user_id,
                ExpeditionModel.status == "active",
            )
        )

    async def _membership(self, platform_subject: str) -> tuple[UserModel, SeasonMembershipModel]:
        now = utc_now()
        row = (await self._session.execute(
            select(UserModel, SeasonMembershipModel)
            .join(SeasonMembershipModel, SeasonMembershipModel.user_id == UserModel.id)
            .join(SeasonModel, SeasonModel.id == SeasonMembershipModel.season_id)
            .where(
                UserModel.platform_subject == platform_subject,
                SeasonModel.starts_at <= now,
                SeasonModel.ends_at > now,
            )
            .limit(1)
        )).first()
        if row is None:
            raise ApiError(409, "MEMBERSHIP_REQUIRED", "원정을 시작하려면 팬덤을 먼저 선택해 주세요.")
        return row[0], row[1]
