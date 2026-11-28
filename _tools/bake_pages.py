#!/usr/bin/env python3
"""Write the lists that stacks.js draws into the HTML itself.

Run from the repo root:
    python3 _tools/bake_pages.py          # rewrite the baked blocks
    python3 _tools/bake_pages.py --check  # exit 1 if any block is out of date

build_articles.py calls this on every run, so the daily routines that run
sync_chrome.py and build_articles.py also refresh the static copy of the
homepage, Articles, Memes, Videos and Events pages.

The HTML comes from the site's own renderers: _tools/bake_render.js runs
stacks.js against library.js with a small DOM stub and prints what each list
would draw. It is written between <!-- baked:ID --> and <!-- /baked:ID -->
inside the element with that id. In the browser, stacks.js replaces the
contents of the same element with identical markup, so nothing is duplicated.
Baked dates are absolute and event times are in Mountain, so nothing goes
stale-wrong; the script then shows relative dates and the visitor's own time.
Jekyll skips folders starting with "_", so this file is not published.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RENDER = Path(__file__).resolve().parent / "bake_render.js"
import media_pages  # noqa: E402

# Page -> ids of the elements that get a baked block. The renderer calls for
# each one live in bake_render.js and in the page's inline script.
PAGES = {
    "index.html": ["news-grid", "meme-row", "video-row"],
    "articles/index.html": ["stack", "rail"],
    "memes/index.html": ["stack", "rail"],
    "videos/index.html": ["stack", "rail"],
    "events/index.html": ["stack", "rail"],
}


class BakeError(Exception):
    pass


def render_all() -> dict:
    env = os.environ.copy()
    env["TZ"] = "America/Edmonton"
    result = subprocess.run(
        ["node", str(RENDER)], env=env, capture_output=True, text=True, check=False, cwd=str(ROOT)
    )
    if result.returncode != 0:
        sys.stderr.write(result.stderr or result.stdout)
        raise BakeError("bake_render.js failed")
    try:
        data = json.loads(result.stdout)
    except json.JSONDecodeError as e:
        raise BakeError("bake_render.js returned invalid JSON: %s" % e) from e
    return data


def block_pattern(element_id: str) -> re.Pattern:
    return re.compile(
        r"<!-- baked:%s -->.*?<!-- /baked:%s -->" % (re.escape(element_id), re.escape(element_id)),
        re.S,
    )


def element_pattern(element_id: str) -> re.Pattern:
    # An element with this id that is still empty: <div ... id="stack"></div>
    return re.compile(
        r'(<(?P<tag>[a-z0-9]+)\b[^>]*\bid="%s"[^>]*>)(?P<inner>\s*)(</(?P=tag)>)' % re.escape(element_id)
    )


def bake_block(page_html: str, element_id: str, inner: str, name: str) -> str:
    block = "<!-- baked:%s -->%s<!-- /baked:%s -->" % (element_id, inner, element_id)
    marked = block_pattern(element_id)
    if marked.search(page_html):
        return marked.sub(lambda _m: block, page_html, count=1)
    empty = element_pattern(element_id)
    if not empty.search(page_html):
        raise BakeError("%s: no #%s element to bake into" % (name, element_id))
    return empty.sub(lambda m: m.group(1) + block + m.group(4), page_html, count=1)


def bake(check: bool = False) -> list[str]:
    """Bake every block, plus a static page for each video and meme."""
    rendered = render_all()
    stacks = media_pages.load_stacks()
    videos = media_pages.valid_videos(stacks)
    memes = media_pages.valid_memes(stacks)
    redirects = media_pages.hash_redirects(
        videos, memes, media_pages.video_slugs(videos), media_pages.meme_slugs(memes)
    )
    changed = []
    for page, ids in PAGES.items():
        path = ROOT / page
        if not path.exists():
            raise BakeError("missing %s" % page)
        old = path.read_text()
        new = old
        for element_id in ids:
            inner = (rendered.get(page) or {}).get(element_id)
            if inner is None:
                raise BakeError("%s: renderer returned nothing for #%s" % (page, element_id))
            if "<!--" in inner:
                raise BakeError("%s: rendered #%s contains a comment" % (page, element_id))
            new = bake_block(new, element_id, inner, page)
        if page in redirects:
            new = media_pages.inject_hash_redirect(new, redirects[page])
        if new != old:
            changed.append(page)
            if not check:
                path.write_text(new)
    changed.extend(media_pages.publish(stacks=stacks, check=check))
    return changed


def main(argv: list[str]) -> int:
    check = "--check" in argv
    changed = bake(check=check)
    if check:
        if changed:
            print("baked blocks out of date: %s" % ", ".join(changed))
            return 1
        print("baked blocks are current")
        return 0
    for page in PAGES:
        print("%s %s" % ("baked" if page in changed else "unchanged", page))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main(sys.argv[1:]))
    except BakeError as e:
        raise SystemExit("bake_pages failed: %s" % e)
