#!/usr/bin/env python3
"""Fetch SPX6900 market figures and write data/market.json.

Run from the repo root:
    python3 _tools/update_market.py

CoinGecko is tried first (the coins endpoint, then the simple price
API). DexScreener is the fallback. If every fetch fails, the last good
file is left unchanged. Jekyll skips folders starting with "_".
"""
from __future__ import annotations

import json
import math
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "market.json"
TZ = ZoneInfo("America/Edmonton")
UA = "FlipTheStock/1.0 (+https://www.flipthestock.com/; market-data snapshot)"

COIN_ID = "spx6900"
OFFICIAL_ETH = "0xe0f63a424a4439cbe457d80e4f4b51ad25b2c56c"
CG_PAGE = "https://www.coingecko.com/en/coins/spx6900"
DEX_PAGE = "https://dexscreener.com/ethereum/%s" % OFFICIAL_ETH

COINS_URL = (
    "https://api.coingecko.com/api/v3/coins/%s"
    "?localization=false&tickers=false&market_data=true"
    "&community_data=false&developer_data=false&sparkline=false" % COIN_ID
)
SIMPLE_URL = (
    "https://api.coingecko.com/api/v3/simple/price"
    "?ids=%s&vs_currencies=usd"
    "&include_market_cap=true&include_24hr_vol=true"
    "&include_24hr_change=true&include_last_updated_at=true" % COIN_ID
)
DEX_URL = "https://api.dexscreener.com/latest/dex/tokens/%s" % OFFICIAL_ETH


class FetchError(Exception):
    pass


def get_json(url: str, timeout: int = 25):
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
    return data


def as_number(value, name: str, allow_zero: bool = False, allow_negative: bool = False):
    if isinstance(value, bool) or value is None:
        raise FetchError("missing %s" % name)
    if isinstance(value, str):
        value = value.replace(",", "").strip()
        if not value:
            raise FetchError("empty %s" % name)
    try:
        number = float(value)
    except (TypeError, ValueError) as e:
        raise FetchError("%s is not a number: %r" % (name, value)) from e
    if not math.isfinite(number):
        raise FetchError("%s is not finite: %r" % (name, value))
    if not allow_negative and number < 0:
        raise FetchError("%s must not be negative, got %s" % (name, number))
    if not allow_zero and number == 0:
        raise FetchError("%s must be greater than zero" % name)
    return number


def as_optional_number(value, name: str, **kwargs):
    if value is None:
        return None
    try:
        return as_number(value, name, **kwargs)
    except FetchError:
        return None


def parse_iso(value) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None


def from_unix(value) -> datetime | None:
    try:
        ts = int(value)
    except (TypeError, ValueError):
        return None
    if ts <= 0:
        return None
    return datetime.fromtimestamp(ts, tz=timezone.utc)


def payload(
    *,
    source: str,
    source_url: str,
    price_usd: float,
    change_24h_pct=None,
    market_cap_usd=None,
    fdv_usd=None,
    volume_24h_usd=None,
    circulating_supply=None,
    total_supply=None,
    max_supply=None,
    as_of: datetime,
    fetched_at: datetime,
) -> dict:
    def maybe(key, value):
        if value is None:
            return
        out[key] = value

    out = {
        "updated_at": fetched_at.isoformat(timespec="seconds"),
        "as_of": as_of.isoformat(timespec="seconds"),
        "source": source,
        "source_url": source_url,
        "price_usd": price_usd,
    }
    maybe("change_24h_pct", change_24h_pct)
    maybe("market_cap_usd", market_cap_usd)
    maybe("fdv_usd", fdv_usd)
    maybe("volume_24h_usd", volume_24h_usd)
    maybe("circulating_supply", circulating_supply)
    maybe("total_supply", total_supply)
    maybe("max_supply", max_supply)
    return out


def from_coingecko_coins(data: dict, fetched_at: datetime) -> dict:
    if not isinstance(data, dict):
        raise FetchError("CoinGecko coins API returned a non-object")
    md = data.get("market_data")
    if not isinstance(md, dict):
        raise FetchError("CoinGecko coins API had no market_data")

    def usd(obj, name, **kwargs):
        if not isinstance(obj, dict):
            raise FetchError("missing %s" % name)
        return as_number(obj.get("usd"), name, **kwargs)

    def optional_usd(obj, name, **kwargs):
        if not isinstance(obj, dict) or obj.get("usd") is None:
            return None
        return as_optional_number(obj.get("usd"), name, **kwargs)

    price = usd(md.get("current_price"), "price")
    change = as_optional_number(
        md.get("price_change_percentage_24h"),
        "24-hour change",
        allow_zero=True,
        allow_negative=True,
    )
    cap = optional_usd(md.get("market_cap"), "market cap")
    fdv = optional_usd(md.get("fully_diluted_valuation"), "fully diluted valuation")
    volume = optional_usd(md.get("total_volume"), "24-hour volume", allow_zero=True)
    circulating = as_optional_number(md.get("circulating_supply"), "circulating supply")
    total = as_optional_number(md.get("total_supply"), "total supply")
    maximum = as_optional_number(md.get("max_supply"), "max supply")
    as_of = parse_iso(md.get("last_updated")) or parse_iso(data.get("last_updated")) or fetched_at
    return payload(
        source="CoinGecko",
        source_url=CG_PAGE,
        price_usd=price,
        change_24h_pct=change,
        market_cap_usd=cap,
        fdv_usd=fdv,
        volume_24h_usd=volume,
        circulating_supply=circulating,
        total_supply=total,
        max_supply=maximum,
        as_of=as_of,
        fetched_at=fetched_at,
    )


def from_coingecko_simple(data: dict, fetched_at: datetime) -> dict:
    row = data.get(COIN_ID) if isinstance(data, dict) else None
    if not isinstance(row, dict):
        raise FetchError("CoinGecko simple price API had no %s row" % COIN_ID)
    price = as_number(row.get("usd"), "price")
    change = as_optional_number(
        row.get("usd_24h_change"),
        "24-hour change",
        allow_zero=True,
        allow_negative=True,
    )
    cap = as_optional_number(row.get("usd_market_cap"), "market cap")
    volume = as_optional_number(row.get("usd_24h_vol"), "24-hour volume", allow_zero=True)
    as_of = from_unix(row.get("last_updated_at")) or fetched_at
    return payload(
        source="CoinGecko",
        source_url=CG_PAGE,
        price_usd=price,
        change_24h_pct=change,
        market_cap_usd=cap,
        volume_24h_usd=volume,
        as_of=as_of,
        fetched_at=fetched_at,
    )


def from_dexscreener(data: dict, fetched_at: datetime) -> dict:
    pairs = data.get("pairs") if isinstance(data, dict) else None
    if not isinstance(pairs, list) or not pairs:
        raise FetchError("DexScreener returned no pairs")
    best = None
    best_liq = -1.0
    for pair in pairs:
        if not isinstance(pair, dict):
            continue
        base = pair.get("baseToken") if isinstance(pair.get("baseToken"), dict) else {}
        addr = str(base.get("address") or "").lower()
        if addr != OFFICIAL_ETH:
            continue
        liq = 0.0
        liquidity = pair.get("liquidity")
        if isinstance(liquidity, dict):
            try:
                liq = float(liquidity.get("usd") or 0)
            except (TypeError, ValueError):
                liq = 0.0
            if not math.isfinite(liq):
                liq = 0.0
        if liq > best_liq:
            best_liq = liq
            best = pair
    if not best:
        raise FetchError("DexScreener had no official SPX6900 pair")
    price = as_number(best.get("priceUsd"), "price")
    change_raw = None
    change_obj = best.get("priceChange")
    if isinstance(change_obj, dict):
        change_raw = change_obj.get("h24")
    change = as_optional_number(
        change_raw, "24-hour change", allow_zero=True, allow_negative=True
    )
    cap = as_optional_number(best.get("marketCap"), "market cap")
    fdv = as_optional_number(best.get("fdv"), "fully diluted valuation")
    # A single pair's volume is not the market's 24-hour volume, so it is omitted.
    return payload(
        source="DexScreener",
        source_url=DEX_PAGE,
        price_usd=price,
        change_24h_pct=change,
        market_cap_usd=cap,
        fdv_usd=fdv,
        as_of=fetched_at,
        fetched_at=fetched_at,
    )


def fetch_snapshot(fetched_at: datetime) -> dict:
    errors = []
    attempts = (
        ("CoinGecko coins", COINS_URL, from_coingecko_coins),
        ("CoinGecko simple price", SIMPLE_URL, from_coingecko_simple),
        ("DexScreener", DEX_URL, from_dexscreener),
    )
    for name, url, parser in attempts:
        try:
            data = get_json(url)
            snapshot = parser(data, fetched_at)
            print(
                "market snapshot: $%s from %s"
                % (snapshot["price_usd"], snapshot["source"])
            )
            return snapshot
        except FetchError as e:
            print("  %s failed: %s" % (name, e))
            errors.append("%s: %s" % (name, e))
            time.sleep(0.4)
    raise FetchError("all market sources failed (%s)" % "; ".join(errors))


def load_existing() -> dict:
    if not OUT.exists():
        return {}
    try:
        data = json.loads(OUT.read_text())
    except (OSError, json.JSONDecodeError):
        return {}
    return data if isinstance(data, dict) else {}


def write_snapshot(payload_data: dict) -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload_data, indent=2) + "\n")
    print("wrote %s" % OUT.relative_to(ROOT))


def update() -> dict:
    """Fetch a new snapshot, or return the last good one if the fetch fails."""
    existing = load_existing()
    fetched_at = datetime.now(TZ)
    try:
        snapshot = fetch_snapshot(fetched_at)
    except FetchError as e:
        if existing.get("price_usd"):
            print(
                "keeping last good market snapshot from %s (%s)"
                % (existing.get("as_of") or existing.get("updated_at"), e)
            )
            return existing
        raise
    write_snapshot(snapshot)
    return snapshot


def main() -> int:
    update()
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except FetchError as e:
        raise SystemExit("update_market failed: %s" % e)
