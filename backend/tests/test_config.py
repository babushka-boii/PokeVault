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


@pytest.mark.parametrize(
    "values",
    [
        {"CORS_ORIGINS": ("*",)},
        {"FRONTEND_ORIGIN": "https://app.example/path"},
        {"GOOGLE_REDIRECT_URI": "https://api.example/evil"},
        {"AUTH_SESSION_TTL_SECONDS": 0},
        {"APP_ENV": "production"},
        {
            "APP_ENV": "production",
            "FRONTEND_ORIGIN": "https://app.example",
            "GOOGLE_REDIRECT_URI": "https://api.example/api/v1/auth/google/callback",
            "CORS_ORIGINS": ("https://app.example",),
            "AUTH_COOKIE_SECURE": False,
        },
    ],
)
def test_auth_rejects_unsafe_configuration(values):
    with pytest.raises(ValidationError):
        Settings(
            DATABASE_URL="postgresql+psycopg://unused:secret@localhost/test",
            _env_file=None,
            **values,
        )


def test_invalid_auth_configuration_does_not_expose_secrets():
    with pytest.raises(ValidationError) as captured:
        Settings(
            DATABASE_URL="postgresql+psycopg://unused:FAKE_DB_SECRET@localhost/test",
            GOOGLE_CLIENT_SECRET="FAKE_GOOGLE_SECRET",
            APP_ENV="production",
            _env_file=None,
        )
    assert "FAKE_DB_SECRET" not in str(captured.value)
    assert "FAKE_GOOGLE_SECRET" not in str(captured.value)
