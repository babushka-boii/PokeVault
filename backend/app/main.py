from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.health import router as health_router
from app.api.pokemon import router as pokemon_router
from app.core.config import Settings, get_settings
from app.db.base import create_session_factory
from app.pokemon.provider import PokemonProvider


def create_app(settings: Settings | None = None) -> FastAPI:
    active_settings = settings or get_settings()
    app = FastAPI(title="PokéVault API", version="0.1.0")
    app.state.session_factory = create_session_factory(
        active_settings.database_url.get_secret_value()
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(active_settings.cors_origins),
        allow_credentials=False,
        allow_methods=["GET"],
        allow_headers=["Accept", "Content-Type"],
    )
    app.state.pokemon_provider = PokemonProvider()
    app.include_router(pokemon_router)
    app.include_router(health_router)
    return app
