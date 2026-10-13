"""Forget sample lookups that were cached as live data

Revision ID: c9d1e7b3a5f2
Revises: b2e6d4a8f1c3
Create Date: 2026-10-12 17:52:40.118262

Demo lookups answer from recorded samples for two Sheboygan addresses. Until
they got their own cache namespace, those answers were stored under the same
keys live lookups read, so a signed in user asking about either address, or
about any home in that county, could be handed sample figures labelled as
RentCast, Census or HUD data. Those entries go, and live lookups refill them.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "c9d1e7b3a5f2"
down_revision: str | Sequence[str] | None = "b2e6d4a8f1c3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SWEEP = """
    DELETE FROM provider_cache
    WHERE key NOT LIKE 'sample:%'
      AND (
        key IN ('acs:55117', 'fred:MORTGAGE30US')
        OR key LIKE 'hud:55117:%'
        OR payload::text LIKE '%1420 N 14th St%'
        OR payload::text LIKE '%2210 Kohler Ave%'
      )
"""


def upgrade() -> None:
    op.execute(SWEEP)


def downgrade() -> None:
    pass
