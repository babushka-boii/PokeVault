"""Bounded read-only set probes; save summaries, never full card payloads."""

import concurrent.futures
import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

API = "https://api.tcgdex.net/v2/"
QUERY = "{ sets { id name releaseDate logo symbol serie { id name } } }"


def fetch(path):
    query = QUERY if path == "graphql" else None
    request = Request(
        API + path,
        data=json.dumps({"query": query}).encode() if query else None,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urlopen(request, timeout=20) as response:
            status, body = response.status, response.read()
    except HTTPError as error:
        status, body = error.code, error.read()
    try:
        parsed = json.loads(body)
    except ValueError:
        parsed = None
    evidence = {
        "url": request.full_url,
        "method": request.get_method(),
        "verified_at": datetime.now(UTC).isoformat(),
        "status": status,
        "sha256": hashlib.sha256(body).hexdigest(),
    }
    if query:
        evidence["query"] = query
    if isinstance(parsed, list):
        evidence["summary"] = {
            "count": len(parsed),
            "unique_ids": len({row["id"] for row in parsed}),
            "fields": sorted({key for row in parsed for key in row}),
            "sample": [
                row
                for row in parsed
                if row["id"] in {"base1", "swsh3", "sv03.5", "A1"}
            ],
        }
    elif isinstance(parsed, dict) and "cards" in parsed:
        cards = parsed["cards"]
        evidence["summary"] = {
            key: parsed.get(key)
            for key in ["id", "name", "serie", "releaseDate", "logo", "symbol", "cardCount"]
        }
        evidence["summary"].update(
            checklist_count=len(cards),
            unique_card_ids=len({row["id"] for row in cards}),
            card_fields=sorted({key for row in cards for key in row}),
            cards_with_image=sum(bool(row.get("image")) for row in cards),
            sample=cards[:1] + cards[-1:],
            sorted_membership_sha256=hashlib.sha256(
                "\n".join(sorted(row["id"] for row in cards)).encode()
            ).hexdigest(),
        )
    elif path == "graphql" and isinstance(parsed, dict):
        rows = parsed.get("data", {}).get("sets", [])
        evidence["summary"] = {
            "count": len(rows),
            "unique_ids": len({row["id"] for row in rows}),
            "series": sorted({(row.get("serie") or {}).get("id", "UNKNOWN") for row in rows}),
            "unknown_series_set_ids": [row["id"] for row in rows if not row.get("serie")],
            "pocket_sets": [row for row in rows if (row.get("serie") or {}).get("id") == "tcgp"],
            "errors": parsed.get("errors"),
        }
    return evidence, parsed


def run():
    paths = [
        "en/sets", "es/sets", "graphql",
        "en/sets/base1", "es/sets/base1",
        "en/sets/swsh3", "es/sets/swsh3",
        "en/sets/sv03.5", "es/sets/sv03.5", "en/sets/A1",
    ]
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        responses = dict(zip(paths, pool.map(fetch, paths), strict=True))
    en_ids = {row["id"] for row in responses["en/sets"][1]}
    es_ids = {row["id"] for row in responses["es/sets"][1]}
    output = {
        "purpose": "Iteration 5D physical-set and complete-checklist verification",
        "request_budget": 10,
        "official_references": ["https://tcgdex.dev/rest/sets", "https://tcgdex.dev/rest/set"],
        "list_coverage": {
            "english_count": len(en_ids), "spanish_count": len(es_ids),
            "english_only": sorted(en_ids - es_ids),
            "spanish_only": sorted(es_ids - en_ids),
        },
        "requests": [value[0] for value in responses.values()],
    }
    path = Path(__file__).with_name("set_completion_verification.json")
    path.write_text(json.dumps(output, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({"output": str(path), "list_coverage": output["list_coverage"], "summaries": [value[0] for value in responses.values()]}, ensure_ascii=False))


if __name__ == "__main__":
    run()
