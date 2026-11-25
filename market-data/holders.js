(function () {
  var DATA_URL = "../data/holders.json";
  var ZONE = "America/Edmonton";

  function $(id) {
    return document.getElementById(id);
  }

  function formatCount(n) {
    if (typeof n !== "number" || !isFinite(n) || n < 0) return "—";
    return Math.round(n).toLocaleString("en-US");
  }

  function asDate(iso) {
    if (!iso) return null;
    var d = new Date(iso);
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
    var day = get("day");
    var month = get("month");
    var year = get("year");
    var hour = get("hour");
    var minute = get("minute");
    var dayPeriod = (get("dayPeriod") || "").toLowerCase().replace(/\./g, "");
    var when = day + " " + month + " " + year + ", " + hour + ":" + minute + " " + dayPeriod + " MT";
    return (live ? "Updated " : "As of ") + when;
  }

  function sourceLink(chain) {
    if (!chain || !chain.source) return "";
    if (chain.source_url) {
      return '<a href="' + chain.source_url + '" target="_blank" rel="noopener noreferrer">' + chain.source + "</a>";
    }
    return chain.source;
  }

  function render(data, live) {
    if (!data || typeof data.total !== "number") return;
    var totalEl = $("holders-total-value");
    var noteEl = $("holders-total-note");
    var grid = $("holders-chains");
    var method = $("holders-method");
    if (totalEl) totalEl.textContent = formatCount(data.total);
    if (noteEl) {
      var bits = [formatAsOf(asDate(data.updated_at), live)];
      var sources = (data.chains || []).map(function (c) { return c.source; }).filter(Boolean);
      var unique = sources.filter(function (s, i) { return sources.indexOf(s) === i; });
      if (unique.length) bits.push("Sources: " + unique.join(", "));
      noteEl.textContent = bits.filter(Boolean).join(". ") + ".";
    }
    if (grid) {
      grid.innerHTML = (data.chains || []).map(function (chain) {
        var name = chain.name || chain.id || "Chain";
        var note = "Source: " + sourceLink(chain);
        return (
          '<article class="figure">' +
            '<span class="figure-label">' + name + "</span>" +
            '<span class="figure-value">' + formatCount(chain.holders) + "</span>" +
            '<p class="figure-note">' + note + "</p>" +
          "</article>"
        );
      }).join("");
    }
    if (method && data.note) method.textContent = data.note;
  }

  function asInt(value) {
    var n = typeof value === "string" ? Number(value) : value;
    if (typeof n !== "number" || !isFinite(n) || n <= 0) return null;
    return Math.round(n);
  }

  function applyLive(data, updates) {
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

  function refreshLive(data) {
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
      var next = applyLive(data, updates);
      if (next) render(next, true);
    });
  }

  fetchJson(DATA_URL)
    .then(function (data) {
      render(data, false);
      refreshLive(data);
    })
    .catch(function () {
      var note = $("holders-total-note");
      if (note) note.textContent = "The holder count could not be loaded. Please try again shortly.";
    });
})();
