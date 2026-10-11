import enum
import uuid
from datetime import date, datetime
from typing import Any, ClassVar

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    MetaData,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

NAMING = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING)
    type_annotation_map: ClassVar[dict[Any, Any]] = {
        dict[str, Any]: JSONB,
        uuid.UUID: UUID(as_uuid=True),
    }


def _now() -> Any:
    return mapped_column(DateTime(timezone=True), server_default=func.now())


class Plan(enum.StrEnum):
    free = "free"
    pro = "pro"


class Strategy(enum.StrEnum):
    buy_and_hold = "buy_and_hold"
    brrrr = "brrrr"
    flip = "flip"
    creative = "creative"
    wholesale = "wholesale"


class Stage(enum.StrEnum):
    lead = "lead"
    analyzing = "analyzing"
    offer = "offer"
    under_contract = "under_contract"
    owned = "owned"
    passed = "passed"


def _enum(e: type[enum.StrEnum], name: str) -> Enum:
    return Enum(e, name=name, values_callable=lambda members: [m.value for m in members])


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, server_default=text("gen_random_uuid()")
    )
    clerk_id: Mapped[str | None] = mapped_column(String(64), unique=True)
    email: Mapped[str | None] = mapped_column(String(320))
    name: Mapped[str | None] = mapped_column(String(200))
    plan: Mapped[Plan] = mapped_column(_enum(Plan, "plan"), server_default=Plan.free.value)
    stripe_customer_id: Mapped[str | None] = mapped_column(String(64), unique=True)
    stripe_event_created: Mapped[int] = mapped_column(BigInteger, server_default="0")
    """Stripe's timestamp on the last event applied here. Older ones are stale."""
    defaults: Mapped[dict[str, Any]] = mapped_column(server_default=text("'{}'::jsonb"))
    demo_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = _now()

    @property
    def is_demo(self) -> bool:
        return self.demo_expires_at is not None


class Deal(Base):
    __tablename__ = "deals"
    __table_args__ = (
        Index("ix_deals_owner_stage", "owner_id", "stage", "position"),
        Index("ix_deals_owner_updated", "owner_id", "updated_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, server_default=text("gen_random_uuid()")
    )
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(200))
    strategy: Mapped[Strategy] = mapped_column(_enum(Strategy, "strategy"))
    stage: Mapped[Stage] = mapped_column(_enum(Stage, "stage"), server_default=Stage.lead.value)
    position: Mapped[int] = mapped_column(Integer, server_default="0")
    address: Mapped[dict[str, Any]] = mapped_column(server_default=text("'{}'::jsonb"))
    inputs: Mapped[dict[str, Any]]
    provenance: Mapped[dict[str, Any]] = mapped_column(server_default=text("'{}'::jsonb"))
    notes: Mapped[str] = mapped_column(Text, server_default="")
    share_token: Mapped[str | None] = mapped_column(String(43), unique=True)
    acquired_on: Mapped[date | None] = mapped_column(Date)
    created_at: Mapped[datetime] = _now()
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    actuals: Mapped[list["Actual"]] = relationship(
        back_populates="deal", cascade="all, delete-orphan", order_by="Actual.month"
    )


class Actual(Base):
    """What an owned property really did in a month, to compare against the projection."""

    __tablename__ = "actuals"
    __table_args__ = (UniqueConstraint("deal_id", "month"),)

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, server_default=text("gen_random_uuid()")
    )
    deal_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("deals.id", ondelete="CASCADE"))
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    month: Mapped[date] = mapped_column(Date)
    rent_collected: Mapped[float] = mapped_column(Numeric(12, 2, asdecimal=False))
    operating_expenses: Mapped[float] = mapped_column(Numeric(12, 2, asdecimal=False))
    debt_service: Mapped[float] = mapped_column(Numeric(12, 2, asdecimal=False))
    capital_spent: Mapped[float] = mapped_column(
        Numeric(12, 2, asdecimal=False), server_default="0"
    )
    note: Mapped[str] = mapped_column(Text, server_default="")

    deal: Mapped[Deal] = relationship(back_populates="actuals")


class Memo(Base):
    __tablename__ = "memos"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, server_default=text("gen_random_uuid()")
    )
    deal_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("deals.id", ondelete="CASCADE"), index=True
    )
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    scenario_hash: Mapped[str] = mapped_column(String(64))
    body: Mapped[str] = mapped_column(Text)
    model: Mapped[str] = mapped_column(String(64))
    grounded: Mapped[bool] = mapped_column(Boolean)
    unmatched: Mapped[dict[str, Any]] = mapped_column(server_default=text("'{}'::jsonb"))
    created_at: Mapped[datetime] = _now()


class ProviderCache(Base):
    __tablename__ = "provider_cache"

    key: Mapped[str] = mapped_column(String(300), primary_key=True)
    payload: Mapped[dict[str, Any]]
    fetched_at: Mapped[datetime] = _now()
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class Usage(Base):
    """Counters for anything rationed: provider calls, lookups, memos, demo sessions."""

    __tablename__ = "usage"

    bucket: Mapped[str] = mapped_column(String(200), primary_key=True)
    period: Mapped[date] = mapped_column(Date, primary_key=True)
    count: Mapped[int] = mapped_column(BigInteger, server_default="0")


class StripeEvent(Base):
    __tablename__ = "stripe_events"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    type: Mapped[str] = mapped_column(String(100))
    customer: Mapped[str | None] = mapped_column(String(64), index=True)
    created: Mapped[int] = mapped_column(BigInteger, server_default="0")
    """Stripe's own timestamp for the event, which orders retries correctly."""
    received_at: Mapped[datetime] = _now()
