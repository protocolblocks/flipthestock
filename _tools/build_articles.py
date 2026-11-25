#!/usr/bin/env python3
"""Generate a static page for every article in library.js.

Run from the repo root after adding or editing articles:
    python3 _tools/build_articles.py

It writes articles/<slug>/index.html (with the shared chrome from
sync_chrome.py), refreshes sitemap.xml and /feed.xml, and removes
generated pages whose slugs are no longer in library.js. Jekyll skips
folders starting with "_", so this file is not published.
"""
from __future__ import annotations

import html
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from email.utils import format_datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
import sync_chrome  # noqa: E402

ORIGIN = "https://www.flipthestock.com"
SITE = "Flip the Stock"
DEFAULT_OG = ORIGIN + "/assets/og.png"
DEFAULT_OG_ALT = (
    "Flip the Stock masthead on cream paper, with a single black dot "
    "on an otherwise blank chart."
)
TZ = ZoneInfo("America/Edmonton")
SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
SCRIPT_RE = re.compile(r"<script\b[^>]*>[\s\S]*?</script>", re.I)
SAFE_PATH_RE = re.compile(r"^[A-Za-z0-9_./-]+$")
HTTPS_RE = re.compile(r"^https://[A-Za-z0-9.-]+(?:/[^\s]*)?$")


def esc(value) -> str:
    return html.escape("" if value is None else str(value), quote=True)


def load_stacks() -> dict:
    code = r"""
const fs = require("fs");
const vm = require("vm");
const src = fs.readFileSync(process.env.LIBRARY_JS, "utf8");
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(src, ctx, { timeout: 5000 });
const stacks = ctx.window.STACKS || {};
if (!stacks || typeof stacks !== "object") {
  console.error("library.js did not define window.STACKS");
  process.exit(2);
}
process.stdout.write(JSON.stringify(stacks));
"""
    env = os.environ.copy()
    env["LIBRARY_JS"] = str(ROOT / "library.js")
    result = subprocess.run(
        ["node", "-e", code],
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        sys.stderr.write(result.stderr or result.stdout or "node failed to parse library.js\n")
        raise SystemExit("build_articles: could not read library.js")
    try:
        data = json.loads(result.stdout)
    except json.JSONDecodeError as e:
        raise SystemExit("build_articles: node returned invalid JSON: %s" % e)
    if not isinstance(data, dict):
        raise SystemExit("build_articles: STACKS payload was not an object")
    return data


def load_articles(stacks=None) -> list:
    data = (stacks or load_stacks()).get("articles") or []
    if not isinstance(data, list):
        raise SystemExit("build_articles: window.STACKS.articles is not an array")
    return data


def valid_articles(raw) -> list:
    out = []
    seen = set()
    for item in raw:
        if not isinstance(item, dict):
            print("skipping non-object article entry")
            continue
        slug = str(item.get("slug") or "")
        if not SLUG_RE.fullmatch(slug):
            print("skipping article with invalid slug: %r" % slug)
            continue
        if slug in seen:
            print("skipping duplicate slug: %s" % slug)
            continue
        if not str(item.get("title") or "").strip():
            print("skipping article without a title: %s" % slug)
            continue
        seen.add(slug)
        out.append(item)
    out.sort(key=lambda a: str(a.get("date") or ""), reverse=True)
    return out


def format_date(iso) -> str:
    text = str(iso or "")
    try:
        d = datetime.strptime(text, "%Y-%m-%d")
    except ValueError:
        return esc(text)
    return "%s %s" % (d.day, d.strftime("%B %Y"))


def published_time(iso) -> str:
    # Articles only store a calendar date, so publish that rather than a
    # midnight timestamp with a possibly-wrong offset.
    text = str(iso or "")
    return text if re.fullmatch(r"\d{4}-\d{2}-\d{2}", text) else ""


def sanitize_body(raw) -> str:
    return SCRIPT_RE.sub("", str(raw or ""))


def article_image(article) -> tuple[str, str, bool]:
    for key in ("image", "ogImage", "og", "cover"):
        value = article.get(key)
        if not value:
            continue
        value = str(value).strip()
        if HTTPS_RE.match(value) and " " not in value:
            alt = str(article.get("image_alt") or article.get("og_image_alt") or article.get("title") or "")
            return value, alt or DEFAULT_OG_ALT, False
        path = value.lstrip("/")
        if SAFE_PATH_RE.match(path) and ".." not in path:
            alt = str(article.get("image_alt") or article.get("og_image_alt") or article.get("title") or "")
            return ORIGIN + "/" + path, alt or DEFAULT_OG_ALT, False
    return DEFAULT_OG, DEFAULT_OG_ALT, True


def sources_html(article) -> str:
    sources = article.get("sources")
    if not sources:
        return ""
    if isinstance(sources, str):
        sources = [sources]
    if not isinstance(sources, list):
        return ""
    items = []
    for src in sources:
        href = ""
        label = ""
        if isinstance(src, str):
            href = src.strip()
            label = href
        elif isinstance(src, dict):
            href = str(src.get("href") or src.get("url") or "").strip()
            label = str(src.get("label") or src.get("title") or href).strip()
        if not HTTPS_RE.match(href):
            continue
        if not label:
            label = href
        items.append(
            '<li><a href="%s" target="_blank" rel="noopener noreferrer">%s</a></li>'
            % (esc(href), esc(label))
        )
    if not items:
        return ""
    return (
        '<aside class="article-sources"><h2>Sources</h2><ul>\n'
        + "\n".join(items)
        + "\n</ul></aside>"
    )


def related_html(article, articles) -> str:
    more = [item for item in articles if item.get("slug") != article.get("slug")][:4]
    if not more:
        return ""
    teasers = []
    for item in more:
        href = "../%s/" % item["slug"]
        stamp = format_date(item.get("date")) if item.get("date") else ""
        stamp_html = ('<p class="ft-stamp">%s</p>' % stamp) if stamp else ""
        teasers.append(
            '<article class="ft-teaser"><a href="%s">'
            '<p class="ft-tag">%s</p><h3>%s</h3>'
            '<p class="ft-dek">%s</p></a>'
            '%s</article>'
            % (
                esc(href),
                esc(item.get("kicker") or "Latest"),
                esc(item.get("title") or ""),
                esc(item.get("dek") or ""),
                stamp_html,
            )
        )
    return (
        '<section class="ft-slice related-slice" aria-label="More from Flip the Stock">'
        '<h2 class="ft-slice-head"><a href="../">More from Flip the Stock</a></h2>'
        '<div class="ft-row">' + "".join(teasers) + "</div></section>"
    )


def json_ld(article, url, description, image) -> str:
    data = {
        "@context": "https://schema.org",
        "@type": "Article",
        "headline": article.get("title") or "",
        "description": description,
        "inLanguage": "en",
        "mainEntityOfPage": url,
        "url": url,
        "image": image,
        "author": {"@type": "Organization", "name": SITE, "url": ORIGIN + "/"},
        "publisher": {"@type": "Organization", "name": SITE, "url": ORIGIN + "/"},
        "isPartOf": {"@type": "WebSite", "name": SITE, "url": ORIGIN + "/"},
    }
    published = published_time(article.get("date"))
    if published:
        data["datePublished"] = published
    elif article.get("date"):
        data["datePublished"] = article["date"]
    raw = json.dumps(data, ensure_ascii=True, indent=2)
    return raw.replace("<", "\\u003c")


def page_html(article, articles) -> str:
    slug = article["slug"]
    title = str(article.get("title") or "")
    dek = str(article.get("dek") or "")
    kicker = str(article.get("kicker") or "Articles")
    page_title = "%s — %s" % (title, SITE)
    description = dek or (
        "A written piece on SPX6900, filed on Flip the Stock. "
        "A community site. Not financial advice."
    )
    url = "%s/articles/%s/" % (ORIGIN, slug)
    image, image_alt, is_default_image = article_image(article)
    published = published_time(article.get("date"))
    date_label = format_date(article.get("date")) if article.get("date") else ""
    body = sanitize_body(article.get("html"))
    sources = sources_html(article)
    share_x = (
        "https://x.com/intent/post?text="
        + _q(title)
        + "&url="
        + _q(url)
    )
    prefix = "../../"
    chrome_header = sync_chrome.header(prefix, "Articles", True)
    chrome_promo = sync_chrome.promo("newsletter-email-article-%s" % slug, "article")
    chrome_footer = sync_chrome.footer(prefix, True)

    og_image_extras = ""
    if is_default_image:
        og_image_extras = """
  <meta property="og:image:type" content="image/png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">"""

    published_meta = ""
    if published:
        published_meta = (
            '\n  <meta property="article:published_time" content="%s">' % esc(published)
        )

    byline_date = (
        '<span class="byline-date">%s</span>' % date_label if date_label else ""
    )

    html = """%s
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>%s</title>
  <meta name="description" content="%s">
  <meta name="robots" content="index, follow">
  <meta name="theme-color" content="#fff1e5">
  <link rel="canonical" href="%s">
  %s
  <meta property="og:site_name" content="%s">
  <meta property="og:type" content="article">
  <meta property="og:locale" content="en_US">
  <meta property="og:title" content="%s">
  <meta property="og:description" content="%s">
  <meta property="og:url" content="%s">
  <meta property="og:image" content="%s">%s
  <meta property="og:image:alt" content="%s">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="%s">
  <meta name="twitter:description" content="%s">
  <meta name="twitter:image" content="%s">
  <meta name="twitter:image:alt" content="%s">%s
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="icon" href="/favicon.ico" sizes="32x32">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  %s
  <link rel="stylesheet" href="../../site.css">
  <script type="application/ld+json">
  %s
  </script>
</head>
<body>
  <a class="skip" href="#main">Skip to content</a>
  %s
  <main id="main" class="page">
    <div class="wrap">
      <div class="article-layout">
        <article class="article">
          <p class="article-tag"><a class="ft-tag" href="../">%s</a></p>
          <h1>%s</h1>
          <p class="article-dek">%s</p>
          <div class="byline">
            <p><b>Flip the Stock</b>%s</p>
            <p class="share">
              <a href="%s" target="_blank" rel="noopener noreferrer">Share on X</a>
              <button type="button" class="share-copy" data-url="%s">Copy link</button>
            </p>
          </div>
          <div class="article-body">
            %s
          </div>
          %s
          <p class="article-foot">Nothing here is an offer or financial advice. <a class="back" href="../">All articles</a></p>
        </article>
        <aside class="rail" id="article-rail" aria-label="More on this site"></aside>
      </div>
      %s
    </div>
  </main>
  %s

  %s
  <script src="../../library.js"></script>
  <script src="../../stacks.js"></script>
  <script src="../../edition.js"></script>
  <script src="../../ticker.js"></script>
  <script>
    if (typeof renderRail === "function") {
      renderRail(document.getElementById("article-rail"), "../../");
    }
    (function () {
      var copy = document.querySelector(".share-copy");
      if (!copy) return;
      copy.addEventListener("click", function () {
        var shareUrl = copy.getAttribute("data-url");
        if (navigator.clipboard) {
          navigator.clipboard.writeText(shareUrl).then(function () {
            copy.textContent = "Link copied";
          });
        }
      });
    })();
  </script>
  <script data-goatcounter="https://flipthestock.goatcounter.com/count"
          async src="//gc.zgo.at/count.js"></script>
</body>
</html>
""" % (
        "%s slug=\"%s\" -->" % (sync_chrome.ARTICLE_MARKER, slug),
        esc(page_title),
        esc(description),
        esc(url),
        sync_chrome.RSS_LINK,
        esc(SITE),
        esc(page_title),
        esc(description),
        esc(url),
        esc(image),
        og_image_extras,
        esc(image_alt),
        esc(page_title),
        esc(description),
        esc(image),
        esc(image_alt),
        published_meta,
        sync_chrome.FONTS_LINK,
        json_ld(article, url, description, image),
        chrome_header,
        esc(kicker),
        esc(title),
        esc(dek),
        byline_date,
        esc(share_x),
        esc(url),
        body,
        sources,
        related_html(article, articles),
        chrome_promo,
        chrome_footer,
    )
    return sync_chrome.bust_asset_urls(html)



def _q(value: str) -> str:
    # application/x-www-form-urlencoded, matching encodeURIComponent for share links
    from urllib.parse import quote
    return quote(value, safe="-_.!~*'()")


def write_if_changed(path: Path, text: str) -> bool:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and path.read_text() == text:
        return False
    path.write_text(text)
    return True


def remove_stale(keep: set[str]) -> list[str]:
    removed = []
    root = ROOT / "articles"
    if not root.is_dir():
        return removed
    for path in sorted(root.iterdir()):
        index = path / "index.html"
        if not path.is_dir() or not index.is_file():
            continue
        if path.name in keep:
            continue
        try:
            text = index.read_text()
        except OSError:
            continue
        if sync_chrome.ARTICLE_MARKER not in text:
            continue
        index.unlink()
        try:
            path.rmdir()
        except OSError:
            pass
        removed.append(path.name)
    return removed


DATE_RE = re.compile(r"(\d{4}-\d{2}-\d{2})")

# Section pages that should always appear in the sitemap. lastmod is kept
# from the existing file when we cannot derive a newer date from library.js.
STATIC_SITEMAP = [
    ("/learn/", "2026-11-25"),
    ("/market-data/", "2026-11-25"),
    ("/contact/", "2026-11-24"),
]


def iso_date(value) -> str:
    text = str(value or "")
    m = DATE_RE.search(text)
    return m.group(1) if m else ""


def article_date(article) -> str:
    date = iso_date(article.get("date"))
    return date or datetime.now(timezone.utc).date().isoformat()


def newest_date(values) -> str:
    dates = [d for d in values if d]
    return max(dates) if dates else ""


def existing_lastmods() -> dict:
    path = ROOT / "sitemap.xml"
    if not path.exists():
        return {}
    return dict(re.findall(
        r"<loc>https://www\.flipthestock\.com([^<]*)</loc>\s*<lastmod>([^<]+)</lastmod>",
        path.read_text(),
    ))


def lastmod_for(path: str, derived: str, previous: dict, fallback: str = "") -> str:
    candidates = [derived, previous.get(path, ""), fallback]
    return newest_date(candidates) or datetime.now(timezone.utc).date().isoformat()


def sitemap_url(path: str, lastmod: str) -> str:
    return (
        "  <url>\n    <loc>%s%s</loc>\n    <lastmod>%s</lastmod>\n  </url>\n"
        % (ORIGIN, path, lastmod)
    )


def update_sitemap(articles: list, stacks: dict) -> bool:
    previous = existing_lastmods()
    memes = stacks.get("memes") or []
    videos = stacks.get("videos") or []
    meme_dates = [iso_date(m.get("src") or "") for m in memes if isinstance(m, dict)]
    video_dates = [
        iso_date(v.get("poster") or v.get("note") or "")
        for v in videos if isinstance(v, dict)
    ]
    article_dates = [article_date(a) for a in articles]
    newest_article = newest_date(article_dates)
    home_date = lastmod_for(
        "/",
        newest_date(article_dates + meme_dates + video_dates),
        previous,
        "2026-11-25",
    )
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>\n',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n',
        sitemap_url("/", home_date),
        sitemap_url("/articles/", lastmod_for("/articles/", newest_article, previous, newest_article)),
    ]
    for article in articles:
        lines.append(sitemap_url("/articles/%s/" % article["slug"], article_date(article)))
    lines.append(sitemap_url("/memes/", lastmod_for("/memes/", newest_date(meme_dates), previous, "2026-11-23")))
    lines.append(sitemap_url("/videos/", lastmod_for("/videos/", newest_date(video_dates), previous, "2026-11-23")))
    # Event dates are occurrence times, not page-edit dates, so keep the
    # existing lastmod unless the sitemap was missing this URL.
    lines.append(sitemap_url("/events/", lastmod_for("/events/", "", previous, "2026-11-24")))
    for path, fallback in STATIC_SITEMAP:
        lines.append(sitemap_url(path, lastmod_for(path, "", previous, fallback)))
    lines.append(sitemap_url("/feed.xml", lastmod_for("/feed.xml", newest_article, previous, newest_article)))
    lines.append("</urlset>\n")
    return write_if_changed(ROOT / "sitemap.xml", "".join(lines))


def rfc822(iso_date: str) -> str:
    try:
        d = datetime.strptime(iso_date, "%Y-%m-%d")
    except ValueError:
        d = datetime.now(timezone.utc)
        return format_datetime(d)
    return format_datetime(datetime(d.year, d.month, d.day, tzinfo=timezone.utc))


def cdata(text: str) -> str:
    return "<![CDATA[" + str(text or "").replace("]]>", "]]]]><![CDATA[>") + "]]>"


def feed_item(article) -> str:
    url = "%s/articles/%s/" % (ORIGIN, article["slug"])
    title = str(article.get("title") or "Untitled")
    dek = str(article.get("dek") or "")
    body = sanitize_body(article.get("html"))
    encoded = ""
    if dek:
        encoded += "<p>%s</p>\n" % esc(dek)
    if body:
        encoded += body
    if not encoded:
        encoded = "<p>%s</p>" % esc(title)
    pub = rfc822(article_date(article))
    desc = dek or title
    return (
        "    <item>\n"
        "      <title>%s</title>\n"
        "      <link>%s</link>\n"
        "      <guid isPermaLink=\"true\">%s</guid>\n"
        "      <pubDate>%s</pubDate>\n"
        "      <description>%s</description>\n"
        "      <content:encoded>%s</content:encoded>\n"
        "    </item>\n"
        % (esc(title), esc(url), esc(url), esc(pub), esc(desc), cdata(encoded))
    )


def write_feed(articles: list) -> bool:
    items = articles[:20]
    newest = article_date(items[0]) if items else datetime.now(timezone.utc).date().isoformat()
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" '
        'xmlns:atom="http://www.w3.org/2005/Atom">\n'
        "  <channel>\n"
        "    <title>%s</title>\n"
        "    <link>%s/</link>\n"
        "    <description>%s</description>\n"
        "    <language>en-us</language>\n"
        "    <lastBuildDate>%s</lastBuildDate>\n"
        '    <atom:link href="%s/feed.xml" rel="self" type="application/rss+xml"/>\n'
        "%s"
        "  </channel>\n"
        "</rss>\n"
        % (
            esc(SITE),
            ORIGIN,
            esc("Written pieces from Flip the Stock, a user community site for SPX6900. Not financial advice."),
            esc(rfc822(newest)),
            ORIGIN,
            "".join(feed_item(a) for a in items),
        )
    )
    return write_if_changed(ROOT / "feed.xml", xml)


def validate_xml(path: Path) -> None:
    import xml.etree.ElementTree as ET
    try:
        ET.parse(path)
    except ET.ParseError as e:
        raise SystemExit("build_articles: %s is not well-formed XML: %s" % (path.name, e))


def main() -> int:
    stacks = load_stacks()
    articles = valid_articles(load_articles(stacks))
    if not articles:
        raise SystemExit("build_articles: no valid articles found in library.js")
    written = 0
    for article in articles:
        dest = ROOT / "articles" / article["slug"] / "index.html"
        if write_if_changed(dest, page_html(article, articles)):
            written += 1
            print("wrote articles/%s/index.html" % article["slug"])
        else:
            print("unchanged articles/%s/index.html" % article["slug"])
    removed = remove_stale({a["slug"] for a in articles})
    for slug in removed:
        print("removed stale articles/%s/" % slug)
    if update_sitemap(articles, stacks):
        print("updated sitemap.xml")
    else:
        print("sitemap.xml already current")
    if write_feed(articles):
        print("updated feed.xml")
    else:
        print("feed.xml already current")
    validate_xml(ROOT / "sitemap.xml")
    validate_xml(ROOT / "feed.xml")
    print("articles: %s written, %s unchanged, %s removed" % (
        written, len(articles) - written, len(removed)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
