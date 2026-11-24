from datetime import date, datetime
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Numeric,
    SmallInteger,
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
        CheckConstraint(
            "preferred_currency IN ('CLP', 'USD')", name="ck_settings_currency"
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
    preferred_currency: Mapped[str] = mapped_column(
        String(3), nullable=False, default="CLP", server_default="CLP"
    )


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
            "wallpaper IN ('noir','classic','forest','ocean','night')",
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
        String(16), nullable=False, default="noir", server_default="noir"
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


class Binder(Base):
    """A user's album of 9-pocket pages; deleting it never deletes inventory copies."""

    __tablename__ = "binders"
    __table_args__ = (
        UniqueConstraint("user_id", "id", name="uq_binders_owner_id"),
        UniqueConstraint("user_id", "display_order", name="uq_binders_owner_order"),
        CheckConstraint(
            "length(name) BETWEEN 1 AND 80 AND name = trim(name)",
            name="ck_binders_name",
        ),
        CheckConstraint("display_order >= 0", name="ck_binders_order"),
        CheckConstraint("cover IN ('noir')", name="ck_binders_cover"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    display_order: Mapped[int] = mapped_column(nullable=False)
    cover: Mapped[str] = mapped_column(
        String(16), nullable=False, default="noir", server_default="noir"
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


class BinderPocket(Base):
    """One pocket (page 1-40, pocket 1-9) holding one owned copy."""

    __tablename__ = "binder_pockets"
    __table_args__ = (
        ForeignKeyConstraint(
            ["user_id", "binder_id"],
            ["binders.user_id", "binders.id"],
            ondelete="CASCADE",
            name="fk_binder_pocket_owned_binder",
        ),
        ForeignKeyConstraint(
            ["user_id", "copy_id"],
            ["inventory_copies.user_id", "inventory_copies.id"],
            ondelete="CASCADE",
            name="fk_binder_pocket_owned_copy",
        ),
        UniqueConstraint("copy_id", name="uq_binder_pockets_copy"),
        CheckConstraint("page BETWEEN 1 AND 40", name="ck_binder_pockets_page"),
        CheckConstraint("pocket BETWEEN 1 AND 9", name="ck_binder_pockets_pocket"),
        Index("ix_binder_pockets_owner", "user_id"),
    )

    user_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    binder_id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    page: Mapped[int] = mapped_column(SmallInteger, primary_key=True)
    pocket: Mapped[int] = mapped_column(SmallInteger, primary_key=True)
    copy_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    placed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


_PRICE_COLUMNS = (
    "cm_trend",
    "cm_trend_reverse",
    "tp_normal",
    "tp_holofoil",
    "tp_reverse",
)
_ANY_PRICE = " OR ".join(f"{name} IS NOT NULL" for name in _PRICE_COLUMNS)


class CardPriceSnapshot(Base):
    """Latest selectable reference prices for one catalog printing (shared data).

    Only values a copy can be priced with are stored; highPrice never is. No user_id:
    prices belong to the catalog, copies are valued by joining at read time.
    """

    __tablename__ = "card_price_snapshots"
    __table_args__ = (
        CheckConstraint("status IN ('ok', 'no_data')", name="ck_price_status"),
        CheckConstraint(
            f"(status = 'ok') = ({_ANY_PRICE})", name="ck_price_status_data"
        ),
        *(
            CheckConstraint(
                f"{name} IS NULL OR ({name} > 0 AND {name} <= 1000000)",
                name=f"ck_price_{name}",
            )
            for name in _PRICE_COLUMNS
        ),
    )

    card_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    status: Mapped[str] = mapped_column(String(8), nullable=False)
    cm_trend: Mapped[Decimal | None] = mapped_column(Numeric(12, 4))
    cm_trend_reverse: Mapped[Decimal | None] = mapped_column(Numeric(12, 4))
    cm_updated: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    tp_normal: Mapped[Decimal | None] = mapped_column(Numeric(12, 4))
    tp_holofoil: Mapped[Decimal | None] = mapped_column(Numeric(12, 4))
    tp_reverse: Mapped[Decimal | None] = mapped_column(Numeric(12, 4))
    tp_updated: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    has_normal: Mapped[bool | None] = mapped_column(Boolean)
    has_holo: Mapped[bool | None] = mapped_column(Boolean)
    has_reverse: Mapped[bool | None] = mapped_column(Boolean)
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class ExchangeRate(Base):
    """Single cached provider row. Rates are null until the first successful fetch."""

    __tablename__ = "exchange_rates"
    __table_args__ = (
        CheckConstraint("length(source) > 0", name="ck_rates_source"),
        CheckConstraint(
            "(usd_clp IS NULL) = (eur_per_usd IS NULL) "
            "AND (usd_clp IS NULL) = (rates_updated_at IS NULL) "
            "AND (usd_clp IS NULL) = (fetched_at IS NULL)",
            name="ck_rates_all_or_none",
        ),
        CheckConstraint("usd_clp IS NULL OR usd_clp > 0", name="ck_rates_usd_clp"),
        CheckConstraint(
            "eur_per_usd IS NULL OR eur_per_usd > 0", name="ck_rates_eur_per_usd"
        ),
    )

    source: Mapped[str] = mapped_column(String(32), primary_key=True)
    usd_clp: Mapped[Decimal | None] = mapped_column(Numeric(14, 6))
    eur_per_usd: Mapped[Decimal | None] = mapped_column(Numeric(14, 6))
    rates_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    fetched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_attempt_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
