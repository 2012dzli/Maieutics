// src/tinynn/gseries.js — G-series harness (paper §8.1).
//
// Chains teaching generations: a frozen tutor supervises fresh students
// through staged fade; ignited winners become the next generation's tutor.
// Stops when a generation rots (0 ignitions) or after G5.
//
// METHOD (explicit choices — the D-wave scripts were lost in a scratch wipe,
// so this is a documented rebuild, not a replication):
// - Tutor T0: hint-trained (bind labels + attention supervision) on an
//   allowed-12 pool with fair slots. Must pass the §3.4 gate
//   (killA ~1.00, Hd ~0.88, Hu ~1.00) or the series does not start.
// - Students: fresh same-arch nets, hard labels OFF (answers come only via
//   the tutor's soft targets — the pure transmission test, matching the
//   D1-vs-D2 isolation), soft targets (T=1) + attention supervision with a
//   staged keep probability (fast fade 100→50→0% over 3k steps).
// - Fresh Adam optimizer per generation (not carried across stages).
// - Eval at r=4 (lab convention); ignition = killA>=0.60 && killHd>=0.55.
// - Exams use seeds disjoint from training seeds; 200 examples each.
// - Serialize = full Float64 params to JSON (exact, no quantization).
(function () {
"use strict";
if (!window.TinyNN || !window.__tinyNN) throw new Error("gseries: TinyNN not loaded");
const T = window.TinyNN, G = window.__tinyNN;

const DIAG = [0, 5, 10, 15];
const ALLOWED12 = [];
for (let k = 0; k < 4; k++) for (let v = 0; v < 4; v++) {
  const c = k * 4 + v;
  if (DIAG.indexOf(c) < 0) ALLOWED12.push(c);
}
const EVAL_R = 4;

// ---- pools + exams (allowed-12, fair slots) ----
function longRestricted(rng, allowed) {
  const tk = rng.int(4);
  const topts = [];
  for (let v = 0; v < 4; v++) if (allowed.indexOf(tk * 4 + v) >= 0) topts.push(v);
  const tv = topts[rng.int(topts.length)];
  const pos = rng.int(9), x = [];
  for (let s = 0; s <= 8; s++) {
    if (s === pos) { x.push(tk, 4 + tv); continue; }
    let k = rng.int(4);
    while (k === tk) k = rng.int(4);
    const vopts = [];
    for (let v = 0; v < 4; v++) if (allowed.indexOf(k * 4 + v) >= 0) vopts.push(v);
    x.push(k, 4 + vopts[rng.int(vopts.length)]);
  }
  x.push(tk, 8);
  return { x, y: tv };
}
function buildPool(seed, allowed) {
  allowed = allowed || ALLOWED12;
  const Ag = T.TASKS.assocG, rng = G.makeRng(seed), data = [];
  for (let i = 0; i < 500; i++) data.push(Ag.genRestr(rng, 1 + rng.int(3), allowed));
  for (let i = 0; i < 500; i++) data.push(longRestricted(rng, allowed));
  return data;
}
function killAExam(seed, allowed) {
  allowed = allowed || ALLOWED12;
  const rng = G.makeRng(seed), data = [];
  for (let i = 0; i < 200; i++) {
    const pick = allowed[rng.int(allowed.length)];
    const tk = Math.floor(pick / 4), tv = pick % 4, x = [tk, 4 + tv];
    for (let f = 0; f < 8; f++) {
      let k = rng.int(4);
      while (k === tk) k = rng.int(4);
      const vopts = [];
      for (let v = 0; v < 4; v++) if (allowed.indexOf(k * 4 + v) >= 0) vopts.push(v);
      x.push(k, 4 + vopts[rng.int(vopts.length)]);
    }
    x.push(tk, 8);
    data.push({ x, y: tv });
  }
  return data;
}
function buildExams(seed, allowed) {
  allowed = allowed || ALLOWED12;
  const Ag = T.TASKS.assocG;
  return {
    killA: killAExam(seed + 1, allowed),
    killHd: Ag.killMatrix(seed + 2, 8, DIAG, allowed),
    killDa: Ag.killMatrix(seed + 3, 8, allowed, DIAG),
    killHu: Ag.killMatrix(seed + 4, 8, DIAG, DIAG),
    indist: Ag.makeTrainHoldout(seed + 5, allowed).slice(0, 200)
  };
}

// ---- serialization (exact Float64, no quantization) ----
function walkParams(model, fn, path) {
  path = path || [];
  (function walk(o, p) {
    if (!o || typeof o !== "object") return;
    if (o.v instanceof Float64Array && o.g instanceof Float64Array) { fn(o, p.join(".")); return; }
    if (o instanceof Float64Array) return; // caches, not params
    if (Array.isArray(o)) { for (let i = 0; i < o.length; i++) walk(o[i], p.concat(i)); return; }
    for (const k of Object.keys(o)) {
      if (k === "cache" || k === "g") continue;
      walk(o[k], p.concat(k));
    }
  })(model, path);
}
function saveModel(model, opts) {
  const params = [];
  walkParams(model, (p, path) => params.push({ path, v: Array.from(p.v) }));
  return { format: "gseries-1", opts, params };
}
function loadModel(data) {
  if (!data || data.format !== "gseries-1") throw new Error("bad gseries blob");
  const model = T.makeModel(G.makeRng(1), data.opts);
  const live = [];
  walkParams(model, (p, path) => live.push({ path, ref: p }));
  if (live.length !== data.params.length) throw new Error("param count mismatch");
  for (let i = 0; i < live.length; i++) {
    const a = live[i], b = data.params[i];
    if (a.path !== b.path || a.ref.v.length !== b.v.length)
      throw new Error("param mismatch at " + a.path);
    a.ref.v.set(b.v);
    a.ref.g.fill(0);
  }
  return model;
}

// tutor-logit cache: pool is fixed, so precompute tutor logits once per
// (example, r) instead of re-running the frozen tutor every step.
async function cacheTutor(tutor, train, onTick) {
  const cache = new Array(train.length * 4);
  for (let i = 0; i < train.length; i++) {
    for (let r = 1; r <= 4; r++) {
      cache[i * 4 + (r - 1)] = Array.from(tutor.forward(train[i].x, r).logits);
    }
    if (i % 25 === 24) {
      if (onTick) onTick(i + 1, train.length);
      await new Promise((res) => setTimeout(res, 0)); // keep UI alive
    }
  }
  return cache;
}
function softmaxInto(out, logits) {
  let m = -1e30;
  for (let i = 0; i < logits.length; i++) if (logits[i] > m) m = logits[i];
  let s = 0;
  for (let i = 0; i < logits.length; i++) { out[i] = Math.exp(logits[i] - m); s += out[i]; }
  for (let i = 0; i < out.length; i++) out[i] /= s;
  return out;
}

// ---- staged fade trainer ----
// opts: {model, tutor|null, train, stages:[{steps, attnKeep, softW, hardW}],
//        rMode, batch, lr, seed, auxFn, auxW, attnAuxW, onTick}
// hardW: hard-label weight (tutors 1.0; students 0 = pure transmission test,
// answers come only via the tutor's soft targets). One backward per example.
async function trainFaded(opts) {
  const rng = opts.rng || G.makeRng(opts.seed || 7);
  const model = opts.model, tutor = opts.tutor || null;
  const opt = opts.adam || new G.Adam(opts.lr || 5e-3);
  const B = opts.batch || 16;
  const auxFn = opts.auxFn || null;
  const auxW = opts.auxW != null ? opts.auxW : 1.0;
  const attnAuxW = opts.attnAuxW != null ? opts.attnAuxW : 1.0;
  const bounds = [];
  let acc = 0;
  for (const st of opts.stages) { acc += st.steps; bounds.push(acc); }
  const total = acc;
  const hist = [];
  let firstLoss = 0;
  const ps = new Float64Array(4), pt = new Float64Array(4);
  for (let step = 1; step <= total; step++) {
    let si = 0;
    while (step > bounds[si]) si++;
    const st = opts.stages[si];
    const r = opts.rMode === 1 ? 1 : 1 + rng.int(4);
    model.zeroGrad();
    let loss = 0;
    for (let b = 0; b < B; b++) {
      const idx = rng.int(opts.train.length);
      const ex = opts.train[idx];
      const fw = model.forward(ex.x, r);
      let dMain = null;
      const hardW = st.hardW != null ? st.hardW : 0;
      if (hardW) {
        const ce = G.softmaxCE(fw.logits, ex.y);
        loss += hardW * ce.loss;
        dMain = ce.dlogits;
        for (let i = 0; i < dMain.length; i++) dMain[i] *= hardW / B;
      }
      if (tutor && st.softW) {
        if (opts.tutorCache) softmaxInto(pt, opts.tutorCache[idx * 4 + (r - 1)]);
        else { const tfw = tutor.forward(ex.x, r); softmaxInto(pt, tfw.logits); }
        softmaxInto(ps, fw.logits);
        if (!dMain) dMain = new Float64Array(ps.length);
        for (let i = 0; i < ps.length; i++) {
          loss += (-pt[i] * Math.log(ps[i] + 1e-12)) * st.softW;
          dMain[i] += (ps[i] - pt[i]) * st.softW / B;
        }
      }
      let attnX = null;
      if (st.attnKeep > 0 && fw.cache.steps && rng.uniform(0, 1) < st.attnKeep) {
        const sup = T.attnSupervision(ex, fw);
        if (sup) {
          loss += attnAuxW * sup.loss;
          const dw = sup.dw;
          for (let j = 0; j < dw.length; j++) dw[j] *= attnAuxW / B;
          attnX = { dw };
        }
      }
      let auxList = null;
      if (auxFn && fw.cache.posOut) {
        const labs = auxFn(ex.x);
        auxList = new Array(ex.x.length);
        for (let t = 0; t < ex.x.length; t++) {
          if (labs[t] == null) { auxList[t] = null; continue; }
          const ceT = G.softmaxCE(fw.cache.posOut[t].logits, labs[t]);
          loss += (auxW * ceT.loss) / ex.x.length;
          const dt = ceT.dlogits;
          for (let i = 0; i < dt.length; i++) dt[i] *= auxW / (B * ex.x.length);
          auxList[t] = dt;
        }
      }
      // single backward per example: main (hard+soft) + aux + attn accumulate
      if (dMain || attnX || auxList) {
        model.backward(dMain || new Float64Array(fw.logits.length), fw, auxList, attnX, null);
      }
    }
    opt.step(model.params());
    loss /= B;
    if (step === 1) firstLoss = loss;
    if (step % 50 === 0 || step === total) {
      hist.push({ step, loss });
      if (opts.onTick) opts.onTick({ step, of: total, loss });
      await new Promise((res) => setTimeout(res, 0));
    }
  }
  return { model, adam: opt, rng, hist, firstLoss, lastLoss: hist.length ? hist[hist.length - 1].loss : 0 };
}

function evalSuite(model, exams, r) {
  r = r || EVAL_R;
  const out = {};
  for (const k of Object.keys(exams)) out[k] = +T.evaluate(model, exams[k], r).acc.toFixed(4);
  return out;
}
function ignites(s) { return s.killA >= 0.60 && s.killHd >= 0.55; }

const FAST_FADE = [
  { steps: 1000, attnKeep: 1.0, softW: 1.0, hardW: 0 },
  { steps: 1000, attnKeep: 0.5, softW: 1.0, hardW: 0 },
  { steps: 1000, attnKeep: 0.0, softW: 1.0, hardW: 0 }
];
const HINTED = [
  { steps: 1200, attnKeep: 1.0, softW: 0, hardW: 1.0 }
];

window.TinyNN.gseries = {
  DIAG, ALLOWED12, EVAL_R, FAST_FADE, HINTED, cacheTutor,
  buildPool, buildExams, killAExam, saveModel, loadModel,
  trainFaded, evalSuite, ignites
};
})();
