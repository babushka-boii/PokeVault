"""Pure price rules: normalization, variant selection and conversion (no DB/network)."""

import json
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path

import pytest

from app.prices.conversion import convert, round_for, total
from app.prices.normalize import normalize_pricing
from app.prices.schemas import ExchangeRates, NoPrice, PriceQuote
from app.prices.selection import select_price

ROOT = Path(__file__).resolve().parents[2]
SAMPLE = json.loads((ROOT / "research/prices/tcgdex_sample.json").read_text())
NO_CARDMARKET = json.loads(
    (Path(__file__).parent / "fixtures/prices/tcgdex_no_cardmarket.json").read_text()
)
RATES_SAMPLE = json.loads(
    (ROOT / "research/prices/exchangerate_sample.json").read_text()
)["payload"]


def snapshot(entry):
    return normalize_pricing(entry["pricing"], entry["variants"])


def pick(card_id, variant, source=SAMPLE):
    return select_price(snapshot(source[card_id]), variant)


def assert_quote(result, amount, currency, source, metric):
    assert isinstance(result, PriceQuote), result
    assert (result.amount, result.currency, result.source, result.metric) == (
        Decimal(amount),
        currency,
        source,
        metric,
    )


# --- Normalization ------------------------------------------------------------


def test_normalization_keeps_only_selectable_values_from_the_sample():
    snap = snapshot(SAMPLE["en/me05-044"])
    assert snap.status == "ok"
    assert snap.cm_trend == Decimal("0.03")
    assert snap.cm_trend_reverse == Decimal("0.07")
    assert snap.tp_normal == Decimal("0.19")
    assert snap.tp_reverse == Decimal("0.25")
    assert snap.tp_holofoil is None
    assert snap.cm_updated == datetime(2026, 11, 22, 22, 16, 19, 162000, tzinfo=UTC)
    assert snap.tp_updated == datetime(2026, 11, 22, 22, 16, 35, 784000, tzinfo=UTC)
    assert (snap.has_normal, snap.has_holo, snap.has_reverse) == (True, False, True)


def test_zero_trend_holo_means_no_price_not_free():
    snap = snapshot(SAMPLE["en/me02.5-036"])
    assert SAMPLE["en/me02.5-036"]["pricing"]["cardmarket"]["trend-holo"] == 0
    assert snap.cm_trend_reverse is None


def test_high_price_is_never_stored_or_used():
    snap = snapshot(SAMPLE["en/me02.5-261"])
    assert snap.tp_holofoil == Decimal("0.66")
    assert Decimal("4321") not in {
        v for v in vars(snap).values() if isinstance(v, Decimal)
    }


@pytest.mark.parametrize("bad", [None, 0, 0.0, -1, -0.01, True, "0.5", float("nan")])
def test_invalid_values_become_none(bad):
    raw = {"cardmarket": {"unit": "EUR", "updated": None, "trend": bad}}
    assert normalize_pricing(raw, {"normal": True}).cm_trend is None


def test_values_above_the_sanity_cap_are_rejected():
    raw = {"cardmarket": {"unit": "EUR", "trend": 1000000.01}}
    assert normalize_pricing(raw, None).cm_trend is None
    raw = {"cardmarket": {"unit": "EUR", "trend": 1000000}}
    assert normalize_pricing(raw, None).cm_trend == Decimal("1000000")


def test_small_prices_keep_four_decimals_and_unrepresentable_ones_are_dropped():
    def trend(value):
        raw = {"cardmarket": {"unit": "EUR", "trend": value}}
        return normalize_pricing(raw, None).cm_trend

    assert trend(0.004) == Decimal("0.004")
    assert trend(0.0001) == Decimal("0.0001")
    assert trend(0.00004) is None  # would round to 0.0000
    assert trend(0.12345) == Decimal("0.1234")  # half-even at 4 decimals


def test_expensive_real_cards_above_ten_thousand_are_accepted():
    raw = {
        "cardmarket": {"unit": "EUR", "trend": 25000, "updated": "2026-11-22T00:00:00Z"}
    }
    snap = normalize_pricing(raw, {"normal": True, "holo": False, "reverse": False})
    assert snap.status == "ok"
    assert snap.cm_trend == Decimal("25000")
    assert_quote(select_price(snap, "normal"), "25000", "EUR", "cardmarket", "trend")


def test_wrong_or_missing_unit_rejects_that_source():
    raw = {
        "cardmarket": {"unit": "USD", "trend": 1.0},
        "tcgplayer": {
            "updated": "2026-11-22T00:00:00.000Z",
            "normal": {"marketPrice": 2},
        },
    }
    snap = normalize_pricing(raw, {"normal": True})
    assert snap.cm_trend is None
    assert snap.tp_normal is None
    assert snap.status == "no_data"


def test_missing_pricing_is_no_data_but_keeps_catalog_variants():
    snap = normalize_pricing(None, {"normal": True, "holo": False, "reverse": True})
    assert snap.status == "no_data"
    assert (snap.has_normal, snap.has_holo, snap.has_reverse) == (True, False, True)
    assert normalize_pricing({}, None).status == "no_data"


def test_malformed_pricing_shapes_do_not_raise():
    raw = {
        "cardmarket": "bad",
        "tcgplayer": {"unit": "USD", "normal": 5, "holofoil": None},
    }
    assert normalize_pricing(raw, {"normal": "yes"}).status == "no_data"
    assert normalize_pricing([], []).status == "no_data"


def test_unparseable_updated_timestamp_is_none_but_price_is_kept():
    raw = {"cardmarket": {"unit": "EUR", "trend": 1.5, "updated": "yesterday"}}
    snap = normalize_pricing(raw, None)
    assert snap.cm_trend == Decimal("1.5")
    assert snap.cm_updated is None


# --- Selection: sample cases from the spec -------------------------------------


def test_scorbunny_normal_uses_cardmarket_trend():
    result = pick("en/me02.5-036", "normal")
    assert_quote(result, "0.03", "EUR", "cardmarket", "trend")
    assert result.updated_at == datetime(2026, 11, 22, 22, 16, 19, 157000, tzinfo=UTC)


def test_scorbunny_reverse_has_no_price_even_though_catalog_has_it():
    assert pick("en/me02.5-036", "reverse") == NoPrice("no_market_data")


def test_cranidos_normal_and_reverse_use_cardmarket():
    assert_quote(pick("en/me05-044", "normal"), "0.03", "EUR", "cardmarket", "trend")
    assert_quote(pick("en/me05-044", "reverse"), "0.07", "EUR", "cardmarket", "trend")


def test_holo_only_card_uses_cardmarket_base_trend():
    result = pick("en/me02.5-261", "holo")
    assert_quote(result, "0.83", "EUR", "cardmarket", "trend")


def test_variant_not_in_catalog_is_never_priced_from_another_variant():
    assert pick("en/me02.5-261", "normal") == NoPrice("variant_not_in_catalog")
    assert pick("en/me02.5-261", "reverse") == NoPrice("variant_not_in_catalog")
    assert pick("en/me02.5-130", "holo") == NoPrice("variant_not_in_catalog")
    assert pick("en/me05-044", "holo") == NoPrice("variant_not_in_catalog")


@pytest.mark.parametrize("card_id", sorted(SAMPLE))
def test_unknown_and_unpriced_variants_never_get_a_price(card_id):
    assert pick(card_id, "unknown") == NoPrice("variant_unknown")
    assert pick(card_id, "first_edition") == NoPrice("variant_unpriced")
    assert pick(card_id, "other") == NoPrice("variant_unpriced")


def test_spanish_and_english_samples_select_identical_prices():
    for number in ("me02.5-036", "me02.5-085", "me02.5-130", "me05-044"):
        for variant in ("normal", "reverse"):
            es, en = pick(f"es/{number}", variant), pick(f"en/{number}", variant)
            if isinstance(es, PriceQuote):  # provider timestamps differ by ms
                assert (es.amount, es.currency, es.source, es.metric) == (
                    en.amount,
                    en.currency,
                    en.source,
                    en.metric,
                )
            else:
                assert es == en


# --- Selection: USD fallback (derived fixture) -----------------------------------


def test_fallback_to_tcgplayer_market_price_when_cardmarket_is_missing():
    cranidos = NO_CARDMARKET["en/me05-044#no-cardmarket"]
    tower = NO_CARDMARKET["en/me02.5-261#no-cardmarket"]
    assert_quote(
        select_price(snapshot(cranidos), "normal"),
        "0.19",
        "USD",
        "tcgplayer",
        "marketPrice",
    )
    assert_quote(
        select_price(snapshot(cranidos), "reverse"),
        "0.25",
        "USD",
        "tcgplayer",
        "marketPrice",
    )
    assert_quote(
        select_price(snapshot(tower), "holo"), "0.66", "USD", "tcgplayer", "marketPrice"
    )


def test_cardmarket_wins_over_tcgplayer_when_both_exist():
    assert pick("en/me05-044", "normal").source == "cardmarket"


def test_holo_of_card_that_also_has_normal_uses_only_tcgplayer_holofoil():
    raw = {
        "cardmarket": {
            "unit": "EUR",
            "trend": 5.0,
            "updated": "2026-11-22T00:00:00.000Z",
        },
        "tcgplayer": {
            "unit": "USD",
            "updated": "2026-11-22T00:00:00.000Z",
            "normal": {"marketPrice": 1.0},
            "holofoil": {"marketPrice": 7.5, "highPrice": 4321},
        },
    }
    variants = {"normal": True, "holo": True, "reverse": False}
    snap = normalize_pricing(raw, variants)
    assert_quote(select_price(snap, "holo"), "7.5", "USD", "tcgplayer", "marketPrice")
    assert_quote(select_price(snap, "normal"), "5.0", "EUR", "cardmarket", "trend")

    del raw["tcgplayer"]["holofoil"]
    snap = normalize_pricing(raw, variants)
    assert select_price(snap, "holo") == NoPrice("no_market_data")


def test_missing_catalog_variants_skip_cardmarket_and_use_matching_tcgplayer_key():
    raw = {
        "cardmarket": {"unit": "EUR", "trend": 5.0},
        "tcgplayer": {
            "unit": "USD",
            "normal": {"marketPrice": 1.0},
            "reverse-holofoil": {"marketPrice": 3.0},
        },
    }
    snap = normalize_pricing(raw, None)
    assert_quote(select_price(snap, "normal"), "1.0", "USD", "tcgplayer", "marketPrice")
    assert_quote(
        select_price(snap, "reverse"), "3.0", "USD", "tcgplayer", "marketPrice"
    )
    assert select_price(snap, "holo") == NoPrice("no_market_data")


def test_no_pricing_at_all_is_no_market_data():
    snap = normalize_pricing(None, {"normal": True})
    assert select_price(snap, "normal") == NoPrice("no_market_data")


# --- Conversion --------------------------------------------------------------------

RATES = ExchangeRates(
    usd_clp=Decimal("1000"),
    eur_per_usd=Decimal("0.8"),
    updated_at=datetime(2026, 11, 23, tzinfo=UTC),
)


def test_conversion_between_currencies():
    assert convert(Decimal("2"), "USD", "CLP", RATES) == Decimal("2000")
    assert convert(Decimal("2"), "EUR", "CLP", RATES) == Decimal("2500")  # 1 EUR=1250
    assert convert(Decimal("2"), "EUR", "USD", RATES) == Decimal("2.5")
    assert convert(Decimal("2.37"), "USD", "USD", RATES) == Decimal("2.37")


def test_conversion_matches_the_captured_real_rates():
    rates = ExchangeRates(
        usd_clp=Decimal(str(RATES_SAMPLE["rates"]["CLP"])),
        eur_per_usd=Decimal(str(RATES_SAMPLE["rates"]["EUR"])),
        updated_at=datetime(2026, 11, 23, tzinfo=UTC),
    )
    eur_clp = convert(Decimal("1"), "EUR", "CLP", rates)
    assert round_for("CLP", eur_clp) == Decimal("1116")  # ~1115.7 CLP per EUR
    assert round_for("CLP", convert(Decimal("0.83"), "EUR", "CLP", rates)) == Decimal(
        "926"
    )
    assert round_for("USD", convert(Decimal("0.83"), "EUR", "USD", rates)) == Decimal(
        "0.91"
    )


def test_rounding_uses_half_even_with_currency_precision():
    assert round_for("CLP", Decimal("2.5")) == Decimal("2")
    assert round_for("CLP", Decimal("3.5")) == Decimal("4")
    assert round_for("USD", Decimal("0.125")) == Decimal("0.12")
    assert round_for("USD", Decimal("0.135")) == Decimal("0.14")
    assert round_for("CLP", Decimal("37.5")).as_tuple().exponent == 0
    assert round_for("USD", Decimal("1")).as_tuple().exponent == -2


def test_totals_are_summed_before_rounding():
    each = convert(Decimal("0.03"), "EUR", "CLP", RATES)  # 37.5 CLP
    assert each == Decimal("37.5")
    assert round_for("CLP", each) * 2 == Decimal("76")  # rounding each would drift
    assert round_for("CLP", total([each, each])) == Decimal("75")
    assert total([]) == Decimal("0")


def test_conversion_rejects_unknown_currencies():
    with pytest.raises(ValueError):
        convert(Decimal("1"), "CLP", "USD", RATES)  # type: ignore[arg-type]
    with pytest.raises(ValueError):
        convert(Decimal("1"), "EUR", "EUR", RATES)  # type: ignore[arg-type]
