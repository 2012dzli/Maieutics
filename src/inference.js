// Inference provider abstraction — same UI works online AND offline.
// - online:  Perchance hosted LLM via root.generateText (needs network + Perchance engine)
// - offline: local deterministic solver in src/offline-solver.js (zero network)
//
// Detection: Perchance is present iff global `root` has `generateText`.
// Call window.TeachingLab.ask(question, K, onProgress) and it picks correctly,
// unless window.TeachingLab.forceOffline is true (the "force offline" checkbox).

(function () {
  "use strict";

  function hasPerchance() {
    try {
      return typeof root !== "undefined" && root && typeof root.generateText === "function";
    } catch (e) {
      return false;
    }
  }

  // Measured token accounting: use the plugin's OWN live
  // counter when present, chars/4 fallback. Drafts count — hidden ≠ free.
  function countTokens(text) {
    try {
      if (typeof root !== "undefined" && root.generateText) {
        const meta = root.generateText({ getMetaObject: true });
        if (meta && typeof meta.countTokens === "function") {
          return { n: meta.countTokens(text), measured: true };
        }
      }
    } catch (e) {}
    return { n: Math.ceil(text.length / 4), measured: false };
  }

  async function askOnline(question, K, onProgress) {
    // Shared prompt prefix every call (prefix-cache friendly); task appended at end.
    const shared = "You are a terse reasoning assistant.\n<QUESTION>\n" + question + "\n</QUESTION>\n";
    let draft = "";
    let inT = 0, outT = 0, measured = true;
    const tally = (instr, resp) => {
      const a = countTokens(instr), b = countTokens(String(resp));
      inT += a.n; outT += b.n;
      if (!a.measured || !b.measured) measured = false;
    };
    for (let k = 1; k <= K; k++) {
      if (onProgress) onProgress(k, K);
      const task = k === 1
        ? "TASK: Write your best draft answer inside <D> tags. Be concise."
        : "TASK: Read the previous draft in <D>, then write an improved draft inside <D> tags. Fix trick-wording traps. Be concise.";
      const instr = shared + (draft ? "<D>\n" + draft + "\n</D>\n" : "") + task;
      const res = await root.generateText({ instruction: instr });
      tally(instr, res);
      const m = String(res).match(/<D>([\s\S]*?)<\/D>/);
      draft = (m ? m[1] : String(res)).trim().slice(0, 800);
    }
    const finInstr = shared + "<D>\n" + draft + "\n</D>\nTASK: Output ONLY the final answer to the QUESTION. No workings, no tags.";
    const fin = await root.generateText({ instruction: finInstr });
    tally(finInstr, fin);
    return { answer: String(fin).trim(), calls: K + 1, mode: "online", tokensIn: inT, tokensOut: outT, measured };
  }

  async function ask(question, K, onProgress) {
    const forceOff = window.TeachingLab && window.TeachingLab.forceOffline;
    if (!forceOff && hasPerchance()) {
      const t0 = performance.now();
      const r = await askOnline(question, K, onProgress);
      r.elapsedSec = (performance.now() - t0) / 1000;
      return r;
    }
    if (!window.LatentOffline) throw new Error("offline solver missing (src/offline-solver.js not loaded)");
    return window.LatentOffline.askOffline(question, K, onProgress);
  }

  function mode() {
    if (window.TeachingLab && window.TeachingLab.forceOffline) return "offline (forced)";
    return hasPerchance() ? "online (Perchance LLM)" : "offline (local)";
  }

  window.TeachingLab = { ask, mode, hasPerchance, forceOffline: false };
})();
