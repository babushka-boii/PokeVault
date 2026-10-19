import unittest
from datetime import datetime, timezone

from research.providers.provider_validation.fixtures import build_fixture
from research.providers.provider_validation.models import ValidationCase
from research.providers.provider_validation.report import build_report


class ReportTests(unittest.TestCase):
    def test_report_is_deterministic_and_keeps_manifest_order(self):
        cases = (
            ValidationCase("card", "tcgdex", "card", "en", "https://example.test/card", {}),
            ValidationCase("species", "pokeapi", "species", None, "https://example.test/species", {}),
        )
        retrieved = datetime(2026, 10, 19, tzinfo=timezone.utc)
        fixtures = {
            "card": build_fixture(cases[0], {"id": "x", "category": "Pokemon", "dexId": [25, 644], "image": None, "pricing": {"currency": "USD", "updated": None, "low": None}}, retrieved),
            "species": build_fixture(cases[1], {"id": 25, "name": "pikachu", "names": [{"language": {"name": "en"}, "name": "Pikachu"}]}, retrieved),
        }
        first = build_report(cases, fixtures)
        self.assertEqual(first, build_report(cases, fixtures))
        self.assertLess(first.index("`card`"), first.index("`species`"))
        for text in ("Pokemon", "25, 644", "USD", "null", "image URL: missing", "Limitations"):
            self.assertIn(text, first)

    def test_report_exposes_zero_species_and_set_counts(self):
        cases = (
            ValidationCase("trainer", "tcgdex", "card", "en", "https://example.test/trainer", {}),
            ValidationCase("set", "tcgdex", "set", "en", "https://example.test/set", {}),
        )
        now = datetime(2026, 10, 19, tzinfo=timezone.utc)
        fixtures = {
            "trainer": build_fixture(cases[0], {"id": "t", "category": "Trainer", "dexId": []}, now),
            "set": build_fixture(cases[1], {"id": "swsh3", "cardCount": {"official": 189, "total": 201}}, now),
        }
        report = build_report(cases, fixtures)
        self.assertIn("species links: 0", report)
        self.assertIn("official=189, total=201", report)


if __name__ == "__main__":
    unittest.main()
