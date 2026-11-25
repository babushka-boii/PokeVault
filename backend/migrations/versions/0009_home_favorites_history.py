"""Home (9A): card favourites, daily collection value records and the guide state.

Upgrade only adds: two tables and one nullable column. Existing data is untouched.

Downgrade drops them. That loses favourites, the recorded value history and whether the
new-user guide was closed; it never touches inventory, binders, pockets or prices.
"""

import sqlalchemy as sa
from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "user_settings",
        sa.Column("home_guide_dismissed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_table(
        "card_favorites",
        sa.Column(
            "user_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("card_id", sa.String(100), primary_key=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint(
            "length(card_id) BETWEEN 1 AND 100", name="ck_favorites_card"
        ),
    )
    op.create_index(
        "ix_card_favorites_owner_date", "card_favorites", ["user_id", "created_at"]
    )
    op.create_table(
        "collection_value_days",
        sa.Column(
            "user_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("day", sa.Date(), primary_key=True),
        sa.Column("eur_total", sa.Numeric(14, 2), nullable=False),
        sa.Column("usd_original_total", sa.Numeric(14, 2), nullable=False),
        sa.Column("clp_total", sa.Numeric(16, 0)),
        sa.Column("usd_total", sa.Numeric(14, 2)),
        sa.Column("usd_clp", sa.Numeric(14, 6)),
        sa.Column("eur_per_usd", sa.Numeric(14, 6)),
        sa.Column("copy_count", sa.Integer(), nullable=False),
        sa.Column("priced_count", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint("eur_total >= 0", name="ck_value_days_eur"),
        sa.CheckConstraint(
            "usd_original_total >= 0", name="ck_value_days_usd_original"
        ),
        sa.CheckConstraint(
            "clp_total IS NULL OR clp_total >= 0", name="ck_value_days_clp"
        ),
        sa.CheckConstraint(
            "usd_total IS NULL OR usd_total >= 0", name="ck_value_days_usd"
        ),
        sa.CheckConstraint(
            "usd_clp IS NULL OR usd_clp > 0", name="ck_value_days_usd_clp"
        ),
        sa.CheckConstraint(
            "eur_per_usd IS NULL OR eur_per_usd > 0", name="ck_value_days_eur_per_usd"
        ),
        sa.CheckConstraint(
            "(clp_total IS NULL) = (usd_total IS NULL) "
            "AND (clp_total IS NULL) = (usd_clp IS NULL) "
            "AND (clp_total IS NULL) = (eur_per_usd IS NULL)",
            name="ck_value_days_all_or_none",
        ),
        sa.CheckConstraint(
            "copy_count >= 0 AND priced_count >= 0 AND priced_count <= copy_count",
            name="ck_value_days_counts",
        ),
    )


def downgrade():
    op.drop_table("collection_value_days")
    op.drop_index("ix_card_favorites_owner_date", table_name="card_favorites")
    op.drop_table("card_favorites")
    op.drop_column("user_settings", "home_guide_dismissed_at")
