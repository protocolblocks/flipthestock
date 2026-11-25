#!/usr/bin/env python3
"""Single source for the site chrome (FT-style header, newsletter promo, footer).

Run from the repo root after editing the templates below:
    python3 _tools/sync_chrome.py
It rewrites the <header class="mast">, the newsletter promo and the <footer>
on every page so they never drift. Jekyll skips folders starting with "_",
so this file is not published.
"""
import hashlib, re, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent

# Static article pages stamped by _tools/build_articles.py so sync can
# keep their header, footer and font link in step with the rest of the site.
ARTICLE_MARKER = "<!-- generated:article"

# file, link prefix, current nav label, newsletter input id, newsletter tag
PAGES = [
    ("index.html", "", "Home", "newsletter-email-home", "homepage"),
    ("articles/index.html", "../", "Articles", "newsletter-email-articles", "articles"),
    ("articles/piece.html", "../", "Articles", "newsletter-email-article", "article"),
    ("memes/index.html", "../", "Memes", "newsletter-email-memes", "memes"),
    ("videos/index.html", "../", "Videos", "newsletter-email-videos", "videos"),
    ("events/index.html", "../", "Events", "newsletter-email-events", "events"),
    ("explained/index.html", "../", "Explained", "newsletter-email-explained", "learn"),
    ("market-data/index.html", "../", "Market Data", "newsletter-email-market-data", "market-data"),
    ("contact/index.html", "../", None, "newsletter-email-contact", "contact"),
    ("thanks/index.html", "../", None, None, None),
    ("404.html", "/", None, None, None),
]

NAV = [("Home", ""), ("Articles", "articles/"), ("Market Data", "market-data/"),
       ("Events", "events/"), ("Videos", "videos/"), ("Memes", "memes/"), ("Explained", "explained/")]


def header(p, current, has_form):
    nav = "\n".join(
        '          <a href="%s"%s>%s</a>' % ((p + href) or "./", ' aria-current="page"' if label == current else "", label)
        for label, href in NAV)
    sub = "#newsletter" if has_form else ("/" if p == "/" else p) + "#newsletter"
    return '''<!-- chrome:header -->
  <header class="mast">
    <div class="markets">
      <div class="wrap markets-bar">
        <p class="edition"></p>
        <a class="ticker" href="https://www.coingecko.com/en/coins/spx6900" target="_blank" rel="noopener noreferrer" aria-label="SPX6900 price">
          <span class="ticker-live" hidden>Live</span>
          <span class="ticker-name">SPX6900</span>
          <span class="ticker-price">—</span>
          <span class="ticker-change" hidden></span>
          <span class="ticker-source" hidden></span>
        </a>
      </div>
    </div>
    <div class="wrap brand">
      <a class="logo" href="%s">Flip the Stock</a>
      <a class="brand-cta" href="%s">Subscribe</a>
    </div>
    <div class="nav-bar">
      <div class="wrap">
        <nav class="nav-links" aria-label="Site">
%s
        </nav>
      </div>
    </div>
  </header>
  <!-- /chrome:header -->''' % (p or "./", sub, nav)


def promo(input_id, tag):
    return '''<!-- chrome:newsletter -->
  <section class="promo" id="newsletter" aria-label="Newsletter">
    <div class="wrap promo-inner">
      <div class="promo-copy">
        <p class="ft-tag">Newsletter</p>
        <h2>A monthly letter</h2>
        <p class="dek">Keep up with the latest happenings in the SPX6900 community — the writing, the memes, and the videos.</p>
      </div>
      <div class="newsletter">
        <form class="newsletter-form embeddable-buttondown-form" action="https://buttondown.com/api/emails/embed-subscribe/flipthestock" method="post">
          <label for="%s">Email address</label>
          <input id="%s" type="email" name="email" placeholder="you@example.com" autocomplete="email" required>
          <input type="hidden" name="embed" value="1">
          <input type="hidden" name="tag" value="%s">
          <button class="btn" type="submit">Subscribe</button>
        </form>
        <p class="newsletter-help">One email a month. We’ll send a confirmation link first.</p>
      </div>
    </div>
  </section>
  <!-- /chrome:newsletter -->''' % (input_id, input_id, tag)


def footer(p, has_form):
    r = p or "./"
    nl = "#newsletter" if has_form else ("/" if p == "/" else p) + "#newsletter"
    def col(title, links):
        items = "\n".join('            <li>%s</li>' % l for l in links)
        return '''        <div class="foot-col">
          <h2>%s</h2>
          <ul>
%s
          </ul>
        </div>''' % (title, items)
    a = lambda href, text: '<a href="%s">%s</a>' % (href, text)
    ext = lambda href, text: '<a href="%s" target="_blank" rel="noopener noreferrer">%s</a>' % (href, text)
    cols = "\n".join([
        col("Sections", [a(r, "Home"), a(p + "articles/", "Articles"), a(p + "market-data/", "Market Data"),
                         a(p + "events/", "Events"), a(p + "videos/", "Videos"), a(p + "memes/", "Memes"),
                         a(p + "explained/", "Explained")]),
        col("Community", [a(p + "contact/", "Contact"),
                           a(nl, "Newsletter"), a(p + "events/", "Gatherings calendar"),
                           a(p + "feed.xml", "RSS")]),
        col("SPX6900", [ext("https://spx6900.com", "Official site: spx6900.com"),
                        a(p + "explained/#addresses", "Contract addresses"),
                        ext("https://www.coingecko.com/en/coins/spx6900", "Live price on CoinGecko")]),
    ])
    return '''<!-- chrome:footer -->
  <footer class="site-foot">
    <div class="wrap">
      <nav class="foot-cols" aria-label="Footer">
%s
      </nav>
      <div class="foot-print">
        <p>Nothing here is an offer or financial advice. The token can go to zero. Prices in the top bar come from CoinGecko or DexScreener and may be delayed.</p>
        <p>© 2026 Flip the Stock. A user community site for SPX6900.</p>
      </div>
    </div>
    <div class="foot-strip">
      <div class="wrap foot-strip-inner">
        <a class="logo foot-logo" href="%s">Flip the Stock</a>
      </div>
    </div>
  </footer>
  <!-- /chrome:footer -->''' % (cols, r)


def replace(html, pattern, marker, new):
    marked = re.compile(r"<!-- chrome:%s -->.*?<!-- /chrome:%s -->" % (marker, marker), re.S)
    if marked.search(html):
        return marked.sub(lambda m: new, html, count=1)
    if pattern is None:
        return html
    out, n = re.subn(pattern, lambda m: new, html, count=1, flags=re.S)
    if not n:
        raise SystemExit("no %s found" % marker)
    return out


FONTS_LINK = ('<link href="https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@500'
              '&family=Newsreader:opsz,wght@6..72,500;6..72,600&family=Public+Sans:wght@400;500;600;700'
              '&display=swap" rel="stylesheet">')

RSS_LINK = ('<link rel="alternate" type="application/rss+xml" title="Flip the Stock" '
            'href="https://www.flipthestock.com/feed.xml">')


def ensure_rss_link(html):
    pattern = re.compile(r'<link\s+rel="alternate"\s+type="application/rss\+xml"[^>]*>')
    if pattern.search(html):
        return pattern.sub(RSS_LINK, html, count=1)
    return html.replace("</head>", "  %s\n</head>" % RSS_LINK, 1)

def article_pages():
    extra = []
    root = ROOT / "articles"
    if not root.is_dir():
        return extra
    for path in sorted(root.iterdir()):
        index = path / "index.html"
        if not path.is_dir() or not index.is_file():
            continue
        try:
            text = index.read_text()
        except OSError:
            continue
        if ARTICLE_MARKER not in text:
            continue
        slug = path.name
        if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug):
            continue
        extra.append((
            "articles/%s/index.html" % slug,
            "../../",
            "Articles",
            "newsletter-email-article-%s" % slug,
            "article",
        ))
    return extra


def all_pages():
    return list(PAGES) + article_pages()



ASSET_FILES = (
    "site.css",
    "library.js",
    "stacks.js",
    "ticker.js",
    "edition.js",
    "learn-hero.js",
)


def file_version(name: str) -> str:
    path = ROOT / name
    if not path.is_file():
        return "0"
    return hashlib.sha1(path.read_bytes()).hexdigest()[:8]


def bust_asset_urls(html: str) -> str:
    """Append a content-hash query to local CSS and JS so browsers pick up changes."""
    for name in ASSET_FILES:
        ver = file_version(name)
        pattern = re.compile(
            r'((?:href|src)=")(/?(?:\.\./)*)%s(?:\?[^"]*)?(")' % re.escape(name)
        )
        html = pattern.sub(
            lambda m, n=name, v=ver: "%s%s%s?v=%s%s" % (m.group(1), m.group(2), n, v, m.group(3)),
            html,
        )
    return html


def sync():
    for path, p, current, input_id, tag in all_pages():
        f = ROOT / path
        html = f.read_text()
        html = re.sub(r'<link href="https://fonts\.googleapis\.com/css2\?[^"]*" rel="stylesheet">', lambda m: FONTS_LINK, html, count=1)
        html = ensure_rss_link(html)
        has_form = input_id is not None
        html = replace(html, r'<header class="mast">.*?</header>', "header", header(p, current, has_form))
        html = replace(html, r'<footer>.*?</footer>', "footer", footer(p, has_form))
        if has_form and "<!-- chrome:newsletter -->" not in html:
            html = html.replace("<!-- chrome:footer -->", promo(input_id, tag) + "\n\n  <!-- chrome:footer -->", 1)
        elif has_form:
            html = replace(html, None, "newsletter", promo(input_id, tag))
        if "<!-- chrome:footer -->" in html and '<body class="home">' not in html and path == "index.html":
            pass
        html = bust_asset_urls(html)
        f.write_text(html)
        print("synced", path)


if __name__ == "__main__":
    sync()
