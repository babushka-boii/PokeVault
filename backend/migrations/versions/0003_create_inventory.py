"""Persist personal physical TCG copies without copying public catalog data."""

import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "inventory_copies",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("card_id", sa.String(100), nullable=False),
        sa.Column("condition", sa.String(16), nullable=False),
        sa.Column("language", sa.String(8), nullable=False),
        sa.Column("variant", sa.String(16), nullable=False),
        sa.Column("acquired_on", sa.Date(), nullable=True),
        sa.Column("notes", sa.String(2000), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint(
            "condition IN ('mint','near_mint','excellent','good',"
            "'played','poor','unknown')",
            name="ck_inventory_condition",
        ),
        sa.CheckConstraint(
            "language IN ('es','en','ja','fr','de','it',"
            "'pt','ko','zh','id','th','other')",
            name="ck_inventory_language",
        ),
        sa.CheckConstraint(
            "variant IN ('normal','holo','reverse','first_edition','other','unknown')",
            name="ck_inventory_variant",
        ),
        sa.CheckConstraint("length(notes) <= 2000", name="ck_inventory_notes"),
    )
    op.create_index(
        "ix_inventory_owner_created",
        "inventory_copies",
        ["user_id", "created_at", "id"],
    )
    op.create_index(
        "ix_inventory_owner_card", "inventory_copies", ["user_id", "card_id"]
    )


def downgrade():
    op.drop_table("inventory_copies")
