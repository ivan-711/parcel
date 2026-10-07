from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray

type Grid = NDArray[np.float64]
"""Shape (runs, months + 1). Column 0 is closing day."""


@dataclass(frozen=True)
class Schedule:
    interest: Grid
    principal: Grid
    balance: Grid
    """Balance at the end of each month. Zero before funding and after retirement."""
    payoff: Grid
    """Lump sum in the month the loan is retired: a refinance, a sale, or a balloon."""


def payment(principal: Grid, monthly_rate: Grid, months: int) -> Grid:
    """Level payment that retires `principal` in `months` payments."""
    if months <= 0:
        raise ValueError("amortization needs at least one month")
    safe = np.where(monthly_rate == 0, 1.0, monthly_rate)
    level = principal * safe / (1 - (1 + safe) ** -months)
    return np.where(monthly_rate == 0, principal / months, level)


def amortizing(
    principal: Grid,
    annual_rate: Grid,
    horizon: int,
    *,
    amort_months: int,
    io_months: int = 0,
    start: int = 0,
    retire: int,
) -> Schedule:
    r = annual_rate / 12
    m = np.arange(horizon + 1)
    k = np.clip(m - start - io_months, 0, amort_months)
    pay = payment(principal, r, amort_months)
    growth = (1 + r) ** k
    safe = np.where(r == 0, 1.0, r)
    balance = np.where(r == 0, principal - pay * k, principal * growth - pay * (growth - 1) / safe)
    return _settle(np.maximum(balance, 0.0), r, m, start, retire)


def interest_only(
    principal: Grid,
    annual_rate: Grid,
    horizon: int,
    *,
    retire: int,
    draws: Grid,
) -> Schedule:
    m = np.arange(horizon + 1)
    balance = principal + np.cumsum(draws, axis=1)
    return _settle(balance, annual_rate / 12, m, 0, retire)


def _settle(
    balance: Grid, monthly_rate: Grid, m: NDArray[np.int_], start: int, retire: int
) -> Schedule:
    opening = np.concatenate([balance[:, :1], balance[:, :-1]], axis=1)
    paying = (m > start) & (m <= retire)
    interest = np.where(paying, opening * monthly_rate, 0.0)
    principal = np.where(paying, np.maximum(opening - balance, 0.0), 0.0)
    payoff = np.zeros_like(balance)
    payoff[:, retire] = balance[:, retire]
    outstanding = (m >= start) & (m < retire)
    return Schedule(
        interest=interest,
        principal=principal,
        balance=np.where(outstanding, balance, 0.0),
        payoff=payoff,
    )
