"""Six public brief-only name probes; retain compact hashes, never artwork."""

import argparse
import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen

PROBES = (
    ("pikachu_en", "en", "Pikachu"),
    ("furret_en", "en", "Furret"),
    ("furret_es", "es", "Furret"),
    ("trainer_en", "en", "Professor Oak"),
    ("energy_en", "en", "Grass Energy"),
    ("energy_es", "es", "Energía Planta"),
)


def run(captures=None):
    evidence = []
    memberships = {}
    for label, language, name in PROBES:
        query = {
            "name": f"like:{name}",
            "sort:field": "id",
            "sort:order": "ASC",
            "pagination:page": 1,
            "pagination:itemsPerPage": 64,
        }
        url = f"https://api.tcgdex.net/v2/{language}/cards?{urlencode(query)}"
        if captures:
            # Import the six already captured successful curl responses without
            # issuing additional probes. The capture run verified HTTP 200.
            body = (captures / f"pokevault-scanner-{label}.json").read_bytes()
            status = 200
        else:
            with urlopen(url, timeout=20) as response:
                body, status = response.read(), response.status
        rows = json.loads(body)
        if not isinstance(rows, list) or len(rows) > 64:
            raise ValueError(f"Unexpected public page for {label}")
        memberships[label] = {row["id"] for row in rows}
        evidence.append(
            {
                "case": label,
                "url": url,
                "method": "GET",
                "status": status,
                "sha256": hashlib.sha256(body).hexdigest(),
                "summary": {
                    "count": len(rows),
                    "unique_ids": len(memberships[label]),
                    "at_requested_bound": len(rows) == 64,
                    "fields": sorted({key for row in rows for key in row}),
                    "sample": [
                        {key: row[key] for key in ("id", "localId", "name")}
                        for row in rows[:3]
                    ],
                },
            }
        )
    output = {
        "purpose": "Iteration 6 bounded literal scanner-name discovery verification",
        "verified_on": "2026-11-10",
        "recorded_at": datetime.now(UTC).isoformat(),
        "request_budget": 6,
        "official_reference": "https://tcgdex.dev/rest/filtering-sorting-pagination",
        "coverage": "Sampled public name pages only; not a complete physical catalog",
        "artwork_binaries_fetched": False,
        "furret_language_membership": {
            "english_count": len(memberships["furret_en"]),
            "spanish_count": len(memberships["furret_es"]),
            "intersection": len(memberships["furret_en"] & memberships["furret_es"]),
        },
        "requests": evidence,
    }
    path = Path(__file__).with_name("scanner_search_verification.json")
    path.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n")
    print(
        json.dumps(
            {
                "output": str(path),
                "requests": len(evidence),
                "counts": {row["case"]: row["summary"]["count"] for row in evidence},
            }
        )
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--captures", type=Path)
    run(parser.parse_args().captures)
