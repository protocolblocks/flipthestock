(function () {
  // Set by _tools/bake_pages.js while it writes the static copy of each list into
  // the HTML. In that mode dates are absolute and times are in Mountain, so the
  // baked markup never goes stale-wrong. Browsers never set this flag.
  var BAKING = !!window.STACKS_BAKE_MODE;

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function data() {
    var stacks = window.STACKS || {};
    return {
      articles: Array.isArray(stacks.articles) ? stacks.articles : [],
      memes: Array.isArray(stacks.memes) ? stacks.memes : [],
      videos: Array.isArray(stacks.videos) ? stacks.videos : [],
      events: Array.isArray(stacks.events) ? stacks.events : []
    };
  }

  function formatDate(iso) {
    var date = new Date(String(iso) + "T00:00:00");
    if (isNaN(date.getTime())) return esc(iso);
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  }

  var BLOCKED_X_HANDLES = { flipthestock: true };

  function xHandle(value) {
    var handle = String(value || "").replace(/^@/, "");
    if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) return "";
    if (BLOCKED_X_HANDLES[handle.toLowerCase()]) return "";
    return handle;
  }

  function safeHttpUrl(value) {
    var url = String(value || "");
    var match = url.match(/^https:\/\/([A-Za-z0-9.-]+)(\/[^\s]*)$/);
    if (!match) return "";
    var host = match[1].toLowerCase();
    var allowed = {
      "x.com": true,
      "www.x.com": true,
      "twitter.com": true,
      "www.twitter.com": true,
      "luma.com": true,
      "www.luma.com": true,
      "meetup.com": true,
      "www.meetup.com": true,
      "youtube.com": true,
      "www.youtube.com": true,
      "youtu.be": true,
      "my.weezevent.com": true
    };
    if (!allowed[host]) return "";
    if (/\/(?:FlipTheStock|flipthestock)(?:\/|$|\?)/i.test(url)) return "";
    return url;
  }

  function parseStamp(value) {
    if (!value) return NaN;
    var time = Date.parse(value);
    return isNaN(time) ? NaN : time;
  }

  function eventEndTime(event) {
    var end = parseStamp(event && event.end);
    if (!isNaN(end)) return end;
    var start = parseStamp(event && event.start);
    if (isNaN(start)) return NaN;
    return start + 2 * 60 * 60 * 1000;
  }

  function isStanding(event) {
    return !!(event && event.standing);
  }

  function isExpired(event, now) {
    var end = eventEndTime(event);
    return !isNaN(end) && end <= (now || Date.now());
  }

  function isUpcoming(event, now) {
    return !!(event && event.start && !isStanding(event) && !isExpired(event, now));
  }

  function isRecent(event, now) {
    return !!(event && event.start && !isStanding(event) && event.type === "in-person" && isExpired(event, now));
  }

  function sortByStart(a, b) {
    return parseStamp(a.start) - parseStamp(b.start);
  }

  function upcomingEvents(now) {
    return data().events.filter(function (event) {
      return isUpcoming(event, now);
    }).sort(sortByStart);
  }

  function standingEvents() {
    return data().events.filter(isStanding);
  }

  function recentEvents(now) {
    return data().events.filter(function (event) {
      return isRecent(event, now);
    }).sort(function (a, b) {
      return parseStamp(b.start) - parseStamp(a.start);
    });
  }

  function firstUpcomingOfType(type, now) {
    var list = upcomingEvents(now);
    for (var i = 0; i < list.length; i++) {
      if (list[i].type === type) return list[i];
    }
    return null;
  }

  function clockInZone(date, timeZone) {
    var text = date.toLocaleTimeString("en-GB", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: timeZone
    });
    return text.replace(/\s*(am|pm)/i, function (_, mer) {
      return mer.toLowerCase() === "am" ? " a.m." : " p.m.";
    });
  }

  function formatLocalWhen(date) {
    var dayOpts = {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    };
    var timeOpts = {
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    };
    if (BAKING) {
      dayOpts.timeZone = "America/Edmonton";
      timeOpts.timeZone = "America/Edmonton";
    } else {
      timeOpts.timeZoneName = "short";
    }
    var day = date.toLocaleDateString("en-GB", dayOpts);
    var time = date.toLocaleTimeString("en-GB", timeOpts).replace(/\s*(am|pm)/i, function (_, mer) {
      return mer.toLowerCase() === "am" ? " a.m." : " p.m.";
    });
    return day + ", " + time + (BAKING ? " MT" : "");
  }

  function zoneHints(date) {
    return clockInZone(date, "America/Edmonton") + " Mountain, " +
      clockInZone(date, "America/New_York") + " Eastern";
  }

  function typeLabel(event) {
    return event && event.type === "in-person" ? "In person" : "X Space";
  }

  function hostHtml(event) {
    var raw = String(event && event.host || "");
    if (raw.charAt(0) === "@") {
      var handle = xHandle(raw);
      if (handle) {
        return '<a class="text-link" href="https://x.com/' + handle + '" target="_blank" rel="noopener noreferrer">@' + esc(handle) + '</a>';
      }
    }
    return raw ? esc(raw) : "";
  }

  function eventLinks(event) {
    var url = safeHttpUrl(event && event.url);
    var source = safeHttpUrl(event && event.source);
    var parts = [];
    if (url) {
      var label = event.type === "in-person" ? "Tickets or details" : "Space link";
      if (/meetup\.com/i.test(url)) label = "Meetup";
      if (/luma\.com/i.test(url)) label = "Tickets";
      if (/youtube\.com|youtu\.be/i.test(url)) label = "Livestream";
      parts.push('<a class="text-link" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + label + '</a>');
    }
    if (source && source !== url) {
      parts.push('<a class="text-link" href="' + esc(source) + '" target="_blank" rel="noopener noreferrer">Source</a>');
    }
    return parts.join('<span class="event-sep"> · </span>');
  }

  function eventWhenHtml(event) {
    var start = parseStamp(event && event.start);
    if (isNaN(start)) return "";
    var date = new Date(start);
    var local = formatLocalWhen(date);
    var hints = zoneHints(date);
    var flag = event.inferred ? '<span class="flag">Expected</span>' : "";
    return '<p class="when">' + flag + esc(local) + '</p><p class="when-hint">' + esc(hints) + '</p>';
  }

  function eventItemHtml(event, opts) {
    opts = opts || {};
    var compact = !!opts.compact;
    var kicker = typeLabel(event);
    var title = esc(event.title || "Gathering");
    var host = hostHtml(event);
    var when = eventWhenHtml(event);
    var location = event.location ? '<p class="event-place">' + esc(event.location) + '</p>' : "";
    var note = !compact && event.note ? '<p class="event-note">' + esc(event.note) + '</p>' : "";
    var links = eventLinks(event);
    var hostLine = host ? '<p class="credit">Hosted by ' + host + '</p>' : "";
    if (compact) {
      return '<article class="event event-compact">' +
        '<p class="kicker">' + esc(kicker) + '</p>' +
        '<h3>' + title + '</h3>' +
        when +
        (links ? '<p class="event-links">' + links + '</p>' : "") +
        '</article>';
    }
    return '<article class="event">' +
      '<p class="kicker">' + esc(kicker) + '</p>' +
      '<h2>' + title + '</h2>' +
      when +
      hostLine +
      location +
      note +
      (links ? '<p class="event-links">' + links + '</p>' : "") +
      '</article>';
  }

  function standingItemHtml(event) {
    var host = hostHtml(event);
    var links = eventLinks(event);
    return '<article class="event">' +
      '<p class="kicker">' + esc(typeLabel(event)) + '</p>' +
      '<h2>' + esc(event.title || "Gathering") + '</h2>' +
      (host ? '<p class="credit">Hosted by ' + host + '</p>' : "") +
      (event.location ? '<p class="event-place">' + esc(event.location) + '</p>' : "") +
      (event.note ? '<p class="event-note">' + esc(event.note) + '</p>' : "") +
      (links ? '<p class="event-links">' + links + '</p>' : "") +
      '</article>';
  }

  window.renderEvents = function (root) {
    if (!root) return;
    var upcoming = upcomingEvents();
    var regulars = standingEvents();
    var recent = recentEvents();
    var html = "";
    html += '<section class="event-band" aria-label="Upcoming">' +
      '<h2 class="col-head">Upcoming</h2>';
    if (upcoming.length) {
      html += upcoming.map(function (event) { return eventItemHtml(event, {}); }).join("");
    } else {
      html += '<p class="event-empty">Nothing dated is on the calendar just now. The regulars below still stand.</p>';
    }
    html += '</section>';
    html += '<section class="event-band" aria-label="Regulars">' +
      '<h2 class="col-head">Regulars</h2>';
    if (regulars.length) {
      html += regulars.map(standingItemHtml).join("");
    } else {
      html += '<p class="event-empty">No regular gatherings are listed.</p>';
    }
    html += '</section>';
    html += '<section class="event-band" aria-label="Recent">' +
      '<h2 class="col-head">Recent</h2>';
    if (recent.length) {
      html += recent.map(function (event) { return eventItemHtml(event, {}); }).join("");
    } else {
      html += '<p class="event-empty">No recent gatherings are listed.</p>';
    }
    html += '</section>';
    root.innerHTML = html;
  };

  function pieceHref(prefix, slug) {
    var safe = String(slug || "");
    if (!/^[a-z0-9-]+$/.test(safe)) return prefix || "./";
    return (prefix || "") + safe + "/";
  }

  function safeImage(src) {
    var path = String(src || "");
    if (!/^[A-Za-z0-9_./-]+$/.test(path) || path.indexOf("..") !== -1) return "";
    return path;
  }


  function articleImage(article) {
    var src = safeImage(article && article.image);
    if (!src) return null;
    var width = parseInt(article.image_width || article.imageWidth, 10);
    var height = parseInt(article.image_height || article.imageHeight, 10);
    if (!(width > 0 && height > 0)) {
      width = 16;
      height = 9;
    }
    return {
      src: src,
      alt: article.image_alt || article.imageAlt || "",
      width: width,
      height: height
    };
  }

  function articlePicHtml(article) {
    var img = articleImage(article);
    if (!img) return "";
    return '<figure class="article-pic"><img src="/' + esc(img.src) + '" alt="' + esc(img.alt) + '" width="' + img.width + '" height="' + img.height + '"></figure>';
  }

  function empty(title, text) {
    return '<div class="empty"><div class="idx">Empty</div><h2>' + esc(title) + '</h2><p>' + esc(text) + '</p></div>';
  }

  var VIDEO_PAGE_SIZE = 7;
  var MEME_PAGE_SIZE = 7;

  function youtubeId(video) {
    var id = String(video && video.id || "");
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : "";
  }

  function xPost(video) {
    var url = String(video && video.x || "");
    var match = url.match(/^https:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/([A-Za-z0-9_]+)\/status\/(\d+)(?:[/?#].*)?$/);
    if (!match || !safeImage(video.poster)) return null;
    return { user: match[1], id: match[2], href: "https://x.com/" + match[1] + "/status/" + match[2] };
  }

  function videoKey(video) {
    var yt = youtubeId(video);
    if (yt) return yt;
    var x = xPost(video);
    return x ? x.id : "";
  }

  function posterSrc(path) {
    var safe = safeImage(path);
    if (!safe) return "";
    return "/" + safe.replace(/^\//, "");
  }

  function validVideos() {
    return data().videos.filter(function (video) {
      return !!videoKey(video);
    });
  }

  function clampPage(page, totalPages) {
    var n = parseInt(page, 10);
    if (!(n > 0)) n = 1;
    if (totalPages < 1) return 1;
    return n > totalPages ? totalPages : n;
  }

  function pageFromSearch() {
    try {
      return clampPage(new URLSearchParams(location.search).get("page"), Number.MAX_SAFE_INTEGER);
    } catch (err) {
      return 1;
    }
  }

  function setPageQuery(page) {
    var url = new URL(location.href);
    if (page <= 1) url.searchParams.delete("page");
    else url.searchParams.set("page", String(page));
    url.hash = "";
    var next = url.pathname + url.search;
    if (next !== location.pathname + location.search + location.hash) {
      history.replaceState(null, "", next);
    }
  }

  function pageForVideoHash(videos) {
    var hash = String(location.hash || "").replace(/^#/, "");
    if (!hash) return 0;
    for (var i = 0; i < videos.length; i++) {
      var key = videoKey(videos[i]);
      if (key && "v-" + key === hash) return Math.floor(i / VIDEO_PAGE_SIZE) + 1;
    }
    return 0;
  }

  function loadTwitterWidgets(root) {
    if (!root || !root.querySelector || !root.querySelector(".twitter-tweet")) return;
    function paint() {
      if (!window.twttr || !window.twttr.widgets) return false;
      if (window.twttr.events && !loadTwitterWidgets.bound) {
        loadTwitterWidgets.bound = true;
        window.twttr.events.bind("rendered", function (el) {
          var frame = el && el.closest ? el.closest(".frame-x") : null;
          if (frame) frame.classList.add("is-ready");
        });
      }
      window.twttr.widgets.load(root);
      return true;
    }
    if (paint()) return;
    var script = document.getElementById("twitter-wjs");
    if (!script) {
      script = document.createElement("script");
      script.id = "twitter-wjs";
      script.async = true;
      script.src = "https://platform.twitter.com/widgets.js";
      document.body.appendChild(script);
    }
    script.addEventListener("load", function () { paint(); });
  }

  function validMemes() {
    return data().memes.filter(function (meme) {
      return !!safeImage(meme.src);
    });
  }

  function memeAnchor(src) {
    var name = String(src || "").split("/").pop().replace(/\.[A-Za-z0-9]+$/, "");
    if (!/^[A-Za-z0-9_-]+$/.test(name)) return "";
    return "m-" + name;
  }

  // Cover for the left-hand "This issue" thumbnail. Uses the archive only
  // (everything after memes[0]), so it never matches the featured meme on
  // the main hero. The index is (library length * 7) % archive length: it
  // changes when the daily routine prepends a new memes[0], and 7 keeps the
  // pick from always being the previous day's neighbour.
  function archiveCoverMeme() {
    var memes = validMemes();
    if (memes.length < 2) return null;
    var leadSrc = safeImage(memes[0].src);
    var archive = memes.slice(1).filter(function (meme) {
      var src = safeImage(meme.src);
      return src && src !== leadSrc;
    });
    if (!archive.length) return null;
    return archive[(memes.length * 7) % archive.length];
  }

  function pageForMemeHash(memes) {
    var hash = String(location.hash || "").replace(/^#/, "");
    if (!hash) return 0;
    for (var i = 0; i < memes.length; i++) {
      var id = memeAnchor(memes[i].src);
      if (id && id === hash) return Math.floor(i / MEME_PAGE_SIZE) + 1;
    }
    return 0;
  }

  function pagerHtml(page, totalPages, label) {
    if (totalPages <= 1) return "";
    var html = '<nav class="pager" aria-label="' + esc(label || "Video pages") + '">';
    html += page > 1
      ? '<button type="button" data-page="' + (page - 1) + '">Previous</button>'
      : '<button type="button" disabled>Previous</button>';
    for (var i = 1; i <= totalPages; i++) {
      html += i === page
        ? '<button type="button" data-page="' + i + '" aria-current="page">' + i + '</button>'
        : '<button type="button" data-page="' + i + '">' + i + '</button>';
    }
    html += page < totalPages
      ? '<button type="button" data-page="' + (page + 1) + '">Next</button>'
      : '<button type="button" disabled>Next</button>';
    return html + '</nav>';
  }

  function placePager(root, page, totalPages, onPage, label) {
    var existing = root.nextElementSibling;
    if (existing && existing.classList.contains("pager")) existing.remove();
    if (totalPages <= 1) return;
    root.insertAdjacentHTML("afterend", pagerHtml(page, totalPages, label));
    root.nextElementSibling.addEventListener("click", function (event) {
      var button = event.target.closest("button[data-page]");
      if (!button || button.disabled) return;
      var next = parseInt(button.getAttribute("data-page"), 10);
      if (next > 0) onPage(next);
    });
  }

  var SITE = "Flip the Stock";
  var ORIGIN = "https://www.flipthestock.com";

  function metaContent(id, value) {
    var el = document.getElementById(id);
    if (el) el.setAttribute("content", value);
  }

  function setPieceMeta(title, description, url, type, jsonLd, robots) {
    document.title = title;
    metaContent("meta-description", description);
    metaContent("og-title", title);
    metaContent("og-description", description);
    metaContent("og-url", url);
    metaContent("og-type", type);
    metaContent("twitter-title", title);
    metaContent("twitter-description", description);
    metaContent("meta-robots", robots);
    var canonical = document.getElementById("canonical");
    if (canonical) canonical.setAttribute("href", url);
    var ld = document.getElementById("page-jsonld");
    if (ld && jsonLd) ld.textContent = JSON.stringify(jsonLd).replace(/</g, "\\u003c");
  }

  window.renderArticles = function (root) {
    var articles = sortedArticles();
    if (!articles.length) {
      root.innerHTML = empty("The shelf is empty.", "Written pieces will be filed here, newest first.");
      return;
    }
    var lead = articles[0];
    var leadHref = pieceHref("", lead.slug);
    var html = '<a class="sec-lead" href="' + leadHref + '">' +
      '<span class="ft-tag">' + esc(lead.kicker || "Latest") + '</span>' +
      '<span class="sec-lead-title">' + esc(lead.title) + '</span>' +
      '<span class="ft-dek">' + esc(lead.dek) + '</span>' +
      '<span class="ft-stamp">' + esc(stampText(lead.date)) + '</span></a>';
    var lastDate = null;
    html += '<h2 class="col-head">Latest articles</h2><ol class="stream">' + articles.slice(1).map(function (article) {
      var showDate = article.date !== lastDate;
      lastDate = article.date;
      return '<li class="stream-item"><p class="stream-date">' + (showDate ? formatDate(article.date) : "") + '</p>' +
        '<a class="stream-body" href="' + pieceHref("", article.slug) + '">' +
        '<span class="ft-tag">' + esc(article.kicker || "Latest") + '</span>' +
        '<span class="stream-title">' + esc(article.title) + '</span>' +
        '<span class="ft-dek">' + esc(article.dek) + '</span>' +
        '<span class="ft-stamp">' + esc(stampText(article.date)) + '</span></a></li>';
    }).join("") + '</ol>';
    root.innerHTML = html;
  };

  window.renderPiece = function (root) {
    var params = new URLSearchParams(window.location.search);
    var slug = params.get("slug");
    var article = data().articles.filter(function (item) { return item.slug === slug; })[0];
    if (!article) {
      root.innerHTML = '<a class="back" href="./">All articles</a>' +
        empty("That piece is not on the shelf.", "The link may be old, or the piece has not been filed yet.");
      var missingUrl = ORIGIN + "/articles/";
      var missingDescription = "That piece is not on the shelf. The link may be old, or it has not been filed yet.";
      setPieceMeta(
        "Article not found — " + SITE,
        missingDescription,
        missingUrl,
        "website",
        {
          "@context": "https://schema.org",
          "@type": "WebPage",
          "name": "Article not found",
          "url": missingUrl,
          "description": missingDescription,
          "isPartOf": { "@type": "WebSite", "name": SITE, "url": ORIGIN + "/" },
          "inLanguage": "en"
        },
        "noindex, follow"
      );
      return;
    }
    var pieceUrl = ORIGIN + "/articles/piece.html?slug=" + encodeURIComponent(article.slug || "");
    var pieceDescription = article.dek || "A written piece on SPX6900, filed on Flip the Stock.";
    var articleLd = {
      "@context": "https://schema.org",
      "@type": "Article",
      "headline": article.title,
      "description": pieceDescription,
      "inLanguage": "en",
      "mainEntityOfPage": pieceUrl,
      "url": pieceUrl,
      "image": (function () {
        var img = articleImage(article);
        return img ? ORIGIN + "/" + img.src : ORIGIN + "/assets/og.png";
      })(),
      "author": { "@type": "Organization", "name": SITE, "url": ORIGIN + "/" },
      "publisher": { "@type": "Organization", "name": SITE, "url": ORIGIN + "/" },
      "isPartOf": { "@type": "WebSite", "name": SITE, "url": ORIGIN + "/" }
    };
    if (article.date) articleLd.datePublished = article.date;
    setPieceMeta(
      article.title + " — " + SITE,
      pieceDescription,
      pieceUrl,
      "article",
      articleLd,
      "index, follow"
    );
    var body = String(article.html || "").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
    var shareX = "https://x.com/intent/post?text=" + encodeURIComponent(article.title) + "&url=" + encodeURIComponent(pieceUrl);
    var more = sortedArticles().filter(function (item) { return item.slug !== article.slug; }).slice(0, 4);
    root.innerHTML = '<div class="article-layout"><article class="article">' +
      '<p class="article-tag"><a class="ft-tag" href="./">' + esc(article.kicker || "Articles") + '</a></p>' +
      '<h1>' + esc(article.title) + '</h1>' +
      '<p class="article-dek">' + esc(article.dek) + '</p>' +
      '<div class="byline"><p><b>Flip the Stock</b>' +
      (article.date ? '<span class="byline-date">' + formatDate(article.date) + '</span>' : '') + '</p>' +
      '<p class="share"><a href="' + esc(shareX) + '" target="_blank" rel="noopener noreferrer">Share on X</a>' +
      '<button type="button" class="share-copy" data-url="' + esc(pieceUrl) + '">Copy link</button></p></div>' +
      articlePicHtml(article) +
      '<div class="article-body">' + body + '</div>' +
      '<p class="article-foot">Nothing here is an offer or financial advice. <a class="back" href="./">All articles</a></p></article>' +
      '<aside class="rail" id="article-rail" aria-label="More on this site"></aside></div>' +
      (more.length ? '<section class="ft-slice related-slice" aria-label="More from Flip the Stock">' +
        '<h2 class="ft-slice-head"><a href="./">More from Flip the Stock</a></h2><div class="ft-row">' +
        more.map(function (item) {
          return '<article class="ft-teaser"><a href="' + pieceHref("", item.slug) + '">' +
            '<p class="ft-tag">' + esc(item.kicker || "Latest") + '</p><h3>' + esc(item.title) + '</h3>' +
            '<p class="ft-dek">' + esc(item.dek) + '</p></a>' + stampHtml(item.date) + '</article>';
        }).join("") + '</div></section>' : '');
    renderRail(document.getElementById("article-rail"), "../");
    var copy = root.querySelector(".share-copy");
    if (copy) copy.addEventListener("click", function () {
      var url = copy.getAttribute("data-url");
      if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { copy.textContent = "Link copied"; });
    });
  };

  function safePostUrl(value) {
    var url = String(value || "");
    if (!/^https:\/\/(x\.com|twitter\.com)\/[A-Za-z0-9_./?=&%-]+$/.test(url)) return "";
    return url;
  }

  function sortedArticles() {
    return data().articles.slice().sort(function (a, b) {
      return String(b.date || "").localeCompare(String(a.date || ""));
    });
  }

  function stampText(iso) {
    var m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return "";
    var then = Date.UTC(+m[1], +m[2] - 1, +m[3]);
    var today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Edmonton" }).split("-");
    var now = Date.UTC(+today[0], +today[1] - 1, +today[2]);
    var days = Math.round((now - then) / 86400000);
    if (!BAKING) {
      if (days === 0) return "Today";
      if (days === 1) return "Yesterday";
      if (days > 1 && days < 7) return days + " days ago";
    }
    return new Date(then + 43200000).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  }

  function stampHtml(iso) {
    var text = stampText(iso);
    return text ? '<p class="ft-stamp">' + esc(text) + '</p>' : "";
  }

  function frontMemes() {
    return validMemes();
  }

  function frontGatheringHtml(eventsHref) {
    var online = firstUpcomingOfType("online");
    var inPerson = firstUpcomingOfType("in-person");
    var items = "";
    if (online) items += eventItemHtml(online, { compact: true });
    if (inPerson) items += eventItemHtml(inPerson, { compact: true });
    if (!items) {
      items = '<p class="event-empty">Nothing dated is on the calendar just now. The regulars still meet.</p>';
    }
    return '<aside class="ft-picks next-box" aria-label="Next gathering">' +
      '<p class="ft-label"><a href="' + esc(eventsHref) + '">Next gathering</a></p>' + items +
      '<p class="ft-all"><a class="more" href="' + esc(eventsHref) + '">All gatherings</a></p></aside>';
  }

  function teaserHtml(article, withDek) {
    return '<article class="ft-teaser"><a href="' + pieceHref("articles/", article.slug) + '">' +
      '<p class="ft-tag">' + esc(article.kicker || "Latest") + '</p>' +
      '<h3>' + esc(article.title) + '</h3>' +
      (withDek && article.dek ? '<p class="ft-dek">' + esc(article.dek) + '</p>' : '') +
      '</a>' + stampHtml(article.date) + '</article>';
  }

  window.renderNews = function (root) {
    var articles = sortedArticles();
    var memes = frontMemes();
    var picks = frontGatheringHtml("events/");
    if (!articles.length) {
      root.innerHTML = '<section class="ft-hero">' +
        '<div class="ft-lead">' + empty("Nothing filed yet.", "The latest piece will lead this page.") + '</div>' +
        '<div class="ft-feature"></div>' + picks + '</section>';
      return;
    }
    var lead = articles[0];
    var leadHref = pieceHref("articles/", lead.slug);
    var related = articles.slice(1, 3);
    var leadHtml = '<div class="ft-lead">' +
      '<a href="' + leadHref + '">' +
      '<p class="ft-tag">' + esc(lead.kicker || "Cover") + '</p>' +
      '<h2>' + esc(lead.title) + '</h2>' +
      '<p class="ft-dek">' + esc(lead.dek) + '</p></a>' +
      stampHtml(lead.date) +
      (related.length ? '<ul class="ft-related">' + related.map(function (article) {
        return '<li><a href="' + pieceHref("articles/", article.slug) + '">' + esc(article.title) + '</a></li>';
      }).join("") + '</ul>' : '') +
      '</div>';

    var featureHtml = '<div class="ft-feature"></div>';
    var meme = memes[0];
    if (meme) {
      var src = safeImage(meme.src);
      var id = memeAnchor(src);
      var href = "memes/" + (id ? "#" + id : "");
      featureHtml = '<div class="ft-feature"><a href="' + href + '">' +
        '<span class="ft-feature-pic"><img class="pic" src="memes/' + esc(src) + '" alt="' + esc(meme.alt || "") + '" onerror="this.onerror=null;this.src=\'assets/cover.jpg\'"></span>' +
        '<span class="ft-feature-panel"><span class="ft-tag">Featured meme</span>' +
        '<span class="ft-feature-title">' + esc(meme.caption || "") + '</span></span></a></div>';
    }

    var top = articles.slice(3, 6);
    var topHtml = top.length
      ? '<section class="ft-slice" aria-label="Top stories">' +
        '<h2 class="ft-slice-head"><a href="articles/">Top stories</a></h2>' +
        '<div class="ft-row">' + top.map(function (a) { return teaserHtml(a, true); }).join("") +
        '<aside class="ft-most" id="most-read-slot" aria-label="Latest"></aside></div></section>'
      : '<section class="ft-slice" aria-label="Latest"><div class="ft-row"><aside class="ft-most" id="most-read-slot" aria-label="Latest"></aside></div></section>';

    root.innerHTML = '<section class="ft-hero" aria-label="Lead stories">' + leadHtml + featureHtml + picks + '</section>' + topHtml;
    renderMostRead(document.getElementById("most-read-slot"));
  };

  window.renderMostRead = function (root, prefix) {
    if (!root) return;
    prefix = prefix || "";
    var most = sortedArticles().slice(0, 5).map(function (article, index) {
      return '<li><span class="ft-num">' + (index + 1) + '</span><a href="' + pieceHref(prefix + "articles/", article.slug) + '">' +
        esc(article.title) + '</a></li>';
    }).join("");
    root.innerHTML = '<p class="ft-most-head"><a href="' + esc(prefix) + 'articles/">Latest</a></p>' +
      (most ? '<ol class="ft-most-list">' + most + '</ol>' : '<p class="event-empty">Nothing filed yet.</p>');
  };

  /* Right rail for section and article pages, like ft.com's: Latest,
     the next gathering, and a newsletter nudge. */
  window.renderRail = function (root, prefix, opts) {
    if (!root) return;
    opts = opts || {};
    prefix = prefix || "../";
    var html = '<section class="rail-block" aria-label="Latest"><div class="ft-most" data-most></div></section>';
    if (!opts.noEvents) {
      var online = firstUpcomingOfType("online");
      var inPerson = firstUpcomingOfType("in-person");
      var items = "";
      if (online) items += eventItemHtml(online, { compact: true });
      if (inPerson) items += eventItemHtml(inPerson, { compact: true });
      if (!items) items = '<p class="event-empty">Nothing dated is on the calendar just now. The regulars still meet.</p>';
      html += '<section class="rail-block ft-picks" aria-label="Next gathering"><h2 class="rail-head"><a href="' + esc(prefix) + 'events/">Next gathering</a></h2>' +
        items + '</section>';
    }
    html += '<section class="rail-block rail-letter" aria-label="Newsletter"><h2 class="rail-head">The monthly letter</h2>' +
      '<p>The writing, the memes, and the videos, once a month.</p>' +
      '<p><a class="btn" href="#newsletter">Sign up</a></p></section>';
    root.innerHTML = html;
    renderMostRead(root.querySelector("[data-most]"), prefix);
  };

  function postedDate(entry) {
    var fmt = { day: "numeric", month: "long", year: "numeric", timeZone: "America/Edmonton" };
    if (entry.date && /^\d{4}-\d{2}-\d{2}$/.test(String(entry.date))) {
      var parts = String(entry.date).split("-");
      return new Date(Date.UTC(+parts[0], +parts[1] - 1, +parts[2], 12)).toLocaleDateString("en-GB", fmt);
    }
    var m = String(entry.x || entry.href || "").match(/\/status\/(\d{15,20})/);
    if (m) return new Date(Math.floor(Number(m[1]) / 4194304) + 1288834974657).toLocaleDateString("en-GB", fmt);
    var d = String(entry.note || "").match(/\b(\d{1,2} (?:January|February|March|April|May|June|July|August|September|October|November|December) \d{4})\b/);
    return d ? d[1] : "";
  }

  window.renderFrontMemes = function (root) {
    var memes = frontMemes().slice(1, 5);
    if (!memes.length) {
      root.innerHTML = empty("Nothing on the wall.", "Meme images will be hung here.");
      return;
    }
    root.innerHTML = memes.map(function (meme) {
      var src = safeImage(meme.src);
      if (!src) return "";
      var href = safePostUrl(meme.href);
      var open = href
        ? '<a href="' + esc(href) + '" target="_blank" rel="noopener noreferrer">'
        : '<a href="memes/">';
      var when = postedDate(meme);
      return '<article class="ft-card">' + open +
        '<span class="ft-thumb ft-thumb-meme"><img class="pic" src="memes/' + esc(src) + '" alt="' + esc(meme.alt || "") + '"></span>' +
        '<span class="ft-card-body"><span class="ft-tag">Meme</span>' +
        '<span class="ft-card-title">' + esc(meme.caption) + '</span>' +
        (when ? '<span class="ft-stamp">' + esc(when) + '</span>' : '') + '</span></a></article>';
    }).join("");
  };

  window.renderFrontVideos = function (root) {
    var videos = validVideos().slice(0, 4);
    if (!videos.length) {
      root.innerHTML = empty("No reels filed.", "The best videos will play here.");
      return;
    }
    root.innerHTML = videos.map(function (video, index) {
      var key = videoKey(video);
      if (!key) return "";
      var note = postedDate(video);
      var x = xPost(video);
      var thumb = x
        ? posterSrc(video.poster)
        : "https://i.ytimg.com/vi/" + youtubeId(video) + "/hqdefault.jpg";
      return '<article class="ft-card"><a href="videos/#v-' + key + '">' +
        '<span class="ft-thumb"><img class="pic" src="' + esc(thumb) + '" alt=""><span class="ft-play" aria-hidden="true"></span></span>' +
        '<span class="ft-card-body"><span class="ft-tag">' + (index === 0 ? "Featured video" : "Video") + '</span>' +
        '<span class="ft-card-title">' + esc(video.title) + '</span>' +
        (note ? '<span class="ft-stamp">' + esc(note) + '</span>' : '') + '</span></a></article>';
    }).join("");
  };

  window.renderMemes = function (root) {
    var memes = validMemes();
    if (!memes.length) {
      root.innerHTML = empty("Nothing on the wall.", "Meme images will be hung here.");
      placePager(root, 1, 0);
      return;
    }

    if (root.getAttribute("data-viewer") !== "on") {
      root.setAttribute("data-viewer", "on");
      root.addEventListener("click", function (event) {
        var button = event.target.closest("button[data-src]");
        if (!button || !root.contains(button)) return;
        var dialog = document.getElementById("viewer");
        if (!dialog) return;
        var image = dialog.querySelector("img");
        image.src = button.getAttribute("data-src");
        image.alt = button.getAttribute("data-alt") || "";
        dialog.showModal();
      });
    }

    function draw(page, opts) {
      opts = opts || {};
      var totalPages = Math.ceil(memes.length / MEME_PAGE_SIZE);
      page = clampPage(page, totalPages);
      var slice = memes.slice((page - 1) * MEME_PAGE_SIZE, page * MEME_PAGE_SIZE);
      root.innerHTML = slice.map(function (meme, index) {
        var src = safeImage(meme.src);
        if (!src) return "";
        var href = safePostUrl(meme.href);
        var credit = href
          ? '<a class="credit" href="' + esc(href) + '" target="_blank" rel="noopener noreferrer">' + esc(meme.credit || "Source on X") + '</a>'
          : "";
        var id = memeAnchor(src);
        var number = (page - 1) * MEME_PAGE_SIZE + index + 1;
        var lead = page === 1 && index === 0;
        var when = postedDate(meme);
        return '<figure class="meme' + (lead ? ' meme-lead' : '') + '"' + (id ? ' id="' + id + '"' : '') + '>' +
          '<figcaption><span class="ft-tag">' + (lead ? "Featured meme" : "Meme") + '</span>' +
          '<span class="meme-title">' + esc(meme.caption) + '</span>' +
          (when ? '<span class="ft-stamp">' + esc(when) + '</span>' : '') + credit + '</figcaption>' +
          '<button type="button" data-src="' + esc(src) + '" data-alt="' + esc(meme.alt) + '" aria-label="Enlarge meme">' +
          '<img src="' + esc(src) + '" alt="' + esc(meme.alt || "Meme " + number) + '"></button></figure>';
      }).join("");
      placePager(root, page, totalPages, function (next) {
        setPageQuery(next);
        draw(next, { scroll: "grid" });
      }, "Meme pages");
      if (opts.scroll === "grid") {
        var section = document.getElementById("main") || root;
        section.scrollIntoView({ behavior: "smooth", block: "start" });
      } else if (opts.scroll === "hash") {
        var target = document.getElementById(String(location.hash || "").replace(/^#/, ""));
        if (target) target.scrollIntoView();
      }
    }

    var hashPage = pageForMemeHash(memes);
    var page = hashPage || clampPage(pageFromSearch(), Math.ceil(memes.length / MEME_PAGE_SIZE));
    draw(page, { scroll: hashPage ? "hash" : "" });
  };

  window.renderVideos = function (root) {
    var videos = validVideos();
    if (!videos.length) {
      root.innerHTML = empty("No reels filed.", "The best videos will play here.");
      placePager(root, 1, 0);
      return;
    }

    function draw(page, opts) {
      opts = opts || {};
      var totalPages = Math.ceil(videos.length / VIDEO_PAGE_SIZE);
      page = clampPage(page, totalPages);
      var slice = videos.slice((page - 1) * VIDEO_PAGE_SIZE, page * VIDEO_PAGE_SIZE);
      root.innerHTML = slice.map(function (video, index) {
        var x = xPost(video);
        if (x) {
          var poster = posterSrc(video.poster);
          var fallback = poster
            ? '<a class="x-fallback" href="' + esc(x.href) + '" target="_blank" rel="noopener noreferrer">' +
              '<img src="' + esc(poster) + '" alt="">' +
              '<span class="x-fallback-label">Watch on X</span></a>'
            : "";
          var credit = video.credit
            ? '<p><a class="credit" href="' + esc(x.href) + '" target="_blank" rel="noopener noreferrer">' + esc(video.credit) + '</a></p>'
            : "";
          return '<article class="video' + (page === 1 && index === 0 ? ' video-lead' : '') + '" id="v-' + x.id + '"><div class="frame frame-x">' + fallback +
            '<blockquote class="twitter-tweet" data-dnt="true" data-media-max-width="560">' +
            '<a href="' + esc(x.href) + '">' + esc(video.title || "View on X") + '</a></blockquote></div>' +
            '<p class="ft-tag">' + (page === 1 && index === 0 ? "Featured video" : "Video") + '</p>' +
            '<h2>' + esc(video.title) + '</h2>' +
            (postedDate(video) ? '<p class="ft-stamp">' + esc(postedDate(video)) + '</p>' : '') +
            (video.note ? '<p>' + esc(video.note) + '</p>' : '') +
            credit +
            '</article>';
        }
        var id = youtubeId(video);
        if (!id) return "";
        var src = "https://www.youtube-nocookie.com/embed/" + id;
        return '<article class="video' + (page === 1 && index === 0 ? ' video-lead' : '') + '" id="v-' + id + '"><div class="frame"><iframe src="' + src + '" title="' + esc(video.title) + '" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>' +
          '<p class="ft-tag">' + (page === 1 && index === 0 ? "Featured video" : "Video") + '</p>' +
          '<h2>' + esc(video.title) + '</h2>' +
          (postedDate(video) ? '<p class="ft-stamp">' + esc(postedDate(video)) + '</p>' : '') +
          (video.note ? '<p>' + esc(video.note) + '</p>' : '') +
          '</article>';
      }).join("");
      loadTwitterWidgets(root);
      placePager(root, page, totalPages, function (next) {
        setPageQuery(next);
        draw(next, { scroll: "grid" });
      });
      if (opts.scroll === "grid") {
        var section = document.getElementById("main") || root;
        section.scrollIntoView({ behavior: "smooth", block: "start" });
      } else if (opts.scroll === "hash") {
        var target = document.getElementById(String(location.hash || "").replace(/^#/, ""));
        if (target) target.scrollIntoView();
      }
    }

    var hashPage = pageForVideoHash(videos);
    var page = hashPage || clampPage(pageFromSearch(), Math.ceil(videos.length / VIDEO_PAGE_SIZE));
    draw(page, { scroll: hashPage ? "hash" : "" });
  };
})();
