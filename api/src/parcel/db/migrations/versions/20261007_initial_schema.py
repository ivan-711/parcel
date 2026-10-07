"""Initial schema with row-level security

Revision ID: a9594eeec72a
Revises:
Create Date: 2026-10-07 12:55:34.020608

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "a9594eeec72a"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "provider_cache",
        sa.Column("key", sa.String(length=300), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "fetched_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("key", name=op.f("pk_provider_cache")),
    )
    op.create_index(
        op.f("ix_provider_cache_expires_at"), "provider_cache", ["expires_at"], unique=False
    )
    op.create_table(
        "stripe_events",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("type", sa.String(length=100), nullable=False),
        sa.Column(
            "received_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_stripe_events")),
    )
    op.create_table(
        "usage",
        sa.Column("bucket", sa.String(length=200), nullable=False),
        sa.Column("period", sa.Date(), nullable=False),
        sa.Column("count", sa.BigInteger(), server_default="0", nullable=False),
        sa.PrimaryKeyConstraint("bucket", "period", name=op.f("pk_usage")),
    )
    op.create_table(
        "users",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("clerk_id", sa.String(length=64), nullable=True),
        sa.Column("email", sa.String(length=320), nullable=True),
        sa.Column("name", sa.String(length=200), nullable=True),
        sa.Column(
            "plan", sa.Enum("free", "pro", name="plan"), server_default="free", nullable=False
        ),
        sa.Column("stripe_customer_id", sa.String(length=64), nullable=True),
        sa.Column(
            "defaults",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("demo_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
        sa.UniqueConstraint("clerk_id", name=op.f("uq_users_clerk_id")),
        sa.UniqueConstraint("stripe_customer_id", name=op.f("uq_users_stripe_customer_id")),
    )
    op.create_table(
        "deals",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("owner_id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column(
            "strategy",
            sa.Enum("buy_and_hold", "brrrr", "flip", "creative", "wholesale", name="strategy"),
            nullable=False,
        ),
        sa.Column(
            "stage",
            sa.Enum(
                "lead", "analyzing", "offer", "under_contract", "owned", "passed", name="stage"
            ),
            server_default="lead",
            nullable=False,
        ),
        sa.Column("position", sa.Integer(), server_default="0", nullable=False),
        sa.Column(
            "address",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("inputs", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "provenance",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("notes", sa.Text(), server_default="", nullable=False),
        sa.Column("share_token", sa.String(length=43), nullable=True),
        sa.Column("acquired_on", sa.Date(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["owner_id"], ["users.id"], name=op.f("fk_deals_owner_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_deals")),
        sa.UniqueConstraint("share_token", name=op.f("uq_deals_share_token")),
    )
    op.create_index(
        "ix_deals_owner_stage", "deals", ["owner_id", "stage", "position"], unique=False
    )
    op.create_index("ix_deals_owner_updated", "deals", ["owner_id", "updated_at"], unique=False)
    op.create_table(
        "actuals",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("deal_id", sa.UUID(), nullable=False),
        sa.Column("owner_id", sa.UUID(), nullable=False),
        sa.Column("month", sa.Date(), nullable=False),
        sa.Column(
            "rent_collected", sa.Numeric(precision=12, scale=2, asdecimal=False), nullable=False
        ),
        sa.Column(
            "operating_expenses", sa.Numeric(precision=12, scale=2, asdecimal=False), nullable=False
        ),
        sa.Column(
            "debt_service", sa.Numeric(precision=12, scale=2, asdecimal=False), nullable=False
        ),
        sa.Column(
            "capital_spent",
            sa.Numeric(precision=12, scale=2, asdecimal=False),
            server_default="0",
            nullable=False,
        ),
        sa.Column("note", sa.Text(), server_default="", nullable=False),
        sa.ForeignKeyConstraint(
            ["deal_id"], ["deals.id"], name=op.f("fk_actuals_deal_id_deals"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["owner_id"], ["users.id"], name=op.f("fk_actuals_owner_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_actuals")),
        sa.UniqueConstraint("deal_id", "month", name=op.f("uq_actuals_deal_id")),
    )
    op.create_table(
        "memos",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("deal_id", sa.UUID(), nullable=False),
        sa.Column("owner_id", sa.UUID(), nullable=False),
        sa.Column("scenario_hash", sa.String(length=64), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("model", sa.String(length=64), nullable=False),
        sa.Column("grounded", sa.Boolean(), nullable=False),
        sa.Column(
            "unmatched",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["deal_id"], ["deals.id"], name=op.f("fk_memos_deal_id_deals"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["owner_id"], ["users.id"], name=op.f("fk_memos_owner_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_memos")),
    )
    op.create_index(op.f("ix_memos_deal_id"), "memos", ["deal_id"], unique=False)

    enable_row_level_security()


TENANT_TABLES = {"users": "id", "deals": "owner_id", "actuals": "owner_id", "memos": "owner_id"}


def enable_row_level_security() -> None:
    op.execute(
        "do $$ begin if not exists (select from pg_roles where rolname = 'parcel_app') "
        "then create role parcel_app nologin; end if; end $$"
    )
    op.execute("grant parcel_app to current_user")
    op.execute("grant usage on schema public to parcel_app")
    op.execute("grant select, insert, update, delete on all tables in schema public to parcel_app")
    for table, column in TENANT_TABLES.items():
        rule = (
            f"{column} = nullif(current_setting('app.user_id', true), '')::uuid "
            "or current_setting('app.system', true) = 'on'"
        )
        op.execute(f"alter table {table} enable row level security")
        op.execute(f"alter table {table} force row level security")
        op.execute(f"create policy tenant on {table} using ({rule}) with check ({rule})")


def downgrade() -> None:
    op.drop_index(op.f("ix_memos_deal_id"), table_name="memos")
    op.drop_table("memos")
    op.drop_table("actuals")
    op.drop_index("ix_deals_owner_updated", table_name="deals")
    op.drop_index("ix_deals_owner_stage", table_name="deals")
    op.drop_table("deals")
    op.drop_table("users")
    op.execute("drop type if exists stage")
    op.execute("drop type if exists strategy")
    op.execute("drop type if exists plan")
    op.drop_table("usage")
    op.drop_table("stripe_events")
    op.drop_index(op.f("ix_provider_cache_expires_at"), table_name="provider_cache")
    op.drop_table("provider_cache")
