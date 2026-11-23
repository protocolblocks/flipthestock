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
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
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
    if (!articles.length) {
      root.innerHTML = empty("Nothing filed yet.", "The latest piece will lead this page.");
      return;
    }
    var lead = articles[0];
    var rest = articles.slice(1, 4);
    function card(article, className) {
      var slug = encodeURIComponent(article.slug || "");
      return '<a class="' + className + '" href="articles/piece.html?slug=' + slug + '">' +
        '<h3>' + esc(article.title) + '</h3>' +
        '<p>' + esc(article.dek) + '</p>' +
        '<p class="when">' + formatDate(article.date) + '</p></a>';
    }
    root.classList.toggle("is-solo", rest.length === 0);
    root.innerHTML = '<a class="lead" href="articles/piece.html?slug=' + encodeURIComponent(lead.slug || "") + '">' +
      '<p class="kicker">Lead story</p>' +
      '<h2>' + esc(lead.title) + '</h2>' +
      '<p class="standfirst">' + esc(lead.dek) + '</p>' +
      '<p class="when">' + formatDate(lead.date) + ' · Read the piece</p></a>' +
      (rest.length ? '<div class="rail">' + rest.map(function (article) { return card(article, "rail-piece"); }).join("") + '</div>' : "");
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
      return '<article class="video"><div class="frame"><iframe src="' + src + '" title="' + esc(video.title) + '" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>' +
        '<h2>' + esc(video.title) + '</h2>' +
        (video.note ? '<p>' + esc(video.note) + '</p>' : '') +
        '</article>';
    }).join("");
  };
})();
