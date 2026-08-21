"""FastAPI application factory."""

from fastapi import FastAPI

from ..settings import Settings


def create_app(settings: Settings | None = None) -> FastAPI:
    app = FastAPI(title="K-Town Defense", version="0.1.0")
    app.state.settings = settings or Settings()

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"service": "ktown-defense", "status": "ok"}

    return app


app = create_app()
