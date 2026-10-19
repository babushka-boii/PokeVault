import hashlib
import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from research.providers.provider_validation.fixtures import (
    FixtureError,
    build_fixture,
    canonical_payload_bytes,
    promote_fixtures,
    verify_fixture,
    write_staged_fixture,
)
from research.providers.provider_validation.models import ValidationCase


def sample_case(name="furret"):
    return ValidationCase(name, "pokeapi", "species", None, "https://pokeapi.co/api/v2/pokemon-species/162", {})


class FixtureTests(unittest.TestCase):
    def test_canonical_bytes_and_sha256_are_deterministic(self):
        payload = {"z": 1, "a": "á"}
        canonical = b'{"a":"\xc3\xa1","z":1}'
        self.assertEqual(canonical, canonical_payload_bytes(payload))
        fixture = build_fixture(sample_case(), payload, datetime(2026, 10, 19, tzinfo=timezone.utc))
        self.assertEqual(hashlib.sha256(canonical).hexdigest(), fixture["metadata"]["sha256"])
        self.assertEqual("2026-10-19T00:00:00Z", fixture["metadata"]["retrieved_at"])
        self.assertEqual(payload, verify_fixture(fixture))

    def test_rejects_payload_tampering(self):
        fixture = build_fixture(sample_case(), {"id": 162}, datetime.now(timezone.utc))
        fixture["payload"]["id"] = 25
        with self.assertRaisesRegex(FixtureError, "digest"):
            verify_fixture(fixture)

    def test_incomplete_stage_preserves_existing_fixtures(self):
        with tempfile.TemporaryDirectory() as root:
            root_path = Path(root)
            stage, destination = root_path / "stage", root_path / "fixtures"
            destination.mkdir()
            existing = destination / "a.json"
            existing.write_text("known-good\n", encoding="utf-8")
            fixture = build_fixture(sample_case("a"), {"id": 1}, datetime.now(timezone.utc))
            write_staged_fixture(stage, "a", fixture)
            with self.assertRaisesRegex(FixtureError, "incomplete"):
                promote_fixtures(stage, destination, {"a", "b"})
            self.assertEqual("known-good\n", existing.read_text(encoding="utf-8"))

    def test_promotes_complete_valid_stage_with_final_newline(self):
        with tempfile.TemporaryDirectory() as root:
            root_path = Path(root)
            stage, destination = root_path / "stage", root_path / "fixtures"
            for name in ("a", "b"):
                fixture = build_fixture(sample_case(name), {"id": name}, datetime.now(timezone.utc))
                path = write_staged_fixture(stage, name, fixture)
                self.assertTrue(path.read_bytes().endswith(b"\n"))
            promote_fixtures(stage, destination, {"a", "b"})
            self.assertEqual({"a.json", "b.json"}, {path.name for path in destination.iterdir()})
            self.assertEqual("a", verify_fixture(json.loads((destination / "a.json").read_text()))["id"])


if __name__ == "__main__":
    unittest.main()
