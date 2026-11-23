"""Capture a minimal ExchangeRate-API open-access response as evidence (stdlib only).

Usage: python3 research/prices/capture_exchangerate.py
Writes research/prices/exchangerate_sample.json with only base_code,
time_last_update_utc, rates.CLP and rates.EUR. The previous file is replaced only when
the new response validates. Do not run this repeatedly: the open endpoint refreshes once
a day and rate-limited clients are blocked for 20 minutes.
Terms (attribution required, no redistribution): https://www.exchangerate-api.com/terms
"""

import json
import os
import sys
import tempfile
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

URL = "https://open.er-api.com/v6/latest/USD"
OUT = Path(__file__).with_name("exchangerate_sample.json")


def main() -> int:
    request = urllib.request.Request(
        URL, headers={"User-Agent": "PokeVault-Price-Evidence/0.1"}
    )
    with urllib.request.urlopen(request, timeout=15) as response:
        raw = json.loads(response.read(512 * 1024))
    if raw.get("result") != "success" or raw.get("base_code") != "USD":
        raise ValueError("unexpected response")
    clp, eur = float(raw["rates"]["CLP"]), float(raw["rates"]["EUR"])
    if not (clp > 0 and eur > 0):
        raise ValueError("rates must be positive")
    doc = {
        "metadata": {
            "source_url": URL,
            "retrieved_at": datetime.now(timezone.utc).isoformat(),
        },
        "payload": {
            "base_code": raw["base_code"],
            "time_last_update_utc": raw["time_last_update_utc"],
            "rates": {"CLP": clp, "EUR": eur},
        },
    }
    fd, tmp = tempfile.mkstemp(dir=OUT.parent, suffix=".tmp")
    with os.fdopen(fd, "w") as handle:
        json.dump(doc, handle, indent=1, ensure_ascii=False)
    os.replace(tmp, OUT)
    print(f"wrote {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
