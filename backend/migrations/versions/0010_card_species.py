"""Pokédex (9B): remember which Pokémon each catalog card shows.

Upgrade only adds ``card_species``: shared catalog data (no user column) filled
lazily from TCGdex, so ownership can be counted per species. Nothing else changes.

Downgrade drops it. That only loses a cache rebuilt on the next visit; inventory,
binders, favourites, history and prices are untouched.
"""

import sqlalchemy as sa
from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "card_species",
        sa.Column("card_id", sa.String(100), primary_key=True),
        sa.Column("dex_ids", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(8), nullable=False),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "length(card_id) BETWEEN 1 AND 100", name="ck_card_species_card"
        ),
        sa.CheckConstraint(
            "status IN ('ok', 'unknown')", name="ck_card_species_status"
        ),
    )


def downgrade():
    op.drop_table("card_species")
