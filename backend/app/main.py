from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.auth import router as auth_router
from app.api.cards import router as cards_router
from app.api.health import router as health_router
from app.api.pokemon import router as pokemon_router
from app.auth.google import GoogleOIDCClient
from app.auth.middleware import AuthenticationPrivacyMiddleware
from app.cards.provider import CardProvider
from app.core.config import Settings, get_settings
from app.db.base import create_session_factory
from app.pokemon.provider import PokemonProvider


def create_app(settings: Settings | None = None) -> FastAPI:
    active_settings = settings or get_settings()
    app = FastAPI(title="PokéVault API", version="0.1.0")
    app.state.settings = active_settings
    app.state.google_provider = GoogleOIDCClient(active_settings)
    app.state.session_factory = create_session_factory(
        active_settings.database_url.get_secret_value()
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(active_settings.cors_origins),
        allow_credentials=True,
        allow_methods=["GET", "POST"],
        allow_headers=["Accept", "Content-Type", "X-CSRF-Token"],
    )
    app.add_middleware(AuthenticationPrivacyMiddleware)
    app.state.pokemon_provider = PokemonProvider()
    app.state.card_provider = CardProvider()
    app.include_router(auth_router)
    app.include_router(pokemon_router)
    app.include_router(cards_router)
    app.include_router(health_router)
    return app
