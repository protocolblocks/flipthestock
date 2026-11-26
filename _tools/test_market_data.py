#!/usr/bin/env python3
"""Checks for market-data formatters and HTML baking."""
from __future__ import annotations

import unittest
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import build_market_data as build
import update_market as market


class FormatTests(unittest.TestCase):
    def test_price(self):
        self.assertEqual(build.format_price(0.278835), "$0.2788")
        self.assertEqual(build.format_price(1.2346), "$1.235")
        self.assertEqual(build.format_price(-1), "—")

    def test_change(self):
        self.assertEqual(build.format_change(8.67325), "▲ 8.7%")
        self.assertEqual(build.format_change(-3.04), "▼ 3.0%")
        self.assertEqual(build.format_change(0), "– 0.0%")
        self.assertEqual(build.change_class(8.6), "num md-change is-up")
        self.assertEqual(build.change_class(-3), "num md-change is-down")
        self.assertEqual(build.change_class(0), "num md-change")

    def test_compact_and_supply(self):
        self.assertEqual(build.format_usd_compact(259591400), "$259.6m")
        self.assertEqual(build.format_usd_compact(5136224), "$5.14m")
        self.assertEqual(build.format_usd_compact(1_000_000_000), "$1bn")
        self.assertEqual(build.format_usd_full(259591400), "$259,591,400")
        self.assertEqual(build.format_supply(930987178.0065634), "931m")
        self.assertEqual(build.format_supply(1_000_000_000), "1bn")
        self.assertEqual(build.format_supply_full(930987178.0065634), "930,987,178")

    def test_fdv_meaningful(self):
        self.assertFalse(build.fdv_is_meaningful(259591400, 259591400))
        self.assertFalse(build.fdv_is_meaningful(259591400, 260000000))
        self.assertTrue(build.fdv_is_meaningful(259591400, 278835000))

    def test_as_of(self):
        dt = datetime(2026, 11, 26, 6, 50, 53, tzinfo=ZoneInfo("America/Edmonton"))
        self.assertEqual(build.format_as_of(dt), "As of 26 November 2026 6:50 am MT")
        self.assertEqual(build.format_as_of(dt, live=True), "Updated 26 November 2026 6:50 am MT")
        self.assertEqual(build.format_short_date("2026-11-25"), "25 Nov 2026")


class ParseTests(unittest.TestCase):
    def test_coingecko_coins(self):
        fetched = datetime(2026, 11, 26, 7, 50, tzinfo=ZoneInfo("America/Edmonton"))
        data = {
            "last_updated": "2026-11-26T13:50:53.000Z",
            "market_data": {
                "current_price": {"usd": 0.278835},
                "price_change_percentage_24h": 8.67325,
                "market_cap": {"usd": 259591400},
                "fully_diluted_valuation": {"usd": 259591400},
                "total_volume": {"usd": 5136224},
                "circulating_supply": 930987178.0065634,
                "total_supply": 930987178.0065634,
                "max_supply": 1000000000.0,
                "last_updated": "2026-11-26T13:50:53.000Z",
            },
        }
        snap = market.from_coingecko_coins(data, fetched)
        self.assertEqual(snap["source"], "CoinGecko")
        self.assertEqual(snap["price_usd"], 0.278835)
        self.assertEqual(snap["market_cap_usd"], 259591400)
        self.assertTrue(snap["as_of"].startswith("2026-11-26T13:50:53"))

    def test_dex_ignores_other_tokens(self):
        fetched = datetime(2026, 11, 26, 7, 50, tzinfo=ZoneInfo("America/Edmonton"))
        data = {
            "pairs": [
                {
                    "baseToken": {"address": "0x72e4f9F808C49A2a61dE9C5896298920Dc4EEEa9"},
                    "priceUsd": "9.99",
                    "liquidity": {"usd": 999999999},
                    "marketCap": 1,
                },
                {
                    "baseToken": {"address": "0xE0f63A424a4439cBE457D80E4f4b51aD25b2c56C"},
                    "priceUsd": "0.2780",
                    "priceChange": {"h24": 9.07},
                    "liquidity": {"usd": 8000000},
                    "marketCap": 258906319,
                    "fdv": 258906319,
                    "volume": {"h24": 570995},
                },
            ]
        }
        snap = market.from_dexscreener(data, fetched)
        self.assertEqual(snap["source"], "DexScreener")
        self.assertEqual(snap["price_usd"], 0.2780)
        self.assertEqual(snap["market_cap_usd"], 258906319)
        self.assertNotIn("volume_24h_usd", snap)


class BakeTests(unittest.TestCase):
    def test_replace_and_render(self):
        holders = {
            "updated_at": "2026-11-26T04:59:55-06:00",
            "total": 242635,
            "label": "Wallets holding SPX",
            "note": "A short method note.",
            "chains": [
                {
                    "id": "ethereum",
                    "name": "Ethereum",
                    "holders": 49756,
                    "source": "Ethplorer",
                    "source_url": "https://ethplorer.io/example",
                },
                {"id": "base", "name": "Base", "holders": 113824, "source": "GeckoTerminal"},
                {"id": "solana", "name": "Solana", "holders": 79055, "source": "GeckoTerminal"},
            ],
            "history": [
                {"date": "2026-11-25", "total": 242667},
                {"date": "2026-11-26", "total": 242635},
            ],
        }
        market_data = {
            "updated_at": "2026-11-26T07:50:00-07:00",
            "as_of": "2026-11-26T13:50:53+00:00",
            "source": "CoinGecko",
            "source_url": "https://www.coingecko.com/en/coins/spx6900",
            "price_usd": 0.278835,
            "change_24h_pct": 8.67325,
            "market_cap_usd": 259591400,
            "fdv_usd": 259591400,
            "volume_24h_usd": 5136224,
            "circulating_supply": 930987178.0065634,
            "total_supply": 930987178.0065634,
            "max_supply": 1000000000.0,
        }
        lead = build.render_holders_lead(holders)
        self.assertIn("242,635", lead)
        self.assertIn("As of 26 November 2026 4:59 am MT.", lead)
        self.assertNotIn("Loading", lead)
        chains = build.render_holders_chains(holders)
        self.assertIn("Ethereum", chains)
        self.assertIn("49,756", chains)
        self.assertIn("46.9%", chains)  # 113824/242635
        history = build.render_history(holders["history"])
        self.assertIn("md-spark", history)
        self.assertIn("25 Nov 2026", history)
        snap = build.render_market_snapshot(market_data)
        self.assertIn('id="snap-price"', snap)
        self.assertIn("figure-value", snap)
        self.assertIn("$0.2788", snap)
        self.assertIn("md-lead-change", snap)
        self.assertIn("num md-change is-up", snap)
        self.assertIn("▲ 8.7%", snap)
        self.assertNotIn("24-hour change", snap)
        self.assertIn("$259.6m", snap)
        self.assertIn("$5.14m", snap)
        self.assertIn("931m", snap)
        self.assertIn("1bn", snap)
        self.assertNotIn("Fully diluted value", snap)
        self.assertIn("CoinGecko", snap)
        self.assertIn("As of 26 November 2026 7:50 am MT", snap)
        self.assertIn("matches the market cap", snap)
        self.assertLess(snap.find("snap-price"), snap.find("snap-cap"))
        self.assertLess(snap.find("md-snapshot-lead"), snap.find("snapshot-method"))


if __name__ == "__main__":
    unittest.main()
