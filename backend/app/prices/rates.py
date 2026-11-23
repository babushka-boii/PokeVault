"""ExchangeRate-API open-access client (https://www.exchangerate-api.com).

Terms: attribution is required (shown in the UI) and the data must not be
redistributed. The endpoint refreshes once a day and a 429 blocks the client for 20
minutes, so this client never retries and never polls; the 24 h cache and the retry
backoff live in ``app.prices.store``.
"""

import json
from datetime import UTC, datetime
from decimal import Decimal
from email.utils import parsedate_to_datetime

import httpx2 as httpx

from app.prices.schemas import ExchangeRates

RATES_URL = "https://open.er-api.com/v6/latest/USD"
MAX_BYTES = 256 * 1024
# CLP per USD and EUR per USD; values outside these bounds are broken data.
CLP_BOUNDS = (Decimal(300), Decimal(3000))
EUR_BOUNDS = (Decimal("0.4"), Decimal("2.0"))


class RatesUnavailable(Exception):
    """Rates could not be obtained. Messages never include provider payloads."""

    def __init__(self, reason: str, *, rate_limited: bool = False) -> None:
        super().__init__(reason)
        self.rate_limited = rate_limited


def _number(value: object, bounds: tuple[Decimal, Decimal]) -> Decimal:
    if isinstance(value, bool) or not isinstance(value, int | Decimal):
        raise RatesUnavailable("invalid rate")
    number = Decimal(value)
    if not number.is_finite() or not bounds[0] <= number <= bounds[1]:
        raise RatesUnavailable("rate out of bounds")
    return number


def _updated_at(value: object) -> datetime:
    if not isinstance(value, str):
        raise RatesUnavailable("invalid update time")
    try:
        parsed = parsedate_to_datetime(value)
    except TypeError, ValueError:
        raise RatesUnavailable("invalid update time") from None
    return parsed.astimezone(UTC) if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def parse_rates(data: object) -> ExchangeRates:
    if (
        not isinstance(data, dict)
        or data.get("result") != "success"
        or data.get("base_code") != "USD"
        or not isinstance(data.get("rates"), dict)
    ):
        raise RatesUnavailable("unexpected response")
    rates = data["rates"]
    return ExchangeRates(
        usd_clp=_number(rates.get("CLP"), CLP_BOUNDS),
        eur_per_usd=_number(rates.get("EUR"), EUR_BOUNDS),
        updated_at=_updated_at(data.get("time_last_update_utc")),
    )


class RatesClient:
    def __init__(self, *, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self._transport = transport

    async def fetch(self) -> ExchangeRates:
        """One request, no retries. Raises RatesUnavailable on any problem."""
        try:
            async with httpx.AsyncClient(
                timeout=10,
                transport=self._transport,
                follow_redirects=False,
                headers={"User-Agent": "PokeVault/0.1"},
            ) as client:
                response = await client.get(RATES_URL)
            if response.status_code == 429:
                raise RatesUnavailable("rate limited", rate_limited=True)
            response.raise_for_status()
            if len(response.content) > MAX_BYTES:
                raise RatesUnavailable("oversized response")
            # Decimal keeps the provider's digits exact (no binary float noise).
            data = json.loads(response.content, parse_float=Decimal)
        except RatesUnavailable:
            raise
        except (httpx.HTTPError, TimeoutError, ValueError) as error:
            raise RatesUnavailable(f"request failed ({type(error).__name__})") from None
        return parse_rates(data)
