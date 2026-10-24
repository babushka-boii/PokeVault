from functools import lru_cache
from typing import Annotated, Literal, Self
from urllib.parse import urlsplit

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict
from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError

CALLBACK_PATH = "/api/v1/auth/google/callback"


def validate_web_url(value: str, *, origin_only: bool = False) -> None:
    """Accept explicit HTTP(S) destinations, without credentials or URL tricks."""
    parsed = urlsplit(value)
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.hostname
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
        or any(character.isspace() or ord(character) < 32 for character in value)
        or "\\" in value
        or (origin_only and parsed.path)
    ):
        raise ValueError("Authentication URLs must be explicit trusted HTTP(S) URLs")
    # Validate port syntax, too.
    _ = parsed.port


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        repr=False,
        hide_input_in_errors=True,
    )

    app_env: Literal["development", "test", "production"] = Field(
        default="development", validation_alias="APP_ENV"
    )
    database_url: SecretStr = Field(validation_alias="DATABASE_URL")
    cors_origins: Annotated[tuple[str, ...], NoDecode] = Field(
        default=("http://localhost:5173",), validation_alias="CORS_ORIGINS"
    )
    google_client_id: str = Field(default="", validation_alias="GOOGLE_CLIENT_ID")
    google_client_secret: SecretStr = Field(
        default=SecretStr(""), validation_alias="GOOGLE_CLIENT_SECRET"
    )
    google_redirect_uri: str = Field(
        default="http://localhost:8000" + CALLBACK_PATH,
        validation_alias="GOOGLE_REDIRECT_URI",
    )
    frontend_origin: str = Field(
        default="http://localhost:5173", validation_alias="FRONTEND_ORIGIN"
    )
    auth_cookie_secure: bool | None = Field(
        default=None, validation_alias="AUTH_COOKIE_SECURE"
    )
    auth_session_ttl_seconds: int = Field(
        default=604800, ge=60, le=2592000, validation_alias="AUTH_SESSION_TTL_SECONDS"
    )
    auth_transaction_ttl_seconds: int = Field(
        default=600, ge=60, le=900, validation_alias="AUTH_TRANSACTION_TTL_SECONDS"
    )

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return tuple(
                origin.strip() for origin in value.split(",") if origin.strip()
            )
        return value

    @property
    def google_configured(self) -> bool:
        return bool(
            self.google_client_id.strip()
            and self.google_client_secret.get_secret_value().strip()
        )

    @model_validator(mode="after")
    def validate_configuration(self) -> Self:
        try:
            parsed = make_url(self.database_url.get_secret_value())
        except ArgumentError as error:
            raise ValueError(
                "DATABASE_URL must be a PostgreSQL URL with a database name"
            ) from error
        if not parsed.drivername.startswith("postgresql") or not parsed.database:
            raise ValueError(
                "DATABASE_URL must be a PostgreSQL URL with a database name"
            )
        validate_web_url(self.frontend_origin, origin_only=True)
        validate_web_url(self.google_redirect_uri)
        if urlsplit(self.google_redirect_uri).path != CALLBACK_PATH:
            raise ValueError("GOOGLE_REDIRECT_URI must use the Google callback path")
        if not self.cors_origins or self.frontend_origin not in self.cors_origins:
            raise ValueError("CORS_ORIGINS must include FRONTEND_ORIGIN")
        for origin in self.cors_origins:
            validate_web_url(origin, origin_only=True)
        production = self.app_env == "production"
        if self.auth_cookie_secure is None:
            self.auth_cookie_secure = production
        destinations = (
            *self.cors_origins,
            self.frontend_origin,
            self.google_redirect_uri,
        )
        for destination in destinations:
            url = urlsplit(destination)
            if production and (
                url.scheme != "https"
                or url.hostname in {"localhost", "127.0.0.1", "::1"}
            ):
                raise ValueError("Production authentication URLs require public HTTPS")
            if (
                not production
                and url.scheme == "http"
                and url.hostname not in {"localhost", "127.0.0.1", "::1"}
            ):
                raise ValueError(
                    "HTTP authentication development URLs must use localhost"
                )
        if production and not self.auth_cookie_secure:
            raise ValueError("Production authentication requires Secure cookies")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
