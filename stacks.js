(function () {
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
      videos: Array.isArray(stacks.videos) ? stacks.videos : []
    };
  }

  function formatDate(iso) {
    var date = new Date(String(iso) + "T00:00:00");
    if (isNaN(date.getTime())) return esc(iso);
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  }

  function pieceHref(prefix, slug) {
    return prefix + "piece.html?slug=" + encodeURIComponent(slug || "");
  }

  function safeImage(src) {
    var path = String(src || "");
    if (!/^[A-Za-z0-9_./-]+$/.test(path) || path.indexOf("..") !== -1) return "";
    return path;
  }

  function empty(title, text) {
    return '<div class="empty"><div class="idx">Empty</div><h2>' + esc(title) + '</h2><p>' + esc(text) + '</p></div>';
  }

  var VIDEO_PAGE_SIZE = 9;
  var MEME_PAGE_SIZE = 6;

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
  // (everything after memes[0]), so it never matches the meme of the day on
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
    var articles = data().articles.slice().sort(function (a, b) {
      return String(b.date || "").localeCompare(String(a.date || ""));
    });
    if (!articles.length) {
      root.innerHTML = empty("The shelf is empty.", "Written pieces will be filed here, newest first.");
      return;
    }
    root.innerHTML = articles.map(function (article, index) {
      var slug = encodeURIComponent(article.slug || "");
      return '<a class="piece" href="piece.html?slug=' + slug + '">' +
        '<div class="idx">' + String(index + 1).padStart(2, "0") + '</div>' +
        '<h2>' + esc(article.title) + '</h2>' +
        '<p>' + esc(article.dek) + '</p></a>';
    }).join("");
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
      "image": ORIGIN + "/assets/og.png",
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
    root.innerHTML = '<a class="back" href="./">All articles</a>' +
      '<article class="article">' +
      '<h1>' + esc(article.title) + '</h1>' +
      '<p class="article-dek">' + esc(article.dek) + '</p>' +
      '<div class="article-body">' + body + '</div></article>';
  };

  function safePostUrl(value) {
    var url = String(value || "");
    if (!/^https:\/\/(x\.com|twitter\.com)\/[A-Za-z0-9_./?=&%-]+$/.test(url)) return "";
    return url;
  }

  window.renderNews = function (root) {
    var articles = data().articles.slice().sort(function (a, b) {
      return String(b.date || "").localeCompare(String(a.date || ""));
    });
    if (!articles.length) {
      root.innerHTML = empty("Nothing filed yet.", "The latest piece will lead this page.");
      return;
    }
    var lead = articles[0];
    var side = articles[1];
    var related = articles.slice(2, 4);
    var sideHtml = "";
    if (side) {
      var sideImgSrc = "memes/wall/no-chart.jpg";
      var sideImgAlt = "A dark empty chart with green text reading We are here and an arrow pointing at a single dot.";
      var sideImgHref = pieceHref("articles/", side.slug);
      var coverMeme = archiveCoverMeme();
      if (coverMeme) {
        var coverMemeSrc = safeImage(coverMeme.src);
        if (coverMemeSrc) {
          var coverMemeId = memeAnchor(coverMemeSrc);
          sideImgSrc = "memes/" + coverMemeSrc;
          sideImgAlt = coverMeme.alt || coverMeme.caption || sideImgAlt;
          sideImgHref = "memes/" + (coverMemeId ? "#" + coverMemeId : "");
        }
      }
      sideHtml = '<div class="side"><a href="' + sideImgHref + '">' +
        '<img class="pic" src="' + esc(sideImgSrc) + '" alt="' + esc(sideImgAlt) + '"></a>' +
        '<a href="' + pieceHref("articles/", side.slug) + '">' +
        '<p class="kicker">' + esc(side.kicker || "Latest") + '</p>' +
        '<h2>' + esc(side.title) + '</h2>' +
        '<p class="dek">' + esc(side.dek) + '</p>' +
        '<p class="when">' + formatDate(side.date) + '</p></a>' +
        related.map(function (article) {
          return '<div class="related"><a href="' + pieceHref("articles/", article.slug) + '">' +
            '<p class="kicker">' + esc(article.kicker || "Latest") + '</p>' +
            '<h3>' + esc(article.title) + '</h3></a></div>';
        }).join("") +
        '</div>';
    }
    var most = articles.slice(0, 6).map(function (article, index) {
      return '<li><span>' + (index + 1) + '</span><a href="' + pieceHref("articles/", article.slug) + '">' +
        esc(article.title) + '</a></li>';
    }).join("");
    var coverSrc = "assets/cover.jpg";
    var coverAlt = "A sheet of chart paper with a faint grid and a single black dot. The rest of the grid is empty.";
    var leadMeme = data().memes[0];
    if (leadMeme) {
      var memeSrc = safeImage(leadMeme.src);
      if (memeSrc) {
        coverSrc = "memes/" + memeSrc;
        coverAlt = leadMeme.alt || leadMeme.caption || coverAlt;
      }
    }
    root.innerHTML = sideHtml +
      '<a class="hero-pic" href="' + pieceHref("articles/", lead.slug) + '">' +
      '<img class="pic" src="' + esc(coverSrc) + '" alt="' + esc(coverAlt) + '" onerror="this.onerror=null;this.src=\'assets/cover.jpg\'"></a>' +
      '<div class="hero-copy"><a href="' + pieceHref("articles/", lead.slug) + '">' +
      '<p class="kicker">' + esc(lead.kicker || "Cover") + '</p>' +
      '<h2>' + esc(lead.title) + '</h2>' +
      '<p class="dek">' + esc(lead.dek) + '</p>' +
      '<p class="when">' + formatDate(lead.date) + '</p></a></div>' +
      '<aside class="rail" aria-label="Most read"><h2>Most read</h2><ol class="most">' + most + '</ol></aside>';
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
    var memes = data().memes.slice(0, 4);
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
      return open +
        '<img class="pic" src="memes/' + esc(src) + '" alt="' + esc(meme.alt || "") + '">' +
        '<h3>' + esc(meme.caption) + '</h3>' +
        (postedDate(meme) ? '<p class="credit">' + esc(postedDate(meme)) + '</p>' : '') + '</a>';
    }).join("");
  };

  window.renderFrontVideos = function (root) {
    var videos = validVideos().slice(0, 5);
    if (!videos.length) {
      root.innerHTML = empty("No reels filed.", "The best videos will play here.");
      return;
    }
    root.innerHTML = videos.map(function (video) {
      var key = videoKey(video);
      if (!key) return "";
      var note = postedDate(video);
      var x = xPost(video);
      var thumb = x
        ? posterSrc(video.poster)
        : "https://i.ytimg.com/vi/" + youtubeId(video) + "/hqdefault.jpg";
      return '<a href="videos/#v-' + key + '">' +
        '<img class="pic" src="' + esc(thumb) + '" alt="">' +
        '<h3>' + esc(video.title) + '</h3>' +
        (note ? '<p class="credit">' + esc(note) + '</p>' : '') +
        '</a>';
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
        return '<figure class="meme"' + (id ? ' id="' + id + '"' : '') + '><button type="button" data-src="' + esc(src) + '" data-alt="' + esc(meme.alt) + '">' +
          '<img src="' + esc(src) + '" alt="' + esc(meme.alt || "Meme " + number) + '"></button>' +
          '<figcaption><span>' + esc(meme.caption) + '</span>' + credit + '</figcaption></figure>';
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
      root.innerHTML = slice.map(function (video) {
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
          return '<article class="video" id="v-' + x.id + '"><div class="frame frame-x">' + fallback +
            '<blockquote class="twitter-tweet" data-dnt="true" data-media-max-width="560">' +
            '<a href="' + esc(x.href) + '">' + esc(video.title || "View on X") + '</a></blockquote></div>' +
            '<h2>' + esc(video.title) + '</h2>' +
            (video.note ? '<p>' + esc(video.note) + '</p>' : '') +
            credit +
            '</article>';
        }
        var id = youtubeId(video);
        if (!id) return "";
        var src = "https://www.youtube-nocookie.com/embed/" + id;
        return '<article class="video" id="v-' + id + '"><div class="frame"><iframe src="' + src + '" title="' + esc(video.title) + '" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>' +
          '<h2>' + esc(video.title) + '</h2>' +
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
