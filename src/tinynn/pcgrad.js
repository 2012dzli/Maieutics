// PCGrad: gradient surgery for multi-task learning (Yu et al. 2020).
// Verified against the reference implementation
// (github.com/tianheyu927/PCGrad/blob/master/PCGrad_tf.py): per-task grads,
// shuffled order, project each grad against every conflicting one, then ONE
// optimizer step on the merged grad. Our port: per-component backward passes
// on shared forward caches (trainPCGrad in train.js), project-then-average,
// single Adam step — so Adam's momentum only ever sees de-conflicted grads.
(function () {
  function flatLen(params) {
    let n = 0;
    for (const p of params) n += p.g.length;
    return n;
  }
  function readFlat(params) {
    const a = new Float64Array(flatLen(params));
    let o = 0;
    for (const p of params) { a.set(p.g, o); o += p.g.length; }
    return a;
  }
  function writeFlat(params, a) {
    let o = 0;
    for (const p of params) { p.g.set(a.subarray(o, o + p.g.length)); o += p.g.length; }
  }
  function dot(a, b) {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;
  }
  // grads: non-empty array of Float64Array, projected in place. Returns average.
  // rng: function returning uniform [0,1) for shuffle order.
  function pcgrad(grads, rng) {
    const k = grads.length;
    const order = grads.map((_, i) => i);
    for (let i = k - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = order[i]; order[i] = order[j]; order[j] = t;
    }
    for (const i of order) {
      for (const j of order) {
        if (i === j) continue;
        const gi = grads[i], gj = grads[j];
        const d = dot(gi, gj);
        if (d < 0) {
          const n2 = dot(gj, gj);
          if (n2 > 1e-24) {
            const s = d / n2;
            for (let t = 0; t < gi.length; t++) gi[t] -= s * gj[t];
          }
        }
      }
    }
    const out = new Float64Array(grads[0].length);
    for (const g of grads) for (let t = 0; t < g.length; t++) out[t] += g[t] / k;
    return out;
  }
  // Self-check on synthetic conflicts: opposed grads must de-conflict,
  // identical grads must pass through unchanged. Loud on failure.
  function checkPcgradMath() {
    const a = new Float64Array([1, 0]);
    const b = new Float64Array([-1, 0.5]);
    const avg = pcgrad([a.slice(), b.slice()], () => 0.999);
    if (!(avg[0] * -1 + avg[1] * 0.5 >= -1e-9)) return "deconflict-fail";
    const c = new Float64Array([2, 3]);
    const d2 = new Float64Array([2, 3]);
    const avg2 = pcgrad([c.slice(), d2.slice()], () => 0.0);
    if (Math.abs(avg2[0] - 2) > 1e-12 || Math.abs(avg2[1] - 3) > 1e-12) return "identity-fail";
    if (!avg.every(isFinite) || !avg2.every(isFinite)) return "nan";
    return "ok";
  }
  const PCGrad = { readFlat, writeFlat, dot, pcgrad, checkPcgradMath };
  if (typeof window !== "undefined") {
    window.TinyNN = window.TinyNN || {};
    window.TinyNN.pcgrad = PCGrad;
  }
})();
