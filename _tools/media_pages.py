#!/usr/bin/env python3
"""Static pages and 1200x630 share cards for every video and meme.

Called from bake_pages.py (and so from build_articles.py) whenever the
lists in library.js change. Routines that prepend an entry and run the
usual build get a new /videos/<slug>/ or /memes/<slug>/ page, a share
image, a sitemap row, and index links, with no extra manual step.
Jekyll skips folders starting with "_", so this file is not published.
"""
from __future__ import annotations

import html
import json
import os
import re
import subprocess
import sys
import unicodedata
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
import sync_chrome  # noqa: E402

ORIGIN = "https://www.flipthestock.com"
SITE = "Flip the Stock"
DEFAULT_OG = ORIGIN + "/assets/og.png?v=2"
DEFAULT_OG_ALT = (
    "Flip the Stock on a 1970s drive-in at dusk, with a gold coin on the screen."
)
PAPER = (255, 241, 229)  # #fff1e5
SHARE_W, SHARE_H = 1200, 630
SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
YOUTUBE_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")
X_POST_RE = re.compile(
    r"^https://(?:www\.)?(?:x\.com|twitter\.com)/([A-Za-z0-9_]+)/status/(\d+)(?:[/?#].*)?$"
)
SAFE_PATH_RE = re.compile(r"^[A-Za-z0-9_./-]+$")
DATE_ISO_RE = re.compile(r"(\d{4}-\d{2}-\d{2})")
DATE_TEXT_RE = re.compile(
    r"\b(\d{1,2}) (January|February|March|April|May|June|July|August|"
    r"September|October|November|December) (\d{4})\b"
)
MONTHS = {
    "January": 1, "February": 2, "March": 3, "April": 4, "May": 5, "June": 6,
    "July": 7, "August": 8, "September": 9, "October": 10, "November": 11, "December": 12,
}
TZ = ZoneInfo("America/Edmonton")
VIDEO_MARKER = "<!-- generated:video"
MEME_MARKER = "<!-- generated:meme"
BANNED_CREDIT_RE = re.compile(r"@flipthestock\b", re.I)
UA = "FlipTheStock/1.0 (+https://www.flipthestock.com/)"

COMMUNITY_VIDEO = (
    "A video on SPX6900, filed on Flip the Stock. A community site. Not financial advice."
)
COMMUNITY_MEME = (
    "A meme from the SPX6900 community, filed on Flip the Stock. Not financial advice."
)


def esc(value) -> str:
    return html.escape("" if value is None else str(value), quote=True)


def q(value: str) -> str:
    return quote(value, safe="-_.!~*'()")


def write_if_changed(path: Path, text: str) -> bool:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and path.read_text() == text:
        return False
    path.write_text(text)
    return True


def slugify(text: str) -> str:
    s = unicodedata.normalize("NFKD", text or "")
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = re.sub(r"['’]", "", s)
    s = s.lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    if len(s) > 80:
        s = s[:80].rstrip("-")
    return s


def slug_suffix(key: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (key or "").lower()).strip("-")


def assign_slugs(items: list, base_fn, key_fn) -> dict[str, str]:
    """Oldest first keeps a bare title slug; later collisions get a stable suffix."""
    used: set[str] = set()
    by_key: dict[str, str] = {}
    for item in reversed(items):
        key = key_fn(item)
        if not key:
            continue
        base = base_fn(item) or ("item-" + slug_suffix(key))
        if not SLUG_RE.fullmatch(base):
            base = "item-" + slug_suffix(key)
        slug = base
        if slug in used:
            slug = base + "-" + slug_suffix(key)
            n = 2
            while slug in used or not SLUG_RE.fullmatch(slug):
                slug = "%s-%s-%s" % (base, slug_suffix(key), n)
                n += 1
        used.add(slug)
        by_key[key] = slug
    return by_key


def safe_path(value) -> str:
    path = str(value or "").strip().lstrip("/")
    if not path or not SAFE_PATH_RE.match(path) or ".." in path:
        return ""
    return path


def youtube_id(video: dict) -> str:
    ident = str(video.get("id") or "")
    return ident if YOUTUBE_ID_RE.fullmatch(ident) else ""


def x_post(video: dict) -> dict | None:
    url = str(video.get("x") or "")
    match = X_POST_RE.match(url)
    if not match or not safe_path(video.get("poster")):
        return None
    user, ident = match.group(1), match.group(2)
    return {"user": user, "id": ident, "href": "https://x.com/%s/status/%s" % (user, ident)}


def video_key(video: dict) -> str:
    return youtube_id(video) or ((x_post(video) or {}).get("id") or "")


def valid_videos(stacks: dict) -> list:
    out = []
    seen = set()
    for item in stacks.get("videos") or []:
        if not isinstance(item, dict):
            continue
        key = video_key(item)
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(item)
    return out


def meme_key(meme: dict) -> str:
    return safe_path(meme.get("src"))


def meme_base(meme: dict) -> str:
    src = meme_key(meme)
    name = Path(src).stem if src else ""
    return slugify(name.replace("_", "-")) or slugify(str(meme.get("caption") or ""))


def valid_memes(stacks: dict) -> list:
    out = []
    seen = set()
    for item in stacks.get("memes") or []:
        if not isinstance(item, dict):
            continue
        key = meme_key(item)
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(item)
    return out


def video_slugs(videos: list) -> dict[str, str]:
    return assign_slugs(videos, lambda v: slugify(str(v.get("title") or "")), video_key)


def meme_slugs(memes: list) -> dict[str, str]:
    return assign_slugs(memes, meme_base, meme_key)


def load_stacks() -> dict:
    code = r"""
const fs = require("fs");
const vm = require("vm");
const src = fs.readFileSync(process.env.LIBRARY_JS, "utf8");
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(src, ctx, { timeout: 5000 });
const stacks = ctx.window.STACKS || {};
if (!stacks || typeof stacks !== "object") process.exit(2);
process.stdout.write(JSON.stringify(stacks));
"""
    env = os.environ.copy()
    env["LIBRARY_JS"] = str(ROOT / "library.js")
    result = subprocess.run(
        ["node", "-e", code], env=env, capture_output=True, text=True, check=False
    )
    if result.returncode != 0:
        sys.stderr.write(result.stderr or result.stdout or "node failed to parse library.js\n")
        raise SystemExit("media_pages: could not read library.js")
    data = json.loads(result.stdout)
    if not isinstance(data, dict):
        raise SystemExit("media_pages: STACKS payload was not an object")
    return data


def iso_date(value) -> str:
    m = DATE_ISO_RE.search(str(value or ""))
    return m.group(1) if m else ""


def text_date(value) -> str:
    m = DATE_TEXT_RE.search(str(value or ""))
    if not m:
        return ""
    return "%04d-%02d-%02d" % (int(m.group(3)), MONTHS[m.group(2)], int(m.group(1)))


def snowflake_iso(status_id: str) -> str:
    try:
        ms = (int(status_id) // 4194304) + 1288834974657
    except (TypeError, ValueError):
        return ""
    return datetime.fromtimestamp(ms / 1000, TZ).date().isoformat()


def entry_date(item: dict, kind: str) -> str:
    if kind == "video":
        x = x_post(item)
        for value in (item.get("date"), item.get("poster"), item.get("note")):
            found = iso_date(value) or (text_date(value) if value == item.get("note") else "")
            if found:
                return found
        if x:
            found = snowflake_iso(x["id"])
            if found:
                return found
        found = text_date(item.get("note"))
        if found:
            return found
    else:
        for value in (item.get("date"), item.get("src"), item.get("href")):
            found = iso_date(value)
            if found:
                return found
        href = str(item.get("href") or "")
        m = re.search(r"/status/(\d+)", href)
        if m:
            found = snowflake_iso(m.group(1))
            if found:
                return found
    return datetime.now(timezone.utc).date().isoformat()


def format_date(iso: str) -> str:
    try:
        d = datetime.strptime(iso, "%Y-%m-%d")
    except ValueError:
        return ""
    return "%s %s" % (d.day, d.strftime("%B %Y"))


def safe_credit(text: str) -> str:
    if not text or BANNED_CREDIT_RE.search(text):
        return ""
    return text


def js_slugs() -> dict:
    """Ask stacks.js for the slugs it will put in links, so tests can compare."""
    code = r"""
const fs = require("fs");
const path = require("path");
const root = process.env.ROOT;
global.window = global;
global.STACKS_BAKE_MODE = true;
global.document = { getElementById() { return { innerHTML: "", setAttribute() {}, getAttribute() { return null; }, addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; } }; }, querySelectorAll() { return []; }, querySelector() { return null; }, addEventListener() {} };
global.location = { search: "", hash: "", href: "https://www.flipthestock.com/", pathname: "/" };
global.history = { replaceState() {} };
(0, eval)(fs.readFileSync(path.join(root, "library.js"), "utf8"));
(0, eval)(fs.readFileSync(path.join(root, "stacks.js"), "utf8"));
if (typeof global.mediaSlugMaps !== "function") {
  console.error("stacks.js does not define mediaSlugMaps");
  process.exit(2);
}
process.stdout.write(JSON.stringify(global.mediaSlugMaps()));
"""
    env = os.environ.copy()
    env["ROOT"] = str(ROOT)
    env["TZ"] = "America/Edmonton"
    result = subprocess.run(
        ["node", "-e", code], env=env, capture_output=True, text=True, check=False, cwd=str(ROOT)
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr or result.stdout or "mediaSlugMaps failed")
    return json.loads(result.stdout)


def _contain_or_cover(im, mode: str):
    from PIL import Image

    im = im.convert("RGB")
    if mode == "contain":
        scale = min(SHARE_W / im.width, SHARE_H / im.height)
        size = (max(1, round(im.width * scale)), max(1, round(im.height * scale)))
        new = im.resize(size, Image.Resampling.LANCZOS)
        canvas = Image.new("RGB", (SHARE_W, SHARE_H), PAPER)
        canvas.paste(new, ((SHARE_W - new.width) // 2, (SHARE_H - new.height) // 2))
        return canvas
    scale = max(SHARE_W / im.width, SHARE_H / im.height)
    size = (max(1, round(im.width * scale)), max(1, round(im.height * scale)))
    new = im.resize(size, Image.Resampling.LANCZOS)
    left = max(0, (new.width - SHARE_W) // 2)
    top = max(0, (new.height - SHARE_H) // 2)
    return new.crop((left, top, left + SHARE_W, top + SHARE_H))


def _save_share(im, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".tmp")
    im.save(tmp, "JPEG", quality=88, optimize=True, progressive=True)
    tmp.replace(dest)


def _load_local(path: Path):
    from PIL import Image

    with Image.open(path) as im:
        return im.copy()


def _fetch_youtube_thumb(ident: str):
    from PIL import Image
    import io

    for name in ("maxresdefault.jpg", "sddefault.jpg", "hqdefault.jpg"):
        url = "https://i.ytimg.com/vi/%s/%s" % (ident, name)
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                data = resp.read()
        except (urllib.error.URLError, TimeoutError, OSError):
            continue
        if len(data) < 8000:
            continue
        try:
            im = Image.open(io.BytesIO(data))
            im.load()
            # hqdefault is 480x360 with black bars; prefer larger sources first.
            if name == "hqdefault.jpg" or (im.width >= 640 and im.height >= 360):
                return im
            return im
        except Exception:
            continue
    return None


def write_share_image(source: Path | None, dest: Path, mode: str, youtube: str = "") -> bool:
    """Write dest as a 1200x630 JPEG. Returns True if the file was created or replaced."""
    from PIL import Image

    if dest.is_file() and dest.stat().st_size > 1000:
        try:
            with Image.open(dest) as existing:
                if existing.size == (SHARE_W, SHARE_H):
                    if source is None or dest.stat().st_mtime >= source.stat().st_mtime:
                        return False
        except Exception:
            pass
    im = None
    if source is not None and source.is_file():
        im = _load_local(source)
    elif youtube:
        im = _fetch_youtube_thumb(youtube)
    if im is None:
        raise SystemExit("media_pages: no share image source for %s" % dest)
    card = _contain_or_cover(im, mode)
    _save_share(card, dest)
    return True


def share_alt(kind: str, item: dict) -> str:
    if kind == "video":
        return str(item.get("title") or "Video") + ", filed on Flip the Stock."
    return str(item.get("alt") or item.get("caption") or "Meme")


def share_meta(rel_path: str, alt: str) -> tuple[str, str, str]:
    url = ORIGIN + "/" + rel_path.lstrip("/")
    extras = (
        "\n  <meta property=\"og:image:type\" content=\"image/jpeg\">"
        "\n  <meta property=\"og:image:width\" content=\"%s\">"
        "\n  <meta property=\"og:image:height\" content=\"%s\">" % (SHARE_W, SHARE_H)
    )
    return url, alt, extras


def related_html(kind: str, current_slug: str, items: list, slugs: dict, key_fn) -> str:
    more = []
    for item in items:
        slug = slugs.get(key_fn(item))
        if not slug or slug == current_slug:
            continue
        more.append((item, slug))
        if len(more) == 4:
            break
    if not more:
        return ""
    teasers = []
    tag = "Video" if kind == "video" else "Meme"
    for item, slug in more:
        title = str(item.get("title") or item.get("caption") or "")
        when = format_date(entry_date(item, kind))
        stamp = ('<p class="ft-stamp">%s</p>' % when) if when else ""
        teasers.append(
            '<article class="ft-teaser"><a href="../%s/">'
            '<p class="ft-tag">%s</p><h3>%s</h3></a>%s</article>'
            % (esc(slug), tag, esc(title), stamp)
        )
    label = "More videos" if kind == "video" else "More memes"
    index = "../"
    return (
        '<section class="ft-slice related-slice" aria-label="%s">'
        '<h2 class="ft-slice-head"><a href="%s">%s</a></h2>'
        '<div class="ft-row">%s</div></section>'
        % (label, index, label, "".join(teasers))
    )


def youtube_embed_html(video: dict) -> str:
    ident = youtube_id(video)
    title = str(video.get("title") or "video")
    thumb = "https://i.ytimg.com/vi/%s/hqdefault.jpg" % ident
    return (
        '<div class="media-embed"><div class="frame">'
        '<button type="button" class="yt-play" data-youtube-id="%s" data-title="%s" aria-label="Play %s">'
        '<img src="%s" alt="" width="480" height="360" decoding="async" fetchpriority="high">'
        '<span class="ft-play" aria-hidden="true"></span></button>'
        '<noscript><iframe src="https://www.youtube-nocookie.com/embed/%s" title="%s" '
        'allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" '
        'allowfullscreen></iframe></noscript></div></div>'
        % (esc(ident), esc(title), esc(title), esc(thumb), ident, esc(title))
    )


def x_embed_html(video: dict) -> str:
    x = x_post(video)
    poster = safe_path(video.get("poster"))
    width = int(video["width"]) if str(video.get("width") or "").isdigit() else 16
    height = int(video["height"]) if str(video.get("height") or "").isdigit() else 9
    fallback = ""
    if poster:
        fallback = (
            '<a class="x-fallback" href="%s" target="_blank" rel="noopener noreferrer">'
            '<img src="/%s" alt="" width="%s" height="%s" decoding="async" fetchpriority="high">'
            '<span class="x-fallback-label">Watch on X</span></a>'
            % (esc(x["href"]), esc(poster), width, height)
        )
    return (
        '<div class="media-embed"><div class="frame frame-x">%s'
        '<blockquote class="twitter-tweet" data-dnt="true" data-media-max-width="560">'
        '<a href="%s">%s</a></blockquote></div></div>'
        % (fallback, esc(x["href"]), esc(video.get("title") or "View on X"))
    )


def meme_embed_html(meme: dict) -> str:
    src = meme_key(meme)
    alt = str(meme.get("alt") or meme.get("caption") or "")
    width = int(meme["width"]) if str(meme.get("width") or "").isdigit() else 16
    height = int(meme["height"]) if str(meme.get("height") or "").isdigit() else 9
    return (
        '<div class="media-embed"><figure class="article-pic">'
        '<img src="/%s/%s" alt="%s" width="%s" height="%s" decoding="async" fetchpriority="high">'
        "</figure></div>"
        % ("memes", esc(src), esc(alt), width, height)
    )


def credit_html(kind: str, item: dict) -> str:
    if kind == "video":
        x = x_post(item)
        if x:
            label = safe_credit(str(item.get("credit") or "Post on X"))
            if not label:
                return ""
            return (
                '<p class="credit"><a href="%s" target="_blank" rel="noopener noreferrer">%s</a></p>'
                % (esc(x["href"]), esc(label))
            )
        ident = youtube_id(item)
        if ident:
            return (
                '<p class="credit"><a href="https://www.youtube.com/watch?v=%s" '
                'target="_blank" rel="noopener noreferrer">Watch on YouTube</a></p>'
                % ident
            )
        return ""
    href = str(item.get("href") or "")
    if not re.match(r"^https://", href):
        href = ""
    label = safe_credit(str(item.get("credit") or ""))
    if href and label:
        return (
            '<p class="credit"><a href="%s" target="_blank" rel="noopener noreferrer">%s</a></p>'
            % (esc(href), esc(label))
        )
    if href:
        return (
            '<p class="credit"><a href="%s" target="_blank" rel="noopener noreferrer">Source on X</a></p>'
            % esc(href)
        )
    return ""


def json_ld(kind: str, title: str, description: str, url: str, image: str, item: dict) -> str:
    if kind == "video":
        data = {
            "@context": "https://schema.org",
            "@type": "VideoObject",
            "name": title,
            "description": description,
            "thumbnailUrl": image,
            "url": url,
            "inLanguage": "en",
            "publisher": {"@type": "Organization", "name": SITE, "url": ORIGIN + "/"},
            "isPartOf": {"@type": "WebSite", "name": SITE, "url": ORIGIN + "/"},
        }
        ident = youtube_id(item)
        if ident:
            data["embedUrl"] = "https://www.youtube-nocookie.com/embed/" + ident
        else:
            x = x_post(item)
            if x:
                data["url"] = url
                data["embedUrl"] = x["href"]
        published = entry_date(item, "video")
        if published:
            data["uploadDate"] = published
    else:
        data = {
            "@context": "https://schema.org",
            "@type": "ImageObject",
            "name": title,
            "description": description,
            "contentUrl": ORIGIN + "/memes/" + meme_key(item),
            "url": url,
            "inLanguage": "en",
            "publisher": {"@type": "Organization", "name": SITE, "url": ORIGIN + "/"},
            "isPartOf": {"@type": "WebSite", "name": SITE, "url": ORIGIN + "/"},
        }
    raw = json.dumps(data, ensure_ascii=True, indent=2)
    return raw.replace("<", "\\u003c")


def page_html(
    kind: str,
    item: dict,
    slug: str,
    items: list,
    slugs: dict,
    image_url: str,
    image_alt: str,
    image_extras: str,
) -> str:
    if kind == "video":
        title = str(item.get("title") or "")
        dek = str(item.get("note") or "")
        description = dek or COMMUNITY_VIDEO
        section = "Videos"
        tag = "Video"
        marker = '%s slug="%s" -->' % (VIDEO_MARKER, slug)
        url = "%s/videos/%s/" % (ORIGIN, slug)
        embed = x_embed_html(item) if x_post(item) else youtube_embed_html(item)
        back = "All videos"
        og_type = "video.other"
        key_fn = video_key
        input_id = "newsletter-email-video-%s" % slug
        promo_tag = "video"
    else:
        title = str(item.get("caption") or "Meme")
        dek = ""
        description = (str(item.get("caption") or "").strip() or COMMUNITY_MEME)
        if description == str(item.get("caption") or "").strip():
            description = description + " Filed on Flip the Stock, a community site."
        section = "Memes"
        tag = "Meme"
        marker = '%s slug="%s" -->' % (MEME_MARKER, slug)
        url = "%s/memes/%s/" % (ORIGIN, slug)
        embed = meme_embed_html(item)
        back = "All memes"
        og_type = "article"
        key_fn = meme_key
        input_id = "newsletter-email-meme-%s" % slug
        promo_tag = "meme"

    page_title = "%s — %s" % (title, SITE)
    when = format_date(entry_date(item, kind))
    byline_date = ('<span class="byline-date">%s</span>' % when) if when else ""
    share_x = "https://x.com/intent/post?text=" + q(title) + "&url=" + q(url)
    prefix = "../../"
    chrome_header = sync_chrome.header(prefix, section, True)
    chrome_promo = sync_chrome.promo(input_id, promo_tag)
    chrome_footer = sync_chrome.footer(prefix, True)
    credit = credit_html(kind, item)
    related = related_html(kind, slug, items, slugs, key_fn)
    dek_html = ('          <p class="article-dek">%s</p>\n' % esc(dek)) if dek else ""

    html_out = """%s
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
  <meta property="og:type" content="%s">
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
  <meta name="twitter:image:alt" content="%s">
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
        <article class="article media-item">
          <p class="article-tag"><a class="ft-tag" href="../">%s</a></p>
          <h1>%s</h1>
%s          <div class="byline">
            <p><b>Flip the Stock</b>%s</p>
            <p class="share">
              <a href="%s" target="_blank" rel="noopener noreferrer">Share on X</a>
              <button type="button" class="share-copy" data-url="%s">Copy link</button>
            </p>
          </div>
          %s
          %s
          <p class="article-foot">Nothing here is an offer or financial advice. <a class="back" href="../">%s</a></p>
        </article>
        <aside class="rail" id="media-rail" aria-label="More on this site"></aside>
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
      renderRail(document.getElementById("media-rail"), "../../");
    }
    if (typeof bindMediaEmbed === "function") {
      bindMediaEmbed(document.querySelector(".media-embed"));
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
        marker,
        esc(page_title),
        esc(description),
        esc(url),
        sync_chrome.RSS_LINK,
        esc(SITE),
        esc(og_type),
        esc(page_title),
        esc(description),
        esc(url),
        esc(image_url),
        image_extras,
        esc(image_alt),
        esc(page_title),
        esc(description),
        esc(image_url),
        esc(image_alt),
        sync_chrome.FONTS_LINK,
        json_ld(kind, title, description, url, image_url, item),
        chrome_header,
        esc(tag),
        esc(title),
        dek_html,
        byline_date,
        esc(share_x),
        esc(url),
        embed,
        credit,
        back,
        related,
        chrome_promo,
        chrome_footer,
    )
    return sync_chrome.bust_asset_urls(html_out)


def _share_dest(kind: str, slug: str) -> Path:
    folder = "videos" if kind == "video" else "memes"
    return ROOT / folder / "share" / (slug + ".jpg")


def _share_rel(kind: str, slug: str) -> str:
    folder = "videos" if kind == "video" else "memes"
    return "%s/share/%s.jpg" % (folder, slug)


def build_share(kind: str, item: dict, slug: str) -> tuple[str, str, str, bool]:
    dest = _share_dest(kind, slug)
    rel = _share_rel(kind, slug)
    if kind == "video":
        x = x_post(item)
        poster = ROOT / safe_path(item.get("poster")) if x else None
        source = poster if poster and poster.is_file() else None
        changed = write_share_image(source, dest, "cover", youtube=youtube_id(item))
        alt = share_alt(kind, item)
    else:
        src = meme_key(item)
        source = ROOT / "memes" / src
        if not source.is_file():
            raise SystemExit("media_pages: missing meme image %s" % source)
        changed = write_share_image(source, dest, "contain")
        alt = share_alt(kind, item)
    url, alt, extras = share_meta(rel, alt)
    return url, alt, extras, changed


def remove_stale(kind: str, keep: set[str]) -> list[str]:
    marker = VIDEO_MARKER if kind == "video" else MEME_MARKER
    folder = ROOT / ("videos" if kind == "video" else "memes")
    removed = []
    if not folder.is_dir():
        return removed
    reserved = {"posters", "share", "wall"}
    for path in sorted(folder.iterdir()):
        index = path / "index.html"
        if not path.is_dir() or path.name in reserved or not index.is_file():
            continue
        if path.name in keep:
            continue
        try:
            text = index.read_text()
        except OSError:
            continue
        if marker not in text:
            continue
        index.unlink()
        try:
            path.rmdir()
        except OSError:
            pass
        share = folder / "share" / (path.name + ".jpg")
        if share.is_file():
            share.unlink()
        removed.append(path.name)
    return removed


def hash_redirects(videos: list, memes: list, vslugs: dict, mslugs: dict) -> dict[str, dict[str, str]]:
    video_map = {}
    for item in videos:
        key = video_key(item)
        slug = vslugs.get(key)
        if key and slug:
            video_map["v-" + key] = "./%s/" % slug
    meme_map = {}
    for item in memes:
        key = meme_key(item)
        slug = mslugs.get(key)
        if not key or not slug:
            continue
        name = Path(key).stem
        meme_map["m-" + name] = "./%s/" % slug
    return {
        "videos/index.html": video_map,
        "memes/index.html": meme_map,
    }


def inject_hash_redirect(page_html: str, mapping: dict[str, str]) -> str:
    payload = json.dumps(mapping, ensure_ascii=True, separators=(",", ":"))
    script = (
        '<script>(function(){var h=String(location.hash||"").replace(/^#/,"");'
        "var m=%s;if(h&&m[h])location.replace(m[h]);})();</script>" % payload
    )
    block = "<!-- baked:hash-redirect -->%s<!-- /baked:hash-redirect -->" % script
    marked = re.compile(
        r"<!-- baked:hash-redirect -->.*?<!-- /baked:hash-redirect -->", re.S
    )
    if marked.search(page_html):
        return marked.sub(lambda _m: block, page_html, count=1)
    if "</head>" not in page_html:
        raise RuntimeError("page has no </head> for the hash-redirect script")
    return page_html.replace("</head>", "  " + block + "\n</head>", 1)


def sitemap_entries(videos: list, memes: list, vslugs: dict, mslugs: dict) -> list[tuple[str, str]]:
    entries = []
    for item in videos:
        slug = vslugs.get(video_key(item))
        if slug:
            entries.append(("/videos/%s/" % slug, entry_date(item, "video")))
    for item in memes:
        slug = mslugs.get(meme_key(item))
        if slug:
            entries.append(("/memes/%s/" % slug, entry_date(item, "meme")))
    return entries


def publish(stacks: dict | None = None, check: bool = False) -> list[str]:
    """Write or check every video and meme page. Returns paths that changed."""
    stacks = stacks if stacks is not None else load_stacks()
    videos = valid_videos(stacks)
    memes = valid_memes(stacks)
    vslugs = video_slugs(videos)
    mslugs = meme_slugs(memes)
    changed: list[str] = []

    def write_kind(kind: str, items: list, slugs: dict) -> None:
        keep = set()
        key_fn = video_key if kind == "video" else meme_key
        folder = "videos" if kind == "video" else "memes"
        for item in items:
            key = key_fn(item)
            slug = slugs.get(key)
            if not slug:
                continue
            keep.add(slug)
            image_url, image_alt, extras, share_changed = build_share(kind, item, slug)
            html_out = page_html(kind, item, slug, items, slugs, image_url, image_alt, extras)
            dest = ROOT / folder / slug / "index.html"
            if check:
                if share_changed or not dest.is_file() or dest.read_text() != html_out:
                    changed.append("%s/%s/index.html" % (folder, slug))
                continue
            if share_changed:
                changed.append(_share_rel(kind, slug))
                print("wrote %s" % _share_rel(kind, slug))
            if write_if_changed(dest, html_out):
                changed.append("%s/%s/index.html" % (folder, slug))
                print("wrote %s/%s/index.html" % (folder, slug))
        if check:
            return
        for slug in remove_stale(kind, keep):
            changed.append("%s/%s/ (removed)" % (folder, slug))
            print("removed stale %s/%s/" % (folder, slug))

    # In check mode, do not fetch or rewrite share images just to compare HTML.
    if check:
        for kind, items, slugs in (
            ("video", videos, vslugs),
            ("meme", memes, mslugs),
        ):
            key_fn = video_key if kind == "video" else meme_key
            folder = "videos" if kind == "video" else "memes"
            for item in items:
                slug = slugs.get(key_fn(item))
                if not slug:
                    continue
                dest = ROOT / folder / slug / "index.html"
                share = _share_dest(kind, slug)
                if not dest.is_file() or not share.is_file():
                    changed.append("%s/%s/" % (folder, slug))
                    continue
                image_url, image_alt, extras = share_meta(
                    _share_rel(kind, slug),
                    share_alt(kind, item),
                )
                # Reuse existing share URL; compare the rest of the page loosely
                # by regenerating HTML against the existing image path.
                html_out = page_html(kind, item, slug, items, slugs, image_url, image_alt, extras)
                if dest.read_text() != html_out:
                    changed.append("%s/%s/index.html" % (folder, slug))
        return changed

    write_kind("video", videos, vslugs)
    write_kind("meme", memes, mslugs)
    return changed


def apply_hash_redirects(stacks: dict | None = None) -> dict[str, str]:
    stacks = stacks if stacks is not None else load_stacks()
    videos = valid_videos(stacks)
    memes = valid_memes(stacks)
    mapping = hash_redirects(videos, memes, video_slugs(videos), meme_slugs(memes))
    touched = {}
    for page, table in mapping.items():
        path = ROOT / page
        old = path.read_text()
        new = inject_hash_redirect(old, table)
        if new != old:
            path.write_text(new)
            touched[page] = "updated"
        else:
            touched[page] = "unchanged"
    return touched
