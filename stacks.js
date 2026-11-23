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
        '<p>' + esc(article.dek) + '</p>' +
        '<p class="when">' + formatDate(article.date) + '</p></a>';
    }).join("");
  };

  window.renderPiece = function (root) {
    var params = new URLSearchParams(window.location.search);
    var slug = params.get("slug");
    var article = data().articles.filter(function (item) { return item.slug === slug; })[0];
    if (!article) {
      root.innerHTML = '<a class="back" href="./">All articles</a>' +
        empty("That piece is not on the shelf.", "The link may be old, or the piece has not been filed yet.");
      return;
    }
    document.title = article.title + " — There Is No Chart";
    var body = String(article.html || "").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
    root.innerHTML = '<a class="back" href="./">All articles</a>' +
      '<article class="article">' +
      '<p class="when">' + formatDate(article.date) + '</p>' +
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
    var edition = document.getElementById("edition");
    if (!articles.length) {
      root.innerHTML = empty("Nothing filed yet.", "The latest piece will lead this page.");
      return;
    }
    var lead = articles[0];
    var side = articles[1];
    var related = articles.slice(2, 4);
    if (edition) edition.textContent = "Unofficial · " + formatDate(lead.date);
    var sideHtml = "";
    if (side) {
      sideHtml = '<div class="side"><a href="' + pieceHref("articles/", side.slug) + '">' +
        '<img class="pic" src="memes/wall/no-chart.jpg" alt="A dark empty chart with green text reading We are here and an arrow pointing at a single dot.">' +
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
    root.innerHTML = sideHtml +
      '<a class="hero-pic" href="' + pieceHref("articles/", lead.slug) + '">' +
      '<img class="pic" src="assets/cover.jpg" alt="A sheet of chart paper with a faint grid and a single black dot. The rest of the grid is empty."></a>' +
      '<div class="hero-copy"><a href="' + pieceHref("articles/", lead.slug) + '">' +
      '<p class="kicker">' + esc(lead.kicker || "Cover") + '</p>' +
      '<h2>' + esc(lead.title) + '</h2>' +
      '<p class="dek">' + esc(lead.dek) + '</p>' +
      '<p class="when">' + formatDate(lead.date) + '</p></a></div>' +
      '<aside class="rail" aria-label="Most read"><h2>Most read</h2><ol class="most">' + most + '</ol></aside>';
  };

  window.renderFrontMemes = function (root) {
    var memes = data().memes;
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
        '<p class="credit">' + esc(meme.credit || "Post on X") + '</p></a>';
    }).join("");
  };

  window.renderFrontVideos = function (root) {
    var videos = data().videos;
    if (!videos.length) {
      root.innerHTML = empty("No reels filed.", "The best videos will play here.");
      return;
    }
    root.innerHTML = videos.map(function (video) {
      var id = String(video.id || "");
      if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return "";
      var note = String(video.note || "").split(". ")[0];
      return '<a href="videos/#v-' + id + '">' +
        '<img class="pic" src="https://i.ytimg.com/vi/' + id + '/hqdefault.jpg" alt="">' +
        '<h3>' + esc(video.title) + '</h3>' +
        (note ? '<p class="credit">' + esc(note) + '</p>' : '') +
        '</a>';
    }).join("");
  };

  window.renderMemes = function (root) {
    var memes = data().memes;
    if (!memes.length) {
      root.innerHTML = empty("Nothing on the wall.", "Meme images will be hung here.");
      return;
    }
    root.innerHTML = memes.map(function (meme, index) {
      var src = String(meme.src || "");
      if (!/^[A-Za-z0-9_./-]+$/.test(src) || src.indexOf("..") !== -1) return "";
      var href = safePostUrl(meme.href);
      var credit = href
        ? '<a class="credit" href="' + esc(href) + '" target="_blank" rel="noopener noreferrer">' + esc(meme.credit || "Source on X") + '</a>'
        : "";
      return '<figure class="meme"><button type="button" data-src="' + esc(src) + '" data-alt="' + esc(meme.alt) + '">' +
        '<img src="' + esc(src) + '" alt="' + esc(meme.alt || "Meme " + (index + 1)) + '"></button>' +
        '<figcaption><span>' + esc(meme.caption) + '</span>' + credit + '</figcaption></figure>';
    }).join("");
    root.addEventListener("click", function (event) {
      var button = event.target.closest("button");
      if (!button) return;
      var dialog = document.getElementById("viewer");
      var image = dialog.querySelector("img");
      image.src = button.getAttribute("data-src");
      image.alt = button.getAttribute("data-alt") || "";
      dialog.showModal();
    });
  };

  window.renderVideos = function (root) {
    var videos = data().videos;
    if (!videos.length) {
      root.innerHTML = empty("No reels filed.", "The best videos will play here.");
      return;
    }
    root.innerHTML = videos.map(function (video) {
      var id = String(video.id || "");
      if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return "";
      var src = "https://www.youtube-nocookie.com/embed/" + id;
      return '<article class="video" id="v-' + id + '"><div class="frame"><iframe src="' + src + '" title="' + esc(video.title) + '" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>' +
        '<h2>' + esc(video.title) + '</h2>' +
        (video.note ? '<p>' + esc(video.note) + '</p>' : '') +
        '</article>';
    }).join("");
  };
})();
