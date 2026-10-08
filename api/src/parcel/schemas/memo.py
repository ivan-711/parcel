import uuid
from datetime import datetime

from pydantic import BaseModel


class MemoOut(BaseModel):
    id: uuid.UUID
    deal_id: uuid.UUID
    body: str
    model: str
    grounded: bool
    """True when every number in the memo matches a computed figure."""
    unmatched: list[str]
    stale: bool
    """True when the deal has changed since the memo was written."""
    created_at: datetime


class MemoProblem(BaseModel):
    code: str
    title: str
