from fastapi import FastAPI

from ktown_defense.settings import Settings


def create_app(settings: Settings | None = None) -> FastAPI:
    app = FastAPI(title="KTown Defense", version="1.0.0")
    app.state.settings = settings or Settings()

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"service": "ktown-defense", "status": "ok"}

    return app
