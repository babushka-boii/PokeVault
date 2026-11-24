"""Add the dark "Unova Noir" wallpaper and make it the default for new personal boxes.

Existing boxes keep their stored wallpaper: the database cannot tell a chosen
"classic" from the previous default. Downgrade maps "noir" back to "classic".
"""

import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None

CONSTRAINT = "ck_personal_boxes_wallpaper"
WITH_NOIR = "wallpaper IN ('noir','classic','forest','ocean','night')"
RETRO_ONLY = "wallpaper IN ('classic','forest','ocean','night')"


def upgrade():
    op.drop_constraint(CONSTRAINT, "personal_boxes", type_="check")
    op.create_check_constraint(CONSTRAINT, "personal_boxes", WITH_NOIR)
    op.alter_column("personal_boxes", "wallpaper", server_default="noir")


def downgrade():
    op.alter_column("personal_boxes", "wallpaper", server_default="classic")
    op.execute(
        sa.text(
            "UPDATE personal_boxes SET wallpaper = 'classic' WHERE wallpaper = 'noir'"
        )
    )
    op.drop_constraint(CONSTRAINT, "personal_boxes", type_="check")
    op.create_check_constraint(CONSTRAINT, "personal_boxes", RETRO_ONLY)
