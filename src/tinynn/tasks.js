// TinyNN tasks.js — bench reasoning tasks where recurrent depth provably helps.
// Two families (both seeded + reproducible):
//   parity  — XOR of a bitstring. Single-pass nets memorize; recurrence + length
//             generalization is the test (train len 6, test len 10).
//   modadd  — (a + b) mod p. The grokking classic: memorization flips to real
//             arithmetic with enough training. Shared vocab/classes (16) so ONE
//             model can train on p=7 and few-shot adapt to p=11 — learning to learn.
(function () {
"use strict";
const makeRng = window.__tinyNN.makeRng;

function randBits(rng, len) {
  const x = new Array(len);
  for (let i = 0; i < len; i++) x[i] = rng.int(2);
  return x;
}
function parityLabel(x) {
  let p = 0;
  for (let i = 0; i < x.length; i++) p ^= x[i];
  return p;
}

const TASKS = {
  parity6: {
    label: "parity — train len 3 to 6, test len 10",
    vocab: 2, classes: 2, maxLen: 10, padId: 2,
    // running labels: parity of each prefix — free process supervision
    prefixLabels(x) {
      const out = new Array(x.length);
      let p = 0;
      for (let i = 0; i < x.length; i++) { p ^= x[i]; out[i] = p; }
      return out;
    },
    makeTrain(seed) {
      const rng = makeRng(seed), data = [];
      for (let i = 0; i < 500; i++) {
        const len = 3 + rng.int(4); // 3..6, padded to maxLen inside the model
        const x = randBits(rng, len);
        data.push({ x, y: parityLabel(x) });
      }
      return data;
    },
    // in-distribution check: every possible 6-bit string
    makeTestIn() {
      const data = [];
      for (let n = 0; n < 64; n++) {
        const x = [];
        for (let b = 5; b >= 0; b--) x.push((n >> b) & 1);
        data.push({ x, y: parityLabel(x) });
      }
      return data;
    },
    // hard set: longer strings the model never trained on
    makeTestHard(seed) {
      const rng = makeRng(seed), data = [];
      for (let i = 0; i < 300; i++) {
        const x = randBits(rng, 10);
        data.push({ x, y: parityLabel(x) });
      }
      return data;
    },
    // variant for few-shot adaptation: odd length 7
    makeVariant(seed) {
      const rng = makeRng(seed), data = [];
      for (let i = 0; i < 300; i++) {
        const x = randBits(rng, 7);
        data.push({ x, y: parityLabel(x) });
      }
      return data;
    },
    // extra-long set: length 20, for running-state models
    makeTestXLong(seed) {
      const rng = makeRng(seed), data = [];
      for (let i = 0; i < 200; i++) {
        const x = randBits(rng, 20);
        data.push({ x, y: parityLabel(x) });
      }
      return data;
    }
  },
  modadd7: {
    label: "mod-add — train 2+3 term mod 7, test 4-term",
    vocab: 16, classes: 16,
    makeTrain(seed) {
      const rng = makeRng(seed), data = [];
      for (let i = 0; i < 500; i++) {
        const n = i % 2 === 0 ? 2 : 3; // alternate lengths: forces real addition
        const x = [];
        let s = 0;
        for (let j = 0; j < n; j++) { const v = rng.int(7); x.push(v); s += v; }
        data.push({ x, y: s % 7 });
      }
      return data;
    },
    makeTestIn() {
      const data = [];
      for (let a = 0; a < 7; a++) for (let b = 0; b < 7; b++) data.push({ x: [a, b], y: (a + b) % 7 });
      return data;
    },
    // hard set: 4-term sums — longer than anything trained on
    makeTestHard(seed) {
      const rng = makeRng(seed), data = [];
      for (let i = 0; i < 300; i++) {
        const x = [rng.int(7), rng.int(7), rng.int(7), rng.int(7)];
        data.push({ x, y: (x[0] + x[1] + x[2] + x[3]) % 7 });
      }
      return data;
    },
    makeVariant(seed) {
      // adaptation set: 4-term sums mod 7 — same modulus the net knows,
      // longer than anything trained on. Prior should beat scratch here.
      const rng = makeRng(seed), data = [];
      for (let i = 0; i < 400; i++) {
        const x = [rng.int(7), rng.int(7), rng.int(7), rng.int(7)];
        data.push({ x, y: (x[0] + x[1] + x[2] + x[3]) % 7 });
      }
      return data;
    }
  }
};

window.__tinyNN.tasks = TASKS;
// Running-state edition of parity: same data, sequential core (no slots/padding).
TASKS.parityR = Object.assign({}, TASKS.parity6, {
  label: "parity running-state — train len 3 to 6, test 10 and 20",
  arch: "seq",
  xlongNote: "length-20 (never seen, 3x train max)"
});
// Associative recall (Phase 2c): the induction-head bench test. A sequence binds
// keys to values — [k1, v1, ..., kp, vp, q, Q] — and the query (key q before
// the Q marker) asks for its value. Keys 0..3, values 4..7, 4 output classes.
// Fixed-size recurrent states must COMPRESS arbitrary bindings; attention can
// LOOK BACK. Train on 1..3 pairs, test on 4 (hard) and 6 (2x train max).
TASKS.assocR = {
  label: "assoc-recall — keys bound to values, answer the query (attention)",
  vocab: 9, classes: 4, arch: "attn", attnD: 16,
  Q: 8, // query marker: x = [k1, v1, ..., kp, vp, q, Q], answer = value bound to q
  attnAux: true, attnAuxW: 1.0, // selection supervision on the final step's weights
  xlongNote: "6 pairs (never seen, 2x train max)",
  gen(rng, nPairs) {
    const keys = [0, 1, 2, 3];
    for (let i = keys.length - 1; i > 0; i--) {
      const j = rng.int(i + 1), t = keys[i];
      keys[i] = keys[j]; keys[j] = t;
    }
    const ks = keys.slice(0, nPairs);
    const x = [], vals = [];
    for (const k of ks) { const v = rng.int(4); vals.push(v); x.push(k, 4 + v); }
    const qi = rng.int(nPairs);
    x.push(ks[qi], TASKS.assocR.Q);
    return { x, y: vals[qi] };
  },
    // value-supervision: at a VALUE position the state must still carry the
    // KEY that preceded it (the previous-token half of the induction circuit);
    // the final answer then teaches the lookup half. Nulls = no signal there.
    bindLabels(x) {
      const out = new Array(x.length).fill(null);
      for (let t = 1; t < x.length - 2; t += 2) out[t] = x[t - 1]; // value pos -> its key
      return out;
    },
    prefixLabels(x) { return TASKS.assocR.bindLabels(x); },
  makeTrain(seed) {
    const T = TASKS.assocR, rng = makeRng(seed), data = [];
    for (let i = 0; i < 500; i++) data.push(T.gen(rng, 1 + rng.int(3)));
    return data;
  },
  // in-distribution: all 16 one-pair bindings + random 1..3-pair mixes
  makeTestIn(seed) {
    const T = TASKS.assocR, rng = makeRng(seed), data = [];
    for (let k = 0; k < 4; k++) for (let v = 0; v < 4; v++) data.push({ x: [k, 4 + v, k, T.Q], y: v });
    for (let i = 0; i < 200; i++) data.push(T.gen(rng, 1 + rng.int(3)));
    return data;
  },
  // hard: 4 pairs — more bindings than ever trained on
  makeTestHard(seed) {
    const T = TASKS.assocR, rng = makeRng(seed), data = [];
    for (let i = 0; i < 300; i++) data.push(T.gen(rng, 4));
    return data;
  },
  // variant for few-shot adaptation: 3..4 pairs, half of it unseen
  makeVariant(seed) {
    const T = TASKS.assocR, rng = makeRng(seed), data = [];
    for (let i = 0; i < 400; i++) data.push(T.gen(rng, 3 + rng.int(2)));
    return data;
  },
  // extra-long: 6 pairs, 3x the train max
  makeTestXLong(seed) {
    const T = TASKS.assocR, rng = makeRng(seed), data = [];
    for (let i = 0; i < 200; i++) data.push(T.gen(rng, 6));
    return data;
  }
};
// Phase 2d-pure (the ruler): same assoc-recall data/format as assocR, but the
// geometry core (arch "geo") — local gossip only, no attention, no selection
// supervision (a local mixer has no global weights to supervise). Bind labels
// stay: they teach local association, which is exactly what gossip can do.
// Plus two diagnostic sets the attention core never needed:
//   makeKill  — target pair FIRST, distractors after, query at the end.
//               Gap (tokens) between target and query >> window {1,2}.
//   makeGap   — 1 target pair + N distractor pairs, then the query.
//               The 1-vs-20 comparison tells window apart from bias.
TASKS.assocG = {
  label: "assoc-recall geometry (2d-pure ruler, no attention)",
  vocab: 9, classes: 4, arch: "geo",
  xlongNote: "6 pairs (never seen, 2x train max)",
  gen: TASKS.assocR.gen,
  bindLabels: TASKS.assocR.bindLabels,
  prefixLabels(x) { return TASKS.assocR.bindLabels(x); },
  makeTrain(seed) {
    const T = TASKS.assocG, rng = makeRng(seed), data = [];
    for (let i = 0; i < 500; i++) data.push(T.gen(rng, 1 + rng.int(3)));
    return data;
  },
  makeTestIn(seed) {
    const T = TASKS.assocG, rng = makeRng(seed || 11), data = [];
    for (let k = 0; k < 4; k++) for (let v = 0; v < 4; v++) data.push({ x: [k, 4 + v, k, 8], y: v });
    for (let i = 0; i < 200; i++) data.push(T.gen(rng, 1 + rng.int(3)));
    return data;
  },
  makeTestHard(seed) {
    const T = TASKS.assocG, rng = makeRng(seed), data = [];
    for (let i = 0; i < 300; i++) data.push(T.gen(rng, 4));
    return data;
  },
  makeVariant(seed) {
    const T = TASKS.assocG, rng = makeRng(seed), data = [];
    for (let i = 0; i < 400; i++) data.push(T.gen(rng, 3 + rng.int(2)));
    return data;
  },
  makeTestXLong(seed) {
    const T = TASKS.assocG, rng = makeRng(seed), data = [];
    for (let i = 0; i < 200; i++) data.push(T.gen(rng, 6));
    return data;
  },
  // target pair, then `fill` distractor pairs (never reusing the target key,
  // so the query is unambiguous), then the query. 200 examples.
  withDistractors(rng, fill) {
    const x = [];
    const tk = rng.int(4), tv = rng.int(4);
    x.push(tk, 4 + tv);
    for (let f = 0; f < fill; f++) {
      let k = rng.int(4);
      while (k === tk) k = rng.int(4);
      x.push(k, 4 + rng.int(4));
    }
    x.push(tk, 8);
    return { x, y: tv };
  },
  makeKill(seed, nFill) {
    const T = TASKS.assocG, rng = makeRng(seed), data = [];
    for (let i = 0; i < 200; i++) data.push(T.withDistractors(rng, nFill || 8));
    return data;
  },
  makeGap(seed, pairs) {
    const T = TASKS.assocG, rng = makeRng(seed), data = [];
    for (let i = 0; i < 200; i++) data.push(T.withDistractors(rng, pairs));
    return data;
  },
  // Held-out-combo controls: separate "memorized pairs" from "learned rule".
  // HOLDOUT_DIAG (k==v, 4 combos) never appears in training; killH targets
  // only held-out pairs, killA only allowed pairs (same shape otherwise).
  HOLDOUT_DIAG: [0, 5, 10, 15], // comboKey = k*4+v for (0,0),(1,1),(2,2),(3,3)
  comboAllowed(k, v, allowed) { return allowed.indexOf(k * 4 + v) >= 0; },
  genRestr(rng, nPairs, allowed) {
    const keys = [0, 1, 2, 3];
    for (let i = keys.length - 1; i > 0; i--) {
      const j = rng.int(i + 1), t = keys[i];
      keys[i] = keys[j]; keys[j] = t;
    }
    const ks = keys.slice(0, nPairs);
    const x = [], vals = [];
    for (const k of ks) {
      const opts = [];
      for (let v = 0; v < 4; v++) if (TASKS.assocG.comboAllowed(k, v, allowed)) opts.push(v);
      const v = opts[rng.int(opts.length)];
      vals.push(v); x.push(k, 4 + v);
    }
    const qi = rng.int(nPairs);
    x.push(ks[qi], 8);
    return { x, y: vals[qi] };
  },
  makeTrainHoldout(seed, allowed) {
    const T = TASKS.assocG, rng = makeRng(seed), data = [];
    for (let i = 0; i < 500; i++) data.push(T.genRestr(rng, 1 + rng.int(3), allowed));
    return data;
  },
  // 2x2 dissociation: target combos from targetSet, distractor combos from
  // distrSet ("fam" = trained ALLOWED, "nov" = held-out DIAG). Salience
  // theory: novel items pop -> nov/fam high, fam/nov low. Primacy theory:
  // first pair echoed regardless -> all high.
  killMatrix(seed, nFill, targetSet, distrSet) {
    const T = TASKS.assocG, rng = makeRng(seed), data = [];
    for (let i = 0; i < 200; i++) {
      const pick = targetSet[rng.int(targetSet.length)];
      const tk = Math.floor(pick / 4), tv = pick % 4;
      const x = [tk, 4 + tv];
      for (let f = 0; f < nFill; f++) {
        let k = rng.int(4);
        while (k === tk) k = rng.int(4);
        const opts = [];
        for (let v = 0; v < 4; v++) if (T.comboAllowed(k, v, distrSet)) opts.push(v);
        x.push(k, 4 + opts[rng.int(opts.length)]);
      }
      x.push(tk, 8);
      data.push({ x, y: tv });
    }
    return data;
  }
};
// Phase 2d-carry (the hybrid): gossip mixer + gated running notebook + the
// "don't drop the note" loss. carryLabels = the newborn reviewer's transport
// loss wearing work clothes: at EVERY position after the first binding, the
// state must still name the most recent key. Bindings update at each value
// position; everything else (distractors, query, marker) must carry them.
// Same data as assocG; only the supervision (and geoMode) changes.
function assocCarryLabels(x) {
  const out = new Array(x.length).fill(null);
  let lastKey = null;
  for (let t = 0; t < x.length; t++) {
    const tok = x[t];
    if (t > 0 && t < x.length - 1 && tok >= 4 && tok < 8 && x[t - 1] >= 0 && x[t - 1] < 4)
      lastKey = x[t - 1]; // value position: a new binding lands
    // Never supervise the final Q slot: the main loss owns it (it must name
    // a VALUE there, while carry names KEYs — same shared readout, so the
    // two teachers would shout opposite answers at one student).
    if (lastKey != null && t < x.length - 1) out[t] = lastKey;
  }
  return out;
}
function assocCarryTask(label, geoMode) {
  const G = TASKS.assocG;
  return {
    label, vocab: 9, classes: 4, arch: "geo", geoMode,
    xlongNote: "6 pairs (never seen, 2x train max)",
    gen: G.gen,
    prefixLabels: assocCarryLabels,
    makeTrain: G.makeTrain, makeTestIn: G.makeTestIn, makeTestHard: G.makeTestHard,
    makeVariant: G.makeVariant, makeTestXLong: G.makeTestXLong,
    makeKill: G.makeKill, makeGap: G.makeGap
  };
}
TASKS.assocC = assocCarryTask("assoc-recall carry (2d-carry: gossip + notebook + don't-drop loss)", "full");
TASKS.assocC_lin = assocCarryTask("assoc-recall carry, LINEAR mixer ablation (same window, no wedge)", "linear");
TASKS.assocC_none = assocCarryTask("assoc-recall carry, NO mixer ablation (notebook alone)", "none");
TASKS.assocC_camp = assocCarryTask("assoc-recall CAMPFIRE (global summary + gossip + notebook + don't-drop)", "camp");
TASKS.assocC_choosy = assocCarryTask("assoc-recall CHOOSY FIRE (learned write-gate + gossip + notebook + don't-drop)", "choosy");
// Phase 2e-gist (the transit test): query-conditioned VALUE persistence.
// carryLabels teach "hold the latest KEY" (notebook discipline); gist teaches
// "once the QUERIED key's value lands, never drop it". The query key is
// x[L-2] (known at train time), so labels are null before its binding lands
// and name its value at every later position (main loss owns the final Q
// slot, so we leave it null there). Same 4-class head: values 4..7 -> 0..3.
// Deliberately NOT most-recent-value (that would reward the recency heuristic
// we already have); the label follows the queried binding only.
function assocGistLabels(x) {
  const out = new Array(x.length).fill(null);
  const qk = x[x.length - 2];
  if (qk < 0 || qk >= 4) return out;
  let v = null;
  for (let t = 0; t < x.length - 1; t++) {
    const tok = x[t];
    if (t > 0 && tok >= 4 && tok < 8 && x[t - 1] === qk) v = tok - 4;
    if (v != null) out[t] = v;
  }
  return out;
}
TASKS.assocC_gist = (() => {
  const G = TASKS.assocG;
  return {
    label: "assoc-recall GIST (query-conditioned value persistence + choosy fire)",
    vocab: 9, classes: 4, arch: "geo", geoMode: "choosy",
    xlongNote: "6 pairs (never seen, 2x train max)",
    gen: G.gen, prefixLabels: assocGistLabels,
    makeTrain: G.makeTrain, makeTestIn: G.makeTestIn, makeTestHard: G.makeTestHard,
    makeVariant: G.makeVariant, makeTestXLong: G.makeTestXLong,
    makeKill: G.makeKill, makeGap: G.makeGap
  };
})();
TASKS.assocC_gistq = (() => {
  const G = TASKS.assocG;
  return {
    label: "assoc-recall GIST+QUERYHEAD (reader sees the question + persistence)",
    vocab: 9, classes: 4, arch: "geo", geoMode: "choosy", queryHead: true,
    xlongNote: "6 pairs (never seen, 2x train max)",
    gen: G.gen, prefixLabels: assocGistLabels,
    makeTrain: G.makeTrain, makeTestIn: G.makeTestIn, makeTestHard: G.makeTestHard,
    makeVariant: G.makeVariant, makeTestXLong: G.makeTestXLong,
    makeKill: G.makeKill, makeGap: G.makeGap
  };
})();
})();
