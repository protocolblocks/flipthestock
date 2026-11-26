(function () {
  var HOLDERS_URL = "../data/holders.json";
  var MARKET_URL = "../data/market.json";
  var ZONE = "America/Edmonton";
  var CG_SIMPLE = "https://api.coingecko.com/api/v3/simple/price?ids=spx6900&vs_currencies=usd&include_market_cap=true&include_24hr_vol=true&include_24hr_change=true&include_last_updated_at=true";
  var DEX_URL = "https://api.dexscreener.com/latest/dex/tokens/0xe0f63a424a4439cbe457d80e4f4b51ad25b2c56c";
  var OFFICIAL_ETH = "0xe0f63a424a4439cbe457d80e4f4b51ad25b2c56c";
  var CG_HREF = "https://www.coingecko.com/en/coins/spx6900";
  var DEX_HREF = "https://dexscreener.com/ethereum/" + OFFICIAL_ETH;
  var FDV_GAP = 0.015;

  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatCount(n) {
    if (typeof n !== "number" || !isFinite(n) || n < 0) return "—";
    return Math.round(n).toLocaleString("en-US");
  }

  function formatShare(n, total) {
    if (typeof n !== "number" || typeof total !== "number" || !isFinite(n) || !isFinite(total) || total <= 0) {
      return "—";
    }
    return (n / total * 100).toFixed(1) + "%";
  }

  function shareWidth(n, total) {
    if (typeof n !== "number" || typeof total !== "number" || total <= 0) return 0;
    var pct = n / total * 100;
    if (!isFinite(pct) || pct < 0) return 0;
    return Math.min(100, pct);
  }

  function asDate(iso) {
    if (!iso) return null;
    var d = typeof iso === "number" ? new Date(iso * 1000) : new Date(iso);
    return isNaN(d.getTime()) ? null : d;
  }

  function formatAsOf(date, live) {
    if (!date) return "";
    var parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: ZONE,
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    }).formatToParts(date);
    var get = function (type) {
      var part = parts.find(function (p) { return p.type === type; });
      return part ? part.value : "";
    };
    var dayPeriod = (get("dayPeriod") || "").toLowerCase().replace(/\./g, "");
    var when = get("day") + " " + get("month") + " " + get("year") + " " + get("hour") + ":" + get("minute") + " " + dayPeriod + " MT";
    return (live ? "Updated " : "As of ") + when;
  }

  function formatShortDate(isoDate) {
    if (!isoDate) return "";
    var d = new Date(isoDate + "T12:00:00");
    if (isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric"
    }).format(d);
  }

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
    if (typeof n !== "number" || !isFinite(n)) return "—";
    var arrow = n > 0 ? "▲" : n < 0 ? "▼" : "–";
    return arrow + " " + Math.abs(n).toFixed(1) + "%";
  }

  function changeClass(n) {
    if (typeof n !== "number" || !isFinite(n) || n === 0) return "num md-change";
    return n > 0 ? "num md-change is-up" : "num md-change is-down";
  }

  function trimNum(value, decimals) {
    var text = Number(value).toFixed(decimals);
    if (text.indexOf(".") !== -1) {
      text = text.replace(/0+$/, "").replace(/\.$/, "");
    }
    return text;
  }

  function formatUsdCompact(n) {
    if (typeof n !== "number" || !isFinite(n) || n < 0) return "—";
    if (n >= 1e9) return "$" + trimNum(n / 1e9, 2) + "bn";
    if (n >= 1e6) return "$" + trimNum(n / 1e6, n >= 1e8 ? 1 : 2) + "m";
    if (n >= 1e3) return "$" + trimNum(n / 1e3, 1) + "k";
    return "$" + trimNum(n, 2);
  }

  function formatUsdFull(n) {
    if (typeof n !== "number" || !isFinite(n) || n < 0) return "";
    if (Math.abs(n - Math.round(n)) < 1e-6) {
      return "$" + Math.round(n).toLocaleString("en-US");
    }
    return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 6 });
  }

  function formatSupply(n) {
    if (typeof n !== "number" || !isFinite(n) || n <= 0) return "—";
    if (n >= 1e9) return trimNum(n / 1e9, 2) + "bn";
    if (n >= 1e6) return trimNum(n / 1e6, n >= 1e8 ? 0 : 1) + "m";
    return formatCount(n);
  }

  function formatSupplyFull(n) {
    if (typeof n !== "number" || !isFinite(n) || n <= 0) return "";
    return Math.round(n).toLocaleString("en-US");
  }

  function fdvMeaningful(cap, fdv) {
    if (typeof cap !== "number" || typeof fdv !== "number" || !isFinite(cap) || !isFinite(fdv) || cap <= 0 || fdv <= 0) {
      return false;
    }
    return Math.abs(fdv - cap) / cap > FDV_GAP;
  }

  function sourceLink(name, url) {
    if (!name) return "";
    var label = escapeHtml(name);
    if (url) {
      return '<a href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer">' + label + "</a>";
    }
    return label;
  }

  function chainSourceLink(chain) {
    if (!chain || !chain.source) return "";
    return sourceLink(chain.source, chain.source_url);
  }

  function renderHistory(history) {
    var el = $("holders-history");
    if (!el) return;
    var points = (history || []).filter(function (row) {
      return row && typeof row.date === "string" && typeof row.total === "number" && isFinite(row.total);
    });
    if (points.length < 2) {
      var start = points[0] ? formatShortDate(points[0].date) : "";
      var label = start ? "History starts " + start : "History will appear as daily counts are recorded.";
      el.className = "md-history md-history-start";
      el.innerHTML =
        '<p class="figure-label">Total holders</p>' +
        '<div class="md-history-blank" role="img" aria-label="' + escapeHtml(label) + '">' +
          '<span class="md-history-rule"></span>' +
          '<span class="md-history-dot"></span>' +
        "</div>" +
        '<p class="figure-note">' + escapeHtml(label) + "</p>";
      return;
    }

    var w = 360;
    var h = 130;
    var padL = 4;
    var padR = 10;
    var padT = 14;
    var padB = 28;
    var min = points[0].total;
    var max = points[0].total;
    for (var i = 1; i < points.length; i++) {
      if (points[i].total < min) min = points[i].total;
      if (points[i].total > max) max = points[i].total;
    }
    var span = max - min;
    if (span === 0) span = max === 0 ? 1 : max * 0.02;
    var innerW = w - padL - padR;
    var innerH = h - padT - padB;
    var coords = points.map(function (row, idx) {
      var x = padL + (points.length === 1 ? innerW : idx / (points.length - 1) * innerW);
      var y = padT + (1 - (row.total - min) / span) * innerH;
      return { x: x, y: y, row: row };
    });
    var line = coords.map(function (c, idx) {
      return (idx === 0 ? "M" : "L") + c.x.toFixed(1) + " " + c.y.toFixed(1);
    }).join(" ");
    var last = coords[coords.length - 1];
    var area = line + " L" + last.x.toFixed(1) + " " + (h - padB) + " L" + coords[0].x.toFixed(1) + " " + (h - padB) + " Z";
    var firstDate = formatShortDate(points[0].date);
    var lastDate = formatShortDate(points[points.length - 1].date);
    el.className = "md-history";
    el.innerHTML =
      '<p class="figure-label">Total holders</p>' +
      '<svg class="md-spark" viewBox="0 0 ' + w + " " + h + '" width="100%" height="130" role="img" aria-label="Daily total holders from ' + escapeHtml(firstDate) + " to " + escapeHtml(lastDate) + '">' +
        '<path class="md-spark-area" d="' + area + '"></path>' +
        '<path class="md-spark-line" d="' + line + '" fill="none"></path>' +
        '<circle class="md-spark-dot" cx="' + last.x.toFixed(1) + '" cy="' + last.y.toFixed(1) + '" r="3.5"></circle>' +
        '<text class="md-spark-label" x="' + padL + '" y="' + (h - 8) + '">' + escapeHtml(firstDate) + "</text>" +
        '<text class="md-spark-label md-spark-label-end" x="' + (w - padR) + '" y="' + (h - 8) + '">' + escapeHtml(lastDate) + "</text>" +
      "</svg>";
  }

  function renderMethod(data) {
    var el = $("holders-method");
    if (!el) return;
    var sources = (data.chains || []).map(function (chain) {
      if (!chain.source) return "";
      return escapeHtml(chain.name || chain.id) + ": " + chainSourceLink(chain);
    }).filter(Boolean);
    var html = "<h3>Sources and method</h3>";
    if (data.note) html += "<p>" + escapeHtml(data.note) + "</p>";
    if (sources.length) html += "<p>" + sources.join(". ") + ".</p>";
    el.innerHTML = html;
  }

  function renderHolders(data, live) {
    if (!data || typeof data.total !== "number") return;
    var labelEl = $("holders-label");
    var totalEl = $("holders-total-value");
    var noteEl = $("holders-total-note");
    var body = $("holders-chains");
    if (labelEl && data.label) labelEl.textContent = data.label;
    if (totalEl) totalEl.textContent = formatCount(data.total);
    if (noteEl) {
      var asOf = formatAsOf(asDate(data.updated_at), live);
      noteEl.textContent = asOf ? asOf + "." : "";
    }
    if (body) {
      body.innerHTML = (data.chains || []).map(function (chain) {
        var name = escapeHtml(chain.name || chain.id || "Chain");
        var count = formatCount(chain.holders);
        var share = formatShare(chain.holders, data.total);
        var width = shareWidth(chain.holders, data.total).toFixed(1);
        return (
          "<tr>" +
            '<th scope="row">' + name + "</th>" +
            '<td class="num">' + count + "</td>" +
            '<td class="num">' + share + "</td>" +
            '<td class="bar-col">' +
              '<span class="md-bar" role="presentation"><span style="width:' + width + '%"></span></span>' +
            "</td>" +
          "</tr>"
        );
      }).join("");
    }
    renderHistory(data.history);
    renderMethod(data);
  }

  function factRow(label, value, css, id, title) {
    var titleAttr = title ? ' title="' + escapeHtml(title) + '"' : "";
    var idAttr = id ? ' id="' + escapeHtml(id) + '"' : "";
    return (
      "<tr>" +
        '<th scope="row">' + escapeHtml(label) + "</th>" +
        '<td class="' + escapeHtml(css || "num") + '"' + idAttr + titleAttr + ">" + escapeHtml(value) + "</td>" +
      "</tr>"
    );
  }

  function renderSnapshot(data, status) {
    if (!data || typeof data.price_usd !== "number") return;
    var asOfEl = $("snapshot-asof");
    var live = status === "live";
    var delayed = status === "delayed";
    var asOf = formatAsOf(asDate(data.as_of || data.updated_at), live);
    var source = sourceLink(data.source, data.source_url);
    var line = asOf ? asOf + "." : "";
    if (delayed && line) {
      line = asOf + ". Delayed from " + source + ".";
    } else if (live && source) {
      line = (line ? line + " " : "") + "Live from " + source + ".";
    } else if (source) {
      line = (line ? line + " Source: " : "Source: ") + source + ".";
    }
    if (asOfEl) asOfEl.innerHTML = line;

    var priceEl = $("snap-price");
    if (priceEl) {
      priceEl.textContent = formatPrice(data.price_usd);
      var priceTitle = formatUsdFull(data.price_usd);
      if (priceTitle) priceEl.setAttribute("title", priceTitle);
      else priceEl.removeAttribute("title");
    }
    var changeEl = $("snap-change");
    if (changeEl) {
      if (typeof data.change_24h_pct === "number") {
        changeEl.textContent = formatChange(data.change_24h_pct);
        changeEl.className = "md-lead-change " + changeClass(data.change_24h_pct);
        changeEl.removeAttribute("hidden");
      } else {
        changeEl.textContent = "";
        changeEl.className = "md-lead-change num md-change";
        changeEl.setAttribute("hidden", "");
      }
    }

    var rows = [];
    if (typeof data.market_cap_usd === "number") {
      rows.push(factRow("Market cap", formatUsdCompact(data.market_cap_usd), "num", "snap-cap", formatUsdFull(data.market_cap_usd)));
    }
    if (fdvMeaningful(data.market_cap_usd, data.fdv_usd)) {
      rows.push(factRow("Fully diluted value", formatUsdCompact(data.fdv_usd), "num", "snap-fdv", formatUsdFull(data.fdv_usd)));
    }
    if (typeof data.volume_24h_usd === "number") {
      rows.push(factRow("24-hour volume", formatUsdCompact(data.volume_24h_usd), "num", "snap-volume", formatUsdFull(data.volume_24h_usd)));
    }
    if (typeof data.circulating_supply === "number") {
      rows.push(factRow("Circulating supply", formatSupply(data.circulating_supply), "num", "snap-circulating", formatSupplyFull(data.circulating_supply)));
    }
    if (typeof data.max_supply === "number") {
      rows.push(factRow("Max supply", formatSupply(data.max_supply), "num", "snap-max", formatSupplyFull(data.max_supply)));
    }

    var body = $("snapshot-rows");
    if (body) body.innerHTML = rows.join("");

    var method = $("snapshot-method");
    if (method) {
      var sourceHtml = source || "the source named above";
      var html = "<h3>Sources and method</h3>";
      if (status === "live") {
        html += "<p>Figures are taken live from " + sourceHtml + ". The time above is when this page last fetched them.</p>";
      } else if (status === "delayed") {
        html += "<p>A live update could not be fetched, so the last good figures from " + sourceHtml + " are shown. The time above is when those figures were taken.</p>";
      } else {
        html += "<p>Figures are taken from " + sourceHtml + " and are not live. They are refreshed once a day, and the time above is when the source last updated them.</p>";
      }
      if (
        data.source === "CoinGecko" &&
        typeof data.market_cap_usd === "number" &&
        typeof data.fdv_usd === "number" &&
        !fdvMeaningful(data.market_cap_usd, data.fdv_usd)
      ) {
        html += "<p>CoinGecko also publishes a fully diluted valuation; it is not shown separately because it matches the market cap, as circulating supply equals total supply.</p>";
      }
      method.innerHTML = html;
    }
  }

  function asInt(value) {
    var n = typeof value === "string" ? Number(value) : value;
    if (typeof n !== "number" || !isFinite(n) || n <= 0) return null;
    return Math.round(n);
  }

  function applyLiveHolders(data, updates) {
    var changed = false;
    var chains = (data.chains || []).map(function (chain) {
      var next = updates[chain.id];
      if (next == null) return chain;
      changed = true;
      return Object.assign({}, chain, { holders: next });
    });
    if (!changed) return null;
    var total = 0;
    for (var i = 0; i < chains.length; i++) {
      if (typeof chains[i].holders !== "number") return null;
      total += chains[i].holders;
    }
    return Object.assign({}, data, {
      chains: chains,
      total: total,
      updated_at: new Date().toISOString()
    });
  }

  function fetchJson(url) {
    return fetch(url, { cache: "no-store" }).then(function (res) {
      if (!res.ok) throw new Error("bad status " + res.status);
      return res.json();
    });
  }

  function liveEthereum() {
    return fetchJson("https://api.ethplorer.io/getTokenInfo/0xE0f63A424a4439cBE457D80E4f4b51aD25b2c56C?apiKey=freekey")
      .then(function (d) { return asInt(d && d.holdersCount); });
  }

  function liveGecko(network, address) {
    return fetchJson("https://api.geckoterminal.com/api/v2/networks/" + network + "/tokens/" + address + "/info")
      .then(function (d) {
        return asInt(d && d.data && d.data.attributes && d.data.attributes.holders && d.data.attributes.holders.count);
      });
  }

  function refreshLiveHolders(data) {
    var jobs = {};
    (data.chains || []).forEach(function (chain) {
      if (chain.id === "ethereum") jobs.ethereum = liveEthereum();
      else if (chain.id === "base") jobs.base = liveGecko("base", "0x50da645f148798f68ef2d7db7c1cb22a6819bb2c");
      else if (chain.id === "solana") jobs.solana = liveGecko("solana", "J3NKxxXZcnNiMjKw9hYb2K4LUxgwB6t1FtPtQVsv3KFr");
    });
    var ids = Object.keys(jobs);
    if (!ids.length) return;
    Promise.all(ids.map(function (id) {
      return jobs[id].then(function (n) { return [id, n]; }).catch(function () { return [id, null]; });
    })).then(function (rows) {
      var updates = {};
      rows.forEach(function (row) {
        if (row[1] != null) updates[row[0]] = row[1];
      });
      var next = applyLiveHolders(data, updates);
      if (next) renderHolders(next, true);
    });
  }

  function fromCoinGeckoSimple(data) {
    var row = data && data.spx6900;
    if (!row || typeof row.usd !== "number") return null;
    var asOf = typeof row.last_updated_at === "number" ? new Date(row.last_updated_at * 1000) : new Date();
    return {
      source: "CoinGecko",
      source_url: CG_HREF,
      price_usd: row.usd,
      change_24h_pct: typeof row.usd_24h_change === "number" ? row.usd_24h_change : null,
      market_cap_usd: typeof row.usd_market_cap === "number" ? row.usd_market_cap : null,
      volume_24h_usd: typeof row.usd_24h_vol === "number" ? row.usd_24h_vol : null,
      as_of: asOf.toISOString(),
      updated_at: new Date().toISOString()
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
    var cap = best.marketCap != null ? Number(best.marketCap) : null;
    var fdv = best.fdv != null ? Number(best.fdv) : null;
    return {
      source: "DexScreener",
      source_url: DEX_HREF,
      price_usd: usd,
      change_24h_pct: isFinite(change) ? change : null,
      market_cap_usd: isFinite(cap) ? cap : null,
      fdv_usd: isFinite(fdv) ? fdv : null,
      as_of: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  }

  function mergeSupply(next, previous) {
    if (!previous) return next;
    // The simple price API and DexScreener do not always include supply.
    // Keep the baked circulating, total, max and FDV when the live row omits them.
    ["circulating_supply", "total_supply", "max_supply", "fdv_usd"].forEach(function (key) {
      if (next[key] == null && typeof previous[key] === "number") next[key] = previous[key];
    });
    return next;
  }

  var lastMarket = null;

  function refreshLiveMarket(previous) {
    fetchJson(CG_SIMPLE)
      .then(fromCoinGeckoSimple)
      .then(function (quote) {
        if (!quote) throw new Error("empty");
        return quote;
      })
      .catch(function () {
        return fetchJson(DEX_URL).then(fromDexScreener).then(function (quote) {
          if (!quote) throw new Error("empty");
          return quote;
        });
      })
      .then(function (quote) {
        lastMarket = mergeSupply(quote, previous || lastMarket);
        renderSnapshot(lastMarket, "live");
      })
      .catch(function () {
        if (lastMarket) renderSnapshot(lastMarket, "delayed");
      });
  }

  function boot() {
    fetchJson(HOLDERS_URL)
      .then(function (data) {
        renderHolders(data, false);
        refreshLiveHolders(data);
      })
      .catch(function () {
        // The baked figures stay on the page if the JSON cannot be fetched.
      });

    fetchJson(MARKET_URL)
      .then(function (data) {
        lastMarket = data;
        renderSnapshot(data, "saved");
        refreshLiveMarket(data);
      })
      .catch(function () {
        refreshLiveMarket(lastMarket);
      });
  }

  if (typeof document !== "undefined") {
    boot();
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) refreshLiveMarket(lastMarket);
    });
  }
})();
