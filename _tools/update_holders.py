#!/usr/bin/env python3
"""Fetch SPX6900 holder counts and write data/holders.json.

Run from the repo root:
    python3 _tools/update_holders.py

Jekyll skips folders starting with "_", so this file is not published.
"""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "holders.json"
TZ = ZoneInfo("America/Edmonton")
UA = "FlipTheStock/1.0 (+https://www.flipthestock.com/; market-data holder counts)"

# Official contracts, copied from the site's Explained page (and spx6900.com).
ETH = "0xE0f63A424a4439cBE457D80E4f4b51aD25b2c56C"
BASE = "0x50dA645f148798F68EF2d7dB7C1CB22A6819bb2C"
SOL = "J3NKxxXZcnNiMjKw9hYb2K4LUxgwB6t1FtPtQVsv3KFr"
BNB = "0x7c6563b36B2144E7F3175c92977b0e19cE4966de"
SUI = "0x0ee60b2540f5373903679500d0f88710cbb106d47c6dae028fb9c4795a835dda::coin::COIN"

NOTE = (
    "This counts wallets with a non-zero balance, including exchange and "
    "contract wallets. Wallets are counted per chain, so someone holding on "
    "more than one chain is counted more than once. The total adds the "
    "Ethereum token to the bridged copies on Base and Solana. Bridged copies "
    "on BNB Chain and Sui are omitted because no reliable free source returned "
    "a current figure."
)

OMITTED = [
    {
        "id": "bnb",
        "name": "BNB Chain",
        "contract": BNB,
        "reason": "No reliable free source returned a current holder count.",
    },
    {
        "id": "sui",
        "name": "Sui",
        "contract": SUI,
        "reason": "No reliable free source returned a current holder count.",
    },
]


class FetchError(Exception):
    pass


def get_json(url: str, timeout: int = 25) -> dict:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": UA,
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            body = res.read()
            if res.status != 200:
                raise FetchError("%s returned HTTP %s" % (url, res.status))
    except urllib.error.HTTPError as e:
        raise FetchError("%s returned HTTP %s" % (url, e.code)) from e
    except urllib.error.URLError as e:
        raise FetchError("%s failed: %s" % (url, e.reason)) from e
    try:
        data = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as e:
        raise FetchError("%s returned invalid JSON" % url) from e
    if not isinstance(data, dict):
        raise FetchError("%s returned a non-object JSON payload" % url)
    return data


def as_int(value) -> int:
    if isinstance(value, bool) or value is None:
        raise FetchError("missing holder count")
    if isinstance(value, str):
        value = value.replace(",", "").strip()
        if not value:
            raise FetchError("empty holder count")
    try:
        number = int(value)
    except (TypeError, ValueError) as e:
        raise FetchError("holder count is not an integer: %r" % (value,)) from e
    if number <= 0:
        raise FetchError("holder count must be positive, got %s" % number)
    return number


def ethplorer() -> tuple[int, str, str]:
    url = "https://api.ethplorer.io/getTokenInfo/%s?apiKey=freekey" % ETH
    data = get_json(url)
    return (
        as_int(data.get("holdersCount")),
        "Ethplorer",
        "https://ethplorer.io/address/%s" % ETH.lower(),
    )


def blockscout_eth() -> tuple[int, str, str]:
    url = "https://eth.blockscout.com/api/v2/tokens/%s" % ETH
    data = get_json(url)
    return (
        as_int(data.get("holders_count")),
        "Blockscout",
        "https://eth.blockscout.com/token/%s" % ETH,
    )


def geckoterminal(network: str, address: str, page: str) -> tuple[int, str, str]:
    url = "https://api.geckoterminal.com/api/v2/networks/%s/tokens/%s/info" % (
        network,
        address,
    )
    data = get_json(url)
    holders = (
        data.get("data", {})
        .get("attributes", {})
        .get("holders", {})
        .get("count")
    )
    updated = (
        data.get("data", {})
        .get("attributes", {})
        .get("holders", {})
        .get("last_updated")
    )
    # Reject obviously stale snapshots (older than 3 days) so a frozen
    # figure is not treated as current.
    if updated:
        try:
            ts = datetime.fromisoformat(str(updated).replace("Z", "+00:00"))
            age = datetime.now(tz=ts.tzinfo) - ts
            if age.total_seconds() > 3 * 24 * 3600:
                raise FetchError(
                    "GeckoTerminal %s holder count is stale (%s)" % (network, updated)
                )
        except FetchError:
            raise
        except Exception:
            pass
    return as_int(holders), "GeckoTerminal", page


def first_ok(name: str, fetchers) -> tuple[int, str, str]:
    errors = []
    for fetch in fetchers:
        try:
            result = fetch()
            print("%s: %s holders from %s" % (name, result[0], result[1]))
            return result
        except FetchError as e:
            print("  %s failed: %s" % (name, e))
            errors.append(str(e))
        time.sleep(0.4)
    raise FetchError("%s: all sources failed (%s)" % (name, "; ".join(errors)))


def load_existing() -> dict:
    if not OUT.exists():
        return {}
    try:
        return json.loads(OUT.read_text())
    except (OSError, json.JSONDecodeError):
        return {}


def history_for(today: str, total: int, existing: dict) -> list:
    history = []
    prev = existing.get("history") if isinstance(existing, dict) else None
    if isinstance(prev, list):
        for row in prev:
            if not isinstance(row, dict):
                continue
            date = row.get("date")
            value = row.get("total")
            if date == today or not isinstance(date, str) or not isinstance(value, int):
                continue
            history.append({"date": date, "total": value})
    history.append({"date": today, "total": total})
    return history[-365:]


def main() -> int:
    eth_n, eth_src, eth_url = first_ok(
        "Ethereum",
        [
            ethplorer,
            blockscout_eth,
            lambda: geckoterminal(
                "eth",
                ETH,
                "https://www.geckoterminal.com/eth/tokens/%s" % ETH.lower(),
            ),
        ],
    )
    time.sleep(0.6)
    base_n, base_src, base_url = first_ok(
        "Base",
        [
            lambda: geckoterminal(
                "base",
                BASE,
                "https://www.geckoterminal.com/base/tokens/%s" % BASE.lower(),
            ),
        ],
    )
    time.sleep(0.6)
    sol_n, sol_src, sol_url = first_ok(
        "Solana",
        [
            lambda: geckoterminal(
                "solana",
                SOL,
                "https://www.geckoterminal.com/solana/tokens/%s" % SOL,
            ),
        ],
    )

    now = datetime.now(TZ)
    total = eth_n + base_n + sol_n
    existing = load_existing()
    payload = {
        "updated_at": now.isoformat(timespec="seconds"),
        "total": total,
        "label": "Wallets holding SPX",
        "note": NOTE,
        "chains": [
            {
                "id": "ethereum",
                "name": "Ethereum",
                "contract": ETH,
                "holders": eth_n,
                "source": eth_src,
                "source_url": eth_url,
            },
            {
                "id": "base",
                "name": "Base",
                "contract": BASE,
                "holders": base_n,
                "source": base_src,
                "source_url": base_url,
            },
            {
                "id": "solana",
                "name": "Solana",
                "contract": SOL,
                "holders": sol_n,
                "source": sol_src,
                "source_url": sol_url,
            },
        ],
        "omitted": OMITTED,
        "history": history_for(now.date().isoformat(), total, existing),
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=2) + "\n")
    print("wrote %s (total %s)" % (OUT.relative_to(ROOT), total))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except FetchError as e:
        raise SystemExit("update_holders failed: %s" % e)
