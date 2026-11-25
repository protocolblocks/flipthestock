(function (root) {
  var CG_URL = "https://api.coingecko.com/api/v3/simple/price?ids=spx6900&vs_currencies=usd&include_24hr_change=true";
  var DEX_URL = "https://api.dexscreener.com/latest/dex/tokens/0xe0f63a424a4439cbe457d80e4f4b51ad25b2c56c";
  var OFFICIAL_ETH = "0xe0f63a424a4439cbe457d80e4f4b51ad25b2c56c";
  var CG_HREF = "https://www.coingecko.com/en/coins/spx6900";
  var DEX_HREF = "https://dexscreener.com/ethereum/" + OFFICIAL_ETH;
  var INTERVAL = 60000;
  var ZONE = "America/Edmonton";
  var timer = null;
  var lastQuote = null;
  var fetchImpl = typeof fetch === "function" ? fetch : null;

  function formatPrice(n) {
    if (typeof n !== "number" || !isFinite(n) || n < 0) return "—";
    var text = Number(n).toPrecision(4);
    if (/e/i.test(text)) {
      var exp = Math.floor(Math.log(Math.abs(n)) / Math.LN10);
      var decimals = Math.max(0, 3 - exp);
      text = n.toFixed(decimals);
    }
    return "$" + text;
  }

  function formatChange(n) {
    if (typeof n !== "number" || !isFinite(n)) return "";
    var arrow = n > 0 ? "▲" : n < 0 ? "▼" : "–";
    return arrow + " " + Math.abs(n).toFixed(1) + "%";
  }

  function part(parts, type) {
    var found = parts.filter(function (p) { return p.type === type; })[0];
    return found ? found.value : "";
  }

  function formatStamp(date) {
    if (!date || isNaN(date.getTime())) return "";
    var timeParts = new Intl.DateTimeFormat("en-GB", {
      timeZone: ZONE,
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    }).formatToParts(date);
    var dayPeriod = (part(timeParts, "dayPeriod") || "").toLowerCase().replace(/\./g, "");
    var time = part(timeParts, "hour") + ":" + part(timeParts, "minute") + " " + dayPeriod + " MT";
    var dayParts = new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
    var todayParts = new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    var dayKey = part(dayParts, "year") + "-" + part(dayParts, "month") + "-" + part(dayParts, "day");
    var todayKey = part(todayParts, "year") + "-" + part(todayParts, "month") + "-" + part(todayParts, "day");
    if (dayKey === todayKey) return time;
    var longParts = new Intl.DateTimeFormat("en-GB", {
      timeZone: ZONE,
      day: "numeric",
      month: "short"
    }).formatToParts(date);
    return part(longParts, "day") + " " + part(longParts, "month") + ", " + time;
  }

  function fromCoinGecko(data) {
    var row = data && data.spx6900;
    if (!row || typeof row.usd !== "number") return null;
    return {
      usd: row.usd,
      change: typeof row.usd_24h_change === "number" ? row.usd_24h_change : null
    };
  }

  function fromDexScreener(data) {
    var pairs = data && data.pairs;
    if (!pairs || !pairs.length) return null;
    var best = null;
    var bestLiq = -1;
    for (var i = 0; i < pairs.length; i++) {
      var pair = pairs[i];
      var addr = String((pair.baseToken && pair.baseToken.address) || "").toLowerCase();
      if (addr !== OFFICIAL_ETH) continue;
      var liq = Number(pair.liquidity && pair.liquidity.usd);
      if (!isFinite(liq)) liq = 0;
      if (liq > bestLiq) {
        bestLiq = liq;
        best = pair;
      }
    }
    if (!best || best.priceUsd == null) return null;
    var usd = Number(best.priceUsd);
    if (!isFinite(usd)) return null;
    var change = best.priceChange && best.priceChange.h24 != null ? Number(best.priceChange.h24) : null;
    return { usd: usd, change: isFinite(change) ? change : null };
  }

  function getJson(url) {
    if (typeof fetchImpl !== "function") return Promise.reject(new Error("no fetch"));
    var ctrl = typeof AbortController === "function" ? new AbortController() : null;
    var timed = setTimeout(function () {
      try { if (ctrl) ctrl.abort(); } catch (err) {}
    }, 8000);
    var opts = { mode: "cors" };
    if (ctrl) opts.signal = ctrl.signal;
    return fetchImpl(url, opts).then(function (res) {
      if (!res.ok) throw new Error("status");
      return res.json();
    }).then(function (data) {
      clearTimeout(timed);
      return data;
    }, function (err) {
      clearTimeout(timed);
      throw err;
    });
  }

  function setHidden(el, hide) {
    if (!el) return;
    if (hide) el.setAttribute("hidden", "");
    else el.removeAttribute("hidden");
  }

  function paint(quote, status) {
    var nodes = document.querySelectorAll(".ticker");
    var price = status === "unavailable" || !quote ? "Price unavailable" : formatPrice(quote.usd);
    var changeText = status === "unavailable" || !quote ? "" : formatChange(quote.change);
    var dir = quote && quote.change > 0 ? "up" : quote && quote.change < 0 ? "down" : "flat";
    var source = quote && quote.source ? quote.source : "";
    var href = (quote && quote.sourceUrl) || CG_HREF;
    var stamp = quote && quote.at ? formatStamp(quote.at) : "";
    var sourceText = "";
    var liveText = "Live";
    var label = "SPX6900 price unavailable";
    if (status === "live" && quote) {
      sourceText = source;
      label = "SPX6900 " + price + (changeText ? " " + changeText : "") + " live on " + source;
    } else if (status === "delayed" && quote) {
      liveText = "Delayed";
      sourceText = source + (stamp ? ", " + stamp : "");
      label = "SPX6900 " + price + (changeText ? " " + changeText : "") + " delayed from " + source + (stamp ? ", as of " + stamp : "");
    }
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var liveEl = el.querySelector(".ticker-live");
      var priceEl = el.querySelector(".ticker-price");
      var changeEl = el.querySelector(".ticker-change");
      var sourceEl = el.querySelector(".ticker-source");
      if (priceEl) priceEl.textContent = price;
      if (liveEl) {
        liveEl.textContent = liveText;
        setHidden(liveEl, status !== "live" && status !== "delayed");
      }
      if (changeEl) {
        changeEl.textContent = changeText;
        setHidden(changeEl, !changeText);
        changeEl.classList.remove("is-up", "is-down");
        if (dir === "up") changeEl.classList.add("is-up");
        if (dir === "down") changeEl.classList.add("is-down");
      }
      if (sourceEl) {
        sourceEl.textContent = sourceText;
        setHidden(sourceEl, !sourceText);
      }
      el.classList.remove("is-live", "is-delayed", "is-unavailable");
      if (status === "live") el.classList.add("is-live");
      if (status === "delayed") el.classList.add("is-delayed");
      if (status === "unavailable") el.classList.add("is-unavailable");
      el.setAttribute("href", href);
      el.setAttribute("aria-label", label);
    }
  }

  function load() {
    if (typeof fetchImpl !== "function") return Promise.resolve();
    return getJson(CG_URL)
      .then(fromCoinGecko)
      .then(function (quote) {
        if (!quote) throw new Error("empty");
        quote.source = "CoinGecko";
        quote.sourceUrl = CG_HREF;
        return quote;
      })
      .catch(function () {
        return getJson(DEX_URL).then(fromDexScreener).then(function (quote) {
          if (!quote) throw new Error("empty");
          quote.source = "DexScreener";
          quote.sourceUrl = DEX_HREF;
          return quote;
        });
      })
      .then(function (quote) {
        quote.at = new Date();
        lastQuote = quote;
        paint(quote, "live");
        return { status: "live", quote: quote };
      })
      .catch(function () {
        if (lastQuote) {
          paint(lastQuote, "delayed");
          return { status: "delayed", quote: lastQuote };
        }
        paint(null, "unavailable");
        return { status: "unavailable", quote: null };
      });
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function start() {
    stop();
    timer = setInterval(load, INTERVAL);
  }

  function setFetch(fn) {
    fetchImpl = fn;
  }

  function reset() {
    lastQuote = null;
    stop();
  }

  var api = {
    load: load,
    start: start,
    stop: stop,
    paint: paint,
    fromCoinGecko: fromCoinGecko,
    fromDexScreener: fromDexScreener,
    formatPrice: formatPrice,
    formatChange: formatChange,
    formatStamp: formatStamp,
    setFetch: setFetch,
    reset: reset,
    CG_URL: CG_URL,
    DEX_URL: DEX_URL,
    getLastQuote: function () { return lastQuote; }
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  if (typeof document !== "undefined" && typeof window !== "undefined") {
    try {
      load();
      if (!document.hidden) start();
      document.addEventListener("visibilitychange", function () {
        if (document.hidden) stop();
        else {
          load();
          start();
        }
      });
    } catch (err) {}
  }
})(typeof window !== "undefined" ? window : this);
