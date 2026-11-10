// TinyNN evo.js — evolution-strategy fine-tuner (no gradients, no deps).
// Breeds what gradients can't choose: gate/mixer genes + the settle target.
// Starts FROM a trained checkpoint (never from scratch — the from-scratch
// random walk was ruled out by fresh-eyes). Antithetic +/- pairs (textbook
// variance reduction) + strict elitism (best never regresses).
// Fitness is forward-only and dense: ID + familiar-kill + short-gap + long-gap
// form a slope toward the wall, so evolution gets a gradient of difficulty,
// not pass/fail. All evals at r=1 on small fixed slices — seconds on CPU.
(function () {
"use strict";
const T = window.TinyNN;
const G = window.__tinyNN;

const ALLOWED_ALL = [];
for (let k = 0; k < 4; k++) for (let v = 0; v < 4; v++) {
  if (!TASKS_DIAG(k * 4 + v)) ALLOWED_ALL.push(k * 4 + v);
}
function TASKS_DIAG(c) { return c === 0 || c === 5 || c === 10 || c === 15; }

// Gene subsets: evolution operates on whole Linears, never single weights.
// Geo arch (Wf/Wr/Wp/Wl/Lzc/L1c/LoutQ) and attn arch (Wq/Wk/Wv/Wa/Lz/Lout)
// both supported; unknown `which` falls back to all params.
function geneParams(model, which) {
  if (model.Wq) { // attention arch
    if (which === "attn") return [model.Wq.W, model.Wq.b, model.Wk.W, model.Wk.b, model.Wv.W, model.Wv.b, model.Wa.W, model.Wa.b];
    if (which === "gate") return [model.Lz.W, model.Lz.b];
    if (which === "readout") return [model.Lout.W, model.Lout.b];
    return model.params();
  }
  if (which === "gate") return [model.Wf.W, model.Wf.b];
  if (which === "mixer") return [model.Wr.W, model.Wr.b, model.Wp.W, model.Wp.b, model.Wl.W, model.Wl.b];
  if (which === "inject") return [model.Lzc.W, model.Lzc.b, model.L1c.W, model.L1c.b];
  if (which === "readout") return [model.LoutQ.W, model.LoutQ.b, model.Lout.W, model.Lout.b];
  return model.params();
}

function perturbInto(child, rng, sigma, sign, which) {
  const genes = geneParams(child, which);
  for (const p of genes) for (let i = 0; i < p.v.length; i++) p.v[i] += sign * sigma * rng.normal(1);
}

function makeSets(task, seed, n) {
  n = n || 100;
  seed = seed || 0; // honored (2026-11-10 fix — was `void seed`, re-dealing identical slices every round)
  return {
    id: task.makeTestIn(11 + (seed % 89)).slice(0, n),
    fam: T.TASKS.assocG.killMatrix(61 + seed, 8, ALLOWED_ALL, ALLOWED_ALL).slice(0, n),
    gap4: T.TASKS.assocG.makeGap(51 + seed * 2, 4).slice(0, n),
    gap20: T.TASKS.assocG.makeGap(52 + seed * 2, 20).slice(0, n)
  };
}

function fitness(model, task, sets, w) {
  void task;
  w = w || { id: 0.3, fam: 0.3, gap4: 0.2, gap20: 0.2 };
  const ev = (d) => T.evaluate(model, d, 1).acc;
  const parts = { id: ev(sets.id), fam: ev(sets.fam), gap4: ev(sets.gap4), gap20: ev(sets.gap20) };
  // noise estimate: binomial SE per part (floored), weighted RMS combined.
  // Slices of 150 at p~0.45 carry +-0.04 — gains below this are luck.
  let se2 = 0;
  for (const k of Object.keys(parts)) {
    const n = Math.max(sets[k].length, 1), p = parts[k];
    const se = Math.sqrt(Math.max(p * (1 - p), 0.0025) / n);
    se2 += (w[k] * se) * (w[k] * se);
  }
  return { f: w.id * parts.id + w.fam * parts.fam + w.gap4 * parts.gap4 + w.gap20 * parts.gap20, parts, se: Math.sqrt(se2) };
}

// opts: {base, task, sets?, sigma=0.02, pop=8 (antithetic pairs), gens=3,
//        seed=7, which="gate", w?, fitN=100, start?, hist?}. start/hist allow
//        continuing a campaign across calls (early stopping decided upstream).
async function evolve(opts) {
  const rng = G.makeRng(opts.seed || 7);
  let sets = opts.sets || makeSets(opts.task, opts.seed || 7, opts.fitN || 100);
  const pairs = opts.pop || 8, sigma = opts.sigma == null ? 0.02 : opts.sigma;
  const gens = opts.gens || 3, which = opts.which || "gate";
  const margin = opts.margin || 0;
  const resample = !!opts.resample && !opts.sets;
  const seedBase = opts.seed || 7, fitN = opts.fitN || 100;
  let champ = opts.start || opts.base.clone();
  let champFit = fitness(champ, opts.task, sets, opts.w);
  const hist = opts.hist || [{ gen: 0, f: +champFit.f.toFixed(4), parts: champFit.parts }];
  const g0 = hist.length - 1;
  for (let g = 1; g <= gens; g++) {
    let improved = false;
    if (resample) {
      // fresh slices every round (cross-validation analog): nothing fixed
      // to memorize. Champ is re-scored on the new slices so the comparison
      // stays fair; its fresh-slice curve is the generalization monitor.
      sets = makeSets(opts.task, seedBase + g0 + g, fitN);
      champFit = fitness(champ, opts.task, sets, opts.w);
    }
    for (let i = 0; i < pairs; i++) {
      for (const sign of [1, -1]) {
        const child = champ.clone();
        perturbInto(child, rng, sigma, sign, which);
        const f = fitness(child, opts.task, sets, opts.w);
        // margin (in SE units via opts.marginSe, or absolute via margin):
        // gains below noise are luck, not learning.
        const bar = champFit.f + margin + (opts.marginSe || 0) * champFit.se;
        if (f.f > bar) { champ = child; champFit = f; improved = true; }
      }
      await new Promise((res) => setTimeout(res, 0)); // keep UI alive
    }
    hist.push({ gen: g0 + g, f: +champFit.f.toFixed(4), se: +champFit.se.toFixed(4), parts: champFit.parts, improved });
  }
  return { best: champ, bestFit: champFit, hist };
}

// Guard: plumbing only (fitness finite, elitism holds, perturbation real).
async function quickEvoTest() {
  const task = T.TASKS.assocC_gist;
  const out = await T.trainModel(
    { vocab: 9, classes: 4, h: 16, m: 32, arch: "geo", geoMode: "choosy", train: task.makeTrain(7), steps: 200, batch: 16, lr: 5e-3, rMode: "mix", seed: 7, prefixLabels: task.prefixLabels },
    null
  );
  const sets = makeSets(task, 7);
  for (const k of Object.keys(sets)) sets[k] = sets[k].slice(0, 50);
  const parent = fitness(out.model, task, sets);
  const ev = await evolve({ base: out.model, task, sets, sigma: 0.05, pop: 2, gens: 1, seed: 8, which: "gate" });
  // perturbation moved real weight?
  const pa = out.model.Wf.W.v, pb = ev.best.Wf.W.v;
  let diff = 0;
  for (let i = 0; i < pa.length; i++) diff = Math.max(diff, Math.abs(pa[i] - pb[i]));
  const ok = isFinite(parent.f) && isFinite(ev.bestFit.f) && ev.bestFit.f >= parent.f - 1e-12;
  // fair-fitness smoke: resample + noise-margin path runs, se finite.
  const ev2 = await evolve({ base: out.model, task, sigma: 0.05, pop: 2, gens: 1, seed: 9, which: "gate", resample: true, fitN: 50, marginSe: 1 });
  const ok2 = isFinite(ev2.bestFit.f) && ev2.hist.length === 2 && isFinite(ev2.hist[1].se);
  return { parentF: +parent.f.toFixed(4), bestF: +ev.bestFit.f.toFixed(4), maxWfMove: +diff.toExponential(2), fairF: +ev2.bestFit.f.toFixed(4), fairSe: ev2.hist[1].se, ok: ok && ok2 };
}

window.TinyNN.evo = { evolve, fitness, makeSets, quickEvoTest };
})();
