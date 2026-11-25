"""Binder customization (8D Part 2): cover materials, stickers and stored pages.

Upgrade:
- widens ``ck_binders_cover`` to the five materials (noir stays the default);
- adds ``binders.page_count`` (even, 2-40), filled for existing binders with their
  used pages plus one spare, rounded up to even (min 2, max 40): what the app used to
  derive, so nothing changes on screen;
- creates ``binder_stickers`` (at most 24 per binder, owner-scoped, cascading).

Downgrade DROPS the personalization: stickers are deleted, every cover becomes
``noir`` and the stored page count is removed (the derived rule applies again).
Pockets, copies, names, order and prices are never touched.
"""

import sqlalchemy as sa
from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None

COVERS = "('noir', 'brown_leather', 'metallic', 'holographic', 'white')"


def _visible_pages(max_page):
    wanted = 1 if max_page is None else max_page + 1
    return min(40, max(2, -(-wanted // 2) * 2))


def upgrade():
    with op.batch_alter_table("binders") as batch:
        batch.drop_constraint("ck_binders_cover", type_="check")
        batch.add_column(
            sa.Column(
                "page_count", sa.SmallInteger(), nullable=False, server_default="2"
            )
        )
        batch.create_check_constraint("ck_binders_cover", f"cover IN {COVERS}")
        batch.create_check_constraint(
            "ck_binders_page_count",
            "page_count BETWEEN 2 AND 40 AND page_count % 2 = 0",
        )
    connection = op.get_bind()
    used = connection.execute(
        sa.text("SELECT binder_id, MAX(page) FROM binder_pockets GROUP BY binder_id")
    ).all()
    for binder_id, max_page in used:
        connection.execute(
            sa.text("UPDATE binders SET page_count = :pages WHERE id = :id"),
            {"pages": _visible_pages(max_page), "id": binder_id},
        )
    op.create_table(
        "binder_stickers",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("binder_id", sa.Uuid(), nullable=False),
        sa.Column("kind", sa.String(8), nullable=False),
        sa.Column("species_id", sa.SmallInteger()),
        sa.Column("pixel_key", sa.String(16)),
        sa.Column("x", sa.Numeric(5, 2), nullable=False),
        sa.Column("y", sa.Numeric(5, 2), nullable=False),
        sa.Column("rotation", sa.Numeric(5, 1), nullable=False),
        sa.Column("scale", sa.Numeric(3, 2), nullable=False),
        sa.Column("display_order", sa.SmallInteger(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["user_id", "binder_id"],
            ["binders.user_id", "binders.id"],
            ondelete="CASCADE",
            name="fk_binder_sticker_owned_binder",
        ),
        sa.UniqueConstraint(
            "binder_id", "display_order", name="uq_binder_stickers_order"
        ),
        sa.CheckConstraint(
            "kind IN ('pokemon', 'pixel')", name="ck_binder_stickers_kind"
        ),
        sa.CheckConstraint(
            "(kind = 'pokemon' AND species_id BETWEEN 1 AND 1025 AND pixel_key IS NULL)"
            " OR (kind = 'pixel' AND species_id IS NULL AND pixel_key IN "
            "('star', 'bolt', 'heart', 'creature', 'circle'))",
            name="ck_binder_stickers_reference",
        ),
        sa.CheckConstraint("x BETWEEN 0 AND 100", name="ck_binder_stickers_x"),
        sa.CheckConstraint("y BETWEEN 0 AND 100", name="ck_binder_stickers_y"),
        sa.CheckConstraint(
            "rotation BETWEEN -180 AND 180", name="ck_binder_stickers_rotation"
        ),
        sa.CheckConstraint("scale BETWEEN 0.5 AND 2", name="ck_binder_stickers_scale"),
        sa.CheckConstraint(
            "display_order BETWEEN 0 AND 23", name="ck_binder_stickers_display_order"
        ),
    )
    op.create_index(
        "ix_binder_stickers_owner_binder", "binder_stickers", ["user_id", "binder_id"]
    )


def downgrade():
    op.drop_index("ix_binder_stickers_owner_binder", table_name="binder_stickers")
    op.drop_table("binder_stickers")
    op.execute("UPDATE binders SET cover = 'noir'")
    with op.batch_alter_table("binders") as batch:
        batch.drop_constraint("ck_binders_page_count", type_="check")
        batch.drop_constraint("ck_binders_cover", type_="check")
        batch.drop_column("page_count")
        batch.create_check_constraint("ck_binders_cover", "cover IN ('noir')")
