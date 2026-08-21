"""FastAPI application factory."""

from fastapi import FastAPI

from ..infrastructure.database import create_engine_and_session_factory
from ..photo_storage import PrivatePhotoStorage
from ..settings import Settings
from .checkin_routes import router as checkin_router
from .errors import install_error_handlers
from .membership_routes import router as membership_router
from .place_routes import router as place_router


def create_app(settings: Settings | None = None) -> FastAPI:
    app = FastAPI(title="K-Town Defense", version="0.1.0")
    app.state.settings = settings or Settings()
    engine, session_factory = create_engine_and_session_factory(
        app.state.settings.database_url
    )
    app.state.engine = engine
    app.state.session_factory = session_factory
    app.state.photo_storage = PrivatePhotoStorage(app.state.settings.upload_dir)
    install_error_handlers(app)

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"service": "ktown-defense", "status": "ok"}

    app.include_router(place_router)
    app.include_router(membership_router)
    app.include_router(checkin_router)
    return app


app = create_app()
