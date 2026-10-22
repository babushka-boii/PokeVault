"""Read-only TCGdex probes; persist compact metadata and HTTP headers, never artwork.

Run from the repository root: python research/tcgdex/verify_refinement.py
"""

import concurrent.futures
import json
from datetime import UTC, datetime
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen

API = "https://api.tcgdex.net/v2/"
OUTPUT = Path(__file__).with_name("refinement.json")


def fetch(path, *, query=None):
    url = API + path
    data = None if query is None else json.dumps({"query": query}).encode()
    request = Request(url, data=data, headers={"Content-Type": "application/json"})
    try:
        with urlopen(request, timeout=20) as response:
            return {"url": url, "status": response.status, "data": json.load(response)}
    except HTTPError as error:
        return {"url": url, "status": error.code, "data": None}


def cards(number, language="en", **extra):
    return fetch(language + "/cards?" + urlencode({"dexId": f"eq:{number}", **extra}))


def artwork_head(url):
    parsed = urlparse(url)
    assert parsed.scheme == "https" and parsed.hostname == "assets.tcgdex.net"
    assert parsed.port in (None, 443) and parsed.username is None
    assert not parsed.query and not parsed.fragment
    request = Request(url, method="HEAD")
    try:
        with urlopen(request, timeout=15) as response:
            return {
                "url": url,
                "status": response.status,
                "content_type": response.headers.get("Content-Type"),
                "content_length": response.headers.get("Content-Length"),
            }
    except HTTPError as error:
        return {"url": url, "status": error.code}
    except OSError as error:
        return {"url": url, "error": type(error).__name__}


def run():
    result = {
        "verified_at": datetime.now(UTC).isoformat(),
        "official_references": [
            "https://tcgdex.dev/assets",
            "https://tcgdex.dev/reference/set",
            "https://tcgdex.dev/reference/card",
            "https://tcgdex.dev/rest/filtering-sorting-pagination",
        ],
    }
    en = cards(
        25,
        **{"pagination:page": 1, "pagination:itemsPerPage": 1000, "sort:field": "id"},
    )
    es = cards(
        25,
        "es",
        **{"pagination:page": 1, "pagination:itemsPerPage": 1000, "sort:field": "id"},
    )
    en_by_id = {row["id"]: row for row in en["data"]}
    fallback = [
        row["id"]
        for row in es["data"]
        if not row.get("image") and en_by_id.get(row["id"], {}).get("image")
    ]
    result["species_briefs"] = {
        "english_url": en["url"],
        "english_count": len(en["data"]),
        "spanish_url": es["url"],
        "spanish_count": len(es["data"]),
        "spanish_null_english_present_candidates": fallback,
    }
    query = "{ sets { id name releaseDate logo symbol serie { id name } } }"
    metadata = fetch("graphql", query=query)
    sets = metadata["data"]["data"]["sets"]
    set_by_id = {row["id"]: row for row in sets}
    result["set_metadata"] = {
        "url": metadata["url"],
        "method": "POST",
        "query": query,
        "count": len(sets),
        "sample": [set_by_id[key] for key in ["base1", "sm9", "swsh3", "sv03.5", "A1"]],
    }
    result["nested_sort"] = []
    for order in ["ASC", "DESC"]:
        response = cards(
            25,
            **{
                "pagination:page": 1,
                "pagination:itemsPerPage": 8,
                "sort:field": "set.releaseDate",
                "sort:order": order,
            },
        )
        result["nested_sort"].append(
            {
                "url": response["url"],
                "order": order,
                "sample": [
                    {
                        "id": row["id"],
                        "release_date": set_by_id[
                            row["id"][: -(len(str(row["localId"])) + 1)]
                        ]["releaseDate"],
                    }
                    for row in response["data"]
                ],
            }
        )
    samples = [
        "base1-58",
        "sv03.5-199",
        "swsh3-136",
        "sm9-33",
        "swsh12.5gg-GG30",
        "2024sv-2",
        "A1-001",
        *fallback[:2],
    ]
    result["cards"] = []
    asset_urls = set()
    for card_id in dict.fromkeys(samples):
        for language in ["en", "es"]:
            response = fetch(f"{language}/cards/{card_id}")
            raw = response["data"]
            compact = {
                "url": response["url"],
                "status": response["status"],
                "language": language,
            }
            if raw:
                compact["card"] = {
                    key: raw.get(key)
                    for key in [
                        "id",
                        "localId",
                        "name",
                        "category",
                        "dexId",
                        "image",
                        "set",
                        "rarity",
                        "weaknesses",
                        "resistances",
                        "retreat",
                        "regulationMark",
                    ]
                }
                if raw.get("image"):
                    asset_urls.update(
                        raw["image"].rstrip("/") + suffix
                        for suffix in ["/low.webp", "/high.webp", "/high.png"]
                    )
            result["cards"].append(compact)
    for language in ["en", "es"]:
        for set_id in ["swsh3", "sv03.5", "sm9", "A1"]:
            response = fetch(f"{language}/sets/{set_id}")
            raw = response["data"]
            if raw:
                for key in ["logo", "symbol"]:
                    if raw.get(key):
                        asset_urls.add(raw[key] + ".png")
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        result["asset_head"] = list(pool.map(artwork_head, sorted(asset_urls)))
    result["findings"] = [
        "Card /low.webp and /high.webp suffixes are documented; previous selected-language-only normalization discarded verified alternative-language images.",
        "All sampled non-null card image variants responded 200; four documented set symbol PNG URLs responded 404, showing asset metadata alone cannot guarantee availability.",
        "Some exact printings have no image metadata in either supported language; no different-printing replacement is legitimate.",
        "REST nested set.releaseDate sorting does not provide chronological card order in the sampled query; local complete species-brief ordering uses official set metadata before pagination.",
        "Metadata-only GraphQL supplies official English set dates without enriching card details; localized REST set and series lists supply Spanish names/assets.",
        "Only sampled present-day availability is established; neither worldwide catalog completeness nor future availability is claimed.",
    ]
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(
        json.dumps(
            {
                "output": str(OUTPUT),
                "fallback_candidates": fallback,
                "cards": len(result["cards"]),
                "assets": len(result["asset_head"]),
            }
        )
    )


if __name__ == "__main__":
    run()
