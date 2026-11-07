"""Local auth configuration must not change the behavior of backend tests."""

import os
import subprocess
import sys
from pathlib import Path

import pytest

from app.core.config import Settings


@pytest.mark.parametrize("lowercase_environment", [False, True])
def test_auth_tests_ignore_ambient_configuration(tmp_path, lowercase_environment):
    backend = Path(__file__).parents[1]
    ambient = {
        "APP_ENV": "development",
        "GOOGLE_CLIENT_ID": "ambient-client",
        "GOOGLE_CLIENT_SECRET": "synthetic-ambient-secret",
        "AUTH_COOKIE_SECURE": "false",
        "FRONTEND_ORIGIN": "http://localhost:5999",
        "CORS_ORIGINS": "http://localhost:5999",
        "GOOGLE_REDIRECT_URI": "http://localhost:8999/api/v1/auth/google/callback",
    }
    # Use a synthetic dotenv, never the developer's actual credentials.
    (tmp_path / ".env").write_text(
        "\n".join(f"{name}={value}" for name, value in ambient.items()) + "\n"
    )
    setting_names = {
        field.validation_alias.casefold() for field in Settings.model_fields.values()
    }
    environment = {
        name: value
        for name, value in os.environ.items()
        if name.casefold() not in setting_names
    }
    environment.update(
        {
            name.lower() if lowercase_environment else name: value
            for name, value in ambient.items()
        }
    )
    result = subprocess.run(
        [
            sys.executable,
            "-m",
            "pytest",
            "-q",
            "--tb=short",
            str(backend / "tests/test_auth.py")
            + "::test_missing_configuration_fails_safely_without_database",
            str(backend / "tests/test_auth.py")
            + "::test_production_cookies_are_secure_and_redirects_fixed",
            str(Path(__file__)) + "::test_default_settings_ignore_dotenv_credentials",
        ],
        cwd=tmp_path,
        env=environment,
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert result.returncode == 0, result.stdout + result.stderr


def test_default_settings_ignore_dotenv_credentials():
    settings = Settings(
        DATABASE_URL="postgresql+psycopg://unused:unused@localhost/test"
    )
    assert not settings.google_configured


def test_local_http_development_allows_insecure_cookies():
    settings = Settings(
        APP_ENV="development",
        DATABASE_URL="postgresql+psycopg://unused:unused@localhost/test",
        AUTH_COOKIE_SECURE=False,
    )
    assert settings.auth_cookie_secure is False
