// TinyNN train.js — supervised training, test-time depth curves, few-shot adaptation.
// The three "learning to learn" moves:
//   1. learn a task (Adam on cross-entropy, mixed recurrence like the paper)
//   2. think longer at test time (accuracy vs r — the paper's Fig. 1 at bench scale)
//   3. adapt fast to a variant (fine-tuned prior vs from-scratch — the meta test)
(function () {
"use strict";
const T = window.__tinyNN;
const makeRng = T.makeRng, RecModel = T.RecModel, SeqModel = T.SeqModel, AttnModel = T.AttnModel, GeoModel = T.GeoModel, checkAttnGrad = T.checkAttnGrad, checkGeoGrad = T.checkGeoGrad, Adam = T.Adam, softmaxCE = T.softmaxCE;
const TASKS = T.tasks;

// Seeded dice (src/tinynn/seeded.js): numeric seeds use the legacy mulberry32
// path bit-identically; strings hash then stream. Falls back to makeRng if
// seeded.js hasn't loaded (offline order safety).
function rngFromSeed(seed, suffix) {
  const s = seed === undefined || seed === null || seed === "" ? 7 : seed;
  if (typeof s === "number" && Number.isFinite(s)) {
    if (!suffix) return makeRng(s);
    if (suffix === "#adapt") return makeRng(s + 50); // legacy adapt offset, bit-identical
    if (T.makeSeededRng) return T.makeSeededRng(String(s) + String(suffix));
    return makeRng(s);
  }
  const tag = suffix ? String(s) + String(suffix) : s;
  if (typeof tag === "string" && T.makeSeededRng) return T.makeSeededRng(tag);
  return makeRng(s);
}

function makeModel(rng, opts) {
  if (opts.arch === "attn") return new AttnModel(rng, opts.vocab, opts.h, opts.m, opts.classes, opts.d);
  if (opts.arch === "seq") return new SeqModel(rng, opts.vocab, opts.h, opts.m, opts.classes);
  if (opts.arch === "geo") { const gm = new GeoModel(rng, opts.vocab, opts.h, opts.m, opts.classes, opts.geoMode); if (opts.queryHead) gm.useQueryHead = true; return gm; }
  return new RecModel(rng, opts.vocab, opts.h, opts.m, opts.classes, opts.maxLen);
}

function argmax(a) {
  let bi = 0;
  for (let i = 1; i < a.length; i++) if (a[i] > a[bi]) bi = i;
  return bi;
}

// Selection supervision for attention tasks (assoc-recall): at the final
// step, the query must put weight on the VALUE position of the queried key.
// Returns {loss, dw} with raw (unscaled) dL/dw, or null when inapplicable.
function attnSupervision(ex, fw) {
  const steps = fw.cache.steps;
  if (!steps) return null;
  const last = steps[steps.length - 1];
  if (!last || !last.att) return null;
  const n = last.att.n;
  const qk = ex.x[ex.x.length - 2]; // key sitting before the Q marker
  let idx = -1;
  for (let t = 0; t < ex.x.length - 2; t += 2) {
    if (ex.x[t] === qk) { idx = t + 1; break; } // attn idx j <-> state S[j+1]
  }
  if (idx < 0 || idx >= n) return null;
  const w = last.att.w[idx];
  const dw = new Float64Array(n);
  dw[idx] = -1 / (w + 1e-9);
  return { loss: -Math.log(w + 1e-9), dw };
}

function evaluate(model, data, r) {
  let loss = 0, right = 0;
  for (let i = 0; i < data.length; i++) {
    const fw = model.forward(data[i].x, r);
    const ce = softmaxCE(fw.logits, data[i].y);
    loss += ce.loss;
    if (argmax(fw.logits) === data[i].y) right++;
  }
  return { loss: loss / data.length, acc: right / data.length };
}

function depthCurve(model, data, rs) {
  return rs.map((r) => ({ r, acc: evaluate(model, data, r).acc }));
}

// Settle-training helper: grade EVERY depth round, not just the last.
// Returns scaled per-round dlogits (depthList[k] for SD[k]) plus the added
// loss. Same shared head, no new params; weight w spread over r rounds.
function buildDepthList(fw, y, w, B) {
  const dout = fw.cache.depthOut || [];
  const r = Math.max(dout.length, 1);
  const list = new Array(dout.length).fill(null);
  let loss = 0;
  for (let k = 0; k < dout.length; k++) {
    const ce = softmaxCE(dout[k].logits, y);
    loss += (w * ce.loss) / r;
    const dt = ce.dlogits;
    for (let i = 0; i < dt.length; i++) dt[i] *= w / (B * r);
    list[k] = dt;
  }
  return { list, loss };
}

async function trainModel(opts, onTick) {
  const rng = rngFromSeed(opts.seed === undefined ? 7 : opts.seed);
  const model = makeModel(rng, opts);
  const opt = new Adam(opts.lr || 5e-3);
  const B = opts.batch || 16;
  const auxFn = opts.prefixLabels || null;
  const auxW = opts.auxW != null ? opts.auxW : 1.0;
  const hist = [];
  let firstLoss = 0;
  for (let step = 1; step <= opts.steps; step++) {
    const r = opts.rMode === 1 ? 1 : 1 + rng.int(4); // paper style: random depth per pass
    model.zeroGrad();
    let loss = 0;
    for (let b = 0; b < B; b++) {
      const ex = opts.train[rng.int(opts.train.length)];
      const fw = model.forward(ex.x, r);
      const ce = softmaxCE(fw.logits, ex.y);
      loss += ce.loss;
      const d = ce.dlogits;
      for (let i = 0; i < d.length; i++) d[i] /= B;
      let auxList = null;
      if (auxFn && fw.cache.posOut) {
        const labs = auxFn(ex.x);
        auxList = new Array(ex.x.length);
        for (let t = 0; t < ex.x.length; t++) {
          if (labs[t] == null) { auxList[t] = null; continue; } // sparse signal
          const ceT = softmaxCE(fw.cache.posOut[t].logits, labs[t]);
          loss += (auxW * ceT.loss) / ex.x.length;
          const dt = ceT.dlogits;
          for (let i = 0; i < dt.length; i++) dt[i] *= auxW / (B * ex.x.length);
          auxList[t] = dt;
        }
      }
      let attnX = null;
      if (opts.attnAux && fw.cache.steps) {
        const sup = attnSupervision(ex, fw);
        if (sup) {
          const aw = opts.attnAuxW != null ? opts.attnAuxW : 1.0;
          loss += aw * sup.loss;
          const dw = sup.dw;
          for (let j = 0; j < dw.length; j++) dw[j] *= aw / B;
          attnX = { dw };
        }
      }
      let depthList = null;
      if (opts.depthAuxW && fw.cache.depthOut) {
        const dd = buildDepthList(fw, ex.y, opts.depthAuxW, B);
        loss += dd.loss; depthList = dd.list;
      }
      model.backward(d, fw, auxList, attnX, depthList);
    }
    opt.step(model.params());
    loss /= B;
    if (step === 1) firstLoss = loss;
    if (step % 50 === 0 || step === opts.steps) {
      hist.push({ step, loss });
      if (onTick) onTick({ step, of: opts.steps, loss });
      await new Promise((res) => setTimeout(res, 0)); // keep UI alive
    }
  }
  return { model, hist, firstLoss, lastLoss: hist.length ? hist[hist.length - 1].loss : 0 };
}

// PCGrad training path (rabbithole #1, verified vs Yu et al. 2020 + reference
// implementation): per-component backward passes on shared forward caches,
// project-then-average, single Adam step. Mirrors trainModel's loss
// construction exactly (same /B scaling) so magnitudes match fused. Use when
// multiple teachers fight on the shared readout (combo regression).
async function trainPCGrad(opts, onTick) {
  const PC = window.TinyNN.pcgrad;
  const rng = rngFromSeed(opts.seed === undefined ? 7 : opts.seed);
  const model = makeModel(rng, opts);
  const opt = new Adam(opts.lr || 5e-3);
  const B = opts.batch || 16;
  const auxFn = opts.prefixLabels || null;
  const auxW = opts.auxW != null ? opts.auxW : 1.0;
  const hist = [];
  let firstLoss = 0;
  for (let step = 1; step <= opts.steps; step++) {
    const r = opts.rMode === 1 ? 1 : 1 + rng.int(4);
    const acc = [null, null, null, null];
    let loss = 0;
    for (let b = 0; b < B; b++) {
      const ex = opts.train[rng.int(opts.train.length)];
      const fw = model.forward(ex.x, r);
      const ce = softmaxCE(fw.logits, ex.y);
      loss += ce.loss;
      const d = ce.dlogits;
      for (let i = 0; i < d.length; i++) d[i] /= B;
      let auxList = null;
      if (auxFn && fw.cache.posOut) {
        const labs = auxFn(ex.x);
        auxList = new Array(ex.x.length);
        for (let t = 0; t < ex.x.length; t++) {
          if (labs[t] == null) { auxList[t] = null; continue; }
          const ceT = softmaxCE(fw.cache.posOut[t].logits, labs[t]);
          loss += (auxW * ceT.loss) / ex.x.length;
          const dt = ceT.dlogits;
          for (let i = 0; i < dt.length; i++) dt[i] *= auxW / (B * ex.x.length);
          auxList[t] = dt;
        }
      }
      let attnX = null;
      if (opts.attnAux && fw.cache.steps) {
        const sup = attnSupervision(ex, fw);
        if (sup) {
          const aw = opts.attnAuxW != null ? opts.attnAuxW : 1.0;
          loss += aw * sup.loss;
          const dw = sup.dw;
          for (let j = 0; j < dw.length; j++) dw[j] *= aw / B;
          attnX = { dw };
        }
      }
      let depthList = null;
      if (opts.depthAuxW && fw.cache.depthOut) {
        const dd = buildDepthList(fw, ex.y, opts.depthAuxW, B);
        loss += dd.loss; depthList = dd.list;
      }
      const comps = [
        [d, null, null, null],
        auxList ? [new Array(d.length).fill(0), auxList, null, null] : null,
        attnX ? [new Array(d.length).fill(0), null, attnX, null] : null,
        depthList ? [new Array(d.length).fill(0), null, null, depthList] : null,
      ];
      for (let c = 0; c < 4; c++) {
        if (!comps[c]) continue;
        model.zeroGrad();
        model.backward(comps[c][0], fw, comps[c][1], comps[c][2], comps[c][3]);
        const flat = PC.readFlat(model.params());
        if (!acc[c]) acc[c] = new Float64Array(flat.length);
        for (let i = 0; i < flat.length; i++) acc[c][i] += flat[i];
      }
    }
    const present = acc.filter(Boolean);
    model.zeroGrad();
    PC.writeFlat(model.params(), PC.pcgrad(present, () => rng.uniform(0, 1)));
    opt.step(model.params());
    loss /= B;
    if (step === 1) firstLoss = loss;
    if (step % 50 === 0 || step === opts.steps) {
      hist.push({ step, loss });
      if (onTick) onTick({ step, of: opts.steps, loss });
      await new Promise((res) => setTimeout(res, 0));
    }
  }
  return { model, hist, firstLoss, lastLoss: hist.length ? hist[hist.length - 1].loss : 0 };
}

// Few-shot adaptation: clone the trained prior vs a fresh model, same steps on variant.
async function adaptExperiment(base, variantData, opts) {
  const adapted = base.clone();
  const scratch = makeModel(rngFromSeed(opts.seed === undefined ? 7 : opts.seed), opts);
  async function tune(model) {
    const rng = rngFromSeed(opts.seed === undefined ? 7 : opts.seed, "#adapt");
    const opt = new Adam(opts.lr || 5e-3);
    const auxFn = opts.prefixLabels || null;
    const B = 16;
    for (let step = 1; step <= opts.steps; step++) {
      const r = 1 + rng.int(4);
      model.zeroGrad();
      for (let b = 0; b < B; b++) {
        const ex = variantData[rng.int(variantData.length)];
        const fw = model.forward(ex.x, r);
        const ce = softmaxCE(fw.logits, ex.y);
        const d = ce.dlogits;
        for (let i = 0; i < d.length; i++) d[i] /= B;
        let auxList = null;
        if (auxFn && fw.cache.posOut) {
          const labs = auxFn(ex.x);
          auxList = new Array(ex.x.length);
          for (let t = 0; t < ex.x.length; t++) {
            if (labs[t] == null) { auxList[t] = null; continue; } // sparse signal
            const ceT = softmaxCE(fw.cache.posOut[t].logits, labs[t]);
            const dt = ceT.dlogits;
            for (let i = 0; i < dt.length; i++) dt[i] /= B * ex.x.length;
            auxList[t] = dt;
          }
        }
        let attnX = null;
        if (opts.attnAux && fw.cache.steps) {
          const sup = attnSupervision(ex, fw);
          if (sup) {
            const aw = opts.attnAuxW != null ? opts.attnAuxW : 1.0;
            const dw = sup.dw;
            for (let j = 0; j < dw.length; j++) dw[j] *= aw / B;
            attnX = { dw };
          }
        }
        let depthList = null;
        if (opts.depthAuxW && fw.cache.depthOut) {
          const dd = buildDepthList(fw, ex.y, opts.depthAuxW, B);
          depthList = dd.list;
        }
        model.backward(d, fw, auxList, attnX, depthList);
      }
      opt.step(model.params());
      if (step % 20 === 0) await new Promise((res) => setTimeout(res, 0));
    }
    return model;
  }
  const rTest = 4;
  const before = evaluate(adapted, variantData.slice(0, 200), rTest).acc;
  await tune(adapted);
  await tune(scratch);
  const after = evaluate(adapted, variantData.slice(0, 200), rTest).acc;
  const scratchAcc = evaluate(scratch, variantData.slice(0, 200), rTest).acc;
  return { before, after, scratchAcc };
}

// Fast smoke test for CI-style checks (small net, few steps, mod-add task).
async function quickSelfTest() {
  const task = TASKS.modadd7;
  const train = task.makeTrain(7);
  const testIn = task.makeTestIn();
  const hard = task.makeTestHard(21);
  const out = await trainModel(
    { vocab: 16, classes: 16, h: 32, m: 64, train, steps: 800, batch: 16, lr: 5e-3, rMode: "mix", seed: 7 },
    null
  );
  const accIn = evaluate(out.model, testIn, 4).acc;
  const curve = depthCurve(out.model, hard, [1, 4]);
  return {
    firstLoss: out.firstLoss, lastLoss: out.lastLoss,
    accIn, hardR1: curve[0].acc, hardR4: curve[1].acc,
    learned: out.lastLoss < 0.3 && accIn >= 0.95 && curve[1].acc > curve[0].acc
  };
}

// Phase 2c guard: attention grad exact + a small assoc-recall probe that must
// actually learn bindings (in-dist) and beat chance on more pairs than trained.
async function quickAttnTest() {
  const gradErr = checkAttnGrad();
  const task = TASKS.assocR;
  const out = await trainModel(
    { vocab: 9, classes: 4, h: 24, m: 48, d: 8, arch: "attn", train: task.makeTrain(7), steps: 400, batch: 16, lr: 5e-3, rMode: "mix", seed: 7, attnAux: true, attnAuxW: 1.0 },
    null
  );
  const accIn = evaluate(out.model, task.makeTestIn(11), 4).acc;
  const accHard = evaluate(out.model, task.makeTestHard(21), 4).acc;
  return {
    gradErr, lastLoss: out.lastLoss, accIn, accHard,
    ok: gradErr < 1e-6 && out.lastLoss < 1.0 && accIn >= 0.9 && accHard > 0.4
  };
}

// Phase 2d-pure guard: geometry grad exact (with + without bind-aux) + a
// small assoc-recall probe. Honest expectations: in-dist should learn via
// the running notebook, but the kill set (long gap, no attention) should sit
// near chance — that predicted failure IS the ruler. The guard asserts only
// plumbing (grad exact + in-dist learns), never the hypothesis under test.
async function quickGeoTest() {
  const gradErr = checkGeoGrad();
  const task = TASKS.assocG;
  const out = await trainModel(
    { vocab: 9, classes: 4, h: 24, m: 48, arch: "geo", train: task.makeTrain(7), steps: 400, batch: 16, lr: 5e-3, rMode: "mix", seed: 7, prefixLabels: task.prefixLabels },
    null
  );
  const accIn = evaluate(out.model, task.makeTestIn(11), 4).acc;
  const accHard = evaluate(out.model, task.makeTestHard(21), 4).acc;
  const killR1 = evaluate(out.model, task.makeKill(33, 8), 1).acc;
  const killR4 = evaluate(out.model, task.makeKill(33, 8), 4).acc;
  const gap1 = evaluate(out.model, task.makeGap(41, 1), 1).acc;
  const gap20 = evaluate(out.model, task.makeGap(42, 20), 1).acc;
  return {
    gradErr, lastLoss: out.lastLoss, accIn, accHard, killR1, killR4, gap1, gap20,
    ok: gradErr < 1e-6 && out.lastLoss < 1.5 && accIn >= 0.7
  };
}

// Phase 2d-carry guard: gossip + notebook + don't-drop (carry) supervision.
// Asserts plumbing only; the hypothesis (carry beats pure on long gaps) is
// measured live, never asserted here.
async function quickCarryTest() {
  const task = TASKS.assocC;
  const out = await trainModel(
    { vocab: 9, classes: 4, h: 24, m: 48, arch: "geo", geoMode: "full", train: task.makeTrain(7), steps: 400, batch: 16, lr: 5e-3, rMode: "mix", seed: 7, prefixLabels: task.prefixLabels },
    null
  );
  const accIn = evaluate(out.model, task.makeTestIn(11), 4).acc;
  const gap20 = evaluate(out.model, task.makeGap(42, 20), 1).acc;
  const insp = geoInspect(out.model, task.makeKill(43, 8));
  return {
    lastLoss: out.lastLoss, accIn, gap20,
    magAtValue: insp.magAtValue, magElsewhere: insp.magElsewhere,
    readable: insp.magAtValue > insp.magElsewhere * 1.2,
    ok: out.lastLoss < 1.2 && accIn >= 0.7
  };
}

// Paper bullet #4, bench edition: do the disagreement numbers spike where the
// bindings land? Mean |pluecker| at value positions vs everywhere else.
function geoInspect(model, data) {
  let mv = 0, nv = 0, mo = 0, no = 0;
  for (const ex of data) {
    const fw = model.forward(ex.x, 1);
    for (const st of fw.cache.steps) {
      if (st.isDepth || !st.geo || st.geo.lin || !st.geo.pls.length) continue;
      let m = 0;
      for (const pl of st.geo.pls) for (let k = 0; k < pl.p.length; k++) m += Math.abs(pl.p[k]);
      m /= st.geo.pls.length * st.geo.pls[0].p.length;
      const tok = ex.x[st.posT];
      if (tok >= 4 && tok < 8) { mv += m; nv++; } else { mo += m; no++; }
    }
  }
  return { magAtValue: nv ? mv / nv : 0, magElsewhere: no ? mo / no : 0 };
}

// Phase 2d-campfire guard: global summary + gossip + notebook. Asserts only
// plumbing (grad exact is covered by checkGeoGrad's camp mode); the kill-set
// verdict is measured live, never asserted here.
async function quickCampTest() {
  const task = TASKS.assocC_camp;
  const out = await trainModel(
    { vocab: 9, classes: 4, h: 24, m: 48, arch: "geo", geoMode: "camp", train: task.makeTrain(7), steps: 400, batch: 16, lr: 5e-3, rMode: "mix", seed: 7, prefixLabels: task.prefixLabels },
    null
  );
  const accIn = evaluate(out.model, task.makeTestIn(11), 4).acc;
  const kill = evaluate(out.model, task.makeKill(33, 8), 1).acc;
  const gap20 = evaluate(out.model, task.makeGap(42, 20), 1).acc;
  return { lastLoss: out.lastLoss, accIn, kill, gap20, ok: out.lastLoss < 1.5 && accIn >= 0.6 };
}

// Phase 2d-choosy guard: learned write-gate fire + gossip + notebook.
// Asserts plumbing only (grad exact is covered by checkGeoGrad's choosy
// mode); the kill-set verdict is measured live, never asserted here.
async function quickChoosyTest() {
  const task = TASKS.assocC_choosy;
  const out = await trainModel(
    { vocab: 9, classes: 4, h: 24, m: 48, arch: "geo", geoMode: "choosy", train: task.makeTrain(7), steps: 400, batch: 16, lr: 5e-3, rMode: "mix", seed: 7, prefixLabels: task.prefixLabels },
    null
  );
  const accIn = evaluate(out.model, task.makeTestIn(11), 4).acc;
  const kill = evaluate(out.model, task.makeKill(33, 8), 1).acc;
  const gap20 = evaluate(out.model, task.makeGap(42, 20), 1).acc;
  // gate vitality: the write gate must actually vary (not stuck open/closed).
  const fw = out.model.forward(task.makeTestIn(11)[0].x, 1);
  let wMin = 1, wMax = 0, wMean = 0, wN = 0;
  for (const st of fw.cache.steps) {
    if (!st.fire) continue;
    for (let i = 0; i < st.fire.w.length; i++) {
      const w = st.fire.w[i];
      if (w < wMin) wMin = w; if (w > wMax) wMax = w; wMean += w; wN++;
    }
  }
  wMean /= Math.max(wN, 1);
  return { lastLoss: out.lastLoss, accIn, kill, gap20, wMin, wMax, wMean,
    ok: out.lastLoss < 1.5 && accIn >= 0.6 && wMax - wMin > 0.05 };
}

// Linear probe on frozen states — the reviewer's decisive read-vs-write test.
// Trains a fresh multinomial logistic regression mapping a picked frozen
// state vector -> class label. Capacity-matched to the model's own readout
// (also linear on the state): if the probe can't recover the label, the
// model's head can't either (info absent = transport/write failure); if the
// probe succeeds where the model fails, the readout is the bottleneck.
// pickIdx(ex, cache) -> state vector (already copied by caller). Use cache.S
// for position states (S[0] = start, S[j] = after position j-1) or cache.SD
// for post-depth states — the latter is what the head reads at eval r.
// forward runs with opts.r (default 1).
async function probeLinear(model, trainData, testData, pickIdx, opts) {
  opts = opts || {};
  const C = opts.classes || 4;
  function feats(data) {
    const F = [], Y = [];
    for (const ex of data) {
      const cache = model.forward(ex.x, opts.r || 1).cache;
      F.push(pickIdx(ex, cache).slice());
      Y.push(ex.y);
    }
    return { F, Y };
  }
  const tr = feats(trainData), te = feats(testData);
  const wb = await logRegTrain(tr.F, tr.Y, C, opts);
  return { trainAcc: logRegAcc(wb.W, wb.b, tr.F, tr.Y), testAcc: logRegAcc(wb.W, wb.b, te.F, te.Y) };
}

// Multinomial logistic regression core (Adam), shared by probeLinear and
// settleProbe so the capacity is identical before/after settling.
async function logRegTrain(F, Y, C, opts) {
  opts = opts || {};
  const h = F[0].length;
  const rng = rngFromSeed(opts.seed === undefined ? 99 : opts.seed);
  const es = Math.sqrt(1 / h);
  const W = new Float64Array(C * h), b = new Float64Array(C);
  for (let i = 0; i < W.length; i++) W[i] = rng.uniform(-es, es);
  const mW = new Float64Array(C * h), vW = new Float64Array(C * h);
  const mb = new Float64Array(C), vb = new Float64Array(C);
  const lr = opts.lr || 1e-2, B = opts.batch || 32, steps = opts.steps || 500;
  const b1 = 0.9, b2 = 0.999, eps = 1e-8;
  let t = 0;
  for (let step = 1; step <= steps; step++) {
    t++;
    const c1 = 1 - Math.pow(b1, t), c2 = 1 - Math.pow(b2, t);
    const gW = new Float64Array(C * h), gb = new Float64Array(C);
    for (let k = 0; k < B; k++) {
      const i = rng.int(F.length), f = F[i], y = Y[i];
      const lg = new Float64Array(C);
      let mx = -1e300;
      for (let c = 0; c < C; c++) {
        let s = b[c];
        for (let j = 0; j < h; j++) s += W[c * h + j] * f[j];
        lg[c] = s; if (s > mx) mx = s;
      }
      let z = 0;
      for (let c = 0; c < C; c++) { lg[c] = Math.exp(lg[c] - mx); z += lg[c]; }
      for (let c = 0; c < C; c++) {
        const d = (lg[c] / z - (c === y ? 1 : 0)) / B;
        gb[c] += d;
        for (let j = 0; j < h; j++) gW[c * h + j] += d * f[j];
      }
    }
    for (let i = 0; i < W.length; i++) {
      mW[i] = b1 * mW[i] + (1 - b1) * gW[i];
      vW[i] = b2 * vW[i] + (1 - b2) * gW[i] * gW[i];
      W[i] -= lr * (mW[i] / c1) / (Math.sqrt(vW[i] / c2) + eps);
    }
    for (let c = 0; c < C; c++) {
      mb[c] = b1 * mb[c] + (1 - b1) * gb[c];
      vb[c] = b2 * vb[c] + (1 - b2) * gb[c] * gb[c];
      b[c] -= lr * (mb[c] / c1) / (Math.sqrt(vb[c] / c2) + eps);
    }
    if (step % 100 === 0) await new Promise((res) => setTimeout(res, 0));
  }
  return { W, b };
}
function logRegAcc(W, b, F, Y) {
  const C = b.length, h = F[0].length;
  let right = 0;
  for (let i = 0; i < F.length; i++) {
    const f = F[i];
    let bi = 0, bs = -1e300;
    for (let c = 0; c < C; c++) {
      let s = b[c];
      for (let j = 0; j < h; j++) s += W[c * h + j] * f[j];
      if (s > bs) { bs = s; bi = c; }
    }
    if (bi === Y[i]) right++;
  }
  return right / F.length;
}

// Guard: probe machinery must recover labels where info is certainly present
// (short in-dist sequences, final state). Asserts plumbing only.
async function quickProbeTest() {
  const task = TASKS.assocC_none;
  const out = await trainModel(
    { vocab: 9, classes: 4, h: 24, m: 48, arch: "geo", geoMode: "none", train: task.makeTrain(7), steps: 400, batch: 16, lr: 5e-3, rMode: "mix", seed: 7, prefixLabels: task.prefixLabels },
    null
  );
  const inD = task.makeTestIn(11);
  const fin = (ex, c) => c.SD[c.SD.length - 1]; // what the r=4 head reads
  const pos = await probeLinear(out.model, inD.slice(0, 150), inD.slice(150), fin, { r: 4 });
  return { posTestAcc: pos.testAcc, ok: pos.testAcc >= 0.7 };
}

// Query-clamped settling (fresh-eyes #2's specified test): does iterating the
// FROZEN cell (zero new params) improve linear decodability of the answer?
// The query enters as a clamped input every step (Hopfield-completion style);
// geometry reads the frozen trajectory; the fire (if any) is the frozen
// final summary. Controls: "wrong" (clamp a different key — must NOT help;
// if the probe tracks the wrong clamp, that's content-addressing working)
// and "mean" (iteration with no query — generic sharpening check).
// Same probe capacity at every k: acc(k) vs acc(0) is the verdict.
function finalFire(model, cache) {
  const h = model.h, E = model.E.v, x = cache.x, S = cache.S, L = x.length;
  const emb = (id) => E.slice(id * h, (id + 1) * h);
  if (model.geoMode === "camp") {
    // fixed running mean, recomputed from frozen states
    const cf = new Float64Array(h);
    for (let j = 1; j <= L; j++) for (let i = 0; i < h; i++) cf[i] += S[j][i] / L;
    return cf;
  }
  if (model.geoMode !== "choosy") return null;
  let cf = new Float64Array(h);
  for (let t = 0; t < L; t++) {
    const f = new Float64Array(3 * h);
    f.set(S[t], 0); f.set(emb(x[t]), h); f.set(cf, 2 * h);
    const y = model.Wf.forward(f).y;
    const nx = new Float64Array(h), s = S[t + 1];
    for (let i = 0; i < h; i++) {
      const w = 1 / (1 + Math.exp(-y[i]));
      nx[i] = (1 - w) * cf[i] + w * s[i];
    }
    cf = nx;
  }
  return cf;
}
// trail[k] = {h: state after k settle steps, norm: ||h||}. With ramp=true
// (query clamp only) the clamp blends mean->query across the run:
// e_k = a_k*eQuery + (1-a_k)*eMean, a_k = (k+1)/K — whisper to shout.
// Norms distinguish flat-desert (norm steady, probe flat) from collapse
// (norm -> const, probe -> majority) or blowup (norm grows).
function settleStates(model, data, K, clamp, ramp) {
  const h = model.h, E = model.E.v;
  const emb = (id) => E.slice(id * h, (id + 1) * h);
  const nrm = (v) => Math.sqrt(v.reduce((a, x) => a + x * x, 0));
  return data.map((ex) => {
    const x = ex.x, L = x.length;
    const cache = model.forward(x, 1).cache;
    const S = cache.S;
    const Z = S.map((s) => model.Wr.forward(s)); // frozen trajectory arrows
    const cfF = finalFire(model, cache);
    const eMean = cache.ebN.y.slice();
    let eFix = null;
    if (clamp === "query") eFix = emb(x[L - 2]);
    else if (clamp === "wrong") eFix = emb((x[L - 2] + 1) % 4); // a different key
    else eFix = eMean; // mean: iterate without any query
    let hv = S[L].slice();
    const trail = [{ h: hv.slice(), norm: nrm(hv) }], dummy = [];
    for (let k = 0; k < K; k++) {
      let eC = eFix;
      if (ramp && clamp === "query") {
        const a = (k + 1) / K;
        eC = new Float64Array(h);
        for (let i = 0; i < h; i++) eC[i] = a * eFix[i] + (1 - a) * eMean[i];
      }
      const pairs = [];
      for (const d of [1, 2]) if (L - d >= 1) pairs.push({ idx: L - d, d });
      const gs = model.geoStep(hv, Z, pairs);
      hv = model.cell(hv, eC, gs.g, dummy, { isDepth: true, posT: -1, geo: gs.gc, cf: cfF });
      trail.push({ h: hv.slice(), norm: nrm(hv) });
    }
    return trail;
  });
}
async function settleProbe(model, trainData, testData, opts) {
  opts = opts || {};
  const K = opts.K != null ? opts.K : 4, clamp = opts.clamp || "query";
  const C = opts.classes || 4;
  const ks = opts.ks || Array.from({ length: K + 1 }, (_, k) => k);
  const trT = settleStates(model, trainData, K, clamp, opts.ramp);
  const teT = settleStates(model, testData, K, clamp, opts.ramp);
  const Ytr = trainData.map((e) => e.y), Yte = testData.map((e) => e.y);
  const out = [];
  for (const k of ks) {
    const wb = await logRegTrain(trT.map((t) => t[k].h), Ytr, C, opts);
    const nte = teT.reduce((a, t) => a + t[k].norm, 0) / teT.length;
    out.push({ k, testAcc: logRegAcc(wb.W, wb.b, teT.map((t) => t[k].h), Yte), norm: +nte.toFixed(3) });
  }
  return out;
}

// Guard: settling plumbing (trails built, probes train, k=0 reproduces the
// position-final probe). Asserts structure only — whether settling helps is
// measured live, never asserted here.
async function quickSettleTest() {
  const task = TASKS.assocC_none;
  const out = await trainModel(
    { vocab: 9, classes: 4, h: 24, m: 48, arch: "geo", geoMode: "none", train: task.makeTrain(7), steps: 400, batch: 16, lr: 5e-3, rMode: "mix", seed: 7, prefixLabels: task.prefixLabels },
    null
  );
  const kill = TASKS.assocG.makeKill(33, 8);
  const curve = await settleProbe(out.model, kill.slice(0, 150), kill.slice(150), { K: 4, clamp: "query" });
  const sane = curve.length === 5 && curve.every((p) => p.testAcc >= 0 && p.testAcc <= 1);
  return { k0: curve[0].testAcc, k4: curve[4].testAcc, ok: sane };
}

// Gist probe: per-position transit curve on kill examples. For each token
// position t in the gap, a capacity-matched probe maps the frozen state
// AFTER reading t (S[t+1]) to the target value. Near-target acc should exceed
// far acc if anything is carried; flat chance everywhere = the desert.
async function gistProbe(model, killData, opts) {
  opts = opts || {};
  const r = opts.r || 1;
  const L = killData[0].x.length;
  const ts = opts.ts || [2, 4, 8, 12, L - 3];
  const out = [];
  for (const t of ts) {
    if (t + 1 >= killData[0].x.length + 1) continue;
    const pick = (ex, c) => c.S[Math.min(t + 1, c.S.length - 1)];
    const pr = await probeLinear(model, killData.slice(0, 150), killData.slice(150), pick, { r });
    out.push({ t, dist: t - 1, testAcc: +pr.testAcc.toFixed(3) });
  }
  return out;
}

// Guard: gist plumbing (labels learnable in-dist, probe returns a sane
// curve). Whether gist BEATS carry on the kill set is measured live.
async function quickGistTest() {
  const task = TASKS.assocC_gist;
  const out = await trainModel(
    { vocab: 9, classes: 4, h: 24, m: 48, arch: "geo", geoMode: "choosy", train: task.makeTrain(7), steps: 400, batch: 16, lr: 5e-3, rMode: "mix", seed: 7, prefixLabels: task.prefixLabels },
    null
  );
  const accIn = evaluate(out.model, task.makeTestIn(11), 4).acc;
  const curve = await gistProbe(out.model, TASKS.assocG.makeKill(33, 8), { ts: [2, 8, 15] });
  const sane = curve.length === 3 && curve.every((p) => p.testAcc >= 0 && p.testAcc <= 1);
  return { lastLoss: out.lastLoss, accIn, curve, ok: sane && out.lastLoss < 1.5 && accIn >= 0.6 };
}

// Guard: settle-training plumbing (depth grad exact + a depth-supervised
// train runs + every depth round has a readout). Whether grading rounds
// BUILDS basins is measured live, never asserted here.
async function quickDepthAuxTest() {
  const gradErr = T.checkDepthGrad();
  const task = TASKS.assocC_choosy;
  const out = await trainModel(
    { vocab: 9, classes: 4, h: 24, m: 48, arch: "geo", geoMode: "choosy", train: task.makeTrain(7), steps: 400, batch: 16, lr: 5e-3, rMode: "mix", seed: 7, prefixLabels: task.prefixLabels, depthAuxW: 0.5 },
    null
  );
  const accIn = evaluate(out.model, task.makeTestIn(11), 4).acc;
  const fw = out.model.forward(task.makeTestIn(11)[0].x, 4);
  const nOut = fw.cache.depthOut ? fw.cache.depthOut.length : -1;
  return { gradErr, lastLoss: out.lastLoss, accIn, nOut, ok: gradErr < 1e-6 && out.lastLoss < 1.5 && accIn >= 0.6 && nOut === 4 };
}

// Guard: query-head plumbing (grad exact through the split readout, train
// runs, head actually engaged). Whether the reader spends carried info is
// measured live, never asserted here.
async function quickQueryHeadTest() {
  const gradErr = T.checkQueryGrad();
  const task = TASKS.assocC_gistq;
  const out = await trainModel(
    { vocab: 9, classes: 4, h: 24, m: 48, arch: "geo", geoMode: "choosy", queryHead: true, train: task.makeTrain(7), steps: 400, batch: 16, lr: 5e-3, rMode: "mix", seed: 7, prefixLabels: task.prefixLabels },
    null
  );
  const accIn = evaluate(out.model, task.makeTestIn(11), 4).acc;
  const fw = out.model.forward(task.makeTestIn(11)[0].x, 2);
  const engaged = !!fw.cache.qh && fw.cache.depthOut.every((d) => !!d.q);
  const kill = evaluate(out.model, TASKS.assocG.makeKill(33, 8), 1).acc;
  return { gradErr, lastLoss: out.lastLoss, accIn, engaged, kill, ok: gradErr < 1e-6 && out.lastLoss < 1.5 && accIn >= 0.6 && engaged };
}

// Guard: PCGrad plumbing (math self-check + a tiny multi-teacher run whose
// loss must fall with all params finite). Whether surgery helps is measured
// live, never asserted here.
async function quickPcgradTest() {
  const math = window.TinyNN.pcgrad.checkPcgradMath();
  const task = TASKS.assocC_gistq;
  const out = await trainPCGrad(
    { vocab: 9, classes: 4, h: 12, m: 24, arch: "geo", geoMode: "choosy", queryHead: true,
      train: task.makeTrain(3), steps: 60, batch: 8, lr: 5e-3, rMode: "mix", seed: 7,
      prefixLabels: task.prefixLabels },
    null
  );
  let finite = true;
  for (const p of out.model.params()) for (const v of p.v) if (!isFinite(v)) finite = false;
  return { math, firstLoss: out.firstLoss, lastLoss: out.lastLoss,
    ok: math === "ok" && isFinite(out.lastLoss) && out.lastLoss < out.firstLoss && finite };
}

window.TinyNN = { TASKS, trainModel, trainPCGrad, makeModel, attnSupervision, evaluate, depthCurve, adaptExperiment, quickSelfTest, quickAttnTest, quickGeoTest, quickCarryTest, quickCampTest, quickChoosyTest, quickProbeTest, quickSettleTest, quickGistTest, quickDepthAuxTest, quickQueryHeadTest, quickPcgradTest, probeLinear, settleProbe, gistProbe, geoInspect, RecModel, SeqModel, AttnModel, GeoModel, makeRng,
  makeSeededRng: T.makeSeededRng, parseSeed: T.parseSeed, sampleUntil: T.sampleUntil, weightedPick: T.weightedPick, stableIndex: T.stableIndex, stringToSeed: T.stringToSeed, SURPRISE_WORDS: T.SURPRISE_WORDS, SURPRISE_ODDS: T.SURPRISE_ODDS };
})();
