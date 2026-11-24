(function () {
  var CG_URL = "https://api.coingecko.com/api/v3/simple/price?ids=spx6900&vs_currencies=usd&include_24hr_change=true";
  var DEX_URL = "https://api.dexscreener.com/latest/dex/tokens/0xe0f63a424a4439cbe457d80e4f4b51ad25b2c56c";
  var OFFICIAL_ETH = "0xe0f63a424a4439cbe457d80e4f4b51ad25b2c56c";
  var INTERVAL = 60000;
  var timer = null;

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
    var ctrl = typeof AbortController === "function" ? new AbortController() : null;
    var timed = setTimeout(function () {
      try { if (ctrl) ctrl.abort(); } catch (err) {}
    }, 8000);
    var opts = { mode: "cors" };
    if (ctrl) opts.signal = ctrl.signal;
    return fetch(url, opts).then(function (res) {
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

  function paint(quote) {
    var nodes = document.querySelectorAll(".ticker");
    var price = formatPrice(quote.usd);
    var changeText = formatChange(quote.change);
    var dir = quote.change > 0 ? "up" : quote.change < 0 ? "down" : "flat";
    var label = "SPX6900 " + price + (changeText ? " " + changeText : "") + " on CoinGecko";
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var priceEl = el.querySelector(".ticker-price");
      var changeEl = el.querySelector(".ticker-change");
      if (priceEl) priceEl.textContent = price;
      if (changeEl) {
        changeEl.textContent = changeText;
        if (changeText) changeEl.removeAttribute("hidden");
        else changeEl.setAttribute("hidden", "");
        changeEl.classList.remove("is-up", "is-down");
        if (dir === "up") changeEl.classList.add("is-up");
        if (dir === "down") changeEl.classList.add("is-down");
      }
      el.setAttribute("aria-label", label);
    }
  }

  function load() {
    if (typeof fetch !== "function") return;
    getJson(CG_URL)
      .then(fromCoinGecko)
      .then(function (quote) {
        if (!quote) throw new Error("empty");
        return quote;
      })
      .catch(function () {
        return getJson(DEX_URL).then(fromDexScreener).then(function (quote) {
          if (!quote) throw new Error("empty");
          return quote;
        });
      })
      .then(paint)
      .catch(function () {});
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
})();
