import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from research.providers.provider_validation.cli import REPORT_PATH, project_payload, run, validate_payload
from research.providers.provider_validation.models import ValidationCase


class CliTests(unittest.TestCase):
    def test_default_report_path_matches_documented_interface(self):
        self.assertEqual("REPORT.md", REPORT_PATH.name)

    def test_tcgdex_dispatch_passes_manifest_language(self):
        payload = json.loads((Path(__file__).with_name("samples") / "tcgdex_furret_en.json").read_text())
        case = ValidationCase("furret", "tcgdex", "card", "en", "https://example.test", {})
        self.assertEqual("swsh3-136", validate_payload(case, payload).external_id)

    def test_absent_tcgdex_dex_id_satisfies_explicit_zero_links(self):
        payload = {"id": "base1-88", "localId": "88", "name": "Professor Oak", "category": "Trainer", "set": {"id": "base1"}, "variants": {}}
        case = ValidationCase("trainer", "tcgdex", "card", "en", "https://example.test", {"dexId": []})
        self.assertEqual((), validate_payload(case, payload).dex_ids)

    def test_pokeapi_manifest_compares_named_links_semantically(self):
        samples = Path(__file__).with_name("samples")
        species_payload = json.loads((samples / "pokeapi_species_furret.json").read_text())
        species_case = ValidationCase("furret", "pokeapi", "species", None, "https://example.test", {"generation": "generation-ii"})
        self.assertEqual("generation-ii", validate_payload(species_case, species_payload).generation)

        pokemon_payload = json.loads((samples / "pokeapi_pokemon_furret.json").read_text())
        pokemon_case = ValidationCase("furret", "pokeapi", "pokemon", None, "https://example.test", {"types": ["normal"]})
        self.assertEqual(("normal",), validate_payload(pokemon_case, pokemon_payload).types)

    def test_fixture_projection_drops_unrelated_catalog_data(self):
        payload = json.loads((Path(__file__).with_name("samples") / "pokeapi_pokemon_furret.json").read_text())
        payload["moves"] = [{"move": {"name": "tackle"}}] * 100
        case = ValidationCase("furret", "pokeapi", "pokemon", None, "https://example.test", {})
        projected = project_payload(case, payload)
        self.assertEqual({"id", "name", "types", "sprites"}, set(projected))
        self.assertNotIn("moves", projected)

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.manifest = Path(__file__).parents[3] / "research/providers/manifest.json"
        self.fixtures = self.root / "fixtures"
        self.report = self.root / "report.md"

    def tearDown(self):
        self.temp.cleanup()

    def _patch_paths(self):
        return patch.multiple(
            "research.providers.provider_validation.cli",
            MANIFEST_PATH=self.manifest,
            FIXTURES_DIR=self.fixtures,
            REPORT_PATH=self.report,
        )

    def test_refresh_fetches_exact_manifest_urls_and_writes_outputs(self):
        cases = json.loads(self.manifest.read_text())["cases"]
        urls = []
        def fake_fetch(url):
            urls.append(url)
            return {"source": url, "image": "https://images.example/card.png"}
        with self._patch_paths(), patch("research.providers.provider_validation.cli.fetch_json", side_effect=fake_fetch), patch("research.providers.provider_validation.cli.validate_payload"), patch("research.providers.provider_validation.cli.validate_cross_provider"):
            self.assertEqual(0, run(["refresh"]))
        self.assertEqual([case["url"] for case in cases], urls)
        self.assertEqual(12, len(list(self.fixtures.glob("*.json"))))
        self.assertTrue(self.report.exists())
        self.assertEqual(12, len(urls))

    def test_failed_seventh_request_preserves_outputs_and_cleans_staging(self):
        self.fixtures.mkdir()
        old_fixture = self.fixtures / "known.json"
        old_fixture.write_bytes(b"known-good\n")
        self.report.write_bytes(b"old-report\n")
        count = 0
        def fake_fetch(url):
            nonlocal count
            count += 1
            if count == 7:
                raise RuntimeError("offline")
            return {"source": url}
        stderr = io.StringIO()
        with self._patch_paths(), patch("research.providers.provider_validation.cli.fetch_json", side_effect=fake_fetch), patch("sys.stderr", stderr), patch("research.providers.provider_validation.cli.validate_payload"):
            self.assertEqual(1, run(["refresh"]))
        self.assertEqual(b"known-good\n", old_fixture.read_bytes())
        self.assertEqual(b"old-report\n", self.report.read_bytes())
        self.assertIn("pokeapi", stderr.getvalue())
        self.assertIn("fetch", stderr.getvalue())
        self.assertFalse(any(self.root.glob("provider-validation-*")))

    def test_report_rejects_tampered_fixture_without_network(self):
        self.fixtures.mkdir()
        (self.fixtures / "bad.json").write_text('{"metadata":{},"payload":{}}')
        with self._patch_paths(), patch("research.providers.provider_validation.cli.fetch_json") as fetcher, patch("sys.stderr", io.StringIO()):
            self.assertEqual(1, run(["report"]))
            fetcher.assert_not_called()


if __name__ == "__main__":
    unittest.main()
