"""Repair deal inputs saved before two checks were added

Revision ID: b2e6d4a8f1c3
Revises: 3f7a9c2d1e58
Create Date: 2026-10-12 17:48:02.907315

A creative finance deal can no longer put more cash to the seller than the
price leaves after the existing loan, and a buy and hold can't price its sale
off a cap rate without a full year of rent first. Rows saved before those
checks existed would fail to load, taking their owner's whole deal list down
with them, so they are brought in line here: the cash to seller is capped at
what the price allows, and the cap rate exit comes off a hold too short for it.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "b2e6d4a8f1c3"
down_revision: str | Sequence[str] | None = "3f7a9c2d1e58"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

REPAIRS = (
    """
    UPDATE deals
    SET inputs = jsonb_set(
        inputs,
        '{cash_to_seller}',
        to_jsonb(GREATEST((inputs->>'price')::numeric - (inputs->>'existing_balance')::numeric, 0))
    )
    WHERE strategy = 'creative'
      AND (inputs->>'existing_balance')::numeric + COALESCE((inputs->>'cash_to_seller')::numeric, 0)
          > (inputs->>'price')::numeric
    """,
    """
    UPDATE deals
    SET inputs = jsonb_set(inputs, '{exit_cap_rate}', 'null'::jsonb)
    WHERE strategy = 'buy_and_hold'
      AND inputs->>'exit_cap_rate' IS NOT NULL
      AND (inputs->>'hold_years')::int * 12
          - COALESCE((inputs->>'rehab_months')::int, 0)
          - COALESCE((inputs->'operations'->>'lease_up_months')::int, 0) < 12
    """,
)


def upgrade() -> None:
    for statement in REPAIRS:
        op.execute(statement)


def downgrade() -> None:
    pass
