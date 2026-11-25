#!/usr/bin/env python3
"""Single source for the site chrome (FT-style header, newsletter promo, footer).

Run from the repo root after editing the templates below:
    python3 _tools/sync_chrome.py
It rewrites the <header class="mast">, the newsletter promo and the <footer>
on every page so they never drift. Jekyll skips folders starting with "_",
so this file is not published.
"""
import re, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent

# file, link prefix, current nav label, newsletter input id, newsletter tag
PAGES = [
    ("index.html", "", "Home", "newsletter-email-home", "homepage"),
    ("articles/index.html", "../", "Articles", "newsletter-email-articles", "articles"),
    ("articles/piece.html", "../", "Articles", "newsletter-email-article", "article"),
    ("memes/index.html", "../", "Memes", "newsletter-email-memes", "memes"),
    ("videos/index.html", "../", "Videos", "newsletter-email-videos", "videos"),
    ("events/index.html", "../", "Events", "newsletter-email-events", "events"),
    ("learn/index.html", "../", "Learn", "newsletter-email-learn", "learn"),
    ("contact/index.html", "../", None, "newsletter-email-contact", "contact"),
    ("thanks/index.html", "../", None, None, None),
    ("404.html", "/", None, None, None),
]

NAV = [("Home", ""), ("Articles", "articles/"), ("Memes", "memes/"), ("Videos", "videos/"),
       ("Events", "events/"), ("Learn", "learn/")]


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
        <a class="ticker" href="https://www.coingecko.com/en/coins/spx6900" target="_blank" rel="noopener noreferrer" aria-label="SPX6900 price on CoinGecko">
          <span class="ticker-live">Live</span>
          <span class="ticker-name">SPX6900</span>
          <span class="ticker-price">—</span>
          <span class="ticker-change" hidden></span>
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
        col("Sections", [a(r, "Home"), a(p + "articles/", "Articles"), a(p + "memes/", "Memes"),
                         a(p + "videos/", "Videos"), a(p + "events/", "Events"), a(p + "learn/", "Learn")]),
        col("Community", [a(p + "contact/", "Contact"), ext("https://x.com/BankerHQ", "DM @BankerHQ on X"),
                          a(nl, "Newsletter"), a(p + "events/", "Gatherings calendar")]),
        col("SPX6900", [ext("https://spx6900.com", "Official site: spx6900.com"),
                        a(p + "learn/#addresses", "Contract addresses"),
                        ext("https://www.coingecko.com/en/coins/spx6900", "Live price on CoinGecko")]),
        col("About", ['<span>An independent fan site</span>', '<span>Not affiliated with SPX6900</span>',
                      a(("/" if p == "/" else p) + "sitemap.xml", "Sitemap")]),
    ])
    return '''<!-- chrome:footer -->
  <footer class="site-foot">
    <div class="wrap">
      <nav class="foot-cols" aria-label="Footer">
%s
      </nav>
      <div class="foot-print">
        <p>Nothing here is an offer or financial advice. The token can go to zero. Prices in the top bar come from CoinGecko and may be delayed.</p>
        <p>© 2026 Flip the Stock. An independent fan site for SPX6900; not affiliated with the project.</p>
      </div>
    </div>
    <div class="foot-strip">
      <div class="wrap foot-strip-inner">
        <a class="logo foot-logo" href="%s">Flip the Stock</a>
        <span>A fan page for SPX6900</span>
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


for path, p, current, input_id, tag in PAGES:
    f = ROOT / path
    html = f.read_text()
    has_form = input_id is not None
    html = replace(html, r'<header class="mast">.*?</header>', "header", header(p, current, has_form))
    html = replace(html, r'<footer>.*?</footer>', "footer", footer(p, has_form))
    if has_form and "<!-- chrome:newsletter -->" not in html:
        html = html.replace("<!-- chrome:footer -->", promo(input_id, tag) + "\n\n  <!-- chrome:footer -->", 1)
    elif has_form:
        html = replace(html, None, "newsletter", promo(input_id, tag))
    if "<!-- chrome:footer -->" in html and '<body class="home">' not in html and path == "index.html":
        pass
    f.write_text(html)
    print("synced", path)
