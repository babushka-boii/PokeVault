import json
from pathlib import Path
from urllib.parse import urlparse

from .models import ManifestError, ValidationCase


ALLOWED_PROVIDERS = {"tcgdex", "pokeapi"}
ALLOWED_RESOURCE_KINDS = {"card", "set", "species", "pokemon"}
CASE_KEYS = {"name", "provider", "resource_kind", "language", "url", "expected"}


def load_manifest(path: Path) -> tuple[ValidationCase, ...]:
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ManifestError(f"cannot read manifest: {error}") from error

    if type(document) is not dict or set(document) != {"cases"}:
        raise ManifestError("manifest must contain only a cases array")

    raw_cases = document["cases"]
    if type(raw_cases) is not list:
        raise ManifestError("cases must be an array")

    cases: list[ValidationCase] = []
    names: set[str] = set()
    for index, raw_case in enumerate(raw_cases):
        case = _parse_case(raw_case, index)
        if case.name in names:
            raise ManifestError(f"duplicate case name: {case.name}")
        names.add(case.name)
        cases.append(case)

    return tuple(cases)


def _parse_case(raw_case: object, index: int) -> ValidationCase:
    if type(raw_case) is not dict or set(raw_case) != CASE_KEYS:
        raise ManifestError(f"case {index} must contain exactly {sorted(CASE_KEYS)}")

    name = _required_string(raw_case, "name", index)
    provider = _required_string(raw_case, "provider", index)
    resource_kind = _required_string(raw_case, "resource_kind", index)
    url = _required_string(raw_case, "url", index)
    language = raw_case["language"]
    expected = raw_case["expected"]

    if provider not in ALLOWED_PROVIDERS:
        raise ManifestError(f"case {index} has unknown provider: {provider}")
    if resource_kind not in ALLOWED_RESOURCE_KINDS:
        raise ManifestError(f"case {index} has unknown resource kind: {resource_kind}")
    if language is not None and type(language) is not str:
        raise ManifestError(f"case {index} language must be a string or null")
    if type(expected) is not dict:
        raise ManifestError(f"case {index} expected must be an object")

    parsed_url = urlparse(url)
    if parsed_url.scheme != "https" or not parsed_url.hostname:
        raise ManifestError(f"case {index} URL must use HTTPS")

    return ValidationCase(
        name=name,
        provider=provider,
        resource_kind=resource_kind,
        language=language,
        url=url,
        expected=dict(expected),
    )


def _required_string(raw_case: dict[str, object], key: str, index: int) -> str:
    value = raw_case[key]
    if type(value) is not str or not value:
        raise ManifestError(f"case {index} {key} must be a non-empty string")
    return value
