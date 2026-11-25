"""Migration 0006: the dark "Unova Noir" wallpaper is the personal box default."""

from uuid import uuid4

import pytest
from alembic import command
from alembic.script import ScriptDirectory
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.db.models import User

from . import test_auth_postgres

wallpaper_database = test_auth_postgres.auth_database


def seed_owner(factory):
    with factory.begin() as session:
        user = User(google_sub=uuid4().hex, display_name="Collector")
        session.add(user)
        session.flush()
        return user.id


def insert_box(session, owner, name, order, wallpaper=None):
    columns = "id, user_id, name, display_order" + (", wallpaper" if wallpaper else "")
    values = ":id, :user_id, :name, :order" + (", :wallpaper" if wallpaper else "")
    session.execute(
        text(f"INSERT INTO personal_boxes ({columns}) VALUES ({values})"),
        {
            "id": uuid4(),
            "user_id": owner,
            "name": name,
            "order": order,
            "wallpaper": wallpaper,
        },
    )


def wallpapers(factory):
    with factory() as session:
        return dict(
            session.execute(text("SELECT name, wallpaper FROM personal_boxes")).all()
        )


def test_0006_follows_0005_and_defaults_new_boxes_to_noir(wallpaper_database):
    factory, config = wallpaper_database
    scripts = ScriptDirectory.from_config(config)
    assert scripts.get_revision("0006").down_revision == "0005"
    # The box tables exist at revision 0006 (0008 later drops them).
    command.downgrade(config, "0006")
    owner = seed_owner(factory)
    with factory.begin() as session:
        insert_box(session, owner, "Unset", 0)
        insert_box(session, owner, "Retro", 1, "classic")
        insert_box(session, owner, "Dark", 2, "noir")
    assert wallpapers(factory) == {"Unset": "noir", "Retro": "classic", "Dark": "noir"}


def test_postgres_rejects_unknown_wallpapers(wallpaper_database):
    factory, config = wallpaper_database
    command.downgrade(config, "0006")
    owner = seed_owner(factory)
    with pytest.raises(IntegrityError), factory.begin() as session:
        insert_box(session, owner, "Sepia", 0, "sepia")


def test_upgrade_keeps_stored_wallpapers_and_downgrade_maps_noir_to_classic(
    wallpaper_database,
):
    factory, config = wallpaper_database
    command.downgrade(config, "0005")
    owner = seed_owner(factory)
    with factory.begin() as session:
        insert_box(session, owner, "Old default", 0)
        insert_box(session, owner, "Forest", 1, "forest")
    with pytest.raises(IntegrityError), factory.begin() as session:
        insert_box(session, owner, "Too early", 2, "noir")

    command.upgrade(config, "0006")
    # Existing boxes keep their value: a chosen "classic" looks like the old default.
    assert wallpapers(factory) == {"Old default": "classic", "Forest": "forest"}
    with factory.begin() as session:
        insert_box(session, owner, "New", 2)
    assert wallpapers(factory)["New"] == "noir"

    command.downgrade(config, "0005")
    assert wallpapers(factory) == {
        "Old default": "classic",
        "Forest": "forest",
        "New": "classic",
    }
    with factory() as session:
        assert session.scalar(text("SELECT version_num FROM alembic_version")) == "0005"
    command.upgrade(config, "head")
    with factory() as session:
        assert session.scalar(text("SELECT version_num FROM alembic_version")) == (
            ScriptDirectory.from_config(config).get_current_head()
        )
