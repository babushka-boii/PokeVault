"""Profile (Iteration 10): the trainer sprite and the team of up to 5 species.

Upgrade adds two columns to ``user_settings``: ``trainer_id`` (one of four fixed
sprites, default ``mateo``) and ``team`` (a JSON list of national numbers). The team's
size, range and uniqueness are validated by the API; the trainer by a check constraint.

Downgrade drops both columns; only the chosen trainer and team are lost.
"""

import sqlalchemy as sa
from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("user_settings") as batch:
        batch.add_column(
            sa.Column(
                "trainer_id",
                sa.String(16),
                nullable=False,
                server_default="mateo",
            )
        )
        batch.add_column(
            sa.Column("team", sa.JSON(), nullable=False, server_default="[]")
        )
        batch.create_check_constraint(
            "ck_settings_trainer",
            "trainer_id IN ('mateo', 'diego', 'valentina', 'camila')",
        )


def downgrade():
    with op.batch_alter_table("user_settings") as batch:
        batch.drop_constraint("ck_settings_trainer", type_="check")
        batch.drop_column("team")
        batch.drop_column("trainer_id")
