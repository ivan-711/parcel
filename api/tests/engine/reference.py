"""A deliberately plain month-by-month model of a financed rental.

It shares no code with the engine. Tests run both and expect the same answer,
so a mistake has to be made twice, the same way, to slip through.
"""

from dataclasses import dataclass


@dataclass
class Rental:
    price: float
    down_rate: float
    rate: float
    years: int
    closing_rate: float
    rent: float
    vacancy: float
    tax: float
    insurance: float
    management: float
    maintenance: float
    capex: float
    rent_growth: float
    expense_growth: float
    appreciation: float
    hold_years: int
    selling_rate: float


def cash_flows(d: Rental) -> list[float]:
    loan = d.price * (1 - d.down_rate)
    r = d.rate / 12
    n = d.years * 12
    pay = loan * r / (1 - (1 + r) ** -n)
    flows = [-(d.price - loan) - d.price * d.closing_rate]
    balance = loan
    months = d.hold_years * 12
    for month in range(1, months + 1):
        year = (month - 1) // 12
        rent = d.rent * (1 + d.rent_growth) ** year
        collected = rent * (1 - d.vacancy)
        fixed = (d.tax + d.insurance) / 12 * (1 + d.expense_growth) ** year
        variable = collected * (d.management + d.maintenance + d.capex)
        interest = balance * r
        balance -= pay - interest
        flow = collected - fixed - variable - pay
        if month == months:
            value = d.price * (1 + d.appreciation) ** (months / 12)
            flow += value * (1 - d.selling_rate) - balance
        flows.append(flow)
    return flows
