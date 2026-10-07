from dataclasses import dataclass

import numpy as np

from parcel.engine.ledger import Ledger
from parcel.engine.rates import Vec, annualize, monthly_from_annual, monthly_irr, npv


@dataclass(frozen=True)
class Metrics:
    """Per-run results. Every field is an array with one value per run.

    NaN means "does not apply": no stabilized year on a flip, no DSCR without
    debt, no IRR when the cash flows never change sign.
    """

    cash_to_close: Vec
    peak_cash: Vec
    """Most cash the investor has in the deal at any point."""
    cash_left_in_deal: Vec
    """Cash still in after stabilization. Negative when a refinance pulls out more than went in."""
    total_profit: Vec
    equity_multiple: Vec
    irr: Vec
    unlevered_irr: Vec
    npv: Vec
    payback_month: Vec
    roi: Vec
    annualized_roi: Vec

    gross_rent: Vec
    egi: Vec
    opex: Vec
    noi: Vec
    debt_service: Vec
    cash_flow: Vec
    cap_rate: Vec
    yield_on_cost: Vec
    cash_on_cash: Vec
    dscr: Vec
    break_even_occupancy: Vec
    grm: Vec

    refi_cash_out: Vec
    sale_price: Vec
    net_sale_proceeds: Vec


def measure(ledger: Ledger, discount_rate: float = 0.10) -> Metrics:
    cf = ledger.cash_flow
    cumulative = np.cumsum(cf, axis=1)
    h = ledger.horizon
    s = ledger.stabilized

    peak = np.maximum(-cumulative.min(axis=1), 0.0)
    profit = cf.sum(axis=1)
    inflow = np.where(cf > 0, cf, 0.0).sum(axis=1)
    outflow = np.where(cf < 0, -cf, 0.0).sum(axis=1)
    roi = _div(profit, peak)
    with np.errstate(invalid="ignore"):
        annual_roi = np.where(roi > -1, (1 + roi) ** (12 / h) - 1, np.nan)

    window = slice(s + 1, s + 13)
    has_year = s + 12 <= h

    def year(line: np.ndarray) -> Vec:
        return line[:, window].sum(axis=1) if has_year else np.full(ledger.runs, np.nan)

    gross = year(ledger.gross_rent)
    potential = year(ledger.gross_rent + ledger.other_income)
    egi = year(ledger.egi)
    opex = year(ledger.opex)
    noi = year(ledger.noi)
    capex = year(ledger.capex)
    service = year(ledger.debt_service)
    cash_flow = noi - capex - service
    variable = year(ledger.management + ledger.maintenance + ledger.capex)
    fixed = year(ledger.fixed_expenses) + service

    price = ledger.purchase[:, 0]
    project_cost = price + ledger.closing_costs[:, 0] + ledger.rehab.sum(axis=1)
    left = -cumulative[:, s]
    refi_out = (ledger.refi_proceeds - ledger.refi_costs - _payoffs_at_refi(ledger)).sum(axis=1)

    return Metrics(
        cash_to_close=-cf[:, 0],
        peak_cash=peak,
        cash_left_in_deal=left,
        total_profit=profit,
        equity_multiple=_div(inflow, outflow),
        irr=annualize(monthly_irr(cf)),
        unlevered_irr=annualize(monthly_irr(ledger.unlevered_cash_flow)),
        npv=npv(monthly_from_annual(discount_rate), cf),
        payback_month=_payback(cumulative),
        roi=roi,
        annualized_roi=annual_roi,
        gross_rent=gross,
        egi=egi,
        opex=opex,
        noi=noi,
        debt_service=service,
        cash_flow=cash_flow,
        cap_rate=_div(noi, price),
        yield_on_cost=_div(noi, project_cost),
        cash_on_cash=np.where(left > 0, _div(cash_flow, left), np.nan),
        dscr=_div(noi, service),
        break_even_occupancy=_div(fixed, potential * (1 - _div(variable, egi))),
        grm=_div(price, gross),
        refi_cash_out=refi_out,
        sale_price=ledger.sale_price[:, h],
        net_sale_proceeds=ledger.sale_price[:, h]
        - ledger.selling_costs[:, h]
        - ledger.loan_payoffs[:, h],
    )


def _div(a: Vec, b: Vec) -> Vec:
    a, b = np.broadcast_arrays(np.asarray(a, dtype=np.float64), np.asarray(b, dtype=np.float64))
    out = np.full(a.shape, np.nan)
    np.divide(a, b, out=out, where=(b != 0) & ~np.isnan(b))
    return out


def _payback(cumulative: np.ndarray) -> Vec:
    went_negative = np.minimum.accumulate(cumulative, axis=1) < 0
    recovered = went_negative & (cumulative >= 0)
    first = recovered.argmax(axis=1).astype(np.float64)
    return np.where(recovered.any(axis=1), first, np.nan)


def _payoffs_at_refi(ledger: Ledger) -> Vec:
    out = np.zeros_like(ledger.loan_payoffs)
    refi_months = ledger.refi_proceeds.any(axis=0)
    out[:, refi_months] = ledger.loan_payoffs[:, refi_months]
    return out
