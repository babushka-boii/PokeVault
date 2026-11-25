"""Migration 0011 (trainer profile columns) on real PostgreSQL."""

import pytest
from alembic import command
from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError

from . import test_auth_postgres
from .test_binders_postgres import seed_owner

profile_database = test_auth_postgres.auth_database


def columns(factory):
    with factory() as session:
        return {
            c["name"] for c in inspect(session.get_bind()).get_columns("user_settings")
        }


def test_upgrade_adds_defaults_and_downgrade_keeps_everything_else(profile_database):
    factory, config = profile_database
    assert {"trainer_id", "team"} <= columns(factory)
    owner = seed_owner(factory, copies=2, binders=1)
    with factory.begin() as session:
        session.execute(
            text("INSERT INTO user_settings (user_id) VALUES (:u)"),
            {"u": owner["user_id"]},
        )
        row = session.execute(text("SELECT trainer_id, team FROM user_settings")).one()
        assert row.trainer_id == "mateo" and list(row.team) == []
    with pytest.raises(IntegrityError), factory.begin() as session:
        session.execute(text("UPDATE user_settings SET trainer_id = 'red'"))
    command.downgrade(config, "0010")
    assert not {"trainer_id", "team"} & columns(factory)
    with factory() as session:
        assert (
            session.execute(text("SELECT count(*) FROM inventory_copies")).scalar() == 2
        )
        assert session.execute(text("SELECT count(*) FROM user_settings")).scalar() == 1
    command.upgrade(config, "head")
    assert {"trainer_id", "team"} <= columns(factory)
