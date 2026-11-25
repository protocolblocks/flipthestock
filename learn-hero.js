(function (root) {
  var ZONE = "America/Edmonton";
  var SRC_RE = /^wall\/[A-Za-z0-9._-]+$/;
  var X_RE = /^https:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/[A-Za-z0-9_]+\/status\/\d+(?:[/?#].*)?$/;
  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function safeSrc(src) {
    var path = String(src || "").replace(/^\/+/, "");
    if (path.indexOf("memes/") === 0) path = path.slice(6);
    return SRC_RE.test(path) ? path : "";
  }

  function sameSrc(a, b) {
    var left = safeSrc(a);
    var right = safeSrc(b);
    return !!left && left === right;
  }

  function safeHref(url) {
    var href = String(url || "");
    return X_RE.test(href) ? href.replace(/^(https:\/\/(?:www\.)?)twitter\.com\//, "$1x.com/") : "";
  }

  function edmontonDate(now) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(now || new Date());
  }

  function dayNumber(dateStr) {
    var parts = String(dateStr || "").split("-").map(Number);
    if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return 0;
    return Math.floor(Date.UTC(parts[0], parts[1] - 1, parts[2]) / 86400000);
  }

  function gcd(a, b) {
    a = Math.abs(a);
    b = Math.abs(b);
    while (b) {
      var t = a % b;
      a = b;
      b = t;
    }
    return a;
  }

  function hashSrcs(items) {
    var s = items.map(function (entry) { return entry.src; }).join("|");
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function coprimeStep(n, salt) {
    if (n <= 1) return 1;
    var k = (salt % (n - 1)) + 1;
    var guard = 0;
    while (gcd(k, n) !== 1 && guard < n) {
      k = (k % (n - 1)) + 1;
      guard += 1;
    }
    return gcd(k, n) === 1 ? k : 1;
  }

  function indexForDay(n, dayNum, salt) {
    if (n <= 0) return 0;
    var step = coprimeStep(n, salt);
    var offset = salt % n;
    return (((dayNum * step + offset) % n) + n) % n;
  }

  function pickFrom(items, dayNum) {
    if (!items.length) return null;
    var salt = hashSrcs(items);
    return items[indexForDay(items.length, dayNum, salt)];
  }

  function libraryMemes() {
    var stacks = (typeof window !== "undefined" && window.STACKS) || (root && root.STACKS) || {};
    return Array.isArray(stacks.memes) ? stacks.memes : [];
  }

  function homepageLeadSrc(list) {
    var lead = (list || libraryMemes())[0];
    return lead ? safeSrc(lead.src) : "";
  }

  function findLibrary(src, list) {
    var want = safeSrc(src);
    if (!want) return null;
    var memes = list || libraryMemes();
    for (var i = 0; i < memes.length; i++) {
      if (sameSrc(memes[i].src, want)) return memes[i];
    }
    return null;
  }

  function approvedEntries(config, list) {
    var raw = config && Array.isArray(config.memes) ? config.memes : [];
    var out = [];
    var seen = {};
    for (var i = 0; i < raw.length; i++) {
      var entry = raw[i] || {};
      var src = safeSrc(entry.src);
      if (!src || seen[src] || !findLibrary(src, list)) continue;
      seen[src] = true;
      var pos = String(entry.objectPosition || "").trim();
      if (!/^[A-Za-z0-9% ._-]+$/.test(pos)) pos = "";
      out.push({ src: src, objectPosition: pos });
    }
    return out;
  }

  function fallbackEntry(config, list) {
    var src = safeSrc(config && config.default);
    if (src && findLibrary(src, list)) {
      var approved = approvedEntries(config, list);
      for (var i = 0; i < approved.length; i++) {
        if (sameSrc(approved[i].src, src)) return approved[i];
      }
      return { src: src, objectPosition: "" };
    }
    var first = approvedEntries(config, list)[0];
    return first || null;
  }

  function pickLearnMeme(config, opts) {
    opts = opts || {};
    var list = opts.memes || libraryMemes();
    var fallback = fallbackEntry(config, list);
    var catalog = approvedEntries(config, list);
    var homeSrc = opts.homeSrc != null ? safeSrc(opts.homeSrc) : homepageLeadSrc(list);
    var available = catalog.filter(function (entry) {
      return !sameSrc(entry.src, homeSrc);
    });
    if (available.length < 2) return fallback;
    var dateStr = opts.date || edmontonDate(opts.now);
    var dayNum = dayNumber(dateStr);
    var chosen = pickFrom(available, dayNum);
    var previous = pickFrom(available, dayNum - 1);
    if (chosen && previous && sameSrc(chosen.src, previous.src)) {
      chosen = pickFrom(available, dayNum + 1) || chosen;
    }
    return chosen || fallback;
  }

  function creditHtml(meme) {
    var credit = (meme && meme.credit) || "Post on X";
    var href = meme ? safeHref(meme.href) : "";
    if (href) {
      return '<a href="' + esc(href) + '" target="_blank" rel="noopener noreferrer">' + esc(credit) + "</a>";
    }
    return esc(credit);
  }

  function paint(figure, entry, list) {
    if (!figure || !entry) return;
    var img = figure.querySelector("img");
    var caption = figure.querySelector("figcaption");
    var prefix = figure.getAttribute("data-prefix") || "../";
    var meme = findLibrary(entry.src, list);
    if (img) {
      img.src = prefix + "memes/" + entry.src;
      if (meme && meme.alt) img.alt = meme.alt;
      if (entry.objectPosition) img.style.objectPosition = entry.objectPosition;
      else img.style.removeProperty("object-position");
    }
    if (caption) {
      caption.innerHTML = "<span>Community meme</span><span>" + creditHtml(meme || {}) + "</span>";
    }
  }

  function configUrl(figure, dateStr) {
    var prefix = (figure && figure.getAttribute("data-prefix")) || "../";
    return prefix + "data/learn-memes.json?d=" + encodeURIComponent(dateStr);
  }

  function load(opts) {
    opts = opts || {};
    var figure = opts.figure || (typeof document !== "undefined" && document.getElementById("learn-hero"));
    if (!figure) return Promise.resolve(null);
    var dateStr = opts.date || edmontonDate(opts.now);
    var fetchImpl = opts.fetch || (typeof fetch === "function" ? fetch : null);
    if (typeof fetchImpl !== "function") return Promise.resolve(null);
    return fetchImpl(configUrl(figure, dateStr), { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("status");
        return res.json();
      })
      .then(function (config) {
        var entry = pickLearnMeme(config, {
          date: dateStr,
          now: opts.now,
          memes: opts.memes,
          homeSrc: opts.homeSrc
        });
        paint(figure, entry, opts.memes);
        return entry;
      })
      .catch(function () {
        return null;
      });
  }

  var api = {
    edmontonDate: edmontonDate,
    dayNumber: dayNumber,
    pickLearnMeme: pickLearnMeme,
    approvedEntries: approvedEntries,
    pickFrom: pickFrom,
    indexForDay: indexForDay,
    paint: paint,
    load: load,
    sameSrc: sameSrc,
    safeSrc: safeSrc
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  if (typeof document !== "undefined" && typeof window !== "undefined") {
    if (document.getElementById("learn-hero")) {
      load();
    }
  }
})(typeof window !== "undefined" ? window : this);
