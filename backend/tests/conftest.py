"""Keep application settings independent of developer environment and dotenv files."""

import os

import pytest

from app.core.config import Settings, get_settings


@pytest.fixture(autouse=True)
def isolate_settings(monkeypatch):
    names = {
        field.validation_alias.casefold() for field in Settings.model_fields.values()
    }
    # Pydantic reads process environment separately, even with _env_file=None.
    for name in tuple(os.environ):
        if name.casefold() in names:
            monkeypatch.delenv(name)
    monkeypatch.setitem(Settings.model_config, "env_file", None)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()
