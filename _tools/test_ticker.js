#!/usr/bin/env node
"use strict";

function classList() {
  var set = new Set();
  return {
    add: function () { for (var i = 0; i < arguments.length; i++) set.add(arguments[i]); },
    remove: function () { for (var i = 0; i < arguments.length; i++) set.delete(arguments[i]); },
    contains: function (name) { return set.has(name); },
    toString: function () { return Array.from(set).join(" "); }
  };
}

function el(text) {
  var attrs = {};
  return {
    textContent: text || "",
    classList: classList(),
    setAttribute: function (k, v) { attrs[k] = v; },
    getAttribute: function (k) { return Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null; },
    removeAttribute: function (k) { delete attrs[k]; },
    _attrs: attrs
  };
}

function makeDom() {
  var live = el("Live");
  live.setAttribute("hidden", "");
  var name = el("SPX6900");
  var price = el("—");
  var change = el("");
  change.setAttribute("hidden", "");
  var source = el("");
  source.setAttribute("hidden", "");
  var ticker = {
    classList: classList(),
    attrs: {
      href: "https://www.coingecko.com/en/coins/spx6900",
      "aria-label": "SPX6900 price"
    },
    querySelector: function (sel) {
      return ({
        ".ticker-live": live,
        ".ticker-name": name,
        ".ticker-price": price,
        ".ticker-change": change,
        ".ticker-source": source
      })[sel] || null;
    },
    querySelectorAll: function () { return []; },
    setAttribute: function (k, v) { this.attrs[k] = v; },
    getAttribute: function (k) { return this.attrs[k]; }
  };
  var document = {
    querySelectorAll: function (sel) { return sel === ".ticker" ? [ticker] : []; },
    hidden: false,
    addEventListener: function () {}
  };
  return { document: document, ticker: ticker, live: live, price: price, change: change, source: source, name: name };
}

function jsonRes(ok, body) {
  return Promise.resolve({
    ok: ok,
    json: function () { return Promise.resolve(body); }
  });
}

function failFetch() {
  return Promise.reject(new Error("network"));
}

var failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error("FAIL " + msg);
  } else {
    console.log("ok   " + msg);
  }
}

async function run() {
  var ticker = require("../ticker.js");
  var dom = makeDom();
  global.document = dom.document;
  ticker.reset();

  var cg = ticker.CG_URL;
  var dex = ticker.DEX_URL;
  var cgBody = { spx6900: { usd: 0.2581, usd_24h_change: -7.5 } };
  var dexBody = {
    pairs: [{
      baseToken: { address: "0xE0f63A424a4439cBE457D80E4f4b51aD25b2c56C" },
      liquidity: { usd: 1000000 },
      priceUsd: "0.2415",
      priceChange: { h24: 1.25 }
    }]
  };

  // CoinGecko succeeds
  ticker.setFetch(function (url) {
    if (url === cg) return jsonRes(true, cgBody);
    return failFetch();
  });
  var result = await ticker.load();
  assert(result.status === "live", "CoinGecko success is live");
  assert(result.quote.source === "CoinGecko", "source is CoinGecko");
  assert(dom.live.textContent === "Live", "Live label shown for CoinGecko");
  assert(dom.live.getAttribute("hidden") == null, "Live is visible");
  assert(dom.price.textContent.indexOf("$0.258") === 0, "CoinGecko price painted");
  assert(dom.source.textContent === "CoinGecko", "visible source is CoinGecko");
  assert(dom.ticker.classList.contains("is-live"), "is-live class");
  assert(!dom.ticker.classList.contains("is-unavailable"), "not unavailable");
  assert(dom.ticker.getAttribute("href").indexOf("coingecko.com") !== -1, "href is CoinGecko");
  assert(/live on CoinGecko/.test(dom.ticker.getAttribute("aria-label")), "aria-label names CoinGecko");

  // CoinGecko fails, DexScreener succeeds
  ticker.reset();
  ticker.setFetch(function (url) {
    if (url === cg) return jsonRes(false, {});
    if (url === dex) return jsonRes(true, dexBody);
    return failFetch();
  });
  result = await ticker.load();
  assert(result.status === "live", "DexScreener fallback is live");
  assert(result.quote.source === "DexScreener", "source is DexScreener");
  assert(dom.live.textContent === "Live", "Live label shown for DexScreener");
  assert(dom.price.textContent.indexOf("$0.241") === 0, "DexScreener price painted");
  assert(dom.source.textContent === "DexScreener", "visible source is DexScreener");
  assert(dom.ticker.getAttribute("href").indexOf("dexscreener.com") !== -1, "href is DexScreener");
  assert(/live on DexScreener/.test(dom.ticker.getAttribute("aria-label")), "aria-label names DexScreener");
  assert(dom.change.textContent.indexOf("▲") !== -1, "positive DexScreener change shown");

  // Both fail, no cache
  ticker.reset();
  ticker.setFetch(function () { return failFetch(); });
  result = await ticker.load();
  assert(result.status === "unavailable", "both-fail with no cache is unavailable");
  assert(dom.price.textContent === "Price unavailable", "price reads Price unavailable");
  assert(dom.live.getAttribute("hidden") === "", "Live is hidden when unavailable");
  assert(dom.live.textContent !== "Live" || dom.live.getAttribute("hidden") === "", "does not present Live");
  assert(dom.ticker.classList.contains("is-unavailable"), "is-unavailable class");
  assert(!dom.ticker.classList.contains("is-live"), "not is-live when both fail");
  assert(dom.change.getAttribute("hidden") === "", "change hidden when unavailable");
  assert(/unavailable/.test(dom.ticker.getAttribute("aria-label")), "aria-label says unavailable");

  // Success, then both fail: delayed last-known price
  ticker.reset();
  var calls = 0;
  ticker.setFetch(function (url) {
    calls += 1;
    if (calls === 1 && url === cg) return jsonRes(true, cgBody);
    return failFetch();
  });
  result = await ticker.load();
  assert(result.status === "live", "first load live before delayed test");
  result = await ticker.load();
  assert(result.status === "delayed", "cached quote is delayed after both fail");
  assert(result.quote.source === "CoinGecko", "delayed quote keeps CoinGecko source");
  assert(dom.live.textContent === "Delayed", "label switches to Delayed");
  assert(dom.live.getAttribute("hidden") == null, "Delayed is visible");
  assert(dom.price.textContent.indexOf("$0.258") === 0, "last-known price still shown");
  assert(dom.source.textContent.indexOf("CoinGecko") === 0, "delayed source starts with CoinGecko");
  assert(/MT/.test(dom.source.textContent), "delayed source includes a Mountain Time stamp");
  assert(dom.ticker.classList.contains("is-delayed"), "is-delayed class");
  assert(!dom.ticker.classList.contains("is-live"), "not is-live when delayed");
  assert(/delayed from CoinGecko/.test(dom.ticker.getAttribute("aria-label")), "aria-label says delayed from CoinGecko");

  // HTTP 500 on both is also unavailable
  ticker.reset();
  ticker.setFetch(function () { return jsonRes(false, {}); });
  result = await ticker.load();
  assert(result.status === "unavailable", "HTTP errors on both sources are unavailable");
  assert(dom.price.textContent === "Price unavailable", "HTTP failure shows Price unavailable");

  if (failed) {
    console.error("\n" + failed + " ticker test(s) failed");
    process.exit(1);
  }
  console.log("\nall ticker tests passed");
}

run().catch(function (err) {
  console.error(err);
  process.exit(1);
});
