import os
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from dotenv import dotenv_values
from sqlalchemy import inspect, select

from app.db.base import create_session_factory
from app.db.health import check_database
from app.db.models import AppMetadata

BACKEND_ROOT = Path(__file__).parents[2]


def _database_environment() -> dict[str, str | None]:
    # Snapshot only DB configuration before per-test settings isolation. Never
    # export the developer's OAuth/cookie settings into the process environment.
    local_values = dotenv_values(BACKEND_ROOT / ".env")
    return {
        name: os.environ.get(name, local_values.get(name))
        for name in ("DATABASE_URL", "POKEVAULT_TEST_DATABASE_URL")
    }


_DATABASE_ENVIRONMENT = _database_environment()


def integration_url() -> str:
    value = _DATABASE_ENVIRONMENT["POKEVAULT_TEST_DATABASE_URL"]
    if not value:
        pytest.skip(
            "POKEVAULT_TEST_DATABASE_URL is required for PostgreSQL integration tests"
        )
    if value == _DATABASE_ENVIRONMENT["DATABASE_URL"]:
        pytest.fail(
            "POKEVAULT_TEST_DATABASE_URL must differ from the development DATABASE_URL"
        )
    return value


def test_migration_model_and_health_against_postgres(monkeypatch) -> None:
    database_url = integration_url()
    monkeypatch.setenv("DATABASE_URL", database_url)
    configuration = Config(BACKEND_ROOT / "alembic.ini")
    configuration.set_main_option("script_location", str(BACKEND_ROOT / "migrations"))
    command.upgrade(configuration, "head")

    session_factory = create_session_factory(database_url)
    with session_factory() as session:
        assert "app_metadata" in inspect(session.get_bind()).get_table_names()
        record = AppMetadata(schema_version="0001")
        session.add(record)
        session.flush()
        assert (
            session.scalar(select(AppMetadata).where(AppMetadata.id == record.id))
            == record
        )
        session.rollback()

    assert check_database(session_factory).status == "healthy"
