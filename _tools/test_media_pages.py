#!/usr/bin/env python3
"""Checks that every video and meme has a static page and a 1200x630 share card.

Run from the repo root:
    python3 _tools/test_media_pages.py
"""
from __future__ import annotations

import re
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bake_pages  # noqa: E402
import media_pages  # noqa: E402

ROOT = media_pages.ROOT
ORIGIN = media_pages.ORIGIN


def _meta(html: str, attr: str, name: str) -> str:
    m = re.search(r'<meta [^>]*' + re.escape(attr) + '="' + re.escape(name) + r'"[^>]*content="([^"]*)"', html)
    if not m:
        m = re.search(r'<meta [^>]*content="([^"]*)"[^>]*' + re.escape(attr) + '="' + re.escape(name) + r'"', html)
    return m.group(1) if m else ""


class MediaPages(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.stacks = media_pages.load_stacks()
        cls.videos = media_pages.valid_videos(cls.stacks)
        cls.memes = media_pages.valid_memes(cls.stacks)
        cls.vslugs = media_pages.video_slugs(cls.videos)
        cls.mslugs = media_pages.meme_slugs(cls.memes)

    def test_pages_are_current(self):
        self.assertEqual(
            bake_pages.bake(check=True),
            [],
            "run build_articles.py to refresh baked lists and media pages",
        )

    def test_every_video_and_meme_has_a_page(self):
        self.assertGreaterEqual(len(self.videos), 1)
        self.assertGreaterEqual(len(self.memes), 1)
        for item in self.videos:
            slug = self.vslugs[media_pages.video_key(item)]
            path = ROOT / "videos" / slug / "index.html"
            self.assertTrue(path.is_file(), "missing videos/%s/" % slug)
        for item in self.memes:
            slug = self.mslugs[media_pages.meme_key(item)]
            path = ROOT / "memes" / slug / "index.html"
            self.assertTrue(path.is_file(), "missing memes/%s/" % slug)

    def test_slugs_are_unique_and_match_javascript(self):
        v = list(self.vslugs.values())
        m = list(self.mslugs.values())
        self.assertEqual(len(v), len(set(v)))
        self.assertEqual(len(m), len(set(m)))
        for slug in v + m:
            self.assertRegex(slug, r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
            self.assertLessEqual(len(slug), 96)
        js = media_pages.js_slugs()
        self.assertEqual(js["videos"], self.vslugs)
        self.assertEqual(js["memes"], self.mslugs)

    def test_featured_video_example_url(self):
        lead = self.videos[0]
        slug = self.vslugs[media_pages.video_key(lead)]
        self.assertEqual(slug, "the-truth-about-spx6900")
        self.assertTrue((ROOT / "videos" / slug / "index.html").is_file())

    def _assert_share_card(self, kind: str, slug: str, html: str):
        from PIL import Image

        rel = media_pages._share_rel(kind, slug)
        path = ROOT / rel
        self.assertTrue(path.is_file(), rel)
        with Image.open(path) as im:
            self.assertEqual(im.size, (1200, 630))
        url = ORIGIN + "/" + rel
        self.assertIn('content="%s"' % url, html)
        self.assertIn('property="og:image"', html)
        self.assertIn('name="twitter:image"', html)
        self.assertIn('content="1200"', html)
        self.assertIn('content="630"', html)
        self.assertIn('name="twitter:card"', html)
        self.assertIn("summary_large_image", html)

    def test_video_pages_have_share_tags_player_credit_and_back_link(self):
        for item in self.videos:
            slug = self.vslugs[media_pages.video_key(item)]
            html = (ROOT / "videos" / slug / "index.html").read_text()
            title = item["title"]
            self.assertIn("<title>%s — Flip the Stock</title>" % title.replace("&", "&amp;"), html)
            self.assertIn('rel="canonical" href="%s/videos/%s/"' % (ORIGIN, slug), html)
            self.assertEqual(_meta(html, "property", "og:title"), "%s — Flip the Stock" % title)
            self.assertTrue(_meta(html, "property", "og:description"))
            self.assertEqual(_meta(html, "property", "og:url"), "%s/videos/%s/" % (ORIGIN, slug))
            self._assert_share_card("video", slug, html)
            self.assertIn('href="../"', html)
            self.assertIn("All videos", html)
            self.assertIn("community site", html.lower())
            self.assertNotIn("fan site", html.lower())
            self.assertNotIn("fan page", html.lower())
            self.assertNotRegex(html, r"@FlipTheStock")
            if media_pages.youtube_id(item):
                self.assertIn("yt-play", html)
                self.assertIn(media_pages.youtube_id(item), html)
                self.assertIn("Watch on YouTube", html)
            else:
                self.assertIn("twitter-tweet", html)
                self.assertIn("credit", html)
            self.assertIn("<!-- generated:video", html)

    def test_meme_pages_have_share_tags_image_credit_and_back_link(self):
        for item in self.memes:
            slug = self.mslugs[media_pages.meme_key(item)]
            html = (ROOT / "memes" / slug / "index.html").read_text()
            caption = item["caption"]
            self.assertIn(caption.replace("&", "&amp;").replace("’", "’"), html)
            self.assertIn('rel="canonical" href="%s/memes/%s/"' % (ORIGIN, slug), html)
            self.assertIn('name="twitter:card"', html)
            self.assertIn("summary_large_image", html)
            self._assert_share_card("meme", slug, html)
            self.assertIn("/memes/" + media_pages.meme_key(item), html)
            self.assertIn("All memes", html)
            self.assertIn("community site", html.lower())
            self.assertNotIn("fan site", html.lower())
            self.assertNotRegex(html, r"@FlipTheStock")
            if item.get("credit"):
                self.assertIn(item["credit"], html)
            self.assertIn("<!-- generated:meme", html)

    def test_sitemap_lists_every_media_page(self):
        xml = (ROOT / "sitemap.xml").read_text()
        for slug in self.vslugs.values():
            self.assertIn("<loc>%s/videos/%s/</loc>" % (ORIGIN, slug), xml)
        for slug in self.mslugs.values():
            self.assertIn("<loc>%s/memes/%s/</loc>" % (ORIGIN, slug), xml)

    def test_hash_redirects_cover_every_item(self):
        tables = media_pages.hash_redirects(self.videos, self.memes, self.vslugs, self.mslugs)
        videos_html = (ROOT / "videos/index.html").read_text()
        memes_html = (ROOT / "memes/index.html").read_text()
        for item in self.videos:
            key = media_pages.video_key(item)
            slug = self.vslugs[key]
            self.assertEqual(tables["videos/index.html"]["v-" + key], "./%s/" % slug)
            self.assertIn("v-" + key, videos_html)
        for item in self.memes:
            src = media_pages.meme_key(item)
            name = Path(src).stem
            slug = self.mslugs[src]
            self.assertEqual(tables["memes/index.html"]["m-" + name], "./%s/" % slug)
            self.assertIn("m-" + name, memes_html)

    def test_slugify_strips_apostrophes(self):
        self.assertEqual(media_pages.slugify("Murad’s chart"), "murads-chart")
        self.assertEqual(media_pages.slugify("The Truth About SPX6900"), "the-truth-about-spx6900")


if __name__ == "__main__":
    unittest.main()
