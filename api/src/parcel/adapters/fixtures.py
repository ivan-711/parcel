"""Recorded answers for a few sample addresses.

Tests and the demo sandbox use these instead of the live providers, so neither
spends API calls. Any address not listed here simply isn't found.
"""

from datetime import date

from parcel.adapters.property_data import Comparable, Estimate, Facts, Place

_SHEBOYGAN = {"state_fips": "55", "county_fips": "117", "county": "Sheboygan County"}

PLACES = {
    "1420 N 14TH ST SHEBOYGAN WI 53081": Place(
        line1="1420 N 14th St",
        city="Sheboygan",
        state="WI",
        zip="53081",
        latitude=43.7612,
        longitude=-87.7279,
        **_SHEBOYGAN,
    ),
    "2210 KOHLER AVE SHEBOYGAN WI 53081": Place(
        line1="2210 Kohler Ave",
        city="Sheboygan",
        state="WI",
        zip="53081",
        latitude=43.7398,
        longitude=-87.7391,
        **_SHEBOYGAN,
    ),
}

_FACTS = {
    "1420 N 14TH ST SHEBOYGAN WI 53081": Facts(
        property_type="Multi-Family",
        bedrooms=4,
        bathrooms=2,
        square_feet=2_080,
        year_built=1924,
        last_sale_price=161_000,
        last_sale_date="2019-06-14",
    ),
    "2210 KOHLER AVE SHEBOYGAN WI 53081": Facts(
        property_type="Single Family",
        bedrooms=3,
        bathrooms=1,
        square_feet=1_140,
        year_built=1956,
    ),
}

_RENT = {
    "1420 N 14TH ST SHEBOYGAN WI 53081": (2_350, 2_150, 2_560),
    "2210 KOHLER AVE SHEBOYGAN WI 53081": (1_650, 1_480, 1_820),
}
_VALUE = {
    "1420 N 14TH ST SHEBOYGAN WI 53081": (224_000, 199_000, 251_000),
    "2210 KOHLER AVE SHEBOYGAN WI 53081": (128_000, 104_000, 161_000),
}


def _comps(base: float) -> list[Comparable]:
    return [
        Comparable(
            address=f"{1300 + i * 40} N 13th St, Sheboygan, WI 53081",
            price=round(base * f),
            bedrooms=3,
            bathrooms=1.5,
            square_feet=1_250 + i * 60,
            distance_miles=0.2 + i * 0.15,
            days_old=12 + i * 9,
        )
        for i, f in enumerate((0.96, 1.02, 0.99, 1.05))
    ]


class FixtureData:
    def __init__(self) -> None:
        self.calls: list[str] = []

    def _find(self, text: str) -> Place | None:
        key = " ".join(text.upper().replace(",", " ").split())
        return next((p for k, p in PLACES.items() if k.startswith(key) or key.startswith(k)), None)

    async def autocomplete(self, text: str) -> list[Place]:
        key = " ".join(text.upper().replace(",", " ").split())
        return [p for k, p in PLACES.items() if k.startswith(key)]

    async def geocode(self, address: str) -> Place | None:
        return self._find(address)

    async def rent_estimate(self, place: Place) -> Estimate:
        self.calls.append(f"rent:{place.key}")
        value, low, high = _RENT[place.key]
        return Estimate(value, low, high, place, _FACTS[place.key], _comps(value))

    async def value_estimate(self, place: Place) -> Estimate:
        self.calls.append(f"value:{place.key}")
        value, low, high = _VALUE[place.key]
        return Estimate(value, low, high, place, _FACTS[place.key], _comps(value))

    async def county_tax_rate(self, state_fips: str, county_fips: str) -> tuple[float, int] | None:
        return (0.0174, 2023) if (state_fips, county_fips) == ("55", "117") else None

    async def fair_market_rent(self, place: Place, bedrooms: int) -> tuple[float, int] | None:
        return (1_180.0 + 220 * min(bedrooms, 4), 2026) if place.county_fips == "117" else None

    async def mortgage_rate(self) -> tuple[float, date] | None:
        return 0.0631, date(2026, 10, 1)
