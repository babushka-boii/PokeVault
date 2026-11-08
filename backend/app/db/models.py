from datetime import date, datetime
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    String,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AppMetadata(Base):
    __tablename__ = "app_metadata"

    id: Mapped[int] = mapped_column(primary_key=True)
    schema_version: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class User(Base):
    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    google_sub: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str | None] = mapped_column(String(320))
    email_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    picture_url: Mapped[str | None] = mapped_column(String(2048))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class UserSettings(Base):
    __tablename__ = "user_settings"
    __table_args__ = (
        CheckConstraint(
            "preferred_language IN ('es', 'en')", name="ck_settings_language"
        ),
        CheckConstraint(
            "favorite_pokemon_id BETWEEN 1 AND 1025",
            name="ck_settings_favorite_pokemon",
        ),
    )

    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    preferred_language: Mapped[str] = mapped_column(
        String(2), nullable=False, default="es", server_default="es"
    )
    display_name: Mapped[str | None] = mapped_column(String(255))
    trainer_avatar_id: Mapped[str | None] = mapped_column(String(64))
    favorite_pokemon_id: Mapped[int | None]


class AuthSession(Base):
    __tablename__ = "auth_sessions"

    token_digest: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )


class OAuthTransaction(Base):
    __tablename__ = "oauth_transactions"

    state_digest: Mapped[str] = mapped_column(String(64), primary_key=True)
    browser_digest: Mapped[str] = mapped_column(String(64), nullable=False)
    nonce: Mapped[str] = mapped_column(String(128), nullable=False)
    code_verifier: Mapped[str] = mapped_column(String(128), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )


class InventoryCopy(Base):
    """A physical card; duplicate catalog identifiers intentionally stay separate."""

    __tablename__ = "inventory_copies"
    __table_args__ = (
        UniqueConstraint("user_id", "id", name="uq_inventory_owner_id"),
        CheckConstraint(
            "condition IN ('mint','near_mint','excellent','good',"
            "'played','poor','unknown')",
            name="ck_inventory_condition",
        ),
        CheckConstraint(
            "language IN ('es','en','ja','fr','de','it',"
            "'pt','ko','zh','id','th','other')",
            name="ck_inventory_language",
        ),
        CheckConstraint(
            "variant IN ('normal','holo','reverse','first_edition','other','unknown')",
            name="ck_inventory_variant",
        ),
        CheckConstraint("length(notes) <= 2000", name="ck_inventory_notes"),
        Index("ix_inventory_owner_created", "user_id", "created_at", "id"),
        Index("ix_inventory_owner_card", "user_id", "card_id"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    card_id: Mapped[str] = mapped_column(String(100), nullable=False)
    condition: Mapped[str] = mapped_column(String(16), nullable=False)
    language: Mapped[str] = mapped_column(String(8), nullable=False)
    variant: Mapped[str] = mapped_column(String(16), nullable=False)
    acquired_on: Mapped[date | None] = mapped_column(Date)
    notes: Mapped[str] = mapped_column(String(2000), nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class PersonalBox(Base):
    """A user's manual arrangement; deleting it never deletes inventory copies."""

    __tablename__ = "personal_boxes"
    __table_args__ = (
        UniqueConstraint("user_id", "id", name="uq_personal_boxes_owner_id"),
        UniqueConstraint(
            "user_id", "display_order", name="uq_personal_boxes_owner_order"
        ),
        CheckConstraint(
            "length(name) BETWEEN 1 AND 80 AND name = trim(name)",
            name="ck_personal_boxes_name",
        ),
        CheckConstraint("display_order >= 0", name="ck_personal_boxes_order"),
        CheckConstraint(
            "wallpaper IN ('classic','forest','ocean','night')",
            name="ck_personal_boxes_wallpaper",
        ),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    display_order: Mapped[int] = mapped_column(nullable=False)
    wallpaper: Mapped[str] = mapped_column(
        String(16), nullable=False, default="classic", server_default="classic"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class BoxMembership(Base):
    """One placement of an authentic physical copy, with owner-checked parents."""

    __tablename__ = "box_memberships"
    __table_args__ = (
        ForeignKeyConstraint(
            ["user_id", "box_id"],
            ["personal_boxes.user_id", "personal_boxes.id"],
            ondelete="CASCADE",
            name="fk_box_membership_owned_box",
        ),
        ForeignKeyConstraint(
            ["user_id", "copy_id"],
            ["inventory_copies.user_id", "inventory_copies.id"],
            ondelete="CASCADE",
            name="fk_box_membership_owned_copy",
        ),
        UniqueConstraint("copy_id", name="uq_box_membership_copy"),
        CheckConstraint("position BETWEEN 0 AND 29", name="ck_box_membership_position"),
        Index("ix_box_membership_owner", "user_id"),
    )

    user_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    box_id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    position: Mapped[int] = mapped_column(primary_key=True)
    copy_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
