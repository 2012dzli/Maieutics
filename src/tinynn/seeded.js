// TinyNN seeded.js — vendored string-seed dice (own drawer copy).
// ORIGIN: core stream vendored from seeder-plugin (Perchance {import:seeder-plugin},
// imports/seeder-plugin/main.pjs — xfnv1a hash + integer mixer). No Perchance
// wrapper here: no $output, no window.__ cache, no Math.random hijack, no network.
// Pure JS, runs anywhere. License of upstream unknown (tiny public snippet);
// this file is our clean-room adapter around the same public-domain-class
// algorithm (xfnv1a per https://github.com/sindresorhus/fnv1a + mulberry-style
// advance also used by our nn.js mulberry32).
//
// Why: bench runs were numeric-seed only (nn.js makeRng). This adds string
// seeds ("milo", "seed-42") so ?seed= links are human-meaningful and shared
// configs replay bit-identically. Numeric seeds behave EXACTLY as before.
(function () {
"use strict";

function xfnv1a(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

// Same advance as seeder-plugin's stream (a += 0x6D2B79F5 + imul mix).
// Kept byte-compatible with the plugin so old ?seed= numbers replay.
function streamFromWord(a) {
  a = a >>> 0;
  return function () {
    let t = (a += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function stringToSeed(s) {
  return xfnv1a(String(s));
}

// Accepts numbers (legacy path, untouched) or strings (hashed then streamed).
// Returns the same {uniform, int, normal} shape as nn.js makeRng so all
// train/eval call sites work unchanged.
function makeSeededRng(seed) {
  if (typeof seed === "number" && Number.isFinite(seed)) {
    const base = window.__tinyNN && window.__tinyNN.makeRng
      ? window.__tinyNN.makeRng(seed)
      : null;
    if (base) { base.__seedKind = "numeric"; base.__seedValue = seed; return base; }
  }
  const f = streamFromWord(stringToSeed(seed));
  let spare = null;
  const rng = {
    uniform(a, b) { return a + (b - a) * f(); },
    int(n) { return Math.floor(f() * n); },
    normal(scale) {
      if (spare !== null) { const v = spare * scale; spare = null; return v; }
      let u = 0; const v = f();
      while (u === 0) u = f();
      const m = Math.sqrt(-2 * Math.log(u));
      spare = m * Math.sin(2 * Math.PI * v);
      return m * Math.cos(2 * Math.PI * v) * scale;
    },
    __seedKind: "string",
    __seedValue: String(seed),
    __seedWord: stringToSeed(seed)
  };
  return rng;
}

// Lab helper: "7" -> 7 (legacy numeric), anything else stays a string.
function parseSeed(raw) {
  if (raw === undefined || raw === null) return 7;
  const s = String(raw).trim();
  if (s === "") return 7;
  if (/^-?\d+$/.test(s)) {
    const n = parseInt(s, 10);
    if (Number.isSafeInteger(n)) return n;
  }
  return s;
}

// ---- Bench samplers (vendored equivalents of the G4 sampling plugins) ----
// The Perchance plugins operate on Perchance lists (select-until retries
// selectOne, random-select does odds choice, fixed-until-reload caches one
// draw per page load). Our bench draws from seeded pools instead, so the
// equivalents live here as pure functions on our rngs — same semantics,
// deterministic under the same seed, no page-global state.
//   sampleUntil  ~= select-until-plugin  (retry draw until cond, capped)
//   weightedPick ~= random-select-plugin  (odds-proportioned choice)
//   stableIndex  ~= fixed-until-reload-plugin (one stable pick per seed)
function sampleUntil(rng, drawFn, condFn, maxTries) {
  maxTries = maxTries == null ? 100 : maxTries;
  let last = null;
  for (let t = 0; t < maxTries; t++) {
    last = drawFn(rng, t);
    if (condFn(last, t)) return { value: last, tries: t + 1, found: true };
  }
  return { value: last, tries: maxTries, found: false };
}

function weightedPick(rng, items, odds) {
  if (!items.length) return undefined;
  const w = odds && odds.length === items.length ? odds : items.map(() => 1);
  let total = 0;
  for (let i = 0; i < w.length; i++) total += Math.max(0, w[i]);
  if (!(total > 0)) return items[items.length - 1];
  let x = rng.uniform(0, total);
  for (let i = 0; i < items.length; i++) {
    x -= Math.max(0, w[i]);
    if (x <= 0) return items[i];
  }
  return items[items.length - 1];
}

function stableIndex(seed, n, salt) {
  const word = stringToSeed(String(seed) + (salt || "#stable"));
  return word % Math.max(1, n);
}

// Lucky-dip word seeds for the lab seed box (weighted: short words likelier).
const SURPRISE_WORDS = ["milo", "wren", "fig", "juno", "pebble", "moss", "tansy", "bramble", "sorrel", "lark", "cinder", "fern"];
const SURPRISE_ODDS = [3, 3, 3, 2, 2, 2, 1, 1, 1, 2, 1, 2];

const T = window.__tinyNN || (window.__tinyNN = {});
T.makeSeededRng = makeSeededRng;
T.stringToSeed = stringToSeed;
T.parseSeed = parseSeed;
T.sampleUntil = sampleUntil;
T.weightedPick = weightedPick;
T.stableIndex = stableIndex;
T.SURPRISE_WORDS = SURPRISE_WORDS;
T.SURPRISE_ODDS = SURPRISE_ODDS;
})();
