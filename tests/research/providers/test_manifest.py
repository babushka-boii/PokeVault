import json
import tempfile
import unittest
from pathlib import Path

from research.providers.provider_validation.manifest import ManifestError, load_manifest


PROJECT_ROOT = Path(__file__).resolve().parents[3]
REAL_MANIFEST = PROJECT_ROOT / "research" / "providers" / "manifest.json"


class ManifestTests(unittest.TestCase):
    def write_manifest(self, cases: list[dict[str, object]]) -> Path:
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        path = Path(directory.name) / "manifest.json"
        path.write_text(json.dumps({"cases": cases}), encoding="utf-8")
        return path

    def valid_case(self, **changes: object) -> dict[str, object]:
        case: dict[str, object] = {
            "name": "furret-en",
            "provider": "tcgdex",
            "resource_kind": "card",
            "language": "en",
            "url": "https://api.tcgdex.net/v2/en/cards/swsh3-136",
            "expected": {"id": "swsh3-136"},
        }
        case.update(changes)
        return case

    def test_real_manifest_has_expected_fixed_case_distribution(self) -> None:
        cases = load_manifest(REAL_MANIFEST)

        self.assertEqual(12, len(cases))
        self.assertEqual(12, len({case.name for case in cases}))
        self.assertTrue(all(case.url.startswith("https://") for case in cases))
        self.assertEqual(
            {
                ("tcgdex", "card"): 5,
                ("tcgdex", "set"): 1,
                ("pokeapi", "species"): 3,
                ("pokeapi", "pokemon"): 3,
            },
            self.case_distribution(cases),
        )

    def test_rejects_duplicate_case_names(self) -> None:
        case = self.valid_case()
        path = self.write_manifest([case, dict(case)])

        with self.assertRaisesRegex(ManifestError, "duplicate case name"):
            load_manifest(path)

    def test_rejects_unknown_provider(self) -> None:
        path = self.write_manifest([self.valid_case(provider="unknown")])

        with self.assertRaisesRegex(ManifestError, "provider"):
            load_manifest(path)

    def test_rejects_non_https_url(self) -> None:
        path = self.write_manifest(
            [self.valid_case(url="http://api.tcgdex.net/v2/en/cards/swsh3-136")]
        )

        with self.assertRaisesRegex(ManifestError, "HTTPS"):
            load_manifest(path)

    def test_rejects_missing_expected_object(self) -> None:
        case = self.valid_case()
        del case["expected"]
        path = self.write_manifest([case])

        with self.assertRaisesRegex(ManifestError, "expected"):
            load_manifest(path)

    @staticmethod
    def case_distribution(cases: tuple[object, ...]) -> dict[tuple[str, str], int]:
        distribution: dict[tuple[str, str], int] = {}
        for case in cases:
            key = (case.provider, case.resource_kind)
            distribution[key] = distribution.get(key, 0) + 1
        return distribution


if __name__ == "__main__":
    unittest.main()
