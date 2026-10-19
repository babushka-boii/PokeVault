import json
from collections.abc import Mapping, Sequence

from .fixtures import verify_fixture
from .models import ValidationCase


def build_report(
    cases: Sequence[ValidationCase],
    fixtures: Mapping[str, Mapping[str, object]],
) -> str:
    lines = [
        "# Provider validation report",
        "",
        "Generated deterministically from the validation manifest and verified fixtures.",
        "",
        "## Coverage",
        "",
    ]
    for case in cases:
        if case.name not in fixtures:
            raise ValueError(f"missing fixture for {case.name}")
        payload = verify_fixture(fixtures[case.name])
        if not isinstance(payload, Mapping):
            raise ValueError(f"fixture payload for {case.name} must be an object")
        lines.extend(_case_lines(case, payload))

    lines.extend(
        [
            "## Limitations",
            "",
            "- This is a fixed provider sample, not a complete catalog.",
            "- Missing and null optional values remain explicit; prices are not converted or combined.",
            "- Image and sprite binaries are not downloaded.",
            "",
        ]
    )
    return "\n".join(lines)


def _case_lines(case: ValidationCase, payload: Mapping[str, object]) -> list[str]:
    category = payload.get("category")
    dex_ids = payload.get("dexId")
    image = payload.get("image") or payload.get("imageUrl")
    sprites = payload.get("sprites")
    sprite = sprites.get("front_default") if isinstance(sprites, Mapping) else None
    count = payload.get("cardCount")
    details = [f"provider={case.provider}", f"kind={case.resource_kind}"]
    if category is not None:
        details.append(f"category={category}")
    if isinstance(dex_ids, list):
        rendered = ", ".join(str(value) for value in dex_ids) or "0"
        details.append(f"species links: {rendered}")
    if isinstance(count, Mapping):
        details.append(f"official={count.get('official')}, total={count.get('total')}")
    details.append(f"image URL: {'present' if image else 'missing'}")
    details.append(f"sprite URL: {'present' if sprite else 'missing'}")
    details.append("data=" + json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")))
    return [f"### `{case.name}`", "", "- " + "; ".join(details), ""]
