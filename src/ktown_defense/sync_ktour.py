"""Command-line entry point for bounded KTour place synchronization."""

from __future__ import annotations

import argparse
import asyncio
import json
import os

from .infrastructure.database import create_engine_and_session_factory
from .ktour_area import KTourAreaClient
from .place_sync import KTourPlaceSyncService
from .settings import Settings


def _safe_limit(value: str) -> int:
    parsed = int(value)
    if parsed < 1 or parsed > 100:
        raise argparse.ArgumentTypeError("limit must be between 1 and 100")
    return parsed


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Synchronize KTour places")
    parser.add_argument("--area-code", default="6")
    parser.add_argument("--limit", type=_safe_limit, default=100)
    return parser


async def _run(args: argparse.Namespace) -> int:
    settings = Settings()
    if settings.ktour_service_key is None:
        raise SystemExit("KTOUR_SERVICE_KEY is required")
    engine, sessions = create_engine_and_session_factory(settings.database_url)
    try:
        client = KTourAreaClient(
            service_key=settings.ktour_service_key.get_secret_value(),
            mobile_app=os.getenv("KTOUR_MOBILE_APP", "KTownDefense"),
        )
        result = await KTourPlaceSyncService(sessions, client).sync(
            args.area_code, args.limit
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
