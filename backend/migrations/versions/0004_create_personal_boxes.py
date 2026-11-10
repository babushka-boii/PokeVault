"""Arrange existing physical copies in private, owner-checked personal boxes."""

import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade():
    op.create_unique_constraint(
        "uq_inventory_owner_id", "inventory_copies", ["user_id", "id"]
    )
    op.create_table(
        "personal_boxes",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("display_order", sa.Integer(), nullable=False),
        sa.Column("wallpaper", sa.String(16), nullable=False, server_default="classic"),
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
        sa.UniqueConstraint("user_id", "id", name="uq_personal_boxes_owner_id"),
        sa.UniqueConstraint(
            "user_id", "display_order", name="uq_personal_boxes_owner_order"
        ),
        sa.CheckConstraint(
            "length(name) BETWEEN 1 AND 80 AND name = trim(name)",
            name="ck_personal_boxes_name",
        ),
        sa.CheckConstraint("display_order >= 0", name="ck_personal_boxes_order"),
        sa.CheckConstraint(
            "wallpaper IN ('classic','forest','ocean','night')",
            name="ck_personal_boxes_wallpaper",
        ),
    )
    op.create_table(
        "box_memberships",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("box_id", sa.Uuid(), primary_key=True),
        sa.Column("position", sa.Integer(), primary_key=True),
        sa.Column("copy_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id", "box_id"],
            ["personal_boxes.user_id", "personal_boxes.id"],
            ondelete="CASCADE",
            name="fk_box_membership_owned_box",
        ),
        sa.ForeignKeyConstraint(
            ["user_id", "copy_id"],
            ["inventory_copies.user_id", "inventory_copies.id"],
            ondelete="CASCADE",
            name="fk_box_membership_owned_copy",
        ),
        sa.UniqueConstraint("copy_id", name="uq_box_membership_copy"),
        sa.CheckConstraint(
            "position BETWEEN 0 AND 29", name="ck_box_membership_position"
        ),
    )
    op.create_index("ix_box_membership_owner", "box_memberships", ["user_id"])


def downgrade():
    # Memberships and layout are disposable; physical copies remain in 0003.
    op.drop_table("box_memberships")
    op.drop_table("personal_boxes")
    op.drop_constraint("uq_inventory_owner_id", "inventory_copies", type_="unique")
