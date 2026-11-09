// Offline solver — zero network, zero Perchance dependency.
// Purpose: prove the lab runs completely offline, and demonstrate the paper's
// core claim SHAPE (reasoning moves with K, facts don't) without any LLM.
//
// Honest scope: this is NOT general intelligence. It solves only the built-in
// demo subset deterministically, by simulating what "thinking longer" does:
// K=1 returns the fast intuitive answer (often wrong on trick questions),
// K>=2 runs hidden verification iterations and corrects it.
// Open questions still need either Perchance's LLM (online) or a local
// model server (see src/DEPLOY.md). Phase 2 replaces this with a real tiny net.

(function () {
  "use strict";

  function norm(q) { return (q || "").toLowerCase(); }

  function solve(question, K) {
    const q = norm(question);
    const depth = Math.max(1, K | 0);

    // Bat and ball ($1.10 / $1.00 more): classic System-1 trap.
    if (q.includes("bat") && q.includes("ball") && q.includes("1.10")) {
      if (depth <= 1) return "10 cents.";
      return "5 cents — the ball costs $0.05 (checked: $0.05 + $1.05 = $1.10).";
    }
    // Sheep: "all but 9" trap. Fast answer subtracts, slow answer parses.
    if (q.includes("sheep") && q.includes("17") && q.includes("9")) {
      if (depth <= 1) return "8 sheep are left.";
      return "9 sheep are left.";
    }
    // 47 * 68 = 3196. Fast guess rounds, deeper K verifies by decomposition.
    if (q.includes("47") && q.includes("68") && (q.includes("*") || q.includes("times") || q.includes("multiply"))) {
      if (depth <= 1) return "3200";
      // hidden verification, shown only as iteration count in the log:
      // 47*68 = (50-3)*68 = 3400-204 = 3196.
      return "3196";
    }
    // Facts: flatline by design, matching paper Sec 5 (limited benefit).
    if (q.includes("capital") && q.includes("france")) return "Paris";
    if (q.includes("hamlet")) return "William Shakespeare";

    // Anything else: offline engine declines honestly.
    return "Offline engine has no general LLM — this question needs online mode or a local model server (see section 6). Try a built-in demo question with 'force offline' on.";
  }

  // Simulate hidden iterations with a tiny delay so the depth control feels
  // real (and wall-time stays local, ~150ms/round, no tokens).
  async function askOffline(question, K, onProgress) {
    const t0 = performance.now();
    for (let k = 1; k <= K; k++) {
      if (onProgress) onProgress(k, K);
      await new Promise((r) => setTimeout(r, 150));
    }
    const answer = solve(question, K);
    return { answer, calls: K, elapsedSec: (performance.now() - t0) / 1000, mode: "offline" };
  }

  window.LatentOffline = { solve, askOffline };
})();
