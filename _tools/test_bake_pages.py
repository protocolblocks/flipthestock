#!/usr/bin/env python3
"""Checks that the homepage and list pages carry their content in the raw HTML.

Run from the repo root:
    python3 _tools/test_bake_pages.py
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bake_pages  # noqa: E402

ROOT = bake_pages.ROOT


def stacks() -> dict:
    code = (
        "global.window=global;require('fs');"
        "(0,eval)(require('fs').readFileSync('library.js','utf8'));"
        "process.stdout.write(JSON.stringify(global.STACKS))"
    )
    out = subprocess.run(["node", "-e", code], cwd=ROOT, capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def render(now: str | None = None) -> dict:
    env = os.environ.copy()
    env["TZ"] = "America/Edmonton"
    if now:
        env["BAKE_NOW"] = now
    out = subprocess.run(
        ["node", str(bake_pages.RENDER)], cwd=ROOT, env=env, capture_output=True, text=True, check=True
    )
    return json.loads(out.stdout)


class BakedPages(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.stacks = stacks()
        cls.home = (ROOT / "index.html").read_text()

    def test_blocks_are_current(self):
        self.assertEqual(bake_pages.bake(check=True), [], "run build_articles.py to refresh the baked blocks")

    def test_every_root_has_content(self):
        for page, ids in bake_pages.PAGES.items():
            text = (ROOT / page).read_text()
            for element_id in ids:
                m = bake_pages.block_pattern(element_id).search(text)
                self.assertIsNotNone(m, "%s #%s has no baked block" % (page, element_id))
                self.assertGreater(len(m.group(0)), 80, "%s #%s is empty" % (page, element_id))

    def test_homepage_h1(self):
        self.assertEqual(len(re.findall(r"<h1\b", self.home)), 1)
        self.assertIn('<h1 class="logo-h1"><a class="logo" href="./">Flip the Stock</a></h1>', self.home)

    def test_homepage_feature_uses_latest_article_image(self):
        newest = sorted(self.stacks["articles"], key=lambda a: a["date"], reverse=True)[0]
        feature = re.search(r'<div class="ft-feature[^"]*">.*?</div>', self.home, re.S).group(0)
        meme_row = re.search(r"<!-- baked:meme-row -->(.*?)<!-- /baked:meme-row -->", self.home, re.S).group(1)
        lead_meme = self.stacks["memes"][0]["src"]
        if newest.get("image"):
            self.assertIn("ft-feature-fill", feature)
            self.assertIn(newest["image"], feature)
            self.assertIn("articles/%s/" % newest["slug"], feature)
            self.assertIn('fetchpriority="high"', feature)
            self.assertIn('class="pic pic-fill"', feature)
            self.assertNotIn("ft-feature-panel", feature)
            self.assertNotIn(newest["title"], feature)
            self.assertNotIn("Featured meme", feature)
            self.assertIn(lead_meme, meme_row)
            self.assertIn("Featured meme", meme_row)
            self.assertNotIn('fetchpriority="high"', meme_row)
            self.assertIn('loading="lazy"', meme_row)
        else:
            self.assertIn("memes/" + lead_meme, feature)
            self.assertIn("Featured meme", feature)
            self.assertNotIn(lead_meme, meme_row)

    def test_homepage_lead_story_is_newest_article(self):
        newest = sorted(self.stacks["articles"], key=lambda a: a["date"], reverse=True)[0]
        lead = re.search(r'<div class="ft-lead">.*?</h2>', self.home, re.S).group(0)
        self.assertIn("articles/%s/" % newest["slug"], lead)

    def test_no_relative_dates_are_baked(self):
        for page in bake_pages.PAGES:
            text = (ROOT / page).read_text()
            for block in re.findall(r"<!-- baked:.*?<!-- /baked:", text, re.S):
                self.assertNotRegex(block, r">(Today|Yesterday|\d days ago)<", page)

    def test_lists_are_in_raw_html(self):
        videos = (ROOT / "videos/index.html").read_text()
        self.assertIn(self.stacks["videos"][0]["title"].split(",")[0][:20].replace("'", "’"), videos.replace("&#x27;", "’"))
        memes = (ROOT / "memes/index.html").read_text()
        self.assertIn(self.stacks["memes"][0]["src"], memes)
        events = (ROOT / "events/index.html").read_text()
        self.assertIn("Upcoming", events)
        self.assertIn("Regulars", events)


class EventExpiry(unittest.TestCase):
    def test_past_events_leave_upcoming(self):
        later = render("2027-01-01T00:00:00Z")["events/index.html"]["stack"]
        self.assertIn("Nothing dated is on the calendar just now", later)
        now = render("2026-11-26T12:00:00Z")["events/index.html"]["stack"]
        self.assertIn("Art Basel Miami", now)
        self.assertIn("MT", now)


if __name__ == "__main__":
    unittest.main()
