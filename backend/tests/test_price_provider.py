"""TCGdex pricing and exchange-rate clients, against mock transports only."""

import asyncio
import json
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path

import httpx2 as httpx
import pytest

from app.cards.provider import CardPricing, CardProvider, CardsUnavailable
from app.prices.normalize import normalize_pricing
from app.prices.rates import RATES_URL, RatesClient, RatesUnavailable
from app.prices.selection import select_price

ROOT = Path(__file__).resolve().parents[2]
SAMPLE = json.loads((ROOT / "research/prices/tcgdex_sample.json").read_text())
RATES_SAMPLE = json.loads(
    (ROOT / "research/prices/exchangerate_sample.json").read_text()
)["payload"]


def card_body(card_id="me05-044", key=None, **overrides):
    entry = SAMPLE[key or f"en/{card_id}"]
    body = {
        "id": card_id,
        "localId": card_id.rsplit("-", 1)[1],
        "name": entry["name"],
        "variants": entry["variants"],
        "pricing": entry["pricing"],
    }
    return {**body, **overrides}


def provider(handler):
    return CardProvider(transport=httpx.MockTransport(handler))


def pricing(card_id, handler):
    return asyncio.run(provider(handler).card_pricing(card_id))


# --- TCGdex pricing ---


def test_card_pricing_reads_only_the_english_endpoint_once():
    seen = []

    def handle(request):
        seen.append((request.method, request.url.path, dict(request.url.params)))
        return httpx.Response(200, json=card_body())

    result = pricing("me05-044", handle)
    assert seen == [("GET", "/v2/en/cards/me05-044", {})]
    assert isinstance(result, CardPricing)
    snapshot = normalize_pricing(result.pricing, result.variants)
    quote = select_price(snapshot, "reverse")
    assert (quote.amount, quote.currency, quote.source) == (
        Decimal("0.07"),
        "EUR",
        "cardmarket",
    )


def test_card_pricing_supports_dotted_set_identifiers():
    seen = []

    def handle(request):
        seen.append(request.url.path)
        return httpx.Response(200, json=card_body("me02.5-261"))

    assert pricing("me02.5-261", handle).variants["holo"] is True
    assert seen == ["/v2/en/cards/me02.5-261"]


def test_missing_card_is_none():
    assert pricing("me05-044", lambda r: httpx.Response(404)) is None


def test_card_without_pricing_or_variants_is_still_a_valid_answer():
    body = card_body()
    del body["pricing"], body["variants"]
    result = pricing("me05-044", lambda r: httpx.Response(200, json=body))
    assert result == CardPricing(pricing=None, variants=None)
    assert normalize_pricing(result.pricing, result.variants).status == "no_data"


def test_non_object_pricing_or_variants_are_dropped_not_trusted():
    body = card_body(pricing="free", variants=["normal"])
    result = pricing("me05-044", lambda r: httpx.Response(200, json=body))
    assert result == CardPricing(pricing=None, variants=None)


@pytest.mark.parametrize(
    "card_id", ["../en/sets", "a b-1", "x/1", "", "a" * 101, "?q=1"]
)
def test_invalid_identifiers_never_reach_the_network(card_id):
    calls = []

    def handle(request):
        calls.append(request)
        return httpx.Response(200, json=card_body())

    assert pricing(card_id, handle) is None
    assert calls == []


def failing(handler):
    with pytest.raises(CardsUnavailable):
        pricing("me05-044", handler)


@pytest.mark.parametrize("status", [429, 500, 502, 503, 400, 403])
def test_error_statuses_make_pricing_unavailable(status):
    failing(lambda r: httpx.Response(status))


def test_transport_errors_and_timeouts_make_pricing_unavailable():
    def timeout(request):
        raise httpx.ReadTimeout("slow", request=request)

    def refused(request):
        raise httpx.ConnectError("down", request=request)

    failing(timeout)
    failing(refused)


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(200, content=b"<html>not json</html>"),
        httpx.Response(200, json=[card_body()]),
        httpx.Response(200, json="text"),
        httpx.Response(200, json=card_body(id="other-1")),
        httpx.Response(200, json={"localId": "044"}),
    ],
)
def test_invalid_or_mismatched_bodies_make_pricing_unavailable(response):
    failing(lambda r: response)


def test_oversized_bodies_are_rejected():
    big = card_body(notes="x" * (300 * 1024))
    failing(lambda r: httpx.Response(200, json=big))


def test_redirects_are_not_followed():
    calls = []

    def handle(request):
        calls.append(str(request.url))
        return httpx.Response(301, headers={"Location": "http://evil.example/x"})

    failing(handle)
    assert len(calls) == 1


def test_concurrent_pricing_requests_share_the_existing_five_request_limit():
    active = peak = 0

    async def handle(request):
        nonlocal active, peak
        active += 1
        peak = max(peak, active)
        await asyncio.sleep(0.01)
        active -= 1
        return httpx.Response(200, json=card_body())

    async def run():
        card_provider = provider(handle)
        return await asyncio.gather(
            *(card_provider.card_pricing("me05-044") for _ in range(40))
        )

    results = asyncio.run(run())
    assert len(results) == 40
    assert 1 < peak <= 5


# --- Exchange rates ---


def rates_body(**overrides):
    body = {
        "result": "success",
        "provider": "https://www.exchangerate-api.com",
        "base_code": RATES_SAMPLE["base_code"],
        "time_last_update_utc": RATES_SAMPLE["time_last_update_utc"],
        "rates": {"USD": 1, "CLP": 1016.589577, "EUR": 0.911134, "JPY": 150.2},
    }
    return {**body, **overrides}


def fetch(handler):
    client = RatesClient(transport=httpx.MockTransport(handler))
    return asyncio.run(client.fetch())


def test_fetch_returns_exact_decimals_and_provider_date_from_the_real_sample():
    seen = []

    def handle(request):
        seen.append(request)
        return httpx.Response(200, json=rates_body())

    rates = fetch(handle)
    assert rates.usd_clp == Decimal("1016.589577")
    assert rates.eur_per_usd == Decimal("0.911134")
    assert rates.updated_at == datetime(2026, 11, 23, 0, 2, 32, tzinfo=UTC)
    assert len(seen) == 1  # no internal retries: a 429 would block us for 20 minutes
    request = seen[0]
    assert str(request.url) == RATES_URL == "https://open.er-api.com/v6/latest/USD"
    assert request.method == "GET"
    assert "authorization" not in request.headers
    assert request.headers["user-agent"].startswith("PokeVault")
    assert "@" not in request.headers["user-agent"]


def test_fetch_accepts_integer_rates():
    body = rates_body(rates={"CLP": 1000, "EUR": 1})
    assert fetch(lambda r: httpx.Response(200, json=body)).eur_per_usd == Decimal(1)


def test_429_is_reported_as_rate_limited_without_retrying():
    calls = []

    def handle(request):
        calls.append(request)
        return httpx.Response(429, headers={"Retry-After": "1200"})

    with pytest.raises(RatesUnavailable) as error:
        fetch(handle)
    assert error.value.rate_limited is True
    assert len(calls) == 1


@pytest.mark.parametrize("status", [500, 502, 503, 404, 403])
def test_other_statuses_are_unavailable_but_not_rate_limited(status):
    with pytest.raises(RatesUnavailable) as error:
        fetch(lambda r: httpx.Response(status))
    assert error.value.rate_limited is False


def test_timeouts_and_connection_errors_are_unavailable():
    def timeout(request):
        raise httpx.ConnectTimeout("slow", request=request)

    def refused(request):
        raise httpx.ConnectError("down", request=request)

    for handler in (timeout, refused):
        with pytest.raises(RatesUnavailable):
            fetch(handler)


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(200, content=b"not json"),
        httpx.Response(200, json=[1, 2]),
        httpx.Response(200, json=rates_body(result="error")),
        httpx.Response(200, json={"result": "error", "error-type": "quota-reached"}),
        httpx.Response(200, json=rates_body(base_code="EUR")),
        httpx.Response(200, json=rates_body(rates="nope")),
        httpx.Response(200, json=rates_body(rates={"CLP": 1000})),
        httpx.Response(200, json=rates_body(rates={"EUR": 0.9})),
        httpx.Response(200, json=rates_body(rates={"CLP": 0, "EUR": 0.9})),
        httpx.Response(200, json=rates_body(rates={"CLP": 299.99, "EUR": 0.9})),
        httpx.Response(200, json=rates_body(rates={"CLP": 3000.01, "EUR": 0.9})),
        httpx.Response(200, json=rates_body(rates={"CLP": 1000, "EUR": 0.39})),
        httpx.Response(200, json=rates_body(rates={"CLP": 1000, "EUR": 2.01})),
        httpx.Response(200, json=rates_body(rates={"CLP": "1000", "EUR": 0.9})),
        httpx.Response(200, json=rates_body(rates={"CLP": True, "EUR": 0.9})),
        httpx.Response(200, json=rates_body(rates={"CLP": None, "EUR": 0.9})),
        httpx.Response(200, json=rates_body(time_last_update_utc="yesterday")),
        httpx.Response(200, json={**rates_body(), "time_last_update_utc": None}),
    ],
)
def test_invalid_responses_are_rejected(response):
    with pytest.raises(RatesUnavailable):
        fetch(lambda r: response)


def test_bounds_are_inclusive():
    for clp, eur in ((300, 0.4), (3000, 2.0)):
        response = httpx.Response(200, json=rates_body(rates={"CLP": clp, "EUR": eur}))
        assert fetch(lambda r, response=response: response).usd_clp == Decimal(clp)


def test_oversized_and_redirected_responses_are_rejected():
    big = rates_body(rates={f"X{n}": 1 for n in range(30000)})
    with pytest.raises(RatesUnavailable):
        fetch(lambda r: httpx.Response(200, json=big))
    calls = []

    def redirect(request):
        calls.append(request)
        return httpx.Response(302, headers={"Location": "http://evil.example/"})

    with pytest.raises(RatesUnavailable):
        fetch(redirect)
    assert len(calls) == 1


def test_error_messages_do_not_leak_provider_payloads():
    secret = "SECRET-PAYLOAD-" + "x" * 50
    with pytest.raises(RatesUnavailable) as error:
        fetch(lambda r: httpx.Response(200, json=rates_body(result=secret)))
    assert secret not in str(error.value)
