from functools import lru_cache
from typing import Annotated, Self

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict
from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        repr=False,
    )

    app_env: str = Field(default="development", validation_alias="APP_ENV")
    database_url: SecretStr = Field(validation_alias="DATABASE_URL")
    cors_origins: Annotated[tuple[str, ...], NoDecode] = Field(
        default=("http://localhost:5173",), validation_alias="CORS_ORIGINS"
    )

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return tuple(
                origin.strip() for origin in value.split(",") if origin.strip()
            )
        return value

    @model_validator(mode="after")
    def validate_database_url(self) -> Self:
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
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
