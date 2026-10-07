from collections.abc import Callable

import numpy as np
from numpy.typing import NDArray

type Vec = NDArray[np.float64]

_LOWEST = -0.99
_HIGHEST = 1.0
"""Monthly rate bounds for the IRR search, roughly -100% to +390,000% a year."""


def npv(monthly_rate: Vec | float, flows: NDArray[np.float64]) -> Vec:
    t = np.arange(flows.shape[-1])
    r = np.asarray(monthly_rate, dtype=np.float64).reshape(-1, 1)
    with np.errstate(over="ignore", invalid="ignore", divide="ignore"):
        return np.asarray((flows / (1 + r) ** t).sum(axis=-1))


def monthly_irr(flows: NDArray[np.float64], tol: float = 1e-10) -> Vec:
    """Monthly IRR for each row of `flows`. NaN where no rate in range zeroes the NPV.

    Newton's method handles the common case in a handful of steps. Rows where it
    wanders off or never settles fall back to bisection inside a sign-changing
    bracket, which is slower but cannot diverge.
    """
    flows = np.atleast_2d(np.asarray(flows, dtype=np.float64))
    t = np.arange(flows.shape[1])
    limit = tol * np.maximum(np.abs(flows).sum(axis=1), 1.0)
    rate = np.full(flows.shape[0], 0.01)
    live = np.arange(flows.shape[0])
    steps = 0
    while live.size and steps < 50:
        steps += 1
        f, r = flows[live], rate[live, None]
        with np.errstate(over="ignore", invalid="ignore", divide="ignore"):
            disc = np.exp(-t * np.log1p(r))
            value = (f * disc).sum(axis=1)
            slope = -(t * f * disc).sum(axis=1) / (1 + r[:, 0])
            step = np.divide(value, slope, out=np.zeros_like(value), where=slope != 0)
        rate[live] = np.clip(r[:, 0] - step, _LOWEST, _HIGHEST)
        live = live[(np.abs(value) > limit[live]) & (step != 0)]
    settled = np.abs(npv(rate, flows)) <= limit
    if settled.all():
        return rate
    out = np.where(settled, rate, np.nan)
    rows = np.flatnonzero(~settled)
    out[rows] = _bisect(flows[rows], tol)
    return out


def _bisect(flows: NDArray[np.float64], tol: float) -> Vec:
    lo = np.full(flows.shape[0], _LOWEST)
    hi = np.full(flows.shape[0], _HIGHEST)
    f_lo = npv(lo, flows)
    f_hi = npv(hi, flows)
    bracketed = np.sign(f_lo) != np.sign(f_hi)
    halvings = int(np.ceil(np.log2((_HIGHEST - _LOWEST) / tol)))
    for _ in range(halvings):
        mid = (lo + hi) / 2
        f_mid = npv(mid, flows)
        left = np.sign(f_mid) == np.sign(f_lo)
        lo = np.where(left, mid, lo)
        f_lo = np.where(left, f_mid, f_lo)
        hi = np.where(left, hi, mid)
    return np.where(bracketed, (lo + hi) / 2, np.nan)


def annualize(monthly: Vec | float) -> Vec:
    return np.asarray((1 + np.asarray(monthly)) ** 12 - 1)


def monthly_from_annual(annual: float) -> float:
    return float((1 + annual) ** (1 / 12) - 1)


def brent(f: Callable[[float], float], lo: float, hi: float, tol: float = 1e-9) -> float:
    """Root of `f` inside [lo, hi] by Brent's method. `f(lo)` and `f(hi)` must differ in sign."""
    a, b = lo, hi
    fa, fb = f(a), f(b)
    if fa * fb > 0:
        raise ValueError("the root is not bracketed")
    if abs(fa) < abs(fb):
        a, b, fa, fb = b, a, fb, fa
    c, fc, d = a, fa, a
    bisected = True
    steps = 0
    while fb != 0 and abs(b - a) >= tol and steps < 200:
        steps += 1
        if fc not in (fa, fb):
            s = (
                a * fb * fc / ((fa - fb) * (fa - fc))
                + b * fa * fc / ((fb - fa) * (fb - fc))
                + c * fa * fb / ((fc - fa) * (fc - fb))
            )
        else:
            s = b - fb * (b - a) / (fb - fa)
        quarter = (3 * a + b) / 4
        gap = abs(b - c) if bisected else abs(c - d)
        if not min(quarter, b) < s < max(quarter, b) or abs(s - b) >= gap / 2 or gap < tol:
            s = (a + b) / 2
            bisected = True
        else:
            bisected = False
        fs = f(s)
        d, c, fc = c, b, fb
        if fa * fs < 0:
            b, fb = s, fs
        else:
            a, fa = s, fs
        if abs(fa) < abs(fb):
            a, b, fa, fb = b, a, fb, fa
    return b
