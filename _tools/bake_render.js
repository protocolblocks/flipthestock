#!/usr/bin/env node
/* Runs the site's own renderers (stacks.js) against library.js with a tiny DOM
   stub and prints the HTML each list would draw, as JSON. _tools/bake_pages.py
   writes that HTML into the pages, so the static markup and the script's
   markup come from one source and cannot drift apart.

   Usage: node _tools/bake_render.js
   Env:   BAKE_NOW  optional ISO time to pretend it is (used by tests).
   Jekyll skips folders starting with "_", so this file is not published. */
"use strict";
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");

if (process.env.BAKE_NOW) {
  const fixed = Date.parse(process.env.BAKE_NOW);
  if (isNaN(fixed)) throw new Error("BAKE_NOW is not a valid date");
  Date.now = function () { return fixed; };
}

class El {
  constructor(id) {
    this.id = id || "";
    this.innerHTML = "";
    this.attrs = {};
    this.children = {};
    this.nextElementSibling = null;
  }
  getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null; }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  addEventListener() {}
  insertAdjacentHTML() {
    // Pager buttons need the script, so they are not baked. The script adds them.
    this.nextElementSibling = { classList: { contains() { return false; } }, addEventListener() {}, remove() {} };
  }
  querySelector(selector) {
    if (selector === "[data-most]") {
      if (!this.children[selector]) this.children[selector] = new El("");
      return this.children[selector];
    }
    return null; // e.g. ".twitter-tweet": widgets are loaded by the browser only
  }
  scrollIntoView() {}
}

const elements = {};
function el(id) {
  if (!elements[id]) elements[id] = new El(id);
  return elements[id];
}

// In a browser window is the global object, so bare names like renderMostRead resolve.
global.window = global;
global.STACKS_BAKE_MODE = true;
global.document = {
  getElementById: el,
  querySelectorAll() { return []; },
  querySelector() { return null; },
  addEventListener() {}
};
global.location = { search: "", hash: "", href: "https://www.flipthestock.com/", pathname: "/" };
global.history = { replaceState() {} };

function load(file) {
  (0, eval)(fs.readFileSync(path.join(root, file), "utf8"));
}
load("library.js");
load("stacks.js");

const w = global.window;
function need(name) {
  if (typeof w[name] !== "function") throw new Error("stacks.js does not define " + name);
  return w[name];
}

// What each page draws, and where. Keep in step with the inline scripts in the pages.
const jobs = {
  "index.html": [
    ["news-grid", "renderNews", []],
    ["meme-row", "renderFrontMemes", []],
    ["video-row", "renderFrontVideos", []]
  ],
  "articles/index.html": [
    ["stack", "renderArticles", []],
    ["rail", "renderRail", ["../"]]
  ],
  "memes/index.html": [
    ["stack", "renderMemes", []],
    ["rail", "renderRail", ["../"]]
  ],
  "videos/index.html": [
    ["stack", "renderVideos", []],
    ["rail", "renderRail", ["../"]]
  ],
  "events/index.html": [
    ["stack", "renderEvents", []],
    ["rail", "renderRail", ["../", { noEvents: true }]]
  ]
};

// Sub-elements the renderers fill in after drawing their root.
const fills = [
  ['<aside class="ft-most" id="most-read-slot" aria-label="Most read"></aside>',
    function () { return elements["most-read-slot"]; },
    function (inner) { return '<aside class="ft-most" id="most-read-slot" aria-label="Most read">' + inner + "</aside>"; }],
  ['<div class="ft-most" data-most></div>',
    function (root) { return root.children["[data-most]"]; },
    function (inner) { return '<div class="ft-most" data-most>' + inner + "</div>"; }]
];

const out = {};
Object.keys(jobs).forEach(function (page) {
  out[page] = {};
  jobs[page].forEach(function (job) {
    const id = job[0];
    // Each page has its own #stack and #rail, so start from clean elements.
    Object.keys(elements).forEach(function (k) { delete elements[k]; });
    const rootEl = el(id);
    need(job[1]).apply(null, [rootEl].concat(job[2]));
    let html = rootEl.innerHTML;
    fills.forEach(function (fill) {
      const slot = fill[1](rootEl);
      if (slot && html.indexOf(fill[0]) !== -1) html = html.replace(fill[0], function () { return fill[2](slot.innerHTML); });
    });
    out[page][id] = html;
  });
});
process.stdout.write(JSON.stringify(out));
