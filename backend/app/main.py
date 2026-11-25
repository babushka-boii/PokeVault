import asyncio

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.auth import router as auth_router
from app.api.binders import router as binders_router
from app.api.cards import router as cards_router
from app.api.favorites import router as favorites_router
from app.api.health import router as health_router
from app.api.history import router as history_router
from app.api.inventory import router as inventory_router
from app.api.pokemon import router as pokemon_router
from app.api.prices import router as prices_router
from app.api.scans import router as scans_router
from app.api.sets import router as sets_router
from app.api.settings import router as settings_router
from app.auth.google import GoogleOIDCClient
from app.auth.middleware import AuthenticationPrivacyMiddleware
from app.cards.provider import CardProvider
from app.core.config import Settings, get_settings
from app.db.base import create_session_factory
from app.pokemon.provider import PokemonProvider
from app.prices.rates import RatesClient
from app.prices.service import PriceService
from app.scanner.ocr import OCRService


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
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["Accept", "Content-Type", "X-CSRF-Token", "Idempotency-Key"],
    )
    app.add_middleware(AuthenticationPrivacyMiddleware)
    app.state.pokemon_provider = PokemonProvider()
    app.state.card_provider = CardProvider()
    app.state.price_service = PriceService(app.state.card_provider, RatesClient())
    app.state.ocr_service = OCRService()
    app.state.scan_upload_slots = asyncio.Semaphore(2)
    app.state.scan_match_slots = asyncio.Semaphore(4)
    app.include_router(auth_router)
    app.include_router(inventory_router)
    app.include_router(binders_router)
    app.include_router(favorites_router)
    app.include_router(history_router)
    app.include_router(prices_router)
    app.include_router(settings_router)
    app.include_router(pokemon_router)
    app.include_router(cards_router)
    app.include_router(sets_router)
    app.include_router(scans_router)
    app.include_router(health_router)
    return app
