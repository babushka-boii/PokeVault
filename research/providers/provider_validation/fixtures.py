import hashlib
import json
import os
from collections.abc import Collection, Mapping
from datetime import datetime, timezone
from pathlib import Path

from .models import ValidationCase


class FixtureError(ValueError):
    """Raised when stored provider evidence fails integrity checks."""


def canonical_payload_bytes(payload: object) -> bytes:
    return json.dumps(
        payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")


def build_fixture(
    case: ValidationCase, payload: object, retrieved_at: datetime
) -> dict[str, object]:
    if retrieved_at.tzinfo is None:
        raise FixtureError("retrieved_at must include a timezone")
    timestamp = retrieved_at.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    digest = hashlib.sha256(canonical_payload_bytes(payload)).hexdigest()
    return {
        "metadata": {
            "case": case.name,
            "provider": case.provider,
            "source_url": case.url,
            "retrieved_at": timestamp,
            "sha256": digest,
        },
        "payload": payload,
    }


def verify_fixture(fixture: Mapping[str, object]) -> object:
    if set(fixture) != {"metadata", "payload"}:
        raise FixtureError("fixture must contain metadata and payload")
    metadata = fixture["metadata"]
    if not isinstance(metadata, Mapping):
        raise FixtureError("fixture metadata must be an object")
    required = {"case", "provider", "source_url", "retrieved_at", "sha256"}
    if set(metadata) != required or any(type(metadata[key]) is not str for key in required):
        raise FixtureError("fixture metadata is malformed")
    expected = hashlib.sha256(canonical_payload_bytes(fixture["payload"])).hexdigest()
    if metadata["sha256"] != expected:
        raise FixtureError("fixture payload digest does not match")
    return fixture["payload"]


def write_staged_fixture(
    staging_dir: Path, case_name: str, fixture: Mapping[str, object]
) -> Path:
    verify_fixture(fixture)
    staging_dir.mkdir(parents=True, exist_ok=True)
    path = staging_dir / f"{case_name}.json"
    path.write_text(
        json.dumps(fixture, ensure_ascii=False, sort_keys=True, indent=2) + "\n",
        encoding="utf-8",
    )
    return path


def promote_fixtures(
    staging_dir: Path, destination_dir: Path, expected_names: Collection[str]
) -> None:
    expected_files = {f"{name}.json" for name in expected_names}
    actual_files = {path.name for path in staging_dir.glob("*.json")}
    if actual_files != expected_files:
        raise FixtureError("staged fixture set is incomplete")

    staged_paths = [staging_dir / name for name in sorted(expected_files)]
    for path in staged_paths:
        try:
            document = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise FixtureError(f"cannot validate staged fixture {path.name}") from error
        if not isinstance(document, Mapping):
            raise FixtureError(f"staged fixture {path.name} must be an object")
        verify_fixture(document)

    destination_dir.mkdir(parents=True, exist_ok=True)
    for path in staged_paths:
        os.replace(path, destination_dir / path.name)
