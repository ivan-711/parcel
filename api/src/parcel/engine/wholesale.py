from dataclasses import dataclass, replace

from parcel.engine.analysis import metric, solve
from parcel.engine.strategies import Flip


@dataclass(frozen=True)
class Wholesale:
    """Put a property under contract and assign the contract to a flipper.

    The fee you can charge is capped by what the end buyer can pay and still make
    their margin, so the buyer's side is underwritten as a full flip.
    """

    contract_price: float
    buyer: Flip
    """The end buyer's flip. Its `price` is ignored and solved for."""
    buyer_profit_margin: float = 0.15
    """Profit the buyer needs, as a share of ARV."""
    earnest_money: float = 1_000.0


@dataclass(frozen=True)
class WholesaleResult:
    buyer_max_price: float | None
    assignment_fee: float | None
    buyer_profit_at_max: float | None
    seventy_percent_rule: float
    earnest_money: float


def underwrite(deal: Wholesale) -> WholesaleResult:
    arv = float(deal.buyer.after_repair_value)
    target = deal.buyer_profit_margin * arv
    max_price = solve(
        deal.buyer, "price", metric_name="total_profit", target=target, lo=1.0, hi=arv
    )
    rule = 0.70 * arv - float(deal.buyer.rehab_cost)
    if max_price is None:
        return WholesaleResult(None, None, None, rule, deal.earnest_money)
    profit = metric(replace(deal.buyer, price=max_price), "total_profit")
    return WholesaleResult(
        buyer_max_price=max_price,
        assignment_fee=max_price - deal.contract_price,
        buyer_profit_at_max=profit,
        seventy_percent_rule=rule,
        earnest_money=deal.earnest_money,
    )
