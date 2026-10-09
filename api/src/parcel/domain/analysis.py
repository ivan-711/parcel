from dataclasses import replace
from typing import Any, Literal

import numpy as np

from parcel.engine.analysis import run
from parcel.engine.ledger import Ledger
from parcel.engine.metrics import Metrics as EngineMetrics
from parcel.engine.wholesale import underwrite
from parcel.schemas import analysis as out
from parcel.schemas import inputs

_MONEY = {
    "cash_to_close",
    "peak_cash",
    "cash_left_in_deal",
    "total_profit",
    "npv",
    "gross_rent",
    "egi",
    "opex",
    "noi",
    "debt_service",
    "cash_flow",
    "refi_cash_out",
    "sale_price",
    "net_sale_proceeds",
}


def analyze(spec: inputs.Inputs, *, monthly: bool = False) -> out.Analysis | out.WholesaleAnalysis:
    if isinstance(spec, inputs.Wholesale):
        return _wholesale(spec, monthly=monthly)
    ledger, metrics = run(spec.to_engine())
    return _holding(spec, ledger, metrics, monthly=monthly)


def _holding(
    spec: inputs.Holding, ledger: Ledger, m: EngineMetrics, *, monthly: bool
) -> out.Analysis:
    metrics = _metrics(m)
    return out.Analysis(
        strategy=spec.strategy,
        horizon_months=ledger.horizon,
        stabilized_month=ledger.stabilized,
        metrics=metrics,
        years=_years(ledger),
        months=_months(ledger) if monthly else None,
        events=_events(ledger),
        flags=_flags(spec, metrics, ledger),
    )


def _wholesale(spec: inputs.Wholesale, *, monthly: bool) -> out.WholesaleAnalysis:
    deal = spec.to_engine()
    result = underwrite(deal)
    buyer = (
        deal.buyer
        if result.buyer_max_price is None
        else replace(deal.buyer, price=result.buyer_max_price)
    )
    ledger, metrics = run(buyer)
    flip_spec = inputs.Flip(
        price=float(buyer.price),
        rehab_cost=spec.rehab_cost,
        after_repair_value=spec.after_repair_value,
        rehab_months=spec.buyer_rehab_months,
        months_to_sell=spec.buyer_months_to_sell,
        property_tax_annual=spec.property_tax_annual,
        insurance_annual=spec.insurance_annual,
        loan_to_cost=spec.buyer_loan_to_cost,
        rehab_financed=spec.buyer_rehab_financed,
        interest_rate=spec.buyer_interest_rate,
        points=spec.buyer_points,
    )
    flags: list[out.Flag] = []
    if result.assignment_fee is None:
        flags.append(
            _flag(
                "no_buyer_margin",
                "risk",
                "No price leaves an end buyer their margin at this ARV and rehab.",
            )
        )
    elif result.assignment_fee < 0:
        flags.append(
            _flag(
                "contract_too_high", "risk", "Your contract price is above what a flipper can pay."
            )
        )
    elif result.assignment_fee < 5_000:
        flags.append(
            _flag("thin_fee", "caution", "The room for an assignment fee is under $5,000.")
        )
    return out.WholesaleAnalysis(
        contract_price=spec.contract_price,
        buyer_max_price=_money(result.buyer_max_price),
        assignment_fee=_money(result.assignment_fee),
        buyer_profit_at_max=_money(result.buyer_profit_at_max),
        seventy_percent_rule=round(result.seventy_percent_rule, 2),
        earnest_money=spec.earnest_money,
        buyer=_holding(flip_spec, ledger, metrics, monthly=monthly),
        flags=flags,
    )


def _money(x: float | None) -> float | None:
    return None if x is None else round(x, 2)


def _clean(name: str, value: float) -> float | None:
    if not np.isfinite(value):
        return None
    return round(float(value), 2 if name in _MONEY else 6)


def _metrics(m: EngineMetrics) -> out.Metrics:
    values: dict[str, Any] = {
        name: _clean(name, float(getattr(m, name)[0])) for name in out.Metrics.model_fields
    }
    if values["payback_month"] is not None:
        values["payback_month"] = int(values["payback_month"])
    return out.Metrics(**values)


def _lines(ledger: Ledger) -> dict[str, np.ndarray]:
    return {
        "gross_rent": ledger.gross_rent[0],
        "vacancy": ledger.vacancy[0],
        "other_income": ledger.other_income[0],
        "egi": ledger.egi[0],
        "taxes": ledger.taxes[0],
        "insurance": ledger.insurance[0],
        "opex": ledger.opex[0],
        "noi": ledger.noi[0],
        "capex": ledger.capex[0],
        "interest": ledger.interest[0],
        "principal": ledger.principal[0],
        "rehab": ledger.rehab[0],
        "cash_flow": ledger.cash_flow[0],
    }


def _months(ledger: Ledger) -> list[out.Period]:
    lines = _lines(ledger)
    cumulative = np.cumsum(lines["cash_flow"])
    value, debt = ledger.value[0], ledger.debt[0]
    return [
        out.Period(
            period=i,
            **{k: round(float(v[i]), 2) for k, v in lines.items()},
            cumulative_cash_flow=round(float(cumulative[i]), 2),
            value=round(float(value[i]), 2),
            debt=round(float(debt[i]), 2),
            equity=round(float(value[i] - debt[i]), 2),
        )
        for i in range(ledger.horizon + 1)
    ]


def _years(ledger: Ledger) -> list[out.Period]:
    """Year 0 is closing day. Year n covers months 12n-11 through 12n."""
    lines = _lines(ledger)
    cumulative = np.cumsum(lines["cash_flow"])
    h = ledger.horizon
    rows = []
    for year in range((h + 11) // 12 + 1):
        window = slice(0, 1) if year == 0 else slice(12 * year - 11, min(12 * year, h) + 1)
        end = window.stop - 1
        rows.append(
            out.Period(
                period=year,
                **{k: round(float(v[window].sum()), 2) for k, v in lines.items()},
                cumulative_cash_flow=round(float(cumulative[end]), 2),
                value=round(float(ledger.value[0, end]), 2),
                debt=round(float(ledger.debt[0, end]), 2),
                equity=round(float(ledger.value[0, end] - ledger.debt[0, end]), 2),
            )
        )
    return rows


def _events(ledger: Ledger) -> list[out.Event]:
    events = [out.Event(month=0, kind="purchase", amount=round(float(ledger.purchase[0, 0]), 2))]
    rehab_months = np.flatnonzero(ledger.rehab[0])
    if rehab_months.size and rehab_months[-1] > 0:
        events.append(out.Event(month=int(rehab_months[-1]), kind="rehab_done"))
    rent = np.flatnonzero(ledger.gross_rent[0])
    if rent.size:
        events.append(out.Event(month=int(rent[0]), kind="rent_starts"))
    refi = np.flatnonzero(ledger.refi_proceeds[0])
    for month in refi:
        events.append(
            out.Event(
                month=int(month),
                kind="refinance",
                amount=round(float(ledger.refi_proceeds[0, month]), 2),
            )
        )
    payoffs = np.flatnonzero(ledger.loan_payoffs[0] > 0.005)
    for month in payoffs:
        if month not in refi and month != ledger.horizon:
            events.append(
                out.Event(
                    month=int(month),
                    kind="balloon",
                    amount=round(float(ledger.loan_payoffs[0, month]), 2),
                )
            )
    events.append(
        out.Event(
            month=ledger.horizon,
            kind="sale",
            amount=round(float(ledger.sale_price[0, ledger.horizon]), 2),
        )
    )
    return sorted(events, key=lambda e: e.month)


def _flags(spec: inputs.Holding, m: out.Metrics, ledger: Ledger) -> list[out.Flag]:
    flags = _ratio_flags(spec, m)
    if isinstance(spec, inputs.Brrrr):
        flags += _brrrr_flags(m)
    elif isinstance(spec, inputs.Flip):
        margin = m.total_profit / spec.after_repair_value if spec.after_repair_value else 0
        if margin < 0.10:
            flags.append(
                _flag(
                    "thin_flip",
                    "caution",
                    "Profit is under 10% of the resale price, little room for surprises.",
                )
            )
    elif isinstance(spec, inputs.CreativeFinance):
        flags += _creative_flags(spec, ledger)
    if m.irr is None:
        flags.append(_flag("no_irr", "info", "The cash never turns positive, so there is no IRR."))
    return flags


def _flag(code: str, severity: Literal["info", "caution", "risk"], message: str) -> out.Flag:
    return out.Flag(code=code, severity=severity, message=message)


def _ratio_flags(spec: inputs.Holding, m: out.Metrics) -> list[out.Flag]:
    flags = []
    if m.dscr is not None and m.dscr < 1:
        flags.append(
            _flag("dscr_below_1", "risk", "Net operating income doesn't cover the debt payments.")
        )
    elif m.dscr is not None and m.dscr < 1.25:
        flags.append(_flag("dscr_thin", "caution", "Most lenders want a DSCR of 1.25 or better."))
    if m.cash_flow is not None and m.cash_flow < 0:
        flags.append(
            _flag("negative_cash_flow", "risk", "The stabilized year loses money every month.")
        )
    rate = _long_term_rate(spec)
    if m.cap_rate is not None and rate is not None and m.cap_rate < rate:
        flags.append(
            _flag(
                "negative_leverage",
                "caution",
                "The property yields less than the loan costs, so borrowing lowers your return.",
            )
        )
    if not isinstance(spec, inputs.Flip):
        if spec.operations.vacancy_rate < 0.03:
            flags.append(
                _flag("low_vacancy", "caution", "Vacancy under 3% is optimistic for most markets.")
            )
        if spec.operations.capex_rate == 0:
            flags.append(
                _flag(
                    "no_capex",
                    "caution",
                    "No reserve for roofs, furnaces and other big replacements.",
                )
            )
    return flags


def _brrrr_flags(m: out.Metrics) -> list[out.Flag]:
    if m.refi_cash_out < 0:
        return [
            _flag(
                "refi_short",
                "risk",
                f"The refinance falls ${-m.refi_cash_out:,.0f} short of paying off the first loan.",
            )
        ]
    if m.cash_left_in_deal > 0:
        return [
            _flag(
                "cash_left",
                "info",
                f"${m.cash_left_in_deal:,.0f} stays in the deal after the refinance.",
            )
        ]
    return [_flag("all_cash_out", "info", "The refinance returns every dollar you put in.")]


def _creative_flags(spec: inputs.CreativeFinance, ledger: Ledger) -> list[out.Flag]:
    flags = []
    if spec.existing_balance > 0:
        flags.append(
            _flag(
                "due_on_sale",
                "info",
                "The seller's lender can call the existing loan due when the deed transfers.",
            )
        )
    for e in _events(ledger):
        if e.kind == "balloon":
            flags.append(
                _flag(
                    "balloon",
                    "caution",
                    f"A ${e.amount:,.0f} balloon payment comes due in month {e.month}.",
                )
            )
    return flags


def _long_term_rate(spec: inputs.Holding) -> float | None:
    if isinstance(spec, inputs.BuyAndHold) and spec.down_payment_rate < 1:
        return spec.interest_rate
    if isinstance(spec, inputs.Brrrr):
        return spec.refi_rate
    return None
