"""Order Stripe events by their own timestamp

Revision ID: 5c2f0d1e8b47
Revises: a9594eeec72a
Create Date: 2026-10-10 14:05:12.418203

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "5c2f0d1e8b47"
down_revision: str | Sequence[str] | None = "a9594eeec72a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("stripe_events", sa.Column("customer", sa.String(length=64), nullable=True))
    op.add_column(
        "stripe_events",
        sa.Column("created", sa.BigInteger(), server_default="0", nullable=False),
    )
    op.create_index(op.f("ix_stripe_events_customer"), "stripe_events", ["customer"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_stripe_events_customer"), table_name="stripe_events")
    op.drop_column("stripe_events", "created")
    op.drop_column("stripe_events", "customer")
