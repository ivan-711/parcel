"""Twenty deals the memo is evaluated on: each demo sample plus three variations
that push it somewhere interesting (thin margins, a short refinance, all cash)."""

from typing import Any

from parcel.db.models import Deal
from parcel.domain.demo import SAMPLES
from parcel.schemas import inputs as i

_VARIATIONS: dict[str, list[tuple[str, dict[str, Any]]]] = {
    "buy_and_hold": [
        ("expensive_debt", {"interest_rate": 0.085}),
        ("all_cash", {"down_payment_rate": 1.0}),
        ("optimistic", {"operations": {"vacancy_rate": 0.02, "capex_rate": 0.0}}),
    ],
    "brrrr": [
        ("short_refi", {"after_repair_value": 165_000}),
        ("rehab_overrun", {"rehab_cost": 70_000}),
        ("high_refi_rate", {"refi_rate": 0.08}),
    ],
    "flip": [
        ("thin", {"after_repair_value": 195_000}),
        ("all_cash", {"loan_to_cost": 0.0, "rehab_financed": 0.0}),
        ("slow", {"rehab_months": 6, "months_to_sell": 4}),
    ],
    "creative": [
        ("no_balloon", {"seller_balloon_years": None}),
        ("weak_rent", {"operations": {"monthly_rent": 3_100}}),
        ("big_down", {"cash_to_seller": 45_000}),
    ],
    "wholesale": [
        ("overpriced", {"contract_price": 135_000}),
        ("heavy_rehab", {"rehab_cost": 65_000}),
        ("big_deposit", {"earnest_money": 5_000}),
    ],
}


def _vary(spec: i.Inputs, changes: dict[str, Any]) -> dict[str, Any]:
    data = spec.model_dump(mode="json")
    for key, value in changes.items():
        if isinstance(value, dict):
            data[key] = {**data[key], **value}
        else:
            data[key] = value
    return data


def cases() -> list[tuple[str, Deal]]:
    found = []
    for name, address, _, spec in SAMPLES:
        variants = [("base", {}), *_VARIATIONS[spec.strategy]]
        for label, changes in variants:
            deal = Deal(name=name, address=address, inputs=_vary(spec, changes))
            found.append((f"{spec.strategy}-{label}", deal))
    return found
