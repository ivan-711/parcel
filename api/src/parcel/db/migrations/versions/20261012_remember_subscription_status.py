"""Remember the subscription status each Stripe event carried

Revision ID: 3f7a9c2d1e58
Revises: 8d41b7a2c6e3
Create Date: 2026-10-12 17:05:11.284710

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "3f7a9c2d1e58"
down_revision: str | Sequence[str] | None = "8d41b7a2c6e3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "stripe_events", sa.Column("subscription_status", sa.String(length=32), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("stripe_events", "subscription_status")
