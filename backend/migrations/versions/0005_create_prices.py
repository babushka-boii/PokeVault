"""Cache reference prices and exchange rates; add the currency preference."""

import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None

PRICE_COLUMNS = (
    "cm_trend",
    "cm_trend_reverse",
    "tp_normal",
    "tp_holofoil",
    "tp_reverse",
)


def upgrade():
    any_price = " OR ".join(f"{name} IS NOT NULL" for name in PRICE_COLUMNS)
    op.create_table(
        "card_price_snapshots",
        sa.Column("card_id", sa.String(100), primary_key=True),
        sa.Column("status", sa.String(8), nullable=False),
        sa.Column("cm_trend", sa.Numeric(12, 4)),
        sa.Column("cm_trend_reverse", sa.Numeric(12, 4)),
        sa.Column("cm_updated", sa.DateTime(timezone=True)),
        sa.Column("tp_normal", sa.Numeric(12, 4)),
        sa.Column("tp_holofoil", sa.Numeric(12, 4)),
        sa.Column("tp_reverse", sa.Numeric(12, 4)),
        sa.Column("tp_updated", sa.DateTime(timezone=True)),
        sa.Column("has_normal", sa.Boolean()),
        sa.Column("has_holo", sa.Boolean()),
        sa.Column("has_reverse", sa.Boolean()),
        sa.Column(
            "fetched_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint("status IN ('ok', 'no_data')", name="ck_price_status"),
        sa.CheckConstraint(
            f"(status = 'ok') = ({any_price})", name="ck_price_status_data"
        ),
        *(
            sa.CheckConstraint(
                f"{name} IS NULL OR ({name} > 0 AND {name} <= 1000000)",
                name=f"ck_price_{name}",
            )
            for name in PRICE_COLUMNS
        ),
    )
    op.create_table(
        "exchange_rates",
        sa.Column("source", sa.String(32), primary_key=True),
        sa.Column("usd_clp", sa.Numeric(14, 6)),
        sa.Column("eur_per_usd", sa.Numeric(14, 6)),
        sa.Column("rates_updated_at", sa.DateTime(timezone=True)),
        sa.Column("fetched_at", sa.DateTime(timezone=True)),
        sa.Column(
            "last_attempt_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint("length(source) > 0", name="ck_rates_source"),
        sa.CheckConstraint(
            "(usd_clp IS NULL) = (eur_per_usd IS NULL) "
            "AND (usd_clp IS NULL) = (rates_updated_at IS NULL) "
            "AND (usd_clp IS NULL) = (fetched_at IS NULL)",
            name="ck_rates_all_or_none",
        ),
        sa.CheckConstraint("usd_clp IS NULL OR usd_clp > 0", name="ck_rates_usd_clp"),
        sa.CheckConstraint(
            "eur_per_usd IS NULL OR eur_per_usd > 0", name="ck_rates_eur_per_usd"
        ),
    )
    # Existing users get CLP through the server default; no inventory is touched.
    op.add_column(
        "user_settings",
        sa.Column(
            "preferred_currency", sa.String(3), nullable=False, server_default="CLP"
        ),
    )
    op.create_check_constraint(
        "ck_settings_currency", "user_settings", "preferred_currency IN ('CLP', 'USD')"
    )


def downgrade():
    # Prices and rates are a disposable cache; inventory and boxes stay in 0003/0004.
    op.drop_constraint("ck_settings_currency", "user_settings", type_="check")
    op.drop_column("user_settings", "preferred_currency")
    op.drop_table("exchange_rates")
    op.drop_table("card_price_snapshots")
