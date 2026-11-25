#!/usr/bin/env node
"use strict";

var hero = require("../learn-hero.js");
var failed = 0;

function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error("FAIL " + msg);
  } else {
    console.log("ok   " + msg);
  }
}

var library = [
  { src: "wall/2026-11-24-flip-the-stock-market-poster.jpg", alt: "elf poster", credit: "Post on X · @MustStopMurad", href: "https://x.com/MustStopMurad/status/2125323275823915420" },
  { src: "wall/2026-11-24-spiritual-gold.jpg", alt: "gold", credit: "Post on X · @matuaxbt", href: "https://x.com/matuaxbt/status/2125361383726608473" },
  { src: "wall/2026-11-23-painting-the-wall.jpg", alt: "A man paints a wall instead of buying SPX6900.", credit: "Post on X · @ChandlerCharts", href: "https://x.com/ChandlerCharts/status/2124911722431680991" },
  { src: "wall/no-chart.jpg", alt: "A dark empty chart with green text reading We are here and an arrow pointing at a single dot.", credit: "Post on X · @MustStopMurad", href: "https://x.com/MustStopMurad/status/1851221015289799104" },
  { src: "wall/stop-trading.jpg", alt: "loop", credit: "Post on X · @spx6900", href: "https://x.com/spx6900/status/1890781118124949944" }
];

var config = {
  default: "wall/no-chart.jpg",
  memes: [
    { src: "wall/no-chart.jpg" },
    { src: "wall/2026-11-23-painting-the-wall.jpg" }
  ]
};

var a = "wall/no-chart.jpg";
var b = "wall/2026-11-23-painting-the-wall.jpg";
var home = "wall/2026-11-24-flip-the-stock-market-poster.jpg";

function pick(date, homeSrc, cfg) {
  return hero.pickLearnMeme(cfg || config, { date: date, memes: library, homeSrc: homeSrc || home });
}

function dateFromDay(n) {
  var d = new Date(n * 86400000);
  var y = d.getUTCFullYear();
  var m = String(d.getUTCMonth() + 1).padStart(2, "0");
  var day = String(d.getUTCDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
}

// Same Edmonton date => same pick
var p1 = pick("2026-11-25");
var p2 = pick("2026-11-25");
assert(p1 && p1.src && p1.src === p2.src, "same date yields the same meme");
assert(p1.src === a || p1.src === b, "pick is one of the approved memes");

// Never the homepage lead
var seen = {};
var prev = null;
var day0 = hero.dayNumber("2026-11-01");
for (var i = 0; i < 40; i++) {
  var d = dateFromDay(day0 + i);
  var entry = pick(d, home);
  assert(entry.src !== home, "day " + d + " is not the homepage meme");
  seen[entry.src] = (seen[entry.src] || 0) + 1;
  if (prev) {
    assert(entry.src !== prev, "day " + d + " differs from the previous day");
  }
  prev = entry.src;
}
assert(seen[a] > 0 && seen[b] > 0, "both approved memes appear in a 40-day run");

// Cycles through all approved before repeating (pool of 4, none is homepage)
var four = {
  default: "wall/no-chart.jpg",
  memes: [
    { src: "wall/no-chart.jpg" },
    { src: "wall/2026-11-23-painting-the-wall.jpg" },
    { src: "wall/2026-11-24-spiritual-gold.jpg" },
    { src: "wall/stop-trading.jpg" }
  ]
};
var start = hero.dayNumber("2026-01-01");
function picksOver(from, count) {
  var out = [];
  for (var i = 0; i < count; i++) {
    out.push(hero.pickLearnMeme(four, { date: dateFromDay(from + i), memes: library, homeSrc: home }));
  }
  return out;
}
var first = picksOver(start, 4);
var firstSrcs = first.map(function (e) { return e.src; });
assert(new Set(firstSrcs).size === 4, "4-meme pool: any 4 consecutive days cover every approved meme");
for (var i = 1; i < first.length; i++) {
  assert(first[i].src !== first[i - 1].src, "4-meme pool: day " + i + " differs from previous");
}
var second = picksOver(start + 4, 4);
assert(new Set(second.map(function (e) { return e.src; })).size === 4, "4-meme pool: the next 4 days also cover every approved meme");
assert(second[0].src !== first[3].src, "4-meme pool: the day after a full cycle does not repeat");

// Skip homepage if it is in the approved list
var colliding = {
  default: "wall/no-chart.jpg",
  memes: [
    { src: "wall/no-chart.jpg" },
    { src: "wall/2026-11-23-painting-the-wall.jpg" },
    { src: "wall/2026-11-24-flip-the-stock-market-poster.jpg" }
  ]
};
for (var i = 0; i < 30; i++) {
  var entry = hero.pickLearnMeme(colliding, { date: dateFromDay(day0 + i), memes: library, homeSrc: home });
  assert(entry.src !== home, "approved homepage meme is skipped on " + dateFromDay(day0 + i));
  assert(entry.src === a || entry.src === b, "skip leaves one of the other approved memes");
}

// Fewer than 2 after excluding homepage => default
var onlyHomeAndDefault = {
  default: "wall/no-chart.jpg",
  memes: [
    { src: "wall/no-chart.jpg" },
    { src: "wall/2026-11-24-flip-the-stock-market-poster.jpg" }
  ]
};
var fb = hero.pickLearnMeme(onlyHomeAndDefault, { date: "2026-11-25", memes: library, homeSrc: home });
assert(fb && fb.src === a, "falls back to default when fewer than 2 remain after excluding the homepage meme");

// A single approved meme => default (which is that meme)
var one = { default: "wall/no-chart.jpg", memes: [{ src: "wall/no-chart.jpg" }] };
var only = hero.pickLearnMeme(one, { date: "2026-11-25", memes: library, homeSrc: home });
assert(only && only.src === a, "falls back to default when the approved list has fewer than 2 memes");

// Unknown or unsafe src is ignored
var dirty = {
  default: "wall/no-chart.jpg",
  memes: [
    { src: "wall/no-chart.jpg" },
    { src: "../secret.jpg" },
    { src: "https://evil.example/x.jpg" },
    { src: "wall/missing-file.jpg" },
    { src: "wall/2026-11-23-painting-the-wall.jpg" }
  ]
};
var cleaned = hero.approvedEntries(dirty, library).map(function (e) { return e.src; });
assert(cleaned.length === 2 && cleaned.indexOf(a) !== -1 && cleaned.indexOf(b) !== -1, "unsafe or unknown src values are dropped");

// America/Edmonton date: instants that fall on the same local date agree
var evening = new Date("2026-11-25T06:30:00Z"); // still 25 Nov evening if UTC-7? 06:30Z is 23:30 MST Nov 24 if UTC-7, or 00:30 CST Nov 25 if UTC-6
var dateA = hero.edmontonDate(new Date("2026-11-25T18:00:00Z"));
var dateB = hero.edmontonDate(new Date("2026-11-26T05:00:00Z"));
assert(/^\d{4}-\d{2}-\d{2}$/.test(dateA), "edmontonDate returns an ISO date");
var lateUtc = hero.edmontonDate(new Date("2026-11-26T01:00:00Z"));
// 01:00 UTC on 26 Nov is 18:00 or 19:00 on 25 Nov in Edmonton, so it should still be 2026-11-25
assert(lateUtc === "2026-11-25", "01:00 UTC on 26 Nov is still 25 Nov in America/Edmonton (got " + lateUtc + ")");
var earlyNext = hero.edmontonDate(new Date("2026-11-26T08:00:00Z"));
assert(earlyNext === "2026-11-26", "08:00 UTC on 26 Nov is 26 Nov in America/Edmonton (got " + earlyNext + ")");
assert(pick(lateUtc).src === pick("2026-11-25").src, "Edmonton evening still uses that local date's meme");

// Paint uses credit, link, and alt from library.js
function el(name) {
  var attrs = {};
  var style = {};
  var node = {
    tagName: name.toUpperCase(),
    innerHTML: "",
    textContent: "",
    style: {
      objectPosition: "",
      removeProperty: function (k) {
        if (k === "object-position") style.objectPosition = "";
      }
    },
    setAttribute: function (k, v) { attrs[k] = v; },
    getAttribute: function (k) { return attrs[k] || null; },
    querySelector: function (sel) { return children[sel] || null; }
  };
  if (name === "img") {
    Object.defineProperty(node, "src", { get: function () { return attrs.src; }, set: function (v) { attrs.src = v; }, configurable: true });
    Object.defineProperty(node, "alt", { get: function () { return attrs.alt; }, set: function (v) { attrs.alt = v; }, configurable: true });
    Object.defineProperty(node.style, "objectPosition", {
      get: function () { return style.objectPosition; },
      set: function (v) { style.objectPosition = v; },
      configurable: true
    });
  }
  var children = {};
  return { node: node, attrs: attrs, style: style, children: children };
}

var img = el("img");
var cap = el("figcaption");
var fig = el("figure");
fig.node.setAttribute("data-prefix", "../");
fig.children["img"] = img.node;
fig.children["figcaption"] = cap.node;
hero.paint(fig.node, { src: "wall/no-chart.jpg" }, library);
assert(img.attrs.src === "../memes/wall/no-chart.jpg", "paint sets the wall image path");
assert(/We are here/.test(img.attrs.alt), "paint uses the library alt text");
assert(/MustStopMurad/.test(cap.node.innerHTML), "paint credits the creator from library.js");
assert(/href="https:\/\/x\.com\/MustStopMurad\/status\/1851221015289799104"/.test(cap.node.innerHTML), "paint links the credit to the original X post");
assert(/Community meme/.test(cap.node.innerHTML), "paint keeps a short grey caption label");

if (failed) {
  console.error("\n" + failed + " learn-hero test(s) failed");
  process.exit(1);
}
console.log("\nall learn-hero tests passed");
