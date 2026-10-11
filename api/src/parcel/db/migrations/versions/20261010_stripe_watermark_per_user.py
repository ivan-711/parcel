"""Remember the newest Stripe event applied to each user

Revision ID: 8d41b7a2c6e3
Revises: 5c2f0d1e8b47
Create Date: 2026-10-10 15:40:27.615390

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "8d41b7a2c6e3"
down_revision: str | Sequence[str] | None = "5c2f0d1e8b47"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("stripe_event_created", sa.BigInteger(), server_default="0", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("users", "stripe_event_created")
