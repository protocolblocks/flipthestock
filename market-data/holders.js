(function () {
  var DATA_URL = "../data/holders.json";
  var ZONE = "America/Edmonton";

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

  function sourceLink(chain) {
    if (!chain || !chain.source) return "";
    var name = escapeHtml(chain.source);
    if (chain.source_url) {
      return '<a href="' + escapeHtml(chain.source_url) + '" target="_blank" rel="noopener noreferrer">' + name + "</a>";
    }
    return name;
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
      return escapeHtml(chain.name || chain.id) + ": " + sourceLink(chain);
    }).filter(Boolean);
    var html = '<h3>Sources and method</h3>';
    if (data.note) html += "<p>" + escapeHtml(data.note) + "</p>";
    if (sources.length) html += "<p>" + sources.join(". ") + ".</p>";
    el.innerHTML = html;
  }

  function render(data, live) {
    if (!data || typeof data.total !== "number") return;
    var totalEl = $("holders-total-value");
    var noteEl = $("holders-total-note");
    var body = $("holders-chains");
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
