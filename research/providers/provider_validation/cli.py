import argparse
import json
import os
import sys
import tempfile
from collections.abc import Mapping, Sequence
from datetime import datetime, timezone
from pathlib import Path

from .fixtures import build_fixture, promote_fixtures, verify_fixture, write_staged_fixture
from .http import fetch_json
from .manifest import load_manifest
from .models import CardRecord, SpeciesRecord, ValidationCase
from .pokeapi import normalize_pokemon, normalize_species, validate_species_links
from .report import build_report
from .tcgdex import normalize_card, normalize_set


PROVIDERS_DIR = Path(__file__).resolve().parents[1]
MANIFEST_PATH = PROVIDERS_DIR / "manifest.json"
FIXTURES_DIR = PROVIDERS_DIR / "fixtures"
REPORT_PATH = PROVIDERS_DIR / "REPORT.md"


def validate_payload(case: ValidationCase, payload: object) -> object:
    if not isinstance(payload, Mapping):
        raise ValueError("top-level payload must be an object")
    _assert_expected_subset(case.expected, payload, "payload")
    if case.provider == "tcgdex" and case.resource_kind == "card":
        if case.language is None:
            raise ValueError("TCGdex card case requires a language")
        return normalize_card(payload, case.language)
    if case.provider == "tcgdex" and case.resource_kind == "set":
        return normalize_set(payload)
    if case.provider == "pokeapi" and case.resource_kind == "species":
        return normalize_species(payload)
    if case.provider == "pokeapi" and case.resource_kind == "pokemon":
        return normalize_pokemon(payload)
    raise ValueError("unsupported provider/resource combination")


def validate_cross_provider(cases: Sequence[ValidationCase], payloads: Mapping[str, object]) -> None:
    cards: list[CardRecord] = []
    species: dict[int, SpeciesRecord] = {}
    for case in cases:
        normalized = validate_payload(case, payloads[case.name])
        if isinstance(normalized, CardRecord):
            cards.append(normalized)
        elif isinstance(normalized, SpeciesRecord):
            species[normalized.national_dex_number] = normalized
    violations = validate_species_links(cards, species)
    if violations:
        raise ValueError("; ".join(violations))


def project_payload(case: ValidationCase, payload: Mapping[str, object]) -> dict[str, object]:
    if case.provider == "tcgdex" and case.resource_kind == "card":
        keys = ("id", "localId", "name", "category", "set", "dexId", "image", "variants", "variants_detailed", "pricing")
        return {key: payload[key] for key in keys if key in payload}
    if case.provider == "tcgdex" and case.resource_kind == "set":
        keys = ("id", "name", "cardCount")
        return {key: payload[key] for key in keys if key in payload}
    if case.provider == "pokeapi" and case.resource_kind == "species":
        names = payload.get("names", [])
        filtered_names = [
            entry for entry in names
            if isinstance(entry, Mapping)
            and isinstance(entry.get("language"), Mapping)
            and entry["language"].get("name") in {"en", "es"}
        ] if isinstance(names, list) else names
        return {
            key: (filtered_names if key == "names" else payload[key])
            for key in ("id", "name", "generation", "names")
            if key in payload
        }
    if case.provider == "pokeapi" and case.resource_kind == "pokemon":
        sprites = payload.get("sprites")
        minimal_sprites = {"front_default": sprites.get("front_default")} if isinstance(sprites, Mapping) else sprites
        projected = {key: payload[key] for key in ("id", "name", "types") if key in payload}
        projected["sprites"] = minimal_sprites
        return projected
    raise ValueError("unsupported provider/resource combination")


def run(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Validate PokéVault data providers")
    parser.add_argument("command", choices=("refresh", "report"))
    args = parser.parse_args(argv)
    try:
        cases = load_manifest(MANIFEST_PATH)
        if args.command == "refresh":
            return _refresh(cases)
        return _report(cases)
    except Exception as error:
        print(f"provider validation failed: {error}", file=sys.stderr)
        return 1


def _refresh(cases: Sequence[ValidationCase]) -> int:
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    payloads: dict[str, object] = {}
    with tempfile.TemporaryDirectory(prefix="provider-validation-", dir=REPORT_PATH.parent) as temporary:
        staging = Path(temporary)
        for case in cases:
            try:
                payload = fetch_json(case.url)
            except Exception as error:
                raise RuntimeError(_context(case, "fetch", error)) from error
            try:
                validate_payload(case, payload)
            except Exception as error:
                raise RuntimeError(_context(case, "validate", error)) from error
            projected = project_payload(case, payload)
            validate_payload(case, projected)
            payloads[case.name] = projected
            fixture = build_fixture(case, projected, datetime.now(timezone.utc))
            write_staged_fixture(staging, case.name, fixture)

        try:
            validate_cross_provider(cases, payloads)
        except Exception as error:
            raise RuntimeError(f"cross-provider validation stage failed: {error}") from error

        staged = {case.name: _read_fixture(staging / f"{case.name}.json") for case in cases}
        report = build_report(cases, staged)
        promote_fixtures(staging, FIXTURES_DIR, {case.name for case in cases})
        _write_report(report)
    return 0


def _report(cases: Sequence[ValidationCase]) -> int:
    fixtures = {
        case.name: _read_fixture(FIXTURES_DIR / f"{case.name}.json") for case in cases
    }
    _write_report(build_report(cases, fixtures))
    return 0


def _read_fixture(path: Path) -> Mapping[str, object]:
    document = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(document, Mapping):
        raise ValueError(f"fixture {path.name} must be an object")
    verify_fixture(document)
    return document


def _write_report(report: str) -> None:
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(prefix="provider-report-", dir=REPORT_PATH.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
            stream.write(report)
        os.replace(temporary_name, REPORT_PATH)
    except Exception:
        Path(temporary_name).unlink(missing_ok=True)
        raise


def _assert_expected_subset(expected: Mapping[str, object], actual: Mapping[str, object], path: str) -> None:
    for key, value in expected.items():
        if key not in actual:
            if key == "dexId" and value == []:
                continue
            raise ValueError(f"{path}.{key} is missing")
        observed = actual[key]
        if isinstance(value, Mapping):
            if not isinstance(observed, Mapping):
                raise ValueError(f"{path}.{key} must be an object")
            _assert_expected_subset(value, observed, f"{path}.{key}")
        elif not _matches_expected(value, observed):
            raise ValueError(f"{path}.{key} does not match manifest invariant")


def _matches_expected(expected: object, observed: object) -> bool:
    if observed == expected:
        return True
    if isinstance(observed, Mapping) and observed.get("name") == expected:
        return True
    if isinstance(expected, list) and isinstance(observed, list):
        named: list[tuple[int, object]] = []
        for index, entry in enumerate(observed):
            if not isinstance(entry, Mapping):
                return False
            linked = entry.get("type", entry)
            if not isinstance(linked, Mapping) or "name" not in linked:
                return False
            slot = entry.get("slot", index)
            if type(slot) is not int:
                return False
            named.append((slot, linked["name"]))
        return [name for _, name in sorted(named)] == expected
    return False


def _context(case: ValidationCase, stage: str, error: Exception) -> str:
    return f"provider={case.provider} case={case.name} url={case.url} stage={stage}: {error}"
