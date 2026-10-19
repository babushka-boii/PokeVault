import pytest
from pydantic import ValidationError

from app.core.config import Settings


def test_settings_parse_development_environment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv(
        "DATABASE_URL",
        "postgresql+psycopg://pokevault:local-only@localhost:5432/pokevault",
    )
    monkeypatch.setenv("CORS_ORIGINS", "http://localhost:5173, http://127.0.0.1:5173")

    settings = Settings(_env_file=None)

    assert settings.app_env == "development"
    assert settings.cors_origins == (
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    )
    assert "local-only" not in repr(settings)


def test_settings_require_database_url(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)

    with pytest.raises(ValidationError, match="DATABASE_URL"):
        Settings(_env_file=None)


def test_malformed_database_url_does_not_expose_password(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    password = "never-print-this"
    monkeypatch.setenv(
        "DATABASE_URL", f"postgresql+psycopg://pokevault:{password}@localhost"
    )

    with pytest.raises(ValidationError) as captured:
        Settings(_env_file=None)

    assert "must be a PostgreSQL URL with a database name" in str(captured.value)
    assert password not in str(captured.value)
