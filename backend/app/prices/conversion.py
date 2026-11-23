"""Pure currency conversion with Decimal. Round only for presentation and totals."""

from collections.abc import Iterable
from decimal import ROUND_HALF_EVEN, Decimal

from app.prices.schemas import Currency, ExchangeRates, TargetCurrency


def convert(
    amount: Decimal, source: Currency, target: TargetCurrency, rates: ExchangeRates
) -> Decimal:
    """Unrounded ``target`` amount. EUR -> CLP is CLP / EUR; EUR -> USD is 1 / EUR."""
    if source == "USD" and target == "USD":
        return amount
    if source == "USD" and target == "CLP":
        return amount * rates.usd_clp
    if source == "EUR" and target == "CLP":
        return amount * rates.usd_clp / rates.eur_per_usd
    if source == "EUR" and target == "USD":
        return amount / rates.eur_per_usd
    raise ValueError(f"Unsupported conversion {source} -> {target}")


def round_for(currency: str, value: Decimal) -> Decimal:
    """CLP to whole pesos, USD/EUR to cents, half-even."""
    exponent = Decimal(1) if currency == "CLP" else Decimal("0.01")
    return value.quantize(exponent, rounding=ROUND_HALF_EVEN)


def total(amounts: Iterable[Decimal]) -> Decimal:
    """Sum unrounded values; round the result once with ``round_for``."""
    return sum(amounts, Decimal(0))
