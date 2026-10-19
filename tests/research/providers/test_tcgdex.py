import json
import unittest
from decimal import Decimal
from pathlib import Path

from research.providers.provider_validation.models import CardCategory
from research.providers.provider_validation.tcgdex import (
    ProviderDataError,
    normalize_card,
    normalize_set,
)


SAMPLES = Path(__file__).with_name("samples")


def load_sample(name: str) -> dict[str, object]:
    return json.loads((SAMPLES / name).read_text(encoding="utf-8"))


def minimal_card(**changes: object) -> dict[str, object]:
    card: dict[str, object] = {
        "id": "base1-88",
        "localId": "88",
        "name": "Professor Oak",
        "category": "Trainer",
        "set": {"id": "base1"},
        "variants": {"normal": True},
    }
    card.update(changes)
    return card


class TCGdexCardNormalizationTests(unittest.TestCase):
    def test_normalizes_english_and_spanish_pokemon_categories(self) -> None:
        english = normalize_card(load_sample("tcgdex_furret_en.json"), "en")
        spanish_payload = load_sample("tcgdex_furret_en.json")
        spanish_payload["category"] = "Pokémon"
        spanish = normalize_card(spanish_payload, "es")

        self.assertEqual(CardCategory.POKEMON, english.category)
        self.assertEqual(CardCategory.POKEMON, spanish.category)

    def test_preserves_single_and_multiple_species_in_provider_order(self) -> None:
        furret = normalize_card(load_sample("tcgdex_furret_en.json"), "en")
        tag_team = normalize_card(load_sample("tcgdex_multi_species.json"), "en")

        self.assertEqual((162,), furret.dex_ids)
        self.assertEqual((25, 644), tag_team.dex_ids)

    def test_trainer_and_energy_never_create_species_links(self) -> None:
        trainer = normalize_card(minimal_card(dexId=[25]), "en")
        energy = normalize_card(
            minimal_card(id="base1-99", localId="99", category="Energy", dexId=[1]),
            "en",
        )

        self.assertEqual(CardCategory.TRAINER, trainer.category)
        self.assertEqual((), trainer.dex_ids)
        self.assertEqual(CardCategory.ENERGY, energy.category)
        self.assertEqual((), energy.dex_ids)

    def test_preserves_detailed_variant_identity_finish_subtype_and_stamps(self) -> None:
        card = normalize_card(load_sample("tcgdex_furret_en.json"), "en")

        self.assertEqual(2, len(card.variants))
        self.assertEqual("normal-id", card.variants[0].provider_id)
        self.assertEqual("normal", card.variants[0].finish)
        self.assertEqual("reverse-holofoil", card.variants[1].subtype)
        self.assertEqual(("sample-stamp",), card.variants[1].stamps)

    def test_falls_back_to_available_simple_variants(self) -> None:
        card = normalize_card(minimal_card(variants={"normal": True, "reverse": True}), "en")

        self.assertEqual(("normal", "reverse"), tuple(v.finish for v in card.variants))

    def test_keeps_currency_and_null_metrics_without_inventing_zero(self) -> None:
        card = normalize_card(load_sample("tcgdex_furret_en.json"), "en")
        observations = card.variants[0].prices

        self.assertEqual(("cardmarket", "tcgplayer"), tuple(p.source for p in observations))
        self.assertEqual(("EUR", "USD"), tuple(p.currency for p in observations))
        cardmarket_metrics = dict(observations[0].metrics)
        tcgplayer_metrics = dict(observations[1].metrics)
        self.assertEqual(Decimal("0.07"), cardmarket_metrics["avg"])
        self.assertIsNone(cardmarket_metrics["low"])
        self.assertIsNone(tcgplayer_metrics["directLowPrice"])
        self.assertNotIn("highPrice", tcgplayer_metrics)
        self.assertNotIn(Decimal("0"), cardmarket_metrics.values())
        self.assertNotIn(Decimal("0"), tcgplayer_metrics.values())

    def test_allows_optional_display_and_price_fields_to_be_absent(self) -> None:
        card = normalize_card(minimal_card(), "en")

        self.assertIsNone(card.image_url)
        self.assertEqual((), card.prices)

    def test_rejects_malformed_essential_card_fields(self) -> None:
        invalid_cards = [
            minimal_card(id=None),
            minimal_card(category=None),
            minimal_card(set={}),
            minimal_card(localId=None),
            minimal_card(category="Pokemon", dexId=["162"]),
        ]

        for payload in invalid_cards:
            with self.subTest(payload=payload):
                with self.assertRaises(ProviderDataError):
                    normalize_card(payload, "en")


class TCGdexSetNormalizationTests(unittest.TestCase):
    def test_normalizes_set_counts(self) -> None:
        result = normalize_set(
            {
                "id": "swsh3",
                "name": "Darkness Ablaze",
                "cardCount": {"official": 189, "total": 201},
            }
        )

        self.assertEqual("swsh3", result.external_id)
        self.assertEqual(189, result.official_count)
        self.assertEqual(201, result.total_count)

    def test_rejects_non_integer_set_counts(self) -> None:
        with self.assertRaises(ProviderDataError):
            normalize_set(
                {
                    "id": "swsh3",
                    "name": "Darkness Ablaze",
                    "cardCount": {"official": "189", "total": 201},
                }
            )


if __name__ == "__main__":
    unittest.main()
