// TinyNN nn.js — hand-rolled neural core for Phase 2. Zero dependencies, CPU only.
// A recurrent-depth MLP mirroring the paper's macro design:
//   e = P(x)            (embed + mean-pool + RMSNorm)
//   s(i) = R(e, s(i-1)) (concat input injection + residual MLP + norms, looped r times)
//   p = C(s(r))         (RMSNorm + linear head)
// Manual backprop (full BPTT over the unrolled loop) + Adam. Deterministic via seed.
(function () {
"use strict";

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeRng(seed) {
  const f = mulberry32((seed >>> 0) || 1);
  let spare = null;
  return {
    uniform(a, b) { return a + (b - a) * f(); },
    int(n) { return Math.floor(f() * n); },
    normal(scale) {
      if (spare !== null) { const v = spare * scale; spare = null; return v; }
      let u = 0; const v = f();
      while (u === 0) u = f();
      const m = Math.sqrt(-2 * Math.log(u));
      spare = m * Math.sin(2 * Math.PI * v);
      return m * Math.cos(2 * Math.PI * v) * scale;
    }
  };
}

function z(n) { return new Float64Array(n); }

// ---- RMSNorm (no affine gain — keeps the tiny model stable) ----
function rmsForward(x) {
  const n = x.length;
  let s = 0;
  for (let i = 0; i < n; i++) s += x[i] * x[i];
  s /= n;
  const inv = 1 / Math.sqrt(s + 1e-8);
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) y[i] = x[i] * inv;
  return { y, cache: { x: x.slice(), inv } };
}
function rmsBackward(dy, c) {
  const x = c.x, inv = c.inv, n = x.length;
  let dot = 0;
  for (let i = 0; i < n; i++) dot += dy[i] * x[i];
  dot /= n;
  const k = inv * inv * dot;
  const dx = new Float64Array(n);
  for (let i = 0; i < n; i++) dx[i] = inv * (dy[i] - x[i] * k);
  return dx;
}

// ---- SiLU ----
function sig(x) { return 1 / (1 + Math.exp(-x)); }
function siluForward(xpre) {
  const n = xpre.length, y = new Float64Array(n);
  for (let i = 0; i < n; i++) y[i] = xpre[i] * sig(xpre[i]);
  return y;
}
function siluBackward(dy, xpre) {
  const n = dy.length, dx = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const s = sig(xpre[i]);
    dx[i] = dy[i] * (s + xpre[i] * s * (1 - s));
  }
  return dx;
}

function sigForward(x) {
  const n = x.length, y = new Float64Array(n);
  for (let i = 0; i < n; i++) y[i] = sig(x[i]);
  return y;
}
function sigBackward(dy, y) {
  const n = dy.length, dx = new Float64Array(n);
  for (let i = 0; i < n; i++) dx[i] = dy[i] * y[i] * (1 - y[i]);
  return dx;
}

// ---- Linear ----
class Linear {
  constructor(rng, inF, outF) {
    const a = Math.sqrt(2 / inF);
    this.inF = inF; this.outF = outF;
    this.W = { v: new Float64Array(outF * inF), g: new Float64Array(outF * inF) };
    this.b = { v: new Float64Array(outF), g: new Float64Array(outF) };
    for (let i = 0; i < this.W.v.length; i++) this.W.v[i] = rng.uniform(-a, a);
  }
  forward(x) {
    const inF = this.inF, outF = this.outF, W = this.W.v;
    const y = new Float64Array(outF);
    for (let o = 0; o < outF; o++) {
      let s = this.b.v[o];
      const off = o * inF;
      for (let i = 0; i < inF; i++) s += W[off + i] * x[i];
      y[o] = s;
    }
    return { y, x };
  }
  backward(dy, c) {
    const inF = this.inF, outF = this.outF, x = c.x;
    const W = this.W.v, dW = this.W.g;
    const dx = new Float64Array(inF);
    for (let o = 0; o < outF; o++) {
      const d = dy[o];
      this.b.g[o] += d;
      const off = o * inF;
      for (let i = 0; i < inF; i++) { dW[off + i] += d * x[i]; dx[i] += W[off + i] * d; }
    }
    return dx;
  }
}

// ---- Recurrent-depth model (P, R, C) ----
class RecModel {
  constructor(rng, vocab, h, m, classes, maxLen) {
    this.h = h; this.vocab = vocab; this.classes = classes; this.m = m;
    this.maxLen = maxLen || 0; // >0: concat prelude with padding (pad id = vocab)
    const rows = vocab + (this.maxLen ? 1 : 0);
    const es = Math.sqrt(1 / h);
    this.E = { v: new Float64Array(rows * h), g: new Float64Array(rows * h) };
    for (let i = 0; i < this.E.v.length; i++) this.E.v[i] = rng.uniform(-es, es);
    if (this.maxLen) this.Lpre = new Linear(rng, this.maxLen * h, h);
    this.L1 = new Linear(rng, 2 * h, m);
    this.L2 = new Linear(rng, m, h);
    this.Lout = new Linear(rng, h, classes);
  }
  params() {
    const ps = [this.E, this.L1.W, this.L1.b, this.L2.W, this.L2.b, this.Lout.W, this.Lout.b];
    if (this.Lpre) { ps.push(this.Lpre.W, this.Lpre.b); }
    return ps;
  }
  zeroGrad() { for (const p of this.params()) p.g.fill(0); }
  forward(x, r) {
    const h = this.h, E = this.E.v;
    let eN, lpre = null, L = x.length;
    if (this.maxLen) {
      const cat = new Float64Array(this.maxLen * h);
      for (let t = 0; t < this.maxLen; t++) {
        const id = t < L ? x[t] : this.vocab; // pad id
        cat.set(E.subarray(id * h, (id + 1) * h), t * h);
      }
      lpre = this.Lpre.forward(cat);
      eN = rmsForward(lpre.y);
    } else {
      // sum-pool over the sequence (RMSNorm right after keeps the scale
      // stable for any length; the recurrent core sees a fixed-size vector).
      const e = z(h);
      for (let t = 0; t < L; t++) {
        const off = x[t] * h;
        for (let i = 0; i < h; i++) e[i] += E[off + i];
      }
      eN = rmsForward(e);
    }
    let s = z(h);
    const iters = [];
    for (let k = 0; k < r; k++) {
      const u = new Float64Array(2 * h);
      u.set(s, 0); u.set(eN.y, h);
      const l1 = this.L1.forward(u);
      const r1 = rmsForward(l1.y);
      const a = siluForward(r1.y);
      const l2 = this.L2.forward(a);
      const add = new Float64Array(h);
      for (let i = 0; i < h; i++) add[i] = s[i] + l2.y[i];
      const r2 = rmsForward(add);
      iters.push({ sPrev: s, l1, r1, aPre: r1.y, l2, r2 });
      s = r2.y;
    }
    const rC = rmsForward(s);
    const lo = this.Lout.forward(rC.y);
    return { logits: lo.y, cache: { x: x.slice(), eN, lpre, iters, rC, lo, L, maxLen: this.maxLen } };
  }
  backward(dlogits, fw) {
    const h = this.h, c = fw.cache;
    let ds = rmsBackward(this.Lout.backward(dlogits, c.lo), c.rC.cache);
    const deAcc = z(h);
    const iters = c.iters;
    for (let k = iters.length - 1; k >= 0; k--) {
      const it = iters[k];
      const dadd = rmsBackward(ds, it.r2.cache);
      const da2 = this.L2.backward(dadd.slice(), it.l2);
      const da1 = siluBackward(da2, it.aPre);
      const dl1o = rmsBackward(da1, it.r1.cache);
      const du = this.L1.backward(dl1o, it.l1);
      const dsNew = new Float64Array(h);
      for (let i = 0; i < h; i++) { dsNew[i] = dadd[i] + du[i]; deAcc[i] += du[h + i]; }
      ds = dsNew;
    }
    const deEmb = rmsBackward(deAcc, c.eN.cache);
    const Eg = this.E.g;
    if (c.maxLen) {
      const dCat = this.Lpre.backward(deEmb, c.lpre);
      const upto = Math.min(c.L, this.maxLen);
      for (let t = 0; t < upto; t++) {
        const off = c.x[t] * h;
        for (let i = 0; i < h; i++) Eg[off + i] += dCat[t * h + i];
      }
    } else {
      const L = c.L;
      for (let t = 0; t < L; t++) {
        const off = c.x[t] * h;
        for (let i = 0; i < h; i++) Eg[off + i] += deEmb[i];
      }
    }
  }
  clone() {
    const m = Object.create(RecModel.prototype);
    m.h = this.h; m.vocab = this.vocab; m.classes = this.classes; m.m = this.m;
    m.maxLen = this.maxLen;
    const cp = (p) => ({ v: p.v.slice(), g: new Float64Array(p.v.length) });
    m.E = cp(this.E);
    const cL = (l) => {
      const o = Object.create(Linear.prototype);
      o.inF = l.inF; o.outF = l.outF; o.W = cp(l.W); o.b = cp(l.b);
      return o;
    };
    if (this.Lpre) m.Lpre = cL(this.Lpre);
    m.L1 = cL(this.L1); m.L2 = cL(this.L2); m.Lout = cL(this.Lout);
    return m;
  }
}

// ---- Adam ----
class Adam {
  constructor(lr) { this.lr = lr || 5e-3; this.t = 0; }
  step(params) {
    this.t++;
    const b1 = 0.9, b2 = 0.999, eps = 1e-8;
    const c1 = 1 - Math.pow(b1, this.t), c2 = 1 - Math.pow(b2, this.t);
    for (const p of params) {
      if (!p.m) { p.m = new Float64Array(p.v.length); p.vv = new Float64Array(p.v.length); }
      const m = p.m, vv = p.vv, g = p.g, v = p.v, lr = this.lr;
      for (let i = 0; i < v.length; i++) {
        m[i] = b1 * m[i] + (1 - b1) * g[i];
        vv[i] = b2 * vv[i] + (1 - b2) * g[i] * g[i];
        v[i] -= lr * (m[i] / c1) / (Math.sqrt(vv[i] / c2) + eps);
      }
    }
  }
}

// ---- Softmax cross-entropy ----
function softmaxCE(logits, y) {
  const n = logits.length;
  let mx = logits[0];
  for (let i = 1; i < n; i++) if (logits[i] > mx) mx = logits[i];
  const p = new Float64Array(n);
  let s = 0;
  for (let i = 0; i < n; i++) { p[i] = Math.exp(logits[i] - mx); s += p[i]; }
  for (let i = 0; i < n; i++) p[i] /= s;
  const loss = -Math.log(p[y] + 1e-12);
  const d = p.slice();
  d[y] -= 1;
  return { loss, dlogits: d };
}

// ---- Sequential-running-state model (Phase 2b) ----
// Same cell as RecModel, but unrolled over POSITIONS (fresh input each step)
// then over DEPTH (same cell, sequence summary re-injected — the paper's
// e re-injection). Length-agnostic by construction: no slots, no padding.
class SeqModel {
  constructor(rng, vocab, h, m, classes) {
    this.h = h; this.vocab = vocab; this.classes = classes; this.m = m;
    const es = Math.sqrt(1 / h);
    this.E = { v: new Float64Array(vocab * h), g: new Float64Array(vocab * h) };
    for (let i = 0; i < this.E.v.length; i++) this.E.v[i] = rng.uniform(-es, es);
    this.Lz = new Linear(rng, 2 * h, h); // update gate: keep vs take candidate
    this.L1 = new Linear(rng, 2 * h, m);
    this.L2 = new Linear(rng, m, h);
    this.Lout = new Linear(rng, h, classes);
  }
  params() {
    return [this.E, this.Lz.W, this.Lz.b, this.L1.W, this.L1.b, this.L2.W, this.L2.b, this.Lout.W, this.Lout.b];
  }
  zeroGrad() { for (const p of this.params()) p.g.fill(0); }
  cell(s, e, steps, isDepth) {
    const h = this.h;
    const u = new Float64Array(2 * h);
    u.set(s, 0); u.set(e, 0 + h);
    const lz = this.Lz.forward(u);
    const zv = sigForward(lz.y);
    const l1 = this.L1.forward(u);
    const r1 = rmsForward(l1.y);
    const a = siluForward(r1.y);
    const l2 = this.L2.forward(a);
    const cand = l2.y;
    const mix = new Float64Array(h);
    for (let i = 0; i < h; i++) mix[i] = (1 - zv[i]) * s[i] + zv[i] * cand[i];
    const r2 = rmsForward(mix);
    steps.push({ sPrev: s, u, lz, zv, l1, r1, aPre: r1.y, l2, cand, mix, r2, isDepth });
    return r2.y;
  }
  forward(x, r) {
    const h = this.h, L = x.length, E = this.E.v;
    let s = z(h);
    const steps = [];
    const posOut = []; // per-position readout (for step supervision)
    for (let t = 0; t < L; t++) {
      const e = E.subarray(x[t] * h, (x[t] + 1) * h);
      s = this.cell(s, e, steps, false);
      const rsP = rmsForward(s);
      const loP = this.Lout.forward(rsP.y);
      posOut.push({ logits: loP.y, rs: rsP, lo: loP });
    }
    const eb = z(h);
    for (let t = 0; t < L; t++) {
      const off = x[t] * h;
      for (let i = 0; i < h; i++) eb[i] += E[off + i];
    }
    for (let i = 0; i < h; i++) eb[i] /= L;
    const ebN = rmsForward(eb);
    for (let k = 0; k < r; k++) s = this.cell(s, ebN.y, steps, true);
    const rC = rmsForward(s);
    const lo = this.Lout.forward(rC.y);
    return { logits: lo.y, cache: { x: x.slice(), ebN, steps, posOut, rC, lo, L } };
  }
  // auxList[t]: optional scaled dlogits holding position t to its running label
  // (process supervision — teaches the running rule, not just the final answer).
  backward(dlogits, fw, auxList) {
    const h = this.h, c = fw.cache, E = this.E.v, Eg = this.E.g;
    let ds = rmsBackward(this.Lout.backward(dlogits, c.lo), c.rC.cache);
    const deBar = z(h);
    const steps = c.steps;
    for (let k = steps.length - 1; k >= 0; k--) {
      const it = steps[k];
      if (auxList && k < c.L && auxList[k]) {
        const po = c.posOut[k];
        const dsA = rmsBackward(this.Lout.backward(auxList[k], po.lo), po.rs.cache);
        const sum = new Float64Array(h);
        for (let i = 0; i < h; i++) sum[i] = ds[i] + dsA[i];
        ds = sum;
      }
      const dmix = rmsBackward(ds, it.r2.cache);
      const dz = new Float64Array(h);
      const dsKeep = new Float64Array(h);
      const dcand = new Float64Array(h);
      for (let i = 0; i < h; i++) {
        dz[i] = dmix[i] * (it.cand[i] - it.sPrev[i]);
        dsKeep[i] = dmix[i] * (1 - it.zv[i]);
        dcand[i] = dmix[i] * it.zv[i];
      }
      const da2 = this.L2.backward(dcand, it.l2);
      const da1 = siluBackward(da2, it.aPre);
      const dl1o = rmsBackward(da1, it.r1.cache);
      const du1 = this.L1.backward(dl1o, it.l1);
      const dg = sigBackward(dz, it.zv);
      const duz = this.Lz.backward(dg, it.lz);
      const dsNew = new Float64Array(h);
      for (let i = 0; i < h; i++) dsNew[i] = dsKeep[i] + du1[i] + duz[i];
      ds = dsNew;
      const deStep = new Float64Array(h);
      for (let i = 0; i < h; i++) deStep[i] = du1[h + i] + duz[h + i];
      if (it.isDepth) {
        for (let i = 0; i < h; i++) deBar[i] += deStep[i];
      } else {
        // position steps index back into the sequence in reverse; recover t:
        // steps[0..L-1] are positions in order, steps[L..] are depth.
        const t = k; // k < L here since depth steps come last
        const off = c.x[t] * h;
        for (let i = 0; i < h; i++) Eg[off + i] += deStep[i];
      }
    }
    const deEmb = rmsBackward(deBar, c.ebN.cache);
    const L = c.L;
    for (let t = 0; t < L; t++) {
      const off = c.x[t] * h;
      for (let i = 0; i < h; i++) Eg[off + i] += deEmb[i] / L;
    }
  }
  clone() {
    const m = Object.create(SeqModel.prototype);
    m.h = this.h; m.vocab = this.vocab; m.classes = this.classes; m.m = this.m;
    const cp = (p) => ({ v: p.v.slice(), g: new Float64Array(p.v.length) });
    m.E = cp(this.E);
    const cL = (l) => {
      const o = Object.create(Linear.prototype);
      o.inF = l.inF; o.outF = l.outF; o.W = cp(l.W); o.b = cp(l.b);
      return o;
    };
    m.Lz = cL(this.Lz);
    m.L1 = cL(this.L1); m.L2 = cL(this.L2); m.Lout = cL(this.Lout);
    return m;
  }
}

// ---- Causal dot-product attention over position memories ----
// q: query vector (d). Kl/Vl: per-position Linear forward caches. n: how many
// positions are visible (causal prefix during the position pass, all of them
// during depth). Returns {a, q, n, w} for the backward pass.
function attnForward(qy, Kl, Vl, n, dd) {
  const inv = 1 / Math.sqrt(dd);
  const sc = new Float64Array(n);
  for (let j = 0; j < n; j++) {
    const Ky = Kl[j].y;
    let s = 0;
    for (let i = 0; i < dd; i++) s += qy[i] * Ky[i];
    sc[j] = s * inv;
  }
  let mx = sc[0];
  for (let j = 1; j < n; j++) if (sc[j] > mx) mx = sc[j];
  const w = new Float64Array(n);
  let zsum = 0;
  for (let j = 0; j < n; j++) { w[j] = Math.exp(sc[j] - mx); zsum += w[j]; }
  for (let j = 0; j < n; j++) w[j] /= zsum;
  const a = new Float64Array(dd);
  for (let j = 0; j < n; j++) {
    const Vy = Vl[j].y, c = w[j];
    for (let i = 0; i < dd; i++) a[i] += c * Vy[i];
  }
  return { a, q: qy, n, w };
}
// da: grad of the retrieved vector. Accumulates Wv/Wk grads, routes state
// grads into dState[j] (the j-th attended state), and returns dq.
function attnValueBackward(da, att, Vlin, model, dState, off) {
  // Value path: dw from the retrieved vector + dV grads into states.
  const dd = da.length, n = att.n, w = att.w;
  const dw = new Float64Array(n);
  for (let j = 0; j < n; j++) {
    const Vy = Vlin[j].y;
    let dot = 0;
    for (let i = 0; i < dd; i++) dot += da[i] * Vy[i];
    dw[j] = dot;
    const dV = new Float64Array(dd);
    for (let i = 0; i < dd; i++) dV[i] = w[j] * da[i];
    const deV = model.Wv.backward(dV, Vlin[j]);
    const acc = dState[off + j];
    for (let i = 0; i < deV.length; i++) acc[i] += deV[i];
  }
  return dw;
}
function attnWeightBackward(dw, att, Klin, Vlin, model, dState, off, dd) {
  // Selection path: softmax backward from total dL/dw + dK grads into states.
  const n = att.n, w = att.w;
  const inv = 1 / Math.sqrt(dd);
  let s = 0;
  for (let j = 0; j < n; j++) s += w[j] * dw[j];
  const dq = new Float64Array(dd);
  for (let j = 0; j < n; j++) {
    const ds = w[j] * (dw[j] - s) * inv;
    const Ky = Klin[j].y;
    for (let i = 0; i < dd; i++) dq[i] += ds * Ky[i];
    const dK = new Float64Array(dd);
    for (let i = 0; i < dd; i++) dK[i] = ds * att.q[i];
    const deK = model.Wk.backward(dK, Klin[j]);
    const acc = dState[off + j];
    for (let i = 0; i < deK.length; i++) acc[i] += deK[i];
  }
  return dq;
}
function attnBackward(da, att, Klin, Vlin, model, dState, off) {
  const dw = attnValueBackward(da, att, Vlin, model, dState, off);
  return attnWeightBackward(dw, att, Klin, Vlin, model, dState, off, da.length);
}

// ---- Attention running-state model (Phase 2c) ----
// Positions unroll left-to-right. Each step queries the causal memory built
// from past position embeddings (keys K, values V), projects the retrieved
// vector back up, and gates it into the running state alongside the fresh
// input. Depth steps re-query the FULL memory with the current state — the
// paper's own core does the same (each recurrent block holds a causal
// self-attention layer). Length-agnostic: no slots, no padding.
// The induction-head idea at bench scale: "which value was bound to key K?"
// is a lookup, not a compression problem.
class AttnModel {
  constructor(rng, vocab, h, m, classes, d) {
    this.h = h; this.vocab = vocab; this.classes = classes; this.m = m;
    this.d = d || 16;
    const es = Math.sqrt(1 / h);
    this.E = { v: new Float64Array(vocab * h), g: new Float64Array(vocab * h) };
    for (let i = 0; i < this.E.v.length; i++) this.E.v[i] = rng.uniform(-es, es);
    this.Wq = new Linear(rng, 2 * h, this.d); // query reads [state, current input]
    this.Wk = new Linear(rng, h, this.d);
    this.Wv = new Linear(rng, h, this.d);
    this.Wa = new Linear(rng, this.d, h);
    this.Lz = new Linear(rng, 3 * h, h); // gate over [state, input, retrieved]
    this.L1 = new Linear(rng, 3 * h, m);
    this.L2 = new Linear(rng, m, h);
    this.Lout = new Linear(rng, h, classes);
  }
  params() {
    return [this.E,
      this.Wq.W, this.Wq.b, this.Wk.W, this.Wk.b,
      this.Wv.W, this.Wv.b, this.Wa.W, this.Wa.b,
      this.Lz.W, this.Lz.b, this.L1.W, this.L1.b,
      this.L2.W, this.L2.b, this.Lout.W, this.Lout.b];
  }
  zeroGrad() { for (const p of this.params()) p.g.fill(0); }
  cell(s, e, ab, steps, info) {
    const h = this.h;
    const u = new Float64Array(3 * h);
    u.set(s, 0); u.set(e, h); u.set(ab, 2 * h);
    const lz = this.Lz.forward(u);
    const zv = sigForward(lz.y);
    const l1 = this.L1.forward(u);
    const r1 = rmsForward(l1.y);
    const a = siluForward(r1.y);
    const l2 = this.L2.forward(a);
    const cand = l2.y;
    const mix = new Float64Array(h);
    for (let i = 0; i < h; i++) mix[i] = (1 - zv[i]) * s[i] + zv[i] * cand[i];
    const r2 = rmsForward(mix);
    steps.push({ sPrev: s, u, lz, zv, l1, r1, aPre: r1.y, l2, cand, mix, r2,
      isDepth: info.isDepth, posT: info.posT, q: info.q, att: info.att, abLin: info.abLin,
      Klin: info.Klin, Vlin: info.Vlin });
    return r2.y;
  }
  forward(x, r) {
    const h = this.h, dd = this.d, L = x.length, E = this.E.v;
    const emb = new Array(L);
    for (let t = 0; t < L; t++) emb[t] = E.slice(x[t] * h, (x[t] + 1) * h);
    const S = [z(h)]; // S[0] = zero start; S[t+1] = state after position t
    let s = S[0];
    const steps = [];
    const posOut = [];
    const deAcc = new Array(L);
    for (let t = 0; t < L; t++) deAcc[t] = z(h);
    for (let t = 0; t < L; t++) {
      let att = null, abLin = null, q = null, Klin = null, Vlin = null;
      if (t > 0) {
        // attend S[1..t]: past position states only — the model must pick a
        // real memory, never a constant null slot.
        const se = new Float64Array(2 * h);
        se.set(s, 0); se.set(emb[t], h);
        q = this.Wq.forward(se);
        const n = t; // S[1..t]
        Klin = new Array(n); Vlin = new Array(n);
        for (let j = 0; j < n; j++) { Klin[j] = this.Wk.forward(S[j + 1]); Vlin[j] = this.Wv.forward(S[j + 1]); }
        att = attnForward(q.y, Klin, Vlin, n, dd);
        abLin = this.Wa.forward(att.a);
      } else {
        // first token: nothing to look back at — retrieval is the zero vector.
        abLin = { y: z(h), x: z(dd) }; // dummy cache: contributes no Wa grad
      }
      const ab = abLin.y;
      s = this.cell(s, emb[t], ab, steps, { isDepth: false, posT: t, q, att, abLin, Klin, Vlin });
      S.push(s);
      const rsP = rmsForward(s);
      const loP = this.Lout.forward(rsP.y);
      posOut.push({ logits: loP.y, rs: rsP, lo: loP });
    }
    const eb = z(h);
    for (let t = 0; t < L; t++) for (let i = 0; i < h; i++) eb[i] += emb[t][i];
    for (let i = 0; i < h; i++) eb[i] /= L;
    const ebN = rmsForward(eb);
    const SD = []; // post-depth states (what the head reads at eval r)
    for (let k = 0; k < r; k++) {
      const seD = new Float64Array(2 * h);
      seD.set(s, 0); seD.set(ebN.y, h);
      const q = this.Wq.forward(seD);
      const n = L; // full memory: every position state, no null slot
      const Klin = new Array(n), Vlin = new Array(n);
      for (let j = 0; j < n; j++) { Klin[j] = this.Wk.forward(S[j + 1]); Vlin[j] = this.Wv.forward(S[j + 1]); }
      const att = attnForward(q.y, Klin, Vlin, n, dd);
      const abLin = this.Wa.forward(att.a);
      s = this.cell(s, ebN.y, abLin.y, steps, { isDepth: true, posT: -1, q, att, abLin, Klin, Vlin });
      SD.push(s);
    }
    const rC = rmsForward(s);
    const lo = this.Lout.forward(rC.y);
    return { logits: lo.y, cache: { x: x.slice(), ebN, steps, posOut, rC, lo, L, deAcc, S, SD } };
  }
  backward(dlogits, fw, auxList, attnX) {
    const h = this.h, c = fw.cache, Eg = this.E.g;
    let ds = rmsBackward(this.Lout.backward(dlogits, c.lo), c.rC.cache);
    const deBar = z(h);
    const deAcc = c.deAcc;
    const dState = new Array(c.L + 1); // grads into S[j], picked up in reverse
    for (let j = 0; j <= c.L; j++) dState[j] = z(h);
    const steps = c.steps;
    for (let k = steps.length - 1; k >= 0; k--) {
      const it = steps[k];
      if (!it.isDepth) {
        const acc = dState[it.posT + 1]; // S[posT+1] is the state this step made
        for (let i = 0; i < h; i++) ds[i] += acc[i];
      }
      if (auxList && !it.isDepth && auxList[it.posT]) {
        const po = c.posOut[it.posT];
        const dsA = rmsBackward(this.Lout.backward(auxList[it.posT], po.lo), po.rs.cache);
        const sum = new Float64Array(h);
        for (let i = 0; i < h; i++) sum[i] = ds[i] + dsA[i];
        ds = sum;
      }
      const dmix = rmsBackward(ds, it.r2.cache);
      const dz = new Float64Array(h);
      const dsKeep = new Float64Array(h);
      const dcand = new Float64Array(h);
      for (let i = 0; i < h; i++) {
        dz[i] = dmix[i] * (it.cand[i] - it.sPrev[i]);
        dsKeep[i] = dmix[i] * (1 - it.zv[i]);
        dcand[i] = dmix[i] * it.zv[i];
      }
      const da2 = this.L2.backward(dcand, it.l2);
      const da1 = siluBackward(da2, it.aPre);
      const dl1o = rmsBackward(da1, it.r1.cache);
      const du = this.L1.backward(dl1o, it.l1);
      const dg = sigBackward(dz, it.zv);
      const duz = this.Lz.backward(dg, it.lz);
      const dab = du.slice(2 * h, 3 * h);
      for (let i = 0; i < h; i++) dab[i] += duz[2 * h + i]; // gate path also reads the retrieved vector
      const da = it.att ? this.Wa.backward(dab, it.abLin) : z(this.d); // t=0: ab is constant, no Wa path
      // attn index j attends S[j+1] (no null slot); t=0 has no attention.
      let dq;
      if (it.att) {
        const dw = attnValueBackward(da, it.att, it.Vlin, this, dState, 1);
        if (attnX && k === steps.length - 1) {
          // selection supervision lands on the final step's weights
          for (let j = 0; j < dw.length; j++) dw[j] += attnX.dw[j];
        }
        dq = this.Wq.backward(attnWeightBackward(dw, it.att, it.Klin, it.Vlin, this, dState, 1, this.d), it.q);
      } else {
        dq = null;
      }
      const dse = it.att ? dq : z(2 * h);
      const dsNew = new Float64Array(h);
      for (let i = 0; i < h; i++) dsNew[i] = dsKeep[i] + du[i] + duz[i] + dse[i];
      ds = dsNew;
      const deStep = new Float64Array(h);
      for (let i = 0; i < h; i++) deStep[i] = du[h + i] + duz[h + i] + dse[h + i];
      if (it.isDepth) {
        for (let i = 0; i < h; i++) deBar[i] += deStep[i];
      } else {
        const acc = deAcc[it.posT];
        for (let i = 0; i < h; i++) acc[i] += deStep[i];
      }
    }
    const deEmb = rmsBackward(deBar, c.ebN.cache);
    const L = c.L;
    for (let t = 0; t < L; t++) {
      const off = c.x[t] * h;
      for (let i = 0; i < h; i++) Eg[off + i] += deAcc[t][i] + deEmb[i] / L;
    }
  }
  clone() {
    const m = Object.create(AttnModel.prototype);
    m.h = this.h; m.vocab = this.vocab; m.classes = this.classes; m.m = this.m; m.d = this.d;
    const cp = (p) => ({ v: p.v.slice(), g: new Float64Array(p.v.length) });
    m.E = cp(this.E);
    const cL = (l) => {
      const o = Object.create(Linear.prototype);
      o.inF = l.inF; o.outF = l.outF; o.W = cp(l.W); o.b = cp(l.b);
      return o;
    };
    m.Wq = cL(this.Wq); m.Wk = cL(this.Wk); m.Wv = cL(this.Wv); m.Wa = cL(this.Wa);
    m.Lz = cL(this.Lz);
    m.L1 = cL(this.L1); m.L2 = cL(this.L2); m.Lout = cL(this.Lout);
    return m;
  }
}

// ---- Phase 2d-pure: local geometry mixer (Grassmann-style, attention-free) ----
// Per position: reduce the running state h->z (GEO_G=6), wedge the current
// reduced state against past neighbors at causal offsets {1,2}:
//   p_ij = zc_i * zp_j - zc_j * zp_i          (GEO_P = 15 Pluecker dims)
// rms-normalize, mean over available offsets, project back with Wp, gate-fuse.
// Deliberately NO global lookup: a binding survives only while the running
// state carries it step to step. Long-gap retrieval is expected to FAIL —
// that predicted failure is the ruler the hybrid (2d-carry) gets measured by.
const GEO_G = 6, GEO_P = 15, GEO_OFFS = [1, 2];
function geoPluckIdx(i, j) { return i * GEO_G - (i * (i + 1)) / 2 + (j - i - 1); }

class GeoModel {
  constructor(rng, vocab, h, m, classes, geoMode) {
    this.h = h; this.vocab = vocab; this.classes = classes; this.m = m;
    // geoMode: "full" (wedge gossip) | "linear" (learned mixer ablation) |
    // "none" (no mixer — gated notebook alone) | "camp" (full wedge + fixed
    // running-mean fire) | "choosy" (full wedge + LEARNED write-gate fire:
    // cf_{t+1} = (1-w_t)*cf_t + w_t*S[t+1], w_t = sigmoid(Wf[S[t],e_t,cf_t]).
    // The net chooses what to pin to the fire instead of averaging mush).
    // The ablations are the trap detectors: if "none" matches "full", the
    // geometry is decoration.
    this.geoMode = geoMode || "full";
    const es = Math.sqrt(1 / h);
    this.E = { v: new Float64Array(vocab * h), g: new Float64Array(vocab * h) };
    for (let i = 0; i < this.E.v.length; i++) this.E.v[i] = rng.uniform(-es, es);
    this.Wr = new Linear(rng, h, GEO_G); // running state -> reduced arrow
    this.Wp = new Linear(rng, GEO_P, h); // disagreement vector -> state space
    this.Wl = new Linear(rng, 2 * GEO_G, h); // linear-mixer ablation path
    // Campfire (paper bullet #1: global invariants guide local flows). A
    // running mean of all position states so far, injected into every step
    // through widened gate layers — the summary travels the whole line for
    // free, which is exactly what local gossip cannot do. Mode "camp" =
    // full wedge gossip + campfire + notebook. Mode "choosy" reuses the same
    // widened injection but LEARNS the update: a per-dim write gate picks
    // which states get pinned to the fire (bindings) and which blow past
    // (distractors), instead of the fixed 1/(t+1) average.
    this.Lzc = new Linear(rng, 4 * h, h); // gate over [state, input, geo, fire]
    this.L1c = new Linear(rng, 4 * h, m);
    this.Lz = new Linear(rng, 3 * h, h); // gate over [state, input, geometry]
    this.L1 = new Linear(rng, 3 * h, m);
    this.L2 = new Linear(rng, m, h);
    this.Lout = new Linear(rng, h, classes);
    // Choosy write gate — constructed LAST so the other modes keep
    // byte-identical inits (same seed = same start as all past runs).
    this.Wf = new Linear(rng, 3 * h, h); // over [prev state, input, old fire]
    for (let i = 0; i < h; i++) this.Wf.b.v[i] = -1.0; // start mostly-closed
    // Query-conditioned readout (reader sees the question): final + depth
    // heads read [state, queryKeyEmb]. Constructed LAST so all older modes
    // keep byte-identical inits. Off unless useQueryHead is set (gistq task).
    this.useQueryHead = false;
    this.LoutQ = new Linear(rng, 2 * h, classes);
  }
  params() {
    return [this.E,
      this.Wr.W, this.Wr.b, this.Wp.W, this.Wp.b, this.Wl.W, this.Wl.b,
      this.Lzc.W, this.Lzc.b, this.L1c.W, this.L1c.b, this.Wf.W, this.Wf.b,
      this.Lz.W, this.Lz.b, this.L1.W, this.L1.b,
      this.L2.W, this.L2.b, this.Lout.W, this.Lout.b, this.LoutQ.W, this.LoutQ.b];
  }
  zeroGrad() { for (const p of this.params()) p.g.fill(0); }
  cell(s, e, g, steps, info) {
    const h = this.h;
    const camp = !!info.cf;
    const u = new Float64Array(camp ? 4 * h : 3 * h);
    u.set(s, 0); u.set(e, h); u.set(g, 2 * h);
    if (camp) u.set(info.cf, 3 * h);
    const Lz = camp ? this.Lzc : this.Lz;
    const L1 = camp ? this.L1c : this.L1;
    const lz = Lz.forward(u);
    const zv = sigForward(lz.y);
    const l1 = L1.forward(u);
    const r1 = rmsForward(l1.y);
    const a = siluForward(r1.y);
    const l2 = this.L2.forward(a);
    const cand = l2.y;
    const mix = new Float64Array(h);
    for (let i = 0; i < h; i++) mix[i] = (1 - zv[i]) * s[i] + zv[i] * cand[i];
    const r2 = rmsForward(mix);
    steps.push({ sPrev: s, u, lz, zv, l1, r1, aPre: r1.y, l2, cand, mix, r2,
      isDepth: info.isDepth, posT: info.posT, geo: info.geo, camp });
    return r2.y;
  }
  // One geometry read: zc = Wr(s); wedge vs stored past arrows Z[idx].
  // pairs: [{idx, d}]. gc holds everything backward needs.
  // "linear" ablation: learned mixing of [zc, mean-neighbor] instead of the
  // wedge — same window, no geometry. "none": no mixer at all.
  geoStep(s, Z, pairs) {
    const zt = this.Wr.forward(s);
    if (this.geoMode === "none" || !pairs.length) return { g: z(this.h), gc: null, zt };
    if (this.geoMode === "linear") {
      const avail = pairs.map((pr) => ({ d: pr.d, zp: Z[pr.idx] }));
      const mean = new Float64Array(GEO_G);
      for (const a of avail) for (let i = 0; i < GEO_G; i++) mean[i] += a.zp.y[i] / avail.length;
      const cc = new Float64Array(2 * GEO_G);
      cc.set(zt.y, 0); cc.set(mean, GEO_G);
      const wl = this.Wl.forward(cc);
      return { g: wl.y, gc: { lin: true, zt, zps: avail, n: avail.length, wl }, zt };
    }
    const pls = pairs.map((pr) => {
      const zp = Z[pr.idx];
      const p = new Float64Array(GEO_P);
      for (let i = 0; i < GEO_G; i++) for (let j = i + 1; j < GEO_G; j++)
        p[geoPluckIdx(i, j)] = zt.y[i] * zp.y[j] - zt.y[j] * zp.y[i];
      return { d: pr.d, zp, p, dzp: new Float64Array(GEO_G) };
    });
    const mean = new Float64Array(GEO_P);
    for (const pl of pls) for (let k = 0; k < GEO_P; k++) mean[k] += pl.p[k] / pls.length;
    const rn = rmsForward(mean);
    const wp = this.Wp.forward(rn.y);
    return { g: wp.y, gc: { zt, pls, rn, wp, n: pls.length }, zt };
  }
  forward(x, r) {
    const h = this.h, L = x.length, E = this.E.v;
    const emb = new Array(L);
    for (let t = 0; t < L; t++) emb[t] = E.slice(x[t] * h, (x[t] + 1) * h);
    const S = [z(h)];
    let s = S[0];
    const steps = [];
    const posOut = [];
    const deAcc = new Array(L);
    for (let t = 0; t < L; t++) deAcc[t] = z(h);
    const Z = new Array(L).fill(null); // Z[j] = Wr cache of state S[j]
    const campMode = this.geoMode === "camp";
    const choosyMode = this.geoMode === "choosy";
    const fireMode = campMode || choosyMode; // any global-summary injection
    let cf = z(h); // camp: cf_t = mean of S[1..t]. choosy: gated pins.
    for (let t = 0; t < L; t++) {
      const pairs = [];
      for (const d of GEO_OFFS) if (t - d >= 1) pairs.push({ idx: t - d, d });
      const gs = this.geoStep(s, Z, pairs);
      Z[t] = gs.zt;
      s = this.cell(s, emb[t], gs.g, steps, { isDepth: false, posT: t, geo: gs.gc, cf: fireMode ? cf : null });
      S.push(s);
      const st = steps[steps.length - 1];
      if (choosyMode) {
        // learned write: w from [prev state, current input, old fire].
        // Fresh arrays — old cf/s arrays are cached and must never mutate.
        const f = new Float64Array(3 * h);
        f.set(S[t], 0); f.set(emb[t], h); f.set(cf, 2 * h);
        const lf = this.Wf.forward(f);
        const w = sigForward(lf.y);
        const nx = new Float64Array(h);
        for (let i = 0; i < h; i++) nx[i] = (1 - w[i]) * cf[i] + w[i] * s[i];
        st.fire = { lf, w, cfOld: cf.slice(), sNew: s.slice() };
        cf = nx;
        st.cfOut = cf; // fire state leaving this step (validates finalFire)
      } else if (campMode) {
        // running mean: cf_{t+1} = (t*cf_t + s_{t+1}) / (t+1). Fresh array —
        // old cf arrays are referenced by caches and must never mutate.
        const nx = new Float64Array(h);
        for (let i = 0; i < h; i++) nx[i] = (t * cf[i] + s[i]) / (t + 1);
        cf = nx;
        st.cfOut = cf; // fire state leaving this step (validates finalFire)
      }
      const rsP = rmsForward(s);
      const loP = this.Lout.forward(rsP.y);
      posOut.push({ logits: loP.y, rs: rsP, lo: loP });
    }
    const eb = z(h);
    for (let t = 0; t < L; t++) for (let i = 0; i < h; i++) eb[i] += emb[t][i];
    for (let i = 0; i < h; i++) eb[i] /= L;
    const ebN = rmsForward(eb);
    const SD = []; // post-depth states (what the head reads at eval r)
    for (let k = 0; k < r; k++) {
      // depth reads stay local too: current state vs the last window only.
      // The campfire is frozen here (no new positions) but still guides.
      const pairs = [];
      for (const d of GEO_OFFS) if (L - d >= 1) pairs.push({ idx: L - d, d });
      const gs = this.geoStep(s, Z, pairs);
      s = this.cell(s, ebN.y, gs.g, steps, { isDepth: true, posT: -1, geo: gs.gc, cf: fireMode ? cf : null });
      SD.push(s);
    }
    const rC = rmsForward(s);
    const lo = this.Lout.forward(rC.y);
    // Reader-sees-question: final + depth heads read [state, queryKeyEmb].
    // The query key is input (x[L-2]), known at test time — no leakage; the
    // value must still be retrieved from the state. Fallback: mean input.
    const qRaw = x[L - 2];
    const qOk = Number.isInteger(qRaw) && qRaw >= 0 && qRaw < this.vocab;
    const qv = qOk ? E.slice(qRaw * h, (qRaw + 1) * h) : ebN.y.slice();
    let qh = null, logits = lo.y;
    if (this.useQueryHead) {
      const qc = new Float64Array(2 * h);
      qc.set(s, 0); qc.set(qv, h);
      const loQ = this.LoutQ.forward(qc);
      logits = loQ.y;
      qh = { lo: loQ, qk: qRaw, fb: !qOk };
    }
    // Settle-training readout: the head's view after EVERY depth round, so
    // train.js can grade each round (dense depth loss). Same shared head, no
    // new params; final rC/lo duplicate depthOut[r-1] (kept for the old path).
    const depthOut = [];
    for (let k = 0; k < SD.length; k++) {
      const rsD = rmsForward(SD[k]);
      let lgD = this.Lout.forward(rsD.y), qD = null;
      if (this.useQueryHead) {
        const qc = new Float64Array(2 * h);
        qc.set(SD[k], 0); qc.set(qv, h);
        const loQ = this.LoutQ.forward(qc);
        lgD = loQ;
        qD = { lo: loQ, qk: qRaw, fb: !qOk };
      }
      depthOut.push({ logits: lgD.y, rs: rsD, lo: lgD, q: qD });
    }
    return { logits, cache: { x: x.slice(), ebN, steps, posOut, rC, lo, L, deAcc, S, SD, depthOut, qh } };
  }
  // auxList[t]: optional scaled dlogits holding position t to its bind label
  // (teaches local association; deliberately NO selection loss — a local
  // mixer has no global weights to supervise).
  // depthList[k]: optional scaled dlogits grading SD[k] (settle training).
  // attnX is accepted and ignored (attention-only signal).
  backward(dlogits, fw, auxList, attnX, depthList) {
    const h = this.h, G = GEO_G, c = fw.cache, Eg = this.E.g;
    const deBar = z(h);
    let ds;
    if (c.qh) {
      // query-conditioned readout: split head grad into state + query-key
      // embedding parts; the query part flows to E (or the mean path).
      const dqF = this.LoutQ.backward(dlogits, c.qh.lo);
      ds = dqF.slice(0, h);
      const dq = dqF.slice(h);
      if (c.qh.fb) { for (let i = 0; i < h; i++) deBar[i] += dq[i]; }
      else { const off = c.qh.qk * h; for (let i = 0; i < h; i++) Eg[off + i] += dq[i]; }
    } else {
      ds = rmsBackward(this.Lout.backward(dlogits, c.lo), c.rC.cache);
    }
    const deAcc = c.deAcc;
    const dState = new Array(c.L + 1); // grads into S[j], picked up in reverse
    for (let j = 0; j <= c.L; j++) dState[j] = z(h);
    let dcf = z(h); // grad into cf_{t+1} while unwinding (campfire chain)
    let dSeen = 0; // depth steps unwound so far (maps unwind order -> SD index)
    const steps = c.steps;
    for (let k = steps.length - 1; k >= 0; k--) {
      const it = steps[k];
      if (!it.isDepth) {
        const acc = dState[it.posT + 1]; // S[posT+1] is the state this step made
        for (let i = 0; i < h; i++) ds[i] += acc[i];
        if (it.camp) {
          if (it.fire) {
            // choosy: cf_{t+1} = (1-w)*cf_t + w*S[t+1] — write path to S.
            const w = it.fire.w;
            for (let i = 0; i < h; i++) ds[i] += dcf[i] * w[i];
          } else {
            // cf_{t+1} = (t*cf_t + S[t+1])/(t+1): chain part flows to S[t+1].
            const tt = it.posT + 1;
            for (let i = 0; i < h; i++) ds[i] += dcf[i] / tt;
          }
        }
      }
      if (it.isDepth && depthList && c.depthOut) {
        // settle supervision: SD[dk] was graded too — inject its head grad
        // into the state stream before unwinding this depth step.
        const dk = c.depthOut.length - 1 - dSeen;
        dSeen++;
        const dl = depthList[dk];
        if (dl) {
          const dout = c.depthOut[dk];
          let dd;
          if (dout.q) {
            const dqF = this.LoutQ.backward(dl, dout.q.lo);
            dd = dqF.slice(0, h);
            const dq = dqF.slice(h);
            if (dout.q.fb) { for (let i = 0; i < h; i++) deBar[i] += dq[i]; }
            else { const off = dout.q.qk * h; for (let i = 0; i < h; i++) Eg[off + i] += dq[i]; }
          } else {
            dd = rmsBackward(this.Lout.backward(dl, dout.lo), dout.rs.cache);
          }
          const sumD = new Float64Array(h);
          for (let i = 0; i < h; i++) sumD[i] = ds[i] + dd[i];
          ds = sumD;
        }
      } else if (it.isDepth) { dSeen++; }
      if (auxList && !it.isDepth && auxList[it.posT]) {
        const po = c.posOut[it.posT];
        const dsA = rmsBackward(this.Lout.backward(auxList[it.posT], po.lo), po.rs.cache);
        const sum = new Float64Array(h);
        for (let i = 0; i < h; i++) sum[i] = ds[i] + dsA[i];
        ds = sum;
      }
      const dmix = rmsBackward(ds, it.r2.cache);
      const dz = new Float64Array(h);
      const dsKeep = new Float64Array(h);
      const dcand = new Float64Array(h);
      for (let i = 0; i < h; i++) {
        dz[i] = dmix[i] * (it.cand[i] - it.sPrev[i]);
        dsKeep[i] = dmix[i] * (1 - it.zv[i]);
        dcand[i] = dmix[i] * it.zv[i];
      }
      const da2 = this.L2.backward(dcand, it.l2);
      const da1 = siluBackward(da2, it.aPre);
      const dl1o = rmsBackward(da1, it.r1.cache);
      const L1u = it.camp ? this.L1c : this.L1;
      const Lzu = it.camp ? this.Lzc : this.Lz;
      const du = L1u.backward(dl1o, it.l1);
      const dg = sigBackward(dz, it.zv);
      const duz = Lzu.backward(dg, it.lz);
      const dab = du.slice(2 * h, 3 * h);
      for (let i = 0; i < h; i++) dab[i] += duz[2 * h + i]; // gate also reads geometry
      // geometry backward: dab is dL/dg. zc feeds this step's input state
      // (chain path, like the attention query); zp feeds past states.
      let dsGeo = z(h);
      if (it.geo) {
        const gc = it.geo;
        if (gc.lin) {
          // linear ablation: learned mixing, same window, no wedge.
          const dcc = this.Wl.backward(dab, gc.wl);
          const dzc = dcc.slice(0, G);
          dsGeo = this.Wr.backward(dzc, gc.zt);
          for (const a of gc.zps) {
            const dzp = new Float64Array(G);
            for (let i = 0; i < G; i++) dzp[i] = dcc[G + i] / gc.n;
            const dpast = this.Wr.backward(dzp, a.zp);
            const acc2 = dState[(it.isDepth ? c.L : it.posT) - a.d];
            for (let i = 0; i < h; i++) acc2[i] += dpast[i];
          }
        } else {
        const dmean = rmsBackward(this.Wp.backward(dab, gc.wp), gc.rn.cache);
        const dzc = new Float64Array(G);
        for (const pl of gc.pls) {
          for (let i = 0; i < G; i++) for (let j = i + 1; j < G; j++) {
            const kk = geoPluckIdx(i, j), dd = dmean[kk] / gc.n;
            dzc[i] += dd * pl.zp.y[j];
            dzc[j] -= dd * pl.zp.y[i];
            pl.dzp[i] -= dd * gc.zt.y[j];
            pl.dzp[j] += dd * gc.zt.y[i];
          }
        }
        dsGeo = this.Wr.backward(dzc, gc.zt);
        for (const pl of gc.pls) {
          const idx = (it.isDepth ? c.L : it.posT) - pl.d;
          const dpast = this.Wr.backward(pl.dzp, pl.zp);
          const acc2 = dState[idx];
          for (let i = 0; i < h; i++) acc2[i] += dpast[i];
        }
        } // end else (wedge path)
      }
      const dsNew = new Float64Array(h);
      for (let i = 0; i < h; i++) dsNew[i] = dsKeep[i] + du[i] + duz[i] + dsGeo[i];
      ds = dsNew;
      const deStep = new Float64Array(h);
      for (let i = 0; i < h; i++) deStep[i] = du[h + i] + duz[h + i];
      if (it.camp) {
        // cf_{t+1} = (t*cf_t + S[t+1])/(t+1): injection grads belong to cf_t,
        // chain part (t/(t+1)) stays on the fire for earlier steps. Depth
        // steps only inject (frozen fire) — their share accumulates into dcf.
        // Choosy: cf_{t+1} = (1-w)*cf_t + w*S[t+1]; the keep part (1-w) stays
        // on the fire, the write part already flowed to S above, and the gate
        // weights route into [prev state, input, old fire].
        const tt = it.isDepth ? -1 : it.posT;
        if (it.isDepth) {
          for (let i = 0; i < h; i++) dcf[i] += du[3 * h + i] + duz[3 * h + i];
        } else if (it.fire) {
          const w = it.fire.w, cfOld = it.fire.cfOld, sNew = it.fire.sNew;
          const dwr = new Float64Array(h);
          for (let i = 0; i < h; i++) dwr[i] = dcf[i] * (sNew[i] - cfOld[i]);
          const dF = this.Wf.backward(sigBackward(dwr, w), it.fire.lf);
          for (let i = 0; i < h; i++) {
            dcf[i] = dcf[i] * (1 - w[i]) + dF[2 * h + i] + du[3 * h + i] + duz[3 * h + i];
            ds[i] += dF[i]; // gate read the prev state — same dL/dS[t] stream
            deStep[i] += dF[h + i]; // gate read the current input token
          }
        } else {
          const f = tt / (tt + 1);
          for (let i = 0; i < h; i++) dcf[i] = dcf[i] * f + du[3 * h + i] + duz[3 * h + i];
        }
      }
      if (it.isDepth) {
        for (let i = 0; i < h; i++) deBar[i] += deStep[i];
      } else {
        const acc = deAcc[it.posT];
        for (let i = 0; i < h; i++) acc[i] += deStep[i];
      }
    }
    const deEmb = rmsBackward(deBar, c.ebN.cache);
    const L = c.L;
    for (let t = 0; t < L; t++) {
      const off = c.x[t] * h;
      for (let i = 0; i < h; i++) Eg[off + i] += deAcc[t][i] + deEmb[i] / L;
    }
  }
  clone() {
    const m = Object.create(GeoModel.prototype);
    m.h = this.h; m.vocab = this.vocab; m.classes = this.classes; m.m = this.m;
    m.geoMode = this.geoMode;
    const cp = (p) => ({ v: p.v.slice(), g: new Float64Array(p.v.length) });
    m.E = cp(this.E);
    const cL = (l) => {
      const o = Object.create(Linear.prototype);
      o.inF = l.inF; o.outF = l.outF; o.W = cp(l.W); o.b = cp(l.b);
      return o;
    };
    m.Wr = cL(this.Wr); m.Wp = cL(this.Wp); m.Wl = cL(this.Wl);
    m.Lzc = cL(this.Lzc); m.L1c = cL(this.L1c); m.Wf = cL(this.Wf);
    m.LoutQ = cL(this.LoutQ); m.useQueryHead = this.useQueryHead;
    m.Lz = cL(this.Lz);
    m.L1 = cL(this.L1); m.L2 = cL(this.L2); m.Lout = cL(this.Lout);
    return m;
  }
}

// Central-difference check for the geometry path, with and without the
// bind-aux readout, in every geoMode (Float64; surrogate loss = dlogits .
// logits [+ aux]). Covers the ablation paths too — a decoration detector
// with wrong gradients would be worse than useless.
function checkGeoGrad() {
  const x = [1, 5, 2, 6, 2], r = 2;
  const dlog = new Float64Array([0.3, -0.1, 0.2, -0.4]);
  const auxT = 2, auxY = 1, auxW = 0.5;
  function dot(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }
  function probe(m, auxOn) {
    m.zeroGrad();
    const fwBase = m.forward(x, r);
    let auxList = null;
    if (auxOn) {
      auxList = new Array(x.length).fill(null);
      const ce = softmaxCE(fwBase.cache.posOut[auxT].logits, auxY);
      const dt = ce.dlogits;
      for (let i = 0; i < dt.length; i++) dt[i] *= auxW;
      auxList[auxT] = dt;
    }
    m.backward(dlog, fwBase, auxList);
    function total(fw) {
      let s = dot(dlog, fw.logits);
      if (auxOn) s += auxW * softmaxCE(fw.cache.posOut[auxT].logits, auxY).loss;
      return s;
    }
    const eps = 1e-6;
    let worst = 0;
    for (const p of m.params()) {
      for (const j of [0, 1, 5, 17]) {
        if (j >= p.v.length) continue;
        const old = p.v[j];
        p.v[j] = old + eps;
        const lp = total(m.forward(x, r));
        p.v[j] = old - eps;
        const lm = total(m.forward(x, r));
        p.v[j] = old;
        const num = (lp - lm) / (2 * eps);
        const diff = Math.abs(num - p.g[j]);
        if (diff > worst) worst = diff;
      }
    }
    return worst;
  }
  let worst = 0;
  for (const mode of ["full", "linear", "none", "camp", "choosy"]) {
    const m = new GeoModel(makeRng(99), 8, 8, 12, 4, mode);
    worst = Math.max(worst, probe(m, false), probe(m, true));
  }
  return worst;
}

// Central-difference gradient check for the attention path (Float64).
// Surrogate loss L = dlogits . logits; compares analytic .g against numeric.
function checkAttnGrad() {
  const rng = makeRng(99);
  const m = new AttnModel(rng, 8, 8, 12, 4, 4);
  const x = [1, 5, 2, 6, 2], r = 2;
  const dlog = new Float64Array([0.3, -0.1, 0.2, -0.4]);
  function dot(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }
  function probe(attnX, supIdx) {
    m.zeroGrad();
    const fwBase = m.forward(x, r);
    m.backward(dlog, fwBase, null, attnX);
    function total(fw) {
      let s = dot(dlog, fw.logits);
      if (supIdx >= 0) s += -Math.log(fw.cache.steps.slice(-1)[0].att.w[supIdx] + 1e-9);
      return s;
    }
    const eps = 1e-6;
    let worst = 0;
    for (const p of m.params()) {
      for (const j of [0, 1, 5, 17]) {
        if (j >= p.v.length) continue;
        const old = p.v[j];
        p.v[j] = old + eps;
        const lp = total(m.forward(x, r));
        p.v[j] = old - eps;
        const lm = total(m.forward(x, r));
        p.v[j] = old;
        const num = (lp - lm) / (2 * eps);
        const diff = Math.abs(num - p.g[j]);
        if (diff > worst) worst = diff;
      }
    }
    return worst;
  }
  const plain = probe(null, -1);
  // second pass: selection supervision on the final step's weights.
  // The numeric target must include the -log w[idx] loss the dw encodes.
  const base = m.forward(x, r);
  const lastAtt = base.cache.steps.slice(-1)[0].att;
  const supIdx = 1;
  const dwx = new Float64Array(lastAtt.n);
  dwx[supIdx] = -1 / (lastAtt.w[supIdx] + 1e-9);
  return Math.max(plain, probe({ dw: dwx }, supIdx));
}

function checkDepthGrad() {
  const m = new GeoModel(makeRng(99), 8, 8, 12, 4, "choosy");
  const x = [1, 5, 2, 6, 2], r = 2, y = 1, w = 0.5;
  function run(mm) {
    const fw = mm.forward(x, r);
    const ce = softmaxCE(fw.logits, y);
    const dl = fw.cache.depthOut.map((d) => {
      const c2 = softmaxCE(d.logits, y);
      const s = w / fw.cache.depthOut.length;
      const g = c2.dlogits;
      for (let i = 0; i < g.length; i++) g[i] *= s;
      return { ce: c2, d: g };
    });
    return { fw, ce, dl };
  }
  m.zeroGrad();
  const a = run(m);
  m.backward(a.ce.dlogits, a.fw, null, null, a.dl.map((o) => o.d));
  const an = [];
  for (const p of m.params()) for (let i = 0; i < p.g.length; i++) an.push(p.g[i]);
  if (!an.every((v) => isFinite(v))) return NaN; // loud failure, never vacuous
  function total(mm) {
    const t = run(mm);
    let L = t.ce.loss;
    for (const o of t.dl) L += (w * o.ce.loss) / t.dl.length;
    return L;
  }
  const e = 1e-5;
  let maxErr = 0, idx = 0;
  for (const p of m.params()) {
    for (let i = 0; i < p.v.length; i++) {
      const old = p.v[i];
      p.v[i] = old + e; const lp = total(m);
      p.v[i] = old - e; const lm = total(m);
      p.v[i] = old;
      if (!isFinite(lp) || !isFinite(lm)) return NaN; // loud failure
      const num = (lp - lm) / (2 * e);
      const den = Math.max(1e-8, Math.abs(an[idx]) + Math.abs(num));
      const err = Math.abs(an[idx] - num) / den;
      if (err > maxErr) maxErr = err;
      idx++;
    }
  }
  return maxErr;
}
function checkQueryGrad() {
  const m = new GeoModel(makeRng(99), 9, 8, 12, 4, "choosy");
  m.useQueryHead = true;
  const x = [0, 5, 1, 6, 0, 8], r = 2, y = 1, w = 0.5;
  function run(mm) {
    const fw = mm.forward(x, r);
    const ce = softmaxCE(fw.logits, y);
    const dl = fw.cache.depthOut.map((d) => {
      const c2 = softmaxCE(d.logits, y);
      const s = w / fw.cache.depthOut.length;
      const g = c2.dlogits;
      for (let i = 0; i < g.length; i++) g[i] *= s;
      return { ce: c2, d: g };
    });
    return { fw, ce, dl };
  }
  m.zeroGrad();
  const a = run(m);
  m.backward(a.ce.dlogits, a.fw, null, null, a.dl.map((o) => o.d));
  const an = [];
  for (const p of m.params()) for (let i = 0; i < p.g.length; i++) an.push(p.g[i]);
  if (!an.every((v) => isFinite(v))) return NaN; // loud failure, never vacuous
  function total(mm) {
    const t = run(mm);
    let L = t.ce.loss;
    for (const o of t.dl) L += (w * o.ce.loss) / t.dl.length;
    return L;
  }
  const e = 1e-5;
  let maxErr = 0, idx = 0;
  for (const p of m.params()) {
    for (let i = 0; i < p.v.length; i++) {
      const old = p.v[i];
      p.v[i] = old + e; const lp = total(m);
      p.v[i] = old - e; const lm = total(m);
      p.v[i] = old;
      if (!isFinite(lp) || !isFinite(lm)) return NaN; // loud failure
      const num = (lp - lm) / (2 * e);
      const den = Math.max(1e-8, Math.abs(an[idx]) + Math.abs(num));
      const err = Math.abs(an[idx] - num) / den;
      if (err > maxErr) maxErr = err;
      idx++;
    }
  }
  return maxErr;
}
window.__tinyNN = { makeRng, RecModel, SeqModel, AttnModel, GeoModel, checkAttnGrad, checkGeoGrad, checkDepthGrad, checkQueryGrad, Adam, softmaxCE };
})();
