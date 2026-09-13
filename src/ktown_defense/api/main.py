"""FastAPI application factory."""

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from sqlalchemy import text

from ..infrastructure.database import create_engine_and_session_factory
from ..photo_storage import PrivatePhotoStorage
from ..settings import Settings
from .auth_routes import router as auth_router
from .checkin_routes import router as checkin_router
from .errors import install_error_handlers
from .expedition_routes import router as expedition_router
from .membership_routes import router as membership_router
from .place_routes import router as place_router


def create_app(settings: Settings | None = None) -> FastAPI:
    runtime_settings = settings or Settings()
    engine, session_factory = create_engine_and_session_factory(
        runtime_settings.database_url
    )

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        yield
        await engine.dispose()

    app = FastAPI(title="K-Town Defense", version="0.1.0", lifespan=lifespan)
    app.state.settings = runtime_settings
    app.state.engine = engine
    app.state.session_factory = session_factory
    app.state.photo_storage = PrivatePhotoStorage(app.state.settings.upload_dir)
    install_error_handlers(app)

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"service": "ktown-defense", "status": "ok"}

    @app.get("/health/ready")
    async def readiness() -> dict[str, str]:
        try:
            async with session_factory() as session:
                await session.execute(text("SELECT 1"))
        except Exception as error:
            raise HTTPException(status_code=503, detail="database unavailable") from error
        return {"service": "ktown-defense", "status": "ready"}

    app.include_router(auth_router)
    app.include_router(place_router)
    app.include_router(expedition_router)
    app.include_router(membership_router)
    app.include_router(checkin_router)
    return app


app = create_app()
