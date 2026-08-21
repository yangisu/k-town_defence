"""Operator CLI for enriched regional expedition synchronization."""

from __future__ import annotations

import argparse
import asyncio
from datetime import date, datetime, timedelta
import json
import os
from zoneinfo import ZoneInfo

from .expedition_sync import TourismExpeditionSyncService
from .infrastructure.database import create_engine_and_session_factory
from .ktour_expedition import KTourExpeditionClient
from .settings import Settings


def _bounded_int(minimum: int, maximum: int, label: str):
    def parse(value: str) -> int:
        parsed = int(value)
        if parsed < minimum or parsed > maximum:
            raise argparse.ArgumentTypeError(
                f"{label} must be between {minimum} and {maximum}"
            )
        return parsed

    return parse


def _date(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("start-date must be YYYY-MM-DD") from exc


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Synchronize regional expeditions")
    parser.add_argument("--area-code", default="6")
    parser.add_argument("--keyword", action="append")
    parser.add_argument("--start-date", type=_date)
    parser.add_argument("--days", type=_bounded_int(1, 90, "days"), default=30)
    parser.add_argument("--limit", type=_bounded_int(1, 100, "limit"), default=100)
    parser.add_argument("--force-full", action="store_true")
    return parser


async def _run(args: argparse.Namespace) -> int:
    settings = Settings()
    if settings.ktour_service_key is None:
        raise SystemExit("KTOUR_SERVICE_KEY is required")
    start_date = args.start_date or datetime.now(ZoneInfo("Asia/Seoul")).date()
    end_date = start_date + timedelta(days=args.days - 1)
    keywords = tuple(args.keyword or ("BTS", "K-POP"))
    engine, sessions = create_engine_and_session_factory(settings.database_url)
    try:
        client = KTourExpeditionClient(
            service_key=settings.ktour_service_key.get_secret_value(),
            mobile_app=os.getenv("KTOUR_MOBILE_APP", "KTownDefense"),
        )
        result = await TourismExpeditionSyncService(sessions, client).sync(
            area_code=args.area_code,
            keywords=keywords,
            start_date=start_date,
            end_date=end_date,
            limit=args.limit,
            force_full=args.force_full,
        )
        print(
            json.dumps(
                {
                    "runId": str(result.run_id),
                    "status": result.status,
                    "fetchedCount": result.fetched_count,
                    "activeCount": result.active_count,
                }
            )
        )
        return 0 if result.status == "succeeded" else 1
    finally:
        await engine.dispose()


def main() -> int:
    return asyncio.run(_run(build_parser().parse_args()))


if __name__ == "__main__":
    raise SystemExit(main())
