#!/usr/bin/env python3
"""Bake holder and market figures into market-data/index.html.

Run from the repo root:
    python3 _tools/build_market_data.py

Reads data/holders.json and data/market.json and replaces the
<!-- generated:... --> blocks on the Market Data page. Called from
update_holders.py after a daily refresh. Jekyll skips folders starting
with "_", so this file is not published.
"""
from __future__ import annotations

import html
import json
import math
import re
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
PAGE = ROOT / "market-data" / "index.html"
HOLDERS = ROOT / "data" / "holders.json"
MARKET = ROOT / "data" / "market.json"
TZ = ZoneInfo("America/Edmonton")

# Fully diluted value is only shown when it differs from market cap by
# more than this fraction. CoinGecko's FDV often matches market cap
# when circulating supply equals total supply.
FDV_GAP = 0.015


class BuildError(Exception):
    pass


def load_json(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as e:
        raise BuildError("could not read %s: %s" % (path, e)) from e
    return data if isinstance(data, dict) else {}


def esc(value) -> str:
    return html.escape(str(value), quote=True)


def parse_time(value) -> datetime | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=TZ)
    return dt.astimezone(TZ)


def format_as_of(dt: datetime | None, live: bool = False) -> str:
    if not dt:
        return ""
    prefix = "Updated " if live else "As of "
    # Linux %-d / %-I: day and hour without a leading zero, as in holders.js.
    stamp = dt.strftime("%-d %B %Y %-I:%M %p").replace("AM", "am").replace("PM", "pm")
    return prefix + stamp + " MT"


def format_short_date(iso_date: str) -> str:
    try:
        d = datetime.strptime(iso_date, "%Y-%m-%d")
    except (TypeError, ValueError):
        return ""
    return d.strftime("%-d %b %Y")


def format_count(n) -> str:
    if not isinstance(n, (int, float)) or isinstance(n, bool) or not math.isfinite(n) or n < 0:
        return "—"
    return format(int(round(n)), ",")


def format_share(n, total) -> str:
    if (
        not isinstance(n, (int, float))
        or not isinstance(total, (int, float))
        or not math.isfinite(n)
        or not math.isfinite(total)
        or total <= 0
    ):
        return "—"
    return "%.1f%%" % (n / total * 100)


def share_width(n, total) -> float:
    if (
        not isinstance(n, (int, float))
        or not isinstance(total, (int, float))
        or total <= 0
    ):
        return 0.0
    pct = n / total * 100
    if not math.isfinite(pct) or pct < 0:
        return 0.0
    return min(100.0, pct)


def format_price(n) -> str:
    """Match ticker.js: Number(n).toPrecision(4), with a $ prefix."""
    if not isinstance(n, (int, float)) or isinstance(n, bool) or not math.isfinite(n) or n < 0:
        return "—"
    text = format(float(n), ".4g")
    if "e" in text.lower():
        exp = math.floor(math.log10(abs(n))) if n else 0
        decimals = max(0, 3 - exp)
        text = f"{n:.{decimals}f}"
    return "$" + text


def format_change(n) -> str:
    if not isinstance(n, (int, float)) or isinstance(n, bool) or not math.isfinite(n):
        return "—"
    if n > 0:
        arrow = "▲"
    elif n < 0:
        arrow = "▼"
    else:
        arrow = "–"
    return "%s %.1f%%" % (arrow, abs(n))


def change_class(n) -> str:
    if not isinstance(n, (int, float)) or isinstance(n, bool) or not math.isfinite(n) or n == 0:
        return "md-change"
    return "md-change is-up" if n > 0 else "md-change is-down"


def _trim(value: float, decimals: int) -> str:
    text = f"{value:.{decimals}f}"
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return text


def format_usd_compact(n) -> str:
    if not isinstance(n, (int, float)) or isinstance(n, bool) or not math.isfinite(n) or n < 0:
        return "—"
    if n >= 1_000_000_000:
        return "$" + _trim(n / 1_000_000_000, 2) + "bn"
    if n >= 1_000_000:
        decimals = 1 if n >= 100_000_000 else 2
        return "$" + _trim(n / 1_000_000, decimals) + "m"
    if n >= 1_000:
        return "$" + _trim(n / 1_000, 1) + "k"
    return "$" + _trim(n, 2)


def format_usd_full(n) -> str:
    if not isinstance(n, (int, float)) or isinstance(n, bool) or not math.isfinite(n) or n < 0:
        return ""
    if abs(n - round(n)) < 1e-6:
        return "$" + format(int(round(n)), ",")
    return "$" + format(n, ",.6f").rstrip("0").rstrip(".")


def format_supply(n) -> str:
    if not isinstance(n, (int, float)) or isinstance(n, bool) or not math.isfinite(n) or n <= 0:
        return "—"
    if n >= 1_000_000_000:
        return _trim(n / 1_000_000_000, 2) + "bn"
    if n >= 1_000_000:
        decimals = 0 if n >= 100_000_000 else 1
        return _trim(n / 1_000_000, decimals) + "m"
    return format_count(n)


def format_supply_full(n) -> str:
    if not isinstance(n, (int, float)) or isinstance(n, bool) or not math.isfinite(n) or n <= 0:
        return ""
    return format(int(round(n)), ",")


def fdv_is_meaningful(market_cap, fdv) -> bool:
    if (
        not isinstance(market_cap, (int, float))
        or not isinstance(fdv, (int, float))
        or not math.isfinite(market_cap)
        or not math.isfinite(fdv)
        or market_cap <= 0
        or fdv <= 0
    ):
        return False
    return abs(fdv - market_cap) / market_cap > FDV_GAP


def replace_block(page: str, name: str, inner: str) -> str:
    pattern = re.compile(
        r"<!-- generated:%s -->.*?<!-- /generated:%s -->" % (re.escape(name), re.escape(name)),
        re.S,
    )
    block = "<!-- generated:%s -->\n%s\n        <!-- /generated:%s -->" % (
        name,
        inner.rstrip(),
        name,
    )
    if not pattern.search(page):
        raise BuildError("missing generated:%s markers in %s" % (name, PAGE.relative_to(ROOT)))
    return pattern.sub(lambda _m: block, page, count=1)


def render_history(history) -> str:
    points = []
    if isinstance(history, list):
        for row in history:
            if not isinstance(row, dict):
                continue
            date = row.get("date")
            total = row.get("total")
            if isinstance(date, str) and isinstance(total, (int, float)) and not isinstance(total, bool) and math.isfinite(total):
                points.append({"date": date, "total": total})
    if len(points) < 2:
        start = format_short_date(points[0]["date"]) if points else ""
        label = "History starts %s" % start if start else "History will appear as daily counts are recorded."
        return (
            '          <p class="figure-label">Total holders</p>\n'
            '          <div class="md-history-blank" role="img" aria-label="%s">\n'
            '            <span class="md-history-rule"></span>\n'
            '            <span class="md-history-dot"></span>\n'
            "          </div>\n"
            '          <p class="figure-note">%s</p>'
            % (esc(label), esc(label))
        )

    w, h = 360, 130
    pad_l, pad_r, pad_t, pad_b = 4, 10, 14, 28
    totals = [p["total"] for p in points]
    low, high = min(totals), max(totals)
    span = high - low
    if span == 0:
        span = 1 if high == 0 else high * 0.02
    inner_w = w - pad_l - pad_r
    inner_h = h - pad_t - pad_b
    coords = []
    for idx, row in enumerate(points):
        x = pad_l + (inner_w if len(points) == 1 else idx / (len(points) - 1) * inner_w)
        y = pad_t + (1 - (row["total"] - low) / span) * inner_h
        coords.append((x, y, row))
    line = " ".join(
        ("%s%.1f %.1f" % ("M" if i == 0 else "L", x, y))
        for i, (x, y, _row) in enumerate(coords)
    )
    last = coords[-1]
    area = "%s L%.1f %s L%.1f %s Z" % (
        line,
        last[0],
        h - pad_b,
        coords[0][0],
        h - pad_b,
    )
    first_date = format_short_date(points[0]["date"])
    last_date = format_short_date(points[-1]["date"])
    return (
        '          <p class="figure-label">Total holders</p>\n'
        '          <svg class="md-spark" viewBox="0 0 %s %s" width="100%%" height="130" role="img" aria-label="Daily total holders from %s to %s">\n'
        '            <path class="md-spark-area" d="%s"></path>\n'
        '            <path class="md-spark-line" d="%s" fill="none"></path>\n'
        '            <circle class="md-spark-dot" cx="%.1f" cy="%.1f" r="3.5"></circle>\n'
        '            <text class="md-spark-label" x="%s" y="%s">%s</text>\n'
        '            <text class="md-spark-label md-spark-label-end" x="%s" y="%s">%s</text>\n'
        "          </svg>"
        % (
            w,
            h,
            esc(first_date),
            esc(last_date),
            esc(area),
            esc(line),
            last[0],
            last[1],
            pad_l,
            h - 8,
            esc(first_date),
            w - pad_r,
            h - 8,
            esc(last_date),
        )
    )


def source_link(name, url) -> str:
    if not name:
        return ""
    label = esc(name)
    if url:
        return '<a href="%s" target="_blank" rel="noopener noreferrer">%s</a>' % (esc(url), label)
    return label


def render_holders_lead(data: dict) -> str:
    label = data.get("label") or "Wallets holding SPX"
    total = format_count(data.get("total")) if isinstance(data.get("total"), (int, float)) else "—"
    as_of = format_as_of(parse_time(data.get("updated_at")))
    note = (as_of + ".") if as_of else "The latest saved count is shown below."
    return (
        '          <span class="figure-label" id="holders-label">%s</span>\n'
        '          <span class="figure-value" id="holders-total-value">%s</span>\n'
        '          <p class="figure-note" id="holders-total-note">%s</p>'
        % (esc(label), esc(total), esc(note))
    )


def render_holders_chains(data: dict) -> str:
    total = data.get("total")
    rows = []
    for chain in data.get("chains") or []:
        if not isinstance(chain, dict):
            continue
        name = chain.get("name") or chain.get("id") or "Chain"
        count = format_count(chain.get("holders"))
        share = format_share(chain.get("holders"), total)
        width = share_width(chain.get("holders"), total)
        rows.append(
            "            <tr>\n"
            '              <th scope="row">%s</th>\n'
            '              <td class="num">%s</td>\n'
            '              <td class="num">%s</td>\n'
            '              <td class="bar-col">\n'
            '                <span class="md-bar" role="presentation"><span style="width:%.1f%%"></span></span>\n'
            "              </td>\n"
            "            </tr>"
            % (esc(name), esc(count), esc(share), width)
        )
    if not rows:
        return (
            '            <tr>\n'
            '              <th scope="row">Counts are not yet recorded.</th>\n'
            '              <td class="num">—</td>\n'
            '              <td class="num">—</td>\n'
            '              <td class="bar-col"></td>\n'
            "            </tr>"
        )
    return "\n".join(rows)


def render_holders_method(data: dict) -> str:
    parts = ['          <h3>Sources and method</h3>']
    note = data.get("note")
    if note:
        parts.append("          <p>%s</p>" % esc(note))
    sources = []
    for chain in data.get("chains") or []:
        if not isinstance(chain, dict) or not chain.get("source"):
            continue
        label = chain.get("name") or chain.get("id") or "Chain"
        sources.append("%s: %s" % (esc(label), source_link(chain.get("source"), chain.get("source_url"))))
    if sources:
        parts.append("          <p>%s.</p>" % ". ".join(sources))
    return "\n".join(parts)


def fact_row(label: str, value: str, *, css: str = "num", title: str = "", row_id: str = "") -> str:
    title_attr = ' title="%s"' % esc(title) if title else ""
    id_attr = ' id="%s"' % esc(row_id) if row_id else ""
    return (
        "            <tr>\n"
        '              <th scope="row">%s</th>\n'
        '              <td class="%s"%s%s>%s</td>\n'
        "            </tr>"
        % (esc(label), esc(css), id_attr, title_attr, value)
    )


def render_market_snapshot(data: dict) -> str:
    if not data.get("price_usd"):
        return (
            '        <p class="figure-note" id="snapshot-asof">'
            "Price and market value will appear here once the first snapshot is recorded.</p>"
        )

    as_of = format_as_of(parse_time(data.get("as_of") or data.get("updated_at")))
    source = source_link(data.get("source"), data.get("source_url"))
    line = as_of + "." if as_of else ""
    if source:
        line = (line + " Source: " + source + ".") if line else ("Source: " + source + ".")

    rows = [
        fact_row(
            "Price (USD)",
            esc(format_price(data.get("price_usd"))),
            title=format_usd_full(data.get("price_usd")),
            row_id="snap-price",
        )
    ]
    if data.get("change_24h_pct") is not None:
        rows.append(
            fact_row(
                "24-hour change",
                esc(format_change(data.get("change_24h_pct"))),
                css=change_class(data.get("change_24h_pct")),
                row_id="snap-change",
            )
        )
    if data.get("market_cap_usd") is not None:
        rows.append(
            fact_row(
                "Market cap",
                esc(format_usd_compact(data.get("market_cap_usd"))),
                title=format_usd_full(data.get("market_cap_usd")),
                row_id="snap-cap",
            )
        )
    if fdv_is_meaningful(data.get("market_cap_usd"), data.get("fdv_usd")):
        rows.append(
            fact_row(
                "Fully diluted value",
                esc(format_usd_compact(data.get("fdv_usd"))),
                title=format_usd_full(data.get("fdv_usd")),
                row_id="snap-fdv",
            )
        )
    if data.get("volume_24h_usd") is not None:
        rows.append(
            fact_row(
                "24-hour volume",
                esc(format_usd_compact(data.get("volume_24h_usd"))),
                title=format_usd_full(data.get("volume_24h_usd")),
                row_id="snap-volume",
            )
        )
    if data.get("circulating_supply") is not None:
        rows.append(
            fact_row(
                "Circulating supply",
                esc(format_supply(data.get("circulating_supply"))),
                title=format_supply_full(data.get("circulating_supply")),
                row_id="snap-circulating",
            )
        )
    if data.get("max_supply") is not None:
        rows.append(
            fact_row(
                "Max supply",
                esc(format_supply(data.get("max_supply"))),
                title=format_supply_full(data.get("max_supply")),
                row_id="snap-max",
            )
        )

    method = []
    method.append(
        "Figures are taken from %s and are not live. They are refreshed once a day, and the time above is when the source last updated them."
        % (source or "the source named above")
    )
    cap = data.get("market_cap_usd")
    fdv = data.get("fdv_usd")
    if (
        data.get("source") == "CoinGecko"
        and cap is not None
        and fdv is not None
        and not fdv_is_meaningful(cap, fdv)
    ):
        method.append(
            "CoinGecko also publishes a fully diluted valuation; it is not shown separately because it matches the market cap, as circulating supply equals total supply."
        )

    return (
        '        <p class="figure-note" id="snapshot-asof">%s</p>\n'
        '        <div class="md-table-wrap">\n'
        '          <table class="md-table md-facts">\n'
        "            <tbody id=\"snapshot-rows\">\n"
        "%s\n"
        "            </tbody>\n"
        "          </table>\n"
        "        </div>\n"
        '        <div class="md-note" id="snapshot-method">\n'
        "          <h3>Sources and method</h3>\n"
        "          <p>%s</p>\n"
        "        </div>"
        % (
            line,
            "\n".join(rows),
            "</p>\n          <p>".join(method),
        )
    )


def build() -> None:
    if not PAGE.exists():
        raise BuildError("missing %s" % PAGE)
    page = PAGE.read_text()
    holders = load_json(HOLDERS)
    market = load_json(MARKET)

    if holders.get("total") is None:
        lead = (
            '          <span class="figure-label" id="holders-label">Wallets holding SPX</span>\n'
            '          <span class="figure-value" id="holders-total-value">—</span>\n'
            '          <p class="figure-note" id="holders-total-note">The holder count has not been recorded yet.</p>'
        )
        history = render_history([])
        chains = render_holders_chains({})
        method = '          <h3>Sources and method</h3>\n          <p>The latest saved counts will appear here once they are recorded.</p>'
    else:
        lead = render_holders_lead(holders)
        history = render_history(holders.get("history"))
        chains = render_holders_chains(holders)
        method = render_holders_method(holders)

    page = replace_block(page, "holders-lead", lead)
    page = replace_block(page, "holders-history", history)
    page = replace_block(page, "holders-chains", chains)
    page = replace_block(page, "holders-method", method)
    page = replace_block(page, "market-snapshot", render_market_snapshot(market))
    PAGE.write_text(page)
    print("baked figures into %s" % PAGE.relative_to(ROOT))


def main() -> int:
    build()
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except BuildError as e:
        raise SystemExit("build_market_data failed: %s" % e)
