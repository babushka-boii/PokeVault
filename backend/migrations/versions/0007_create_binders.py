"""Binders replace personal boxes: copy every box and slot, keep the box tables frozen.

Each box becomes a binder with the same id, name, order and timestamps, and the
"noir" cover. Zero-based slot position p maps to page p // 9 + 1 and pocket
p % 9 + 1 (1-based position 1-30 -> page ceil(pos/9), pocket ((pos-1) mod 9)+1).
The box tables are not touched, so downgrade only drops the binder tables and
0006 is restored exactly. A later migration drops the frozen box tables.
"""

import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "binders",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("display_order", sa.Integer(), nullable=False),
        sa.Column("cover", sa.String(16), nullable=False, server_default="noir"),
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
        sa.UniqueConstraint("user_id", "id", name="uq_binders_owner_id"),
        sa.UniqueConstraint("user_id", "display_order", name="uq_binders_owner_order"),
        sa.CheckConstraint(
            "length(name) BETWEEN 1 AND 80 AND name = trim(name)",
            name="ck_binders_name",
        ),
        sa.CheckConstraint("display_order >= 0", name="ck_binders_order"),
        sa.CheckConstraint("cover IN ('noir')", name="ck_binders_cover"),
    )
    op.create_table(
        "binder_pockets",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("binder_id", sa.Uuid(), primary_key=True),
        sa.Column("page", sa.SmallInteger(), primary_key=True),
        sa.Column("pocket", sa.SmallInteger(), primary_key=True),
        sa.Column("copy_id", sa.Uuid(), nullable=False),
        sa.Column(
            "placed_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["user_id", "binder_id"],
            ["binders.user_id", "binders.id"],
            ondelete="CASCADE",
            name="fk_binder_pocket_owned_binder",
        ),
        sa.ForeignKeyConstraint(
            ["user_id", "copy_id"],
            ["inventory_copies.user_id", "inventory_copies.id"],
            ondelete="CASCADE",
            name="fk_binder_pocket_owned_copy",
        ),
        sa.UniqueConstraint("copy_id", name="uq_binder_pockets_copy"),
        sa.CheckConstraint("page BETWEEN 1 AND 40", name="ck_binder_pockets_page"),
        sa.CheckConstraint("pocket BETWEEN 1 AND 9", name="ck_binder_pockets_pocket"),
    )
    op.create_index("ix_binder_pockets_owner", "binder_pockets", ["user_id"])
    op.execute(
        sa.text(
            "INSERT INTO binders (id, user_id, name, display_order, cover,"
            " created_at, updated_at)"
            " SELECT id, user_id, name, display_order, 'noir', created_at, updated_at"
            " FROM personal_boxes"
        )
    )
    op.execute(
        sa.text(
            "INSERT INTO binder_pockets (user_id, binder_id, page, pocket, copy_id)"
            " SELECT user_id, box_id, position / 9 + 1, position % 9 + 1, copy_id"
            " FROM box_memberships"
        )
    )


def downgrade():
    # The frozen box tables still hold the 0006 data; binders are discarded.
    op.drop_index("ix_binder_pockets_owner", table_name="binder_pockets")
    op.drop_table("binder_pockets")
    op.drop_table("binders")
