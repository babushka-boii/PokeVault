"""Drop the frozen personal-box tables; binders (0007) are the source of truth.

Upgrade only drops ``box_memberships`` and ``personal_boxes``. It does not touch
``inventory_copies``: the ``uq_inventory_owner_id`` unique key was created by 0004,
but the binder tables of 0007 depend on it through a composite foreign key.

Downgrade recreates both tables exactly as they were at 0006 and rebuilds the boxes from
the binders: each binder is split into boxes of 30 pockets in page order (flat pocket
index ``(page - 1) * 9 + (pocket - 1)``, box ``index // 30``, position ``index % 30``).
The first box keeps the binder's id and name; the others get new ids and the name
``"<name> (N)"`` (truncated to 80 characters). Boxes are numbered per owner in binder
order. Covers are not representable in boxes: every rebuilt box uses the ``noir``
wallpaper.
"""

from collections import defaultdict
from uuid import uuid4

import sqlalchemy as sa
from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None

BOX_SIZE = 30
POCKETS_PER_PAGE = 9
NAME_LIMIT = 80


def upgrade():
    op.drop_table("box_memberships")
    op.drop_table("personal_boxes")


def downgrade():
    _create_box_tables()
    _rebuild_boxes_from_binders()


def _create_box_tables():
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
        sa.Column("wallpaper", sa.String(16), nullable=False, server_default="noir"),
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
            "wallpaper IN ('noir','classic','forest','ocean','night')",
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


def _box_name(name: str, box_number: int) -> str:
    if box_number == 0:
        return name
    suffix = f" ({box_number + 1})"
    return name[: NAME_LIMIT - len(suffix)].rstrip() + suffix


def _rebuild_boxes_from_binders():
    binders = sa.table(
        "binders",
        sa.column("id", sa.Uuid()),
        sa.column("user_id", sa.Uuid()),
        sa.column("name", sa.String()),
        sa.column("display_order", sa.Integer()),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )
    pockets = sa.table(
        "binder_pockets",
        sa.column("user_id", sa.Uuid()),
        sa.column("binder_id", sa.Uuid()),
        sa.column("page", sa.SmallInteger()),
        sa.column("pocket", sa.SmallInteger()),
        sa.column("copy_id", sa.Uuid()),
    )
    boxes = sa.table(
        "personal_boxes",
        sa.column("id", sa.Uuid()),
        sa.column("user_id", sa.Uuid()),
        sa.column("name", sa.String()),
        sa.column("display_order", sa.Integer()),
        sa.column("wallpaper", sa.String()),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )
    memberships = sa.table(
        "box_memberships",
        sa.column("user_id", sa.Uuid()),
        sa.column("box_id", sa.Uuid()),
        sa.column("position", sa.Integer()),
        sa.column("copy_id", sa.Uuid()),
    )
    connection = op.get_bind()
    held = defaultdict(list)
    for binder_id, page, pocket, copy_id in connection.execute(
        sa.select(
            pockets.c.binder_id, pockets.c.page, pockets.c.pocket, pockets.c.copy_id
        )
    ):
        index = (page - 1) * POCKETS_PER_PAGE + (pocket - 1)
        held[binder_id].append((index, copy_id))

    next_order = defaultdict(int)
    box_rows, membership_rows = [], []
    ordered = connection.execute(
        sa.select(
            binders.c.id,
            binders.c.user_id,
            binders.c.name,
            binders.c.created_at,
            binders.c.updated_at,
        ).order_by(binders.c.user_id, binders.c.display_order, binders.c.id)
    )
    for binder_id, user_id, name, created_at, updated_at in ordered:
        by_box = defaultdict(list)
        for index, copy_id in held[binder_id]:
            by_box[index // BOX_SIZE].append((index % BOX_SIZE, copy_id))
        # The first box always exists, even for an empty binder.
        for box_number in sorted({0, *by_box}):
            box_id = binder_id if box_number == 0 else uuid4()
            box_rows.append(
                {
                    "id": box_id,
                    "user_id": user_id,
                    "name": _box_name(name, box_number),
                    "display_order": next_order[user_id],
                    "wallpaper": "noir",
                    "created_at": created_at,
                    "updated_at": updated_at,
                }
            )
            next_order[user_id] += 1
            membership_rows.extend(
                {
                    "user_id": user_id,
                    "box_id": box_id,
                    "position": position,
                    "copy_id": copy_id,
                }
                for position, copy_id in sorted(by_box[box_number])
            )
    if box_rows:
        connection.execute(sa.insert(boxes), box_rows)
    if membership_rows:
        connection.execute(sa.insert(memberships), membership_rows)
