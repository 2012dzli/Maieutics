# CHATLOG — the AI's memory, for the AI

Append-only. New dated entry per work session: what was decided, what was
MEASURED (numbers over prose), what failed and why. This file + git is how a
future session (or a contextless me) reconstructs state after compaction.
Keep entries short; link code paths, not whole code. Numbers are sacred:
never "feels faster" — wall time, accuracy, loss, token counts.

## Conventions
- Chatlog-as-AI-memory, durable-store-is-git,
  session entries with measurements. NOT used here: game content, persona system,
  LLM-judge A/B rig (wrong tool here — our benchmarks are numeric, and
  `quickSelfTest` + pinned thresholds already do that job deterministically),
  upload-mint machinery (we use git).
- Dual-mode rule (src/DEPLOY.md): every perchance-only
  dependency must have a non-perchance path or be optional.
- Token accounting: section-4 online mode reports MEASURED
  tokens via the plugin's own `countTokens`, chars/4 fallback offline.
- PRE-STEP RESEARCH CHECK (standing rule, user-set 2026-11-08): before
  starting any new step, ask what external fact could save compute or
  unblock a question. "Nothing" is a valid answer — record it and move on.
  If something: max ~2 searches via src/tools/websearch, fetch 1-2 PRIMARY
  sources (arxiv/repo/docs, not blogs), double-check every claim against
  our own code/numbers before using it (research errs like fresh-eyes
  reviewers do), cite URL + verdict in the entry. Never skip the check
  silently; never spiral past 2 searches.
- RABBITHOLE MODE (standing rule, user-set 2026-11-08): when researching a
  topic, follow tangents that serve the ORIGINAL question (depth-first, max
  ~3 hops from the root). Log the trail (Q -> finding -> next Q) in the
  entry; every branch ends with a verdict (useful / dead end + why).
  Always return to the root with: what changed about the original question.
  Budget per session agreed with user; report between waves, never burn it
  all in one silent burst.
- FLEET (standing pattern, no sub-agent tool exists — this is the workaround,
  user-set 2026-11-08): spawn N parallel contextless researchers via ONE
  page_eval firing N concurrent root.generateText calls (Promise.all), each
  handed a SEALED brief (question + background + 150-word cap + return
  shape). Scouts never see each other; I synthesize after. Recipe: briefs
  short, questions disjoint, cap scout count per wave (default 3), verify
  each reply is on-brief before merging. If the platform throttles (call
  failures), back off to sequential with pauses and say so.

## 2026-11-08 — Phase 1: the lab
- Built 6-section explainer around Geiping et al. arXiv:2502.05171 (Huginn 0125).
  Verified paper is real via arXiv fetch. Blog summary was accurate.
- Cost question (user): layering on Perchance LLM costs K+1 calls/tokens;
  true latent recurrence costs K× FLOPs, 0 tokens. Answered in lab §2 + §4 log.
- Verified: K=1 online → "Paris" in 3.7s / 2 calls. Orbit canvas + depth slider OK.

## 2026-11-08 — Offline port + repo
- Two backends behind `window.TeachingLab.ask()` (src/inference.js): online
  (root.generateText) vs offline (src/offline-solver.js, deterministic demos).
- Verified forced-offline: bat-ball K=1 "10c" (wrong) → K=4 "5c" (fixed),
  0.2s/0.6s, 0 tokens; facts flat. Force-offline toggle rehearses cluster build.
- Ship set: index.html + src/*.js only. Dockerfile (nginx) + k8s/deployment.yaml
  + src/DEPLOY.md. Shipped to a previous private repo (since deleted). main.pjs excluded.

## 2026-11-08 — Phase 2a: tiny net learns (MLP core)
- src/tinynn/{nn,tasks,train}.js: hand-rolled (P,R,C), manual BPTT, Adam.
  Grad-check exact to 1e-9 before any training (both pool paths).
- mod-add (train 2+3-term mod7, h48): 100% in-dist; 4-term hard r=1 47% → r=4
  59% → r=16 collapse. Paper shape + stability cliff at bench scale.
- Parity + mean-pool FAILED (stuck at chance): count-mod-2 pathology. Fixed by
  representation (sum-pool, then concat-pad prelude). Lesson: generalization
  comes from the architecture, not wishes.
- Parity concat-pad: 97% in-dist, len-10 ~chance (padding OOD by construction —
  kept as honest negative). Meta mod7→4-term/60 steps: prior 86% vs scratch 19%.
- Bugs fixed: rmsBackward cache object, sum-pool /L grad, glue TDZ, h1
  double-render (engine re-inserts binding; MutationObserver guard).
- quickSelfTest green (mod-add h32/800 steps, 4.4s): asserts loss + acc + depth.

## 2026-11-08 — Phase 2b: running state + process supervision
- User asked why longer strings can't be chunked. Answer built: SeqModel reuses
  one gated cell over POSITIONS (fresh input) then DEPTH (summary re-injected).
- Vanilla cell memorized (in-dist 98%, len-10 chance). Gate alone: 100% in-dist,
  still chance OOD. Only +per-step running-parity labels worked: outcome-only
  supervision memorizes, step supervision teaches the rule (CoT analogue).
- Parity ≤6 → 100% in-dist, 100% len-10 all r, 100% len-20 (3x train max), ~46s.
  UI verdict separates "solved at r=1" (parity-R) from depth curves (mod-add).
  Adapt len-7: zero-shot 100%, holds 100% vs scratch 57%.
- Gated + aux-path gradients grad-checked exact.

## 2026-11-08 — Helper-system review (cross-project ideas)
- Adopted: CHATLOG convention (this file), measured-token reporting (§4 online now
  prints live-tokenizer in/out counts), dual-mode rule (DEPLOY.md).
- Skipped: LLM-judge A/B rig (numeric benchmarks subsume it), kv saves (Phase 3),
  game content files, upload mints (git instead).

## 2026-11-08 — Name-scrub
- Removed all references to the other project from shipped files (CHATLOG,
  DEPLOY.md, inference.js comment). Ideas kept, attribution removed per user
  request. Pushed 2026-11-08 as follow-up commit.

## 2026-11-08 — Phase 2c: single-head attention core + selection supervision
- `AttnModel` (src/tinynn/nn.js): positions unroll left-to-right, each step
  queries a causal dot-product memory over past position STATES (paper-style:
  its recurrent block holds a self-attention layer), gates retrieval into the
  running state; depth steps re-query full memory. Task assoc-recall
  `[k1,v1,..,q,Q]` → bound value; train 1..3 pairs, test 4/6.
- Two bugs caught by grad-check before any training: (1) gate-path grad
  `duz[2h..]` into the retrieved vector was dropped (7e-2 errors); (2) dummy
  t=0 retrieval cache leaked Wa grads. Both fixed, both passes exact (~1e-10).
- Learning needed 3 tries, all measured: static-embedding attention can't
  express binding (hard ~0.5); state-attention alone memorizes (hard ~0.6,
  held-out combos ~5% — learns the dataset bias, not lookup); +BIND aux (value
  pos predicts its key) + SELECTION aux (`-log w[target]` on final weights)
  installs the circuit: in-dist 99.5%, hard 4-pair ~0.96 FLAT r=1..16,
  held-out (key,value) combos ~97%, one-pair 100%. 6 pairs ~0.57 (capacity
  limit past 2x — honest). Gated-RNN same-data baseline: 0.84 / ~0.59 / ~5%.
- UI (§7): assoc-recall option, verdict logic now 4-way (helped / solved at
  r≈1 / flat-near-chance / flat-middle), per-task xlong notes. Full UI loop
  verified live (600 steps: 98.6% in-dist, hard 94%, adapt 98.5%→100% vs 57%).
- `quickAttnTest` green (grad 5e-10, 96% in-dist, hard 73% at h24/400, 7.9s);
  `quickSelfTest` still green (4.5s).

## 2026-11-08 — Grassmann paper (2512.19428) + ELI5 mode
- Paper: "Attention Is Not What You Need" (Zhang, Dec 2025, single author).
  Framing: attention = tensor lifting (L×L pairwise space, opaque, no small
  invariants) → uninterpretability is structural, not just size. Method:
  reduce h→z (r=32), multi-scale local pairs, wedge/Plücker p_ij, normalize,
  project back, gate-fuse. Results: 13–18M params within 10–15% of matched
  Transformer on Wikitext-2 (gap narrows with depth); SNLI head edge is
  noise-level (0.8538 vs 0.8511); linear in L asymptotically but slower in
  practice. Honest scale: weak absolute numbers, unreplicated.
- Lessons for us: (1) Phase 2d = geometry core (spec in README): Plücker
  mixing as a THIRD core beside RNN/attention, same tasks, same honest
  baselines. Bench cost is trivial (r=6 → 15 dims, offsets {1,2}).
  (2) Interpretability caveat for the lab: attention maps show WHERE, not WHY
  (their §7.4) — our weight readouts need that label. (3) Their "global
  invariants guide local flow" future = our §3 orbit plot grown up.
  (4) ELI5 for wedge product: "how much two arrows disagree" (signed area).
- ELI5 mode shipped in generator: header toggle (persisted in localStorage),
  7 section boxes (hiker/fog, paper-vs-quiet-thinking, orbits, bat-ball,
  paper shelf one-liners incl. Grassmann, camping, §7 report-reader legend).
  Verified live: 7 boxes hidden by default, all show on toggle, restore on
  reload, off on untoggle. Fixed one self-inflicted syntax error (ate a
  `})();` with the insert — page_refresh caught it. Lesson: check the body too, not just the boxes.

## 2026-11-08 — ELI5 bug: toggle hid the whole page
 - User: "it disappeared when clicking eli5". Diagnosis via page_eval:
   `document.body` itself matched the `.eli5{display:none}` rule once it got
   class `eli5` (body is not its own descendant, so `body.eli5 .eli5` never
   rescued it) — body computed `display:none`, entire page blank. My earlier
   DOM-only check passed because I read the boxes, not the body. Lesson: a
   visibility toggle must use a body class that collides with nothing.
 - Fix: body class renamed to `eli5-on` (CSS `body.eli5-on .eli5`, JS toggle
   x2); box class `.eli5` untouched; localStorage key unchanged. Verified live:
   on = body block + 7/7 boxes shown; off = body block + 0 boxes; back on =
   7/7; persisted ON across refresh. All 7 sections present in every state.
 - User rule adopted (refined): user knows basic programming — ELI5 is for
   complex AI concepts only. Toggle ON = ELI5 for the hard AI stuff, normal
   voice for code mechanics; toggle OFF = full technical everywhere.
   I check `document.getElementById("eli5El").checked` (or the persisted key)
   before substantive explanations. Toggle was left ON after verification.
 - Pushed 2026-11-08 as 6f3b7a0 (linear on bce1865).

 ## 2026-11-08 — Fresh-eyes process + first review of the 2d plan
 - Q: is there a built-in sanity-check skill? A: no. But generateText calls
   are stateless (zero conversation memory), so "brand-new contextless me" =
   one call handed ONLY the artifact. Standing rule: whenever either of us
   says "fresh eyes", that's what runs. ELI5 ignored in reviews (they talk
   to me, blunt/technical).
 - Ran it on the 2d gameplan. Newborn-me verdict: MODIFY-THEN-BUILD.
   (1) Local-only gossip can't do content lookup: binding must be carried
   hand-to-hand through intervening pairs, decays with distance — breaks as
   soon as gap > window. This matches our own 2b lesson (running state can't
   look up). (2) New idea adopted: a "transport/persistence" aux loss forcing
   the binding signal not to decay across steps. (3) Kill exp adopted as 2d
   gate: single pair at start, query at end of long line; fail-where-2c-passes
   = plan dead. Confirm metric: accuracy flat across gap distance + held-out
   combos (anti-memorization). (4) Scold already covered: 2c flat r=1..16 =
   depth does nothing on assoc-recall; our verdict says exactly that.
   Modified plan: build pure-local 2d EXPECTING kill-test failure (cheap
   honest negative proving the theory), then 2d-carry hybrid (2b notebook +
   geometry mixer).
 - Lab feature: §7 "fresh-eyes check" button + output div. Sends ONLY current
   report text + task label to a stateless reviewer. Verified live: empty
   guard correct; synthetic report returned a real critique (it even caught
   my franken-test-report mixing parity framing with selection labels —
   proves it reads, not nods). NOT yet pushed.

 ## 2026-11-08 — Two tracks, no collision (user asked for triple-check)
 - User's model: track 1 (Huginn/latent depth) = think longer without more
   tokens; track 2 (2b/2c/2d) = how info moves across positions (memory
   mixer). Confirmed: separate axes, fully composable. R-loop says HOW LONG
   to think; mixer says WHAT the block is made of. We already compose them:
   2c runs an attention core inside a depth loop (r=1..16 curve).
 - One framing correction: the saving isn't "preventing encode/decode" —
   prelude/coda still run once. The saving is zero extra TOKENS while
   thinking grows (no CoT write-out + re-read); you pay FLOPs instead.
 - Interactions audited, all clean: per-step mixer cost × r depth
   (geometry's linear-T edge survives looping); random-r training (loop
   trick) vs aux losses (mixer teaching) combine freely; orbit dynamics vs
   mixer internals = two microscopes, no conflict. Only "collision" is
   lab-UI complexity, not architecture. Offered fresh-eyes run on this;
   user to invoke.
 - FLOPs explained (user asked): count of +/× on decimals = total math-work;
   FLOPS/second = speed. Hiker footprints.
 - Fresh-eyes #2 (next step): SKIP pure, go straight to carry. Theater (gap>
   window is math fact); kill decisive if gap>>window + run 1-step vs 20-step
   gap control (adopted); catch decoration by ablating mixer→linear (adopted
   for Step 2). MY PUSHBACK (recorded): pure stays but FAST — it doubles as
   the ablation baseline that makes carry meaningful (no pure baseline =>
   can't tell if geometry contributed). Gap sweep adopted.
 - Fresh-eyes #3 (whole program): "clever toy, no discovery-grade controls".
   Fair hits: want fixed-depth/FLOP-matched baselines; OOD=longer is partly
   capacity test (but held-out combos 97% IS the generalization test +
   xlong; reviewer under-weight). WRONG hit: step-labels = "leakage" (no:
   supervision at train, hidden at test = teaching, not leaking). Cut
   campfire/readouts = "fluff": DISAGREE, keep (paper's own bullet #4,
   cheap). Stance kept: claims stay "shape at bench scale".

 ## 2026-11-08 — 2d-pure ruler + 2d-carry built and measured
 - `GeoModel` (nn.js): h->z G=6, wedge vs causal offsets {1,2} (P=15),
   rms-norm, mean, project, gate-fuse; modes full/linear/none (ablations).
   Grad exact all modes + aux (~1e-8..1e-10). Self-caught bug: check probed
   p.v instead of p.g (model was right, check was wrong) — per-param debug
   proved it in minutes. Second self-catch: carry aux + main loss fought at
   the shared Q readout (KEY vs VALUE) — carry labels now skip the Q slot.
 - TASKS.assocG (bind aux + kill/gap sets) + assocC family (carry/don't-drop
   aux, full/lin/none). quickGeoTest + quickCarryTest green (plumbing only).
   UI: 4 task options, cfg.geoMode, ELI5 legend updated; all paths verified.
 - MEASURED h48/m96/1200 assoc: pure ID 0.76 hard 0.48 kill 0.37-0.41 gap1
   0.64->gap20 0.35 (predicted failure confirmed, window signature). Carry:
   full ID 0.73 hard 0.54 / lin 0.87/0.59 / none 0.86/0.62 (seed8 0.84/0.57);
   kill 0.35-0.38 all, gap1 ~0.80 all, gap20 0.30-0.34 all. geoInspect: no
   binding spike (4.76 vs 4.84). VERDICT: no local variant crosses long gaps;
   wedge gossip underperforms bare notebook at matched budget (a drag, not
   decoration); carry buys short gaps only. Next: campfire-summary gate.
 - CAMPFIRE BUILT + MEASURED (mode "camp": running-mean cf of all states,
   widened Lzc/L1c injection, frozen in depth, full BPTT through the chain).
   Grad exact all 4 modes (4.6e-10); fire path alive (Lzc/L1c grad norms
   9.7/18.5, unused paths zero — no bug, no dead code). h48/m96/1200:
   lastLoss 0.005 (memorized train) but ID 0.73 hard 0.52 kill 0.32 gap1
   0.71 gap20 0.315 — matches full-gossip, below bare notebook (0.86/kill
   0.38). VERDICT: static-mean campfire does NOT transport lookup.
   Mechanism: mean over 20 binding states = mush; lookup needs SELECTIVE
   pointing (attention) or selective writing (untested). Paper bullet #1 in
   its averaged-subspace form: ruled out for lookup.
 - SCALING STUDY (steps x size, assocC seed 7): steps axis @h48 (400/1200/
   2400): ID full 0.73/0.73/0.80 vs none 0.80/0.86/0.90 — PARALLEL curves,
   gap ~0.1 never closes; kill/gap20 flat ~0.3-0.4 both (6x training moves
   nothing). Size axis @1200 steps (h24/h48/h64): ID gap 0.12/0.13/0.00
   (closes on easy!), hard gap 0.10/0.08/0.04 (shrinking), kill/gap20
   identical walls everywhere. VERDICT: budget moves levels, never the wall
   (window {1,2} can't bridge gap 20 at any h or steps). "Starts worse,
   catches up on easy; strictly walled on transport." Single-seed caveat
   (+-0.04); the wall is the robust result (12+ runs flat).
 - FRESH-EYES #4 (whole 2d saga + resource Q, my answer given first with
   the verdict sealed): resources — steps solid (converged), h solid (wall
   architectural), seeds fragile (fair: single seeds +-0.04), hyperparams
   saturated. AGREED on all four. Two newborn ERRORS caught: (a) "zero aux
   at eval" is already how evaluate() works — no-op suggestion, proves
   fresh eyes need verification against the code; (b) "aux leakage" at
   test time is impossible (aux is train-only gradients); the real version
   = recency/position heuristics, which kill (target-first) already
   controls for. Better control proposed (mine): held-out-combo kill —
   train 12 combos, test kill on 4 excluded; separates memorized pairs
   from rule. Status: proposed, not yet run.
 - HELD-OUT-COMBO KILL, SOLO (none-mode, train 12 combos, diagonal held out):
   INVERTED result — killH (novel targets) 0.72, killA (familiar) 0.27.
   2x2 dissociation (retrain + killMatrix, target x distractors fam/nov):
   famFam 0.27 / novFam 0.72 / famNov 0.47 / novNov 0.19. errFirst=0.00
   everywhere (primacy DEAD); errors guess LAST value 31-52% (noisy
   recency default). UNIFIED THEORY: no lookup — just recency default +
   novelty pop (von Restorff: the unfamiliar stands out of the mush).
   CORRECTION to own scoreboard: mixed kill 0.35-0.38 was novelty-inflated;
   fair-distribution long-gap (famFam) = chance 0.27. Wall MORE solid.
   Bar for choosy-fire set precisely: beat famFam substantially, on
   held-out combos. WARNING: a novelty-triggered write-gate would exploit
   the heuristic, not implement lookup — test on famFam.
 - CHOOSY FIRE BUILT + MEASURED (mode "choosy": per-dim learned gate
   cf_{t+1}=(1-w)*cf_t+w*S[t+1], w=sigmoid(Wf[S[t],e_t,cf_t]), bias -1
   start-closed; full wedge gossip + widened injection + notebook +
   don't-drop; Wf constructed LAST so other modes keep byte-identical
   inits — caught a 1e-6 finite-diff false alarm in "full" caused purely by
   shifted rng draws, not by the gate code). Grad exact all 5 modes
   (4.6e-10); quickChoosyTest green (loss 0.32, ID 0.76, gate range
   0.03-1.0 — vitality assert passed). h48/m96/1200 seed7: ID 0.84, hard
   0.62, kill 0.375 (r1) / 0.38 (r4), gap1 0.80, gap20 0.32; gate at scale
   0.00009-0.99 mean 0.27 (alive, selective). Seed8: ID 0.81, hard 0.51,
   kill 0.41, gap20 0.34. CHEAT-PROOF 2x2 (held-out train, seed7): famFam
   0.33 / novFam 0.65 / famNov 0.59 / novNov 0.05 vs none-mode 0.27/0.72/
   0.47/0.19 — same recency + novelty-pop shape (novNov BELOW chance =
   heuristic misfiring on all-novel lines); fair cell still ~chance
   (+0.06, ~1.7 sigma, n=200 — not a signal). VERDICT: choosy fire FAILS
   the exam. Selective writing without selective reading does not
   transport lookup.
 - SETTLE TEST BUILT + RUN (fresh-eyes #2's specified design, 2026-11-08):
   new settleProbe/train (frozen cell iterated K steps, query-clamped input,
   frozen trajectory + frozen fire, zero new params; controls wrong-key and
   mean clamps; same probe capacity every k) + quickSettleTest green + cfOut
   stash validating finalFire bit-exact (diff 0). Self-caught bug pre-
   verdict: opts.steps collision meant 8-step probes (fixed -> K namespace).
   h48/1200 choosy, kill s33/s44, K=0..8: query 0.29-0.31 FLAT, wrong
   0.25-0.33 flat, mean 0.33-0.39 (noise-level lift). VERDICT: settling
   does NOT retrieve — untrained dynamics have no basins; iteration is just
   diffusion. Lesson: the R-loop must be TRAINED to settle (paper's random-r
   unrolls), not bolted on. Attractor-by-dynamics needs settle-time training
   signal, now the specified next design.
 - SETTLE-100 (reviewer's K=100 + clamp-ramp test, 2026-11-08): h48 choosy,
   kill s33/s44, ks 0..100, query-ramp vs query-fixed vs mean. Norms
   6.928 everywhere — dead instrument (RMSNorm pins ||h||=sqrt(h) by
   construction; admitted). Probes: fixed 0.26-0.31 flat all 100 rounds;
   ramp bumps 0.38/0.37 early then 0.275 at k=100; mean same shape
   (0.385 at k=1). No query-specific, no sustained effect — 27 looks,
   bumps = multiple-comparison noise. RMSNorm also rules out the
   diverge-branch a priori. VERDICT: desert confirmed at 100 rounds.
   Reviewer's test adopted and answered: not slow dynamics, no valleys. Remaining local options thin: direction-inspect,
   r-sweep 2x2, fresh-eyes. The honest shape: lookup wants a query-time
   pointer (attention), not a better souvenir shelf.
  - SELF-CALL TEST (user asked, 2026-11-08): newborn generateText given
    README (2500 chars) + search SKILL + fresh-eyes button desc, CHATLOG
    deliberately withheld. Asked: would you use the 3 helpers + cheapest
    next experiment? ANSWER: fresh-eyes NO ("can't generate hypothesis"),
    memory YES-but-missing (asked for CHATLOG trends), search NO
    ("internal failure, not facts"). Proposed r=1..10 depth sweep on one
    hard instance — ALREADY RUN (r=1..16 flat, ID 99.5/hard .96/kill .3).
    LESSON: self-calling is NOT automatic; newborn optimizes local fix,
    dismisses reviewers/search, and re-proposes run history it can't see.
    Fix = explicit invocation checklist, not assumed initiative. Standing
    rule proposed: before any next-experiment claim, (1) check CHATLOG for
    already-run, (2) run fresh-eyes, (3) 1 search for prior art.
  - PHASE 2e BUILT (user: "lets do those", all three, 2026-11-08):
    gist labels (query-conditioned value persistence, NOT most-recent —
    rewards the queried binding only) + TASKS.assocC_gist; settle-training
    (depthOut readouts + depthList grad injection + buildDepthList +
    UI toggle -> depthAuxW 0.5); evo.js (from-checkpoint ES, antithetic
    pairs, elitism, gate|mixer|inject genes, dense fitness
    ID/famFam/gap4/gap20). Guards green: checkDepthGrad 2.8e-7 (old paths
    4.6e-10 unchanged), gist h24/400 loss 0.39 ID 0.75 curve
    1.00/0.90/0.66, depthAux h24/400 loss 0.65 ID 0.72 4/4 readouts,
    combo kill 0.44 curve 1.00/0.88/0.72, evo 0.522->0.524 elitism holds.
    FIRST supervision that moves transit (graded decay, not flat chance).
    Research: 2 DDG searches, textbook-confirmed, no new trick. Full
    h48/1200 verdicts live (UI: gist task + settle toggle). NOT yet pushed.
  - FULL-SCALE GIST h48/1200 (2.5 min): ID 0.755/hard 0.45/kill 0.345/
    gap20 0.385 — wall UNMOVED (choosy 0.84/0.62/0.375/0.32), ID taxed by
    shared head. But probe graded 1.00/0.64/0.42: transit carries, readout
    can't use it (or kill-shift). New bottleneck: query-conditioned readout.
  - FULL-SCALE GIST+QUERYHEAD h48/1200 (0.8 min): kill 0.445/0.475 (+0.10 over gist, +0.07 over choosy) — FIRST wall movement. Wall cracked (0.475 vs chance 0.25), not broken. ID 0.778 (gist-label tax persists).
  - WEB-SEARCH SKILL (user asked, 2026-11-08): agent had no search; Google
    fetch_url works (200, ~531KB) but brittle; DDG html endpoint verified
    better (~35KB, result__a/result__snippet parse cleanly). Built
    src/tools/websearch/SKILL.md (recipe) + search.js (execute_js runnable,
    uses tools.fetch_url + fs, returns top ~8 {title,url,snippet}).
    Verified live on fresh query "LoopFormer elastic depth recurrent
    transformer" -> 8 results, top arxiv 2602.11451 + ICLR page. Rule:
    1 search -> read primary source, cite URL, no spiralling.

  - PUSHED 2026-11-08 cdbd081 (parent 62cea09): 2e + queryhead + search skill, 15 files, fast-forward, commit verified via API.
  - EVO-READOUT gens 1-3 (1.6 min, h48 gistq base, pop8/sig0.02, readout genes): fitness 0.495->0.506->0.511->0.514, improved every gen (id flat 0.77, fam .30->.33, gap4 .56->.57, gap20 .31->.35). Held-out kill transfer: 0.445/0.475 -> 0.455/0.47 (~noise; fitness slices != eval seed — partial slice fit). Breeder mechanics WORK, transfer weak. Next: fair-distribution fitness (famFam held-out) or more gens.
  - EVO CAMPAIGN readout genes, h48 gistq (2026-11-08): chunk A (fitN150, pop6, gens1-3, sig0.02): fitness 0.475->0.488->flat; kill transfer 0.445/0.475 -> 0.43/0.45 (ANTI-transfer). Chunk B (multi-seed fam 300ex, sig0.015, gens4-6): fitness ->0.5003 then flat x2; kill -> 0.415/0.435 (worse again). STOPPED at gen 6: fitness up 2x, transfer down 2x = overfitting slices, not learning. Rounds are not the bottleneck; fitness design is. Next: fair-distribution fitness or architectural change, not more gens.
  - FAIR FITNESS v2 (2026-11-08, no-memorization design): evo fitness() now returns se (binomial, weighted RMS); evolve() gains resample (fresh slices/round, champ re-scored — nothing fixed to memorize) + margin/marginSe (gains below noise don't count). quickEvoTest extended: fair path smoke green (se 0.032, matches +-0.04 theory). Fixed const->let self-catch (page_refresh caught it). Rule ADDED to Conventions: PRE-STEP RESEARCH CHECK (ask what could save compute; 'nothing' valid but recorded; max ~2 searches, primary sources, verify vs code, cite).
  - FAIR EVO CAMPAIGN readout genes, h48 gistq (2026-11-08): chunk A (sig0.02, marginSe1, gens1-3): 0 accepted in 36 children (margin held). Chunk B (sig0.04, marginSe0.5, gens4-6): fitness 0.475->0.488->0.4987 on FRESH slices (real signal, not memorization), but held-out kill 0.445/0.475 -> 0.435/0.445 (ANTI-transfer again). STOPPED gen 6: breeder climbs a hill that is not the kill hill. Verdict: readout-gene selection signal exists but points off-exam; more rounds = faster wrong direction. Next: gate genes, or accept evo-readout negative and move to settle combo.
  - SETTLE COMBO full h48/1200 gistq+depthAux0.5 (0.3 min, 2026-11-08): loss 2.61->0.38, ID 0.755, hard r1/r4/r8/r16 = 0.447/0.483/0.49/0.493 (FIRST monotone depth curve on hard), kill 0.365/0.42 (BELOW gistq 0.445/0.475), gap20 0.345, gist probe 1.00/0.84/0.52 (best transit yet). Verdict: teachers fight — transit best-ever + real depth curve, but kill regressed (too many teachers, shared h48 capacity). Depth-grading teaches thinking (curve rises) but taxes the reader.
  - PUSHED 2026-11-08 cd45f35 (parent cdbd081, verified via API, 15 files): query-head readout, fair ES fitness + both campaigns, settle combo verdict, README scope/next-step cleanup + ELI5 combo line.
  - FLEET TEST (2026-11-08): 2 parallel scouts via one page_eval (Promise.all, sealed 100-word briefs) — both on-brief. Scout 1: PCGrad (project conflicting grads) for the teachers-fight problem — DIRECT lead for combo regression. Scout 2: associative recall capacity ~O(N) hidden size rule of thumb. Mechanism proven; synthesis is mine.
  - RABBITHOLE TOOLING SESSION (2026-11-08): user asked for rabbithole mode + fleet command + background-style research. No sub-agent tool exists — fleet = parallel stateless scouts via one page_eval. Rules set: rabbithole mode (<=3 hops, trail log, verdicts), cautious throttle (2 scouts/wave, <=100 words, 1-2 searches, pause+report non-blocking), throttled-stream no total budget (optional cap only gate), interruption audit (errors/decisions active; limits/compaction mitigated; disconnect risk-accepted), research-only scope, assistant final stakeholder for direction, sandbox scratch/sandbox/ with root access + no-new-roots, stop rules, search-error rule. Built src/tools/rabbithole/SKILL.md; fresh-eyes reviewed (5 points, gaps fixed). Definitions: pause/report non-blocking; checkpoint = internal pause, handoff only at stop reasons.
  - RABBITHOLE AGENDA + AUTONOMY (2026-11-08): top-5 agenda added to skill top (1 PCGrad most promising, 2 capacity math, 3 trained settling most exciting, 4 memory transport, 5 evo selection signal). User sidenote: researcher treats work as personal experience about how it learns — learning-to-learn data. Autonomy: hop freely, no rush, decide next steps without asking.
  - RABBITHOLE RESULTS (2026-11-08): #1 PCGrad ANSWERED — rule verified vs arxiv+repo, sandbox s01 prototype (trainPCGrad: per-component backward, project-then-average, single Adam step), full combo h48/1200 kill 0.365->0.445 with monotone kill-curve, ID 0.769. Port pending user. #2 capacity ANSWERED — fused h96 fits loss 0.105 yet kill 0.415 flat curve: structural not capacity. #3 settling wave2 NEGATIVE (ramp grading fails), v2 drift-penalty queued. #4 transport wave1 USEFUL (fast weights queued s03). #5 untouched. Self-catches: malformed JSON (validator), evals ride with training.
  - PCGRAD PORTED (2026-11-08): src/tinynn/pcgrad.js + trainPCGrad + lab "gradient surgery" checkbox + quickPcgradTest (green live). Reference implementation cross-checked (single optimizer step confirmed). Fused remains default; surgery opt-in. Two self-catches during port: own typo (failed edit correctly rejected), duplicated comment line (removed).

## 2026-11-08 — Wall reframe + rebaseline (rabbithole consolidation)
- PCGrad ROBUSTNESS: same-data retest seed18 kill 0.37 vs fused 0.365 (+0.005); seed8-data 0.385 vs fused 0.33 (+0.055). HONEST verdict: helps, never worse than fused, typical +0.03-0.05; +0.08 was the best draw. Fresh-eyes: accepted thin-seed caveat; REJECTED "fix optimization first" (loss 0.105 fit contradicts it).
- #5 EVO ROOT CAUSE (verified src/tinynn/evo.js makeSets): seed param VOIDED — fair campaign re-dealt IDENTICAL slices every round; selection memorized fixed examples. Sandbox s04 fix + two-slice holdout gate, smoke green. Full 6-gen holdout campaign: ZERO promotions, kill unchanged. Readout genes exhausted; prior climbs = memorization artifacts. PARKED (doubly confounded: void seed + short-gap training).
- #4 FAST WEIGHTS: v1 grad-exact (2 backward bugs caught), assocG h48 kill 0.375 desert band; v2 decay collapse 0.195 (decay erases credit path); v2a gate 0.325 (selection without erasure still loses). Mechanism: unnormalized matvec read = mush, no competitive normalization. Beta-init sweep open>closed (+0.02, noisy).
- REFRAME (highest-leverage finding): SAME attention, short-gap train => kill 0.365/gap20 0.295; WITH long-gap examples => kill 1.00/gap20 1.00. Desert was TRAIN/TEST MISMATCH (train 1-3 pairs via makeTrain, test 8-fill kill/20-gap), not capability. Every arch failed identically = all learned short-gap shortcuts.
- REVERIFY fresh-eyes (stateless, <=100w): YES — prior rankings measured ease-of-learning under mismatch, not capability. Minimal retests: long-gap lowest arch; confounds: pair memorization vs association, test leakage, tiny short-gap grads. Standing: grad-exactness + mechanism lessons hold; all short-gap kill quantities reinterpreted.
- REBASELINE E SERIES (protocol MIXED-8: 500x short seed7 + 500x long-8fill seed71, eval seeds 33/41/42 disjoint; killA/killH memorization-vs-rule gate): E1a ATTN-48 kill 1.00, gap20 1.00, killA 1.00, killH 1.00 (rule not memorization; loss 0.082, ID 0.903). E1b allowed-only train (diag never seen): kill 0.73, killA 0.95, killH 0.00 (systematic, not chance). E1b2 split (diag targets + ALLOWED distractors): killHd 0.355 — distractor novelty real, target novelty dominates; pair-specific circuits, NO abstract lookup. Novel-combo generalization = SECOND wall. E2 weakest arch geo/none (notebook alone, no attention) same pool: kill 0.88 rising 0.945 at r4, gap20 0.875 (was ~0.33). Wall was data for ALL arches. E3 combo (gistq+depthAux0.5) matched: fused kill 1.00 at ALL r + gap20 1.00 vs PCGrad 0.915 declining 0.855, gap20 0.86. Surgery is mismatch-regime-specific; default = matched data + fused, PCGrad stays opt-in.
- ODDITIES (non-blocking): gap1 < gap20 in BOTH archs (attn 0.855 vs 1.00; geo 0.815 vs 0.875) — matched training overweights long; E2 killHd 0.975 > killA 0.795; combo ID tax ~0.74/0.76.
- DECISIONS: baseline = MIXED-8 + fused (ATTN-48 recipe: h48/m96/d16, attnAux 1.0, batch16, 1200 steps, lr5e-3, seed7). Next target = novel-combo wall (honest evo re-entry: gate genes + matched training). s02-v2 drift penalty only if settling still wanted. gap1<gap20 probe queued. Evo stays parked.
- POINTERS: scratch/rabbithole/rebaseline-wall/ (state.json, log.md, BASELINE.md, e1a/e1b/e1b2/e2/e3.json); per-branch wave logs scratch/rabbithole/<slug>/{state.json,log.md}.
- TIE-BREAK FRESH-EYES (2026-11-08): reviewer says test OOD gaps, PICK ONE (meshing confounds), evolve gate-trigger logic, blind spot = notebook overwrite. My take: OOD gaps fair only as relative A-vs-B comparison; sharper = strip supervision + novel combos. Choose-first, evo breeds mesh later. Overwrite probe queued.
- POKÉMON VISION (user-set 2026-11-08): Phase 3 is NOT the next phase — it is the vision for the future: a Deep Blue for Pokémon (teambuilding = long-horizon composition, battles = hidden-info reasoning + mid-match adaptation). Phase 2 is rehearsal. Docs updated (README gameplan + §5 list); parked-list mentions removed.
- SPRING-CLEAN FRESH-EYES (user asked): reviewer agrees structure consistent (era-tags + README queue). Q2 flags tone risk: 1.00 "success" vs 0.00 unseen-pairs looks contradictory — resolved: carry wall (known pairs) vs generalization wall (novel pairs), docs pair them everywhere. Q3's grep test caught a REAL gap: docs promised "default = fair homework" but the lab UI still trained short-only (index.html built makeTrain(7)). FIXED: fair-homework select (default fair for assoc; falls back short for parity/modadd) + buildHomework pool (500 short seed7 + 500 long seed71) + report line; verified live (select defaults fair, pools 500+500, 12-step smoke finite, no errors).
- F-SERIES (overwrite probe → positional shortcut exposed → tie broken): F1 target-position eval (train pos0-fixed): attn pos0 1.00, pos2-8 ~0.25 chance; geo/none pos0 0.90, else ~0.28. No recency gradient — models learned "answer = first pair", not overwrite. ALL pos0 evals (E1a/E2/E3 kill 1.00s) measured the shortcut. F2 randomized-slot training: attn pos0-8 FLAT 0.775-0.835 (kill 0.80, ID 0.884) = REAL lookup; geo/none collapses (0.35-0.50, kill 0.425). F3 choosy+queryhead combo same pool: flat ~0.30-0.41, kill 0.40 — its 1.00 fully retracted. Scoreboard: attention ~0.80 sole winner. gap1<gap20 explained (two circuits keyed by length). E1b verdict stands (pair-specificity proven by differential, mechanism differs). Lab toggle hardened to random slots. Runs: scratch/rabbithole/rebaseline-wall/f1+f2+f3.json.
- CAMP RETEST (user asked; memory check: only prior runs were short-gap h48/1200 + guard — new ground): fair-slot campfire h48/1200: pos0-8 = 0.455/0.365/0.375/0.43/0.435 (flat, no lookup), kill 0.42, gap20 0.32, ID 0.722 (= old 0.73). Mush verdict STANDS — the running mean carries no addressable signal even with ideal training. Slight uniform lift over chance (~0.40 vs 0.25) is weak residue, not retrieval.
- ADDRESSING LESSON (user asked: is non-attention hopeless, or too small?): neither blanket verdict. Our non-attention DOES generalize where structure matches recurrence (2b parity len-20 100%, mod-add grokking) — procedures, not pointers. It fails only at content-addressed random access (F2/F3/camp flat ~chance). Failure looks qualitative (flat, no position trend) not capacity-like; h96-width evidence same direction. Lesson = mechanism-task fit: recurrence computes functions of the past, attention addresses it. Untested hybrid that could revive geometry: wedge/geometric keys + addressing read head (selection supervision on geometric features).
- GRASSMANN CHECK (user asked — re-read abstract 2026-11-08): no discrepancy. Paper claims Wikitext-2 within 10-15% of size-matched transformers + tiny SNLI edge (0.8538 vs 0.8511); tests NO retrieval task. Its mechanism is explicitly LOCAL (token pairs, multi-scale windows) — our F-series tests exactly what local propagation can't do (content-address an arbitrary slot 20 back). Our geo is a distant cousin (offsets {1,2} wedge), not their layer — no refutation either way. Synthesis: our bench is a microscope for their missing 10-15% (likely retrieval-heavy phenomena). Next: selection supervision on wedge features (can a query head point with geometric keys?).
- FIVE DOORS (Grassmann §8, read 2026-11-08) + HYBRID QUEUED (user-approved): 1. global/long-range invariants — TRIED (campfire = averaged-subspace form, ruled out for lookup). 2. richer Grassmann structures (k>2, smooth-trajectory regularizers) — UNTRIED, cheap, backlog. 3. HYBRIDS — QUEUED as wedge-keys + addressing-read: decides attentionless's fate. 4. interpretability — TRIED WEAK (geoInspect unreadable), needs instruments. 5. scaling/engineering — OUT OF SCOPE for bench CPU lab.
- SHINY VERDICT (user asked + fresh-eyes): attentionless-for-lookup unjustified after F2/F3 (flat chance; addressing necessary for this task) — but "waste" overstates it: attentionless owns procedural generalization (2b parity 100% at 3x) and the hybrid is a genuine open bet with a kill criterion. Fresh-eyes harsher: kill the pursuit, run hard-symmetry (transformed-key) retrieval as executioner, warns train-fit-0.105 + novel-0.00 = memorization mistaken for reasoning. RULING: hybrid gets ONE funded run with pre-registered kill bar; if it fails, attentionless leaves lookup, keeps procedural lane + vision-rehearsal.
- NOT PUSHED (no PAT this session): everything after 6b09dee (robustness, #5 root cause + campaign, FW builds + reframe, reverify, full rebaseline).
- HYBRID RUN (user: run hybrid, best chance, components then final with kill bar — DONE 2026-11-08, s05 sandbox): built wedge/geometric-keys + addressing head. Grad check FAILED first (0.47/0.79/0.24 vs stock exact) — root cause: backward banked dZ but dropped Wr's returned dx, severing Zy→S; fixed with inline flush (dZ[posT+1] provably final at own step), all 4 configs exact ~3e-10 after. Side finding: nn-diff "linear" bisect was VOID (forward-only change = built-in mismatch). Wave A h24/400 underpowered (all ~0.44 incl. attn — not a kill). Wave A2 h48/d16/1200 fair slots: attn 0.755/0.065, wedge-only 0.717/0.075 (geometry alone matches attention), +global 0.419 (mush — door #1 closed in this form), +global+off2 0.823/0.065 (BEST, beats attn). FINAL h64/m128/d32/2000: attn perfect 1.00; hybrid kill 1.00, meanPos 0.999, range 0.005 — BAR MET, hybrid SURVIVES. Honest: ceiling match at scale, differentiation at h48. Open: hybrid on novel-combo killH (second wall); global-poison vs global+off2-win mechanism; B1 ~4x faster train (timing anomaly, not a claim).
- PUSHED 846f596 (parent a7683be, verified via API, fast-forward, 3 files: index.html + F-series strip corrections, src/README.md, src/CHATLOG.md).
- HYBRID MECHANISM (user pulled forward — DONE 2026-11-08, s05 waveM): new config M4 (wedge+off2, NO global) PERFECT 1.00 everywhere at h48 (ID/kill/gap20/pos0-8, loss 0.002) — best hybrid yet, beats M3-full 0.823. Lesion matrix on saved models (zero Wk column-blocks at test time): M3 full=noG=0.823, noW=Sonly=0.819, noS=geoOnly=0.392; M4 all S-variants 1.00, geoOnly 0.369; M2 ALL lesions ~0.41 (even Sonly — global poisoned the S-keys too). Deployed addressing is S-based in every winner; geo paths are training scaffolding. Key-segment norms: M4 W-term 0.31 (ignored) vs M2 2.39; attention entropy M2 0.731 (flat) vs M3 0.055 vs M4 0.002 (razor). Mechanism hypothesis: global-mean injects identical signal into every key + uniform grads into every Zy (common-mode noise that derails key learning); off2 doubles the wedge scaffolding signal and overwhelms it. killH now goes with M4 (+A0 control); fairness matrix becomes A0/A1/M3/M4 ×3 seeds.
- NOT PUSHED: everything after 846f596 = src/README.md (mechanism) + src/CHATLOG.md (this entry). Needs PAT.
- C-SUITE (user: launch entire suite — DONE 2026-11-08, s05 waveC1/C2, h48/d16/1200 fair slots, A0/A1/M3/M4 × seeds 7/8/9): C1 hints-on seed-means — A0 0.553 (0.755/0.475/0.428), A1 0.766, M3 0.531, M4 0.799 (1.00/0.42/0.976). Bimodal ignite-or-not regime (failures = high loss, not wrong rule); seed 7 was lucky for everyone. M4 best seed-mean, passes non-inferiority. C2 hints-off: ALL fail 0.28-0.445 incl. attention — selection teaching is load-bearing for every arch at this scale; hybrid exonerated from the parasite charge (fails identically without hints, matches-or-better with them).
- WAVE K (second wall — CROSSED 2026-11-08, s05 waveK/K2, restricted allowed-only pool): M4 killHd 0.88/0.785, A0 0.785/0.71 (bar was 0.50; E1b-era 0.00/0.355). Mirror killDa (allowed target + diag distractors, validated construction) = 1.00/0.995/1.00/1.00 — novelty-pop confound dead, true lookup both directions. E1b's pair-specificity verdict was shortcut-regime-specific: fair-slot training teaches genuinely addressable lookup that composes to unseen pairs. Remnant gap novel<familiar (0.8 vs 1.0). Deterministic replicas confirmed throughout (M2/M3/M4 + all K numbers reproduced exactly).
- NOT PUSHED: everything after 846f596 = src/README.md (C-suite + K) + src/CHATLOG.md (this entry). Needs PAT.
- BENCH-NOT-TOY + NURSERY/LEARNER (user-set 2026-11-09): "toy" renamed "bench" everywhere living (bench-scale model, bench science; field = scaled tool). Historical run records + attributed reviewer quotes keep original wording. Ontology: nursery (exists — lab, protocol, verified claims; product = knowledge, which transfers though weights don't) vs learner (destination — self-tutoring entity with textbook + ancestors + time + eyes). Gameplan carries the line.
- WAVE H CHUNK 1 (answer-only × M4/A1/S/A0, seeds 11-18, allowed-pool): 0/32 ignited → FUTILITY STOP (pre-registered ≤2/32); seeds 19-30 not run. killA 0.15-0.43, mean Hd 0.478-0.529 (floor). FINDING: hints necessary for ignition at h48/1200, every arch — scaffolding claims scoped to hinted regime. BONUS: partial identity heuristic (high Hd + low killA) validates conjunctive bar; H-S flat chance ×8. PROXY VALIDATED: mild-vs-full Spearman 0.61 (bar 0.60). S-only arm built (nn.js + snippet, grad exact 1.1e-10).
- SELF-TUTORING PROGRAM (user-set goal): model gets textbook + ancestors + time + generic biases; ground-truth positions never. Order: H2 (answer-only ×3000 control) → entropy-sharpening aux → Wave D self-distillation (frozen hinted M4 tutors hint-free student, iterate) → auto-curriculum (competence-gated) → evo breeds bootstrappers (fitness = hint-free ignition). H2 + D spec'd, awaiting go.
- VERIFICATION CORRECTIONS (measured 2026-11-08, supersede mechanism entry above): Hd/Da prose glosses were swapped (scripts rule: killHd = DIAG target + ALLOWED distractors; killDa = ALLOWED target + DIAG distractors) — novel TARGETS hard (0.7-0.88), alien DISTRACTORS harmless (1.00); E1b's 0.00 was all target-side. "W-term 0.31 shrunk" did NOT reproduce (measured M4 wedge 1.513 vs init-E 1.594; S grew 1.6-1.8x) — "test-time unused" stands, "shrunk" retracted. "Global noise + uniform grads" retracted → NULL proof (noG ≡ full everywhere + M2/M3 global weights identical to 1.2e-9 across divergent runs; shared key component cancels in softmax → zero grads). M2-vs-A1 init-confounded (keyDim shifts rng stream); clean causal pairs = off2 (M4>A1, M3>M2).
## 2026-11-09 — Gameplan v5 + H2 + Wave D (gameplan execution begins)
- v4 archived verbatim (src/GAMEPLAN_ARCHIVE.md); v5 rebuilt from shared understanding (destination: nursery picks books, emergent dialect, nursery-level graduation, memorize-vs-derive labels, match-or-close + 5.7 star, consult-never-blocks, no-human-reviewer, moral-code-not-a-goal). 14 research-critique rounds filed (R1-R14: sieve/snap, peer verification, drift gates, diploma probes, ZK transfer, causal bar, half-life) + consolidation/red-team/diploma-exam/steelman. Drift battery 10x original-vs-latest: 5 real drifts adjudicated (grok-hunt tiers, 3 diploma probes, rival-error battery + mimicry void, causal DiD bar, provisional half-life); doctrines intact. Snapshot rule adopted (scratch/gameplan-snapshots/).
- Doctrines filed in README: hints-as-exhaust (nursery generates own hints structurally from construction intermediates; checker-first co-evolution on frontier) + self-defined/world-verified success. Conclusion battery 10x: C1 HOLD (same arch+data ignites hinted: M4 1.00, attn ~0.80 — residual is the signal), C2 SPLIT (exhaust holds, portability downgraded to hypothesis), C3 HOLD as design requirement.
- H2 (Phase 0, scratch/h2/): answer-only x3000, fair slots TRAIN-10/UNSEEN-2, M4/A1/S/A0 x seeds 31-38 = 0/32 IGNITED (bars killA>=0.60 && Hd>=0.55; seed-means killA 0.33-0.37, Hd 0.41-0.47). S-only NaN-collapsed 8/8 (constant-predictor signature). Identity heuristic replicated 5x + 1 mirror (A0-s35 0.62/0.06). killHu means 0.20-0.25. Proxy Spearman 0.527 < 0.60 bar (demoted, was 0.61 at 1.2k). TIER2 to 10k: A0-s35 loss->0.000, killA 0.64, Hd 0.02 = MEMORIZE; M4-s34 killA 0.46->0.285, Hd 0.21->0.565 = heuristic-lock. VERDICT: TEACHING problem, no escalation.
- Wave D: tutor gate FAILED on H2 pool (hinted M4: killA 1.00 but Hd 0.05-0.425; bind labels worse 0.185-0.245) = hinted ignition is pool-fragile (12-combo coverage needed; 10-combo memorizes). Tutor repointed to K-M4-s7 (allowed-12, verified loading: 1.00/0.88/1.00Hu). D1 cold distillation 0/9 fidelity (killA ~0.3, heuristic regime) + extend 0/2 = PHOTOCOPY verdict for cold copying. D2-FADE (attnAux 100->50->0%): s32 held at 50% (1.00/0.92/1.00) then COLLAPSED at severance (0.225/0.44/0.045); s33 HELD (1.00/0.565/1.00, ID 0.90) = first hint-free ignition via transmission. VERDICT: transmission possible but fragile (1/2). Next: fade ignition-rate over 8 seeds + stability-gated hardening, then G1->G2.
- Wave D-RATE (fade x8 virgin seeds 41-48, scratch/h2/waveDrate.js): 5/8 IGNITED at severance (s41 1.00/0.71, s44 1.00/0.985, s45 1.00/0.87, s46 1.00/0.74, s47 1.00/0.66). Failures in 3 modes: s42 full collapse (0.30/0.38), s43 memorize-lean (0.95/0.185), s48 killA-collapse (0.245/0.62). Combined D-fade 6/10. VERDICT: transmission majority but fragile.
- Wave D-SLOW (fade 100->75->50->25->0% over 5k on s42/s43/s48 + control s41, scratch/h2/waveDslow.js): s48 RESCUED (1.00/1.00/1.00); s42 collapse merely delayed one stage; s43 WORSE under slow (collapse at 50%); control s41 HOLDS (1.00/0.56/1.00). VERDICT 1/3 rescues, 0 harm: schedule is A lever, not THE lever. G1->G2 stays on fast fade; needs G1 retrain+save (waves save evals only).
- PUSHED ddda2f2 (doctrines). This entry + README doctrines push on user PAT.
- SKILLS DOCS (user asked, 2026-11-09): fresh-eyes → src/tools/fresh-eyes/SKILL.md (statelessness principle, 9 formats, premise-artifact hygiene from the two stale-premise incidents, verbatim prompts, adjudication ownership, armed-vs-unarmed evidence from 14 armed rounds, stop rule from R11/R14, self-call lesson); memory system → src/tools/memory/SKILL.md (4 layers, snapshot/newest-wins/checkpoint/append-only rules, reconcile procedure, has-it-helped verdict YES with 5 receipts + 4 costs); index + skill definition + steal guide → src/tools/README.md. Not yet pushed (needs PAT).
- FRESH-EYES UPDATE (user: spell out research-skill granting): new "Equipping reviewers" section (how to grant: paste recipe + name the 1-2 search allowance + require cited primaries + verify-against-artifact; measured unarmed-vs-armed differences; armed-round rules); deduped old bullets. Not yet pushed.
- SKILL DEPENDENCIES (user: add): Dependencies section in all four SKILL.md files (memory: none/foundational; websearch: none/standalone; fresh-eyes: memory logging + websearch armed-only; rabbithole: websearch + memory required, fresh-eyes optional) + Needs column in src/tools/README.md index + steal-memory-first note. Not yet pushed.
- PAPER DRAFT v0.1 (user asked, 2026-11-09): index.html is now a research-paper draft first, lab second. New: title/abstract/draft-banner/secondary-directive comment; §§1-8 (intro, related work with Huginn + Grassmann equations + direct quotes, method, results tables, discussion, missteps, TBDs, G1->G2 pre-reg) + References; old §§1-7 retitled Appendix A-G, all ids/scripts intact. Sources read from arxiv html (papers in scratch/paper-*.html, extracts in scratch/*-extract.txt + g-body.txt). Verified live (16 sections, orbit, ELI5 x9, parity6/600 clean, snapshot good). Known stale: Appendix E/G roadmap pointers. Not yet pushed.
- RENAMED (user: descriptive, no flair): program = Teaching Small Models to Learn (URL perchance.org/teaching-small-models-to-learn, rename confirmed via editor notice); paper = Teaching Addressable Lookup to Small Recurrent Networks by Staged Hint Fading (h1 + meta line). Filed in main.pjs ($meta title/description/tags, title list, header comment) + README gameplan header. Not yet pushed.
- FULL-ARC SCOPE (user: paper must eventually cover the whole nursery): abstract now declares the endpoint (§8: nursery that creates full models; past G1→G2 is roadmap with bars, not results); §1 claim map points to §8; §8 expanded to 8.1 G1→G2 (pre-reg kept) + 8.2 harvest + 8.3 staircase + 8.4 breeding + 8.5 nursery finale with graduation bars, all TBD. Verified live (16 sections, §8 = 6 paras). Not yet pushed.
- PORTED (user: port to github.com/2012dzli/Maieutics): previous private remote; seed via contents API (empty repos reject git blobs) then full port: 23/23 files. Root README retitled + provenance line.
- COMPARE (user: old vs new — does everything line up?): recursive-tree diff previous tip vs port tip: same 23 paths, 0 missing/extra, 17 SHAs identical, 6 differ = all known unpushed work (paper +25KB, CHATLOG, readmes, main.pjs -4, memory-SKILL Dependencies +206, pure addition). VERDICT: faithful.
- DELETED (user: delete the old repo): previous private repo removed via API (204; follow-up GET 404s). Guard: re-verified public tree intact (23/23) before deleting. Old commit history now lives only in these notes + the port commit message.
- TOKENS DEAD 2026-11-09 (user: verify neither PAT works): GET /user with both PATs → 401
  Bad credentials on both. User already rotated/revoked. No valid tokens remain in play;
  future pushes need a fresh PAT.
- SCRUBBED (user: remaking repo, distancing): all private-remote identifiers + old display/code names removed workspace-wide (namespace now window.TeachingLab); verified live (refresh clean, ask→"Paris"). Zero grep hits remain.
- PUSHED (user: push remade Maieutics with fresh PAT): repo was empty (no main); seed via contents API then full tree, 23/23 verified, commit a77e796. Scrubbed tree live in public.
- PUSHED (user: push the skill addition): fast-forward a77e796 → 3ea52af (SKILL.md iteration
  section + CHATLOG), 23/23 verified.
- PAPER BATTERY R1 (user: does index.html pass as a real paper?): 10/10 PASS, armed with
  live-fetched ICLR format + NeurIPS checklist. Adopted: error bars/CIs, compute disclosure,
  ref completion, numbered equations, metric defs, public-repo + ethics TBDs. Rejected:
  "missing abstract" ×5 = MY artifact bug (extraction dropped the bare-<p> abstract; verdicts
  stand). Full record: scratch/fresh-eyes-paper-v01-10x-results.md. Not yet patched/pushed.
- PAPER LOOP ×10 (user: iterate ≥10 times, no check-ins): R1–R11 batteries ×10 reviewers (110 verdicts:
  105 PASS, 5 FAIL — all FAILs penalized TBDs against instructions). 10 patches v0.2–v0.11 + v0.12
  micro-patch (futility rule). Diminishing returns absolute by R9. Per-round records in
  scratch/fresh-eyes-paper-v*.md. Standing rejects: citation-mix (both correct), LaTeX centering
  (HTML medium), TBD penalties vs contract, arXiv-only venues, draft chrome.
- PUSH BLOCKED 2026-11-09: paper v0.12 push failed (PAT rotated, 401). Needs fresh PAT.

- PUSHED 2026-11-09 (user: push with fresh PAT): fast-forward 3ea52af → daabe92, 23/23 files via git-blobs API (paper v0.12 + dictionary groundwork msg). Verified via API update-ref 200.
- GENIUS CHECK 2026-11-09 (user: genius.com/Radiohead-creep-annotations as dictionary model?): fetched page (557KB) + /api/referents/1405330. Model = lyric <a class=ReferentFragment Highlight> clickable spans (data-id) → side-panel annotation (1-3 paras simple-English, not ELI5). Verdict: YES, fits paper dictionary — terms clickable, popup simple-English + optional ELI5 toggle. Next: dictionary step.

- DICT SHELL 2026-11-09 (user: Genius-clickable sentences/paragraphs/terms, WIRED 5-levels → agreed Professional/Simple/ELI5): §1 wired with 7 entries (d-testtime 2-lvl, d-latent 3, d-addressable 3, d-killset 1, d-ignite 1, d-thesis 3, d-fade 3). Fixed side panel (bottom sheet mobile), Simple-default, Esc/outside-close. Verified live: 7 links, thesis 3 tabs default Simple, ignite 1 tab, close OK. Dict lives inline in index.html (split to src/ at format time).

- DICT FIX 2026-11-09 (user: tab click closed panel): cause = tab onclick re-rendered tabs (detaching clicked button) before document outside-close check, so panel saw an outside click. Fix = stopPropagation in tab handler. Verified live: Simple→ELI5→Professional all keep panel open.

- DICT §3.1 LINKS 2026-11-09 (user: all §3.1 terms must link to their definition + carry simple/ELI5): sec31 anchor added; Terms() line now wraps ignite/killset/coldcopy/fade (fade/ignite/killset appear in-prose + in Terms line = 10 links); new d-coldcopy entry (3 lvl); jump button in panel (close→scroll→flash) for d-ignite/d-killset/d-fade/d-coldcopy. Bug: smooth scrollIntoView never completes in preview iframe; switched to auto (verified: fade jump lands §3.1 in view + flash). Tab-close fix from prior entry holds.

- DICT FULL-PAPER 2026-11-09 (user: thesis is whole paper not one part — confirmed; unify highlight; full-paper coverage): 28 entries / 39 links, zero orphans, §§1-8 all covered (10/4/6/5/4/2/2/6). New: d-huginn/d-verbalcot/d-grassmann/d-pathindep (§2), d-saddr/d-fairhw+d-coldcopy (§3, +sec33 anchor), d-wall/d-failures/d-rescue (§4, incl. table cells), d-mechanism/d-scope (§5, d-thesis/d-failures reused), d-posshortcut/d-nullproof (§6), d-bimodal/d-g1g2 (§7), d-harvest/d-staircase/d-breeding/d-nursery (§8, d-g1g2 reused). Highlight unified single blue (term class kept for semantics). Levels per-entry 1-3 as content decides (acknowledged, already supported). Bugs: (1) comma eaten by entries insert → syntax error, fixed; (2) src/inference.js overwrote window.TeachingLab namespace wiping dict on load → changed to Object.assign merge (backend seam verified intact). Panel screenshot verified.

- INTRO REFRAME 2026-11-09 (user: intro should view whole project, portions get own intros): §1 now opens with program-wide paragraph (nursery endpoint, this paper = first step to clear its bars, §8 pointer; reuses d-nursery link) ahead of unchanged test-time/narrower-question paragraphs — all numbers/tags/links byte-identical. §2 gained a portion opener (2.1–2.5 map); §§3/4/6/7/8 already open with framing lines, §5 is single-paragraph verdict. Verified live: §1 4 paras/11 links, anchors + thesis intact.

- CLAIM MAP PROMOTE 2026-11-09 (user: why small text?): was hidden-note author aside (13px gray); promoted to normal-size reader guide "How the rest is organized" (+§5 verdict line). Verified 16px = body.

- INTRO VS GAMEPLAN 3+3 (user: do fresh eyes return the same thing?): 6/6 on-brief, 6/6 MATCH=yes. Intro readers: program=nursery, paper=first step. Plan readers: program=nursery, role=roadmap. Decisive quotes = new P0 scope sentences. No drift, no patch. Results: scratch/fresh-eyes-intro-vs-gameplan-3x3-results.md.

- PUSH PREP 2026-11-09 (user: push with fresh PAT): bundling dict full-paper (28 entries/39 links §§1-8), intro reframe (program P0 + §2 opener + claim-map promote), inference.js namespace merge fix, intro-vs-gameplan 3+3 cross-check (6/6 MATCH).

- PUSHED 2026-11-09 (user: push with PAT): fast-forward 5476a3c → e9b83c6, 23/23 files via git-blobs API (dict full-paper + intro reframe + inference merge + 3+3 cross-check). Verified via update-ref 200.

- LIVING DOC 2026-11-09 (user: draft must say it updates after steps so it never falls behind): draft banner gains fixed update order (§4 → §6 → §7 → dictionary); new d-livingdoc entry (2 lvl, defaults Simple). Verified live: 29 entries, banner link opens correct tabs.

- PUSH PREP 2026-11-09 (user: push with PAT): living-document banner + d-livingdoc entry.

- PUSHED 2026-11-09 (user: push with PAT): fast-forward f141c39 → b4df7d1, 23/23 files (living-document banner + d-livingdoc). Verified via update-ref 200.

## 2026-11-09 — G series: teaching compounds (T0→G1→G2→G3)
- Goal (user: run entire G series solo): chain tutor→student generations via fast fade until teaching compounds or rots (§8.1). Harness = src/tinynn/gseries.js (pool/exam builders allowed-12 fair, exact Float64 save/load, soft-CE distillation, staged fade w/ Adam+rng carry, evalSuite, ignites(), FAST_FADE + HINTED presets, async cacheTutor). src/tinynn/train.js gained exports (makeModel, attnSupervision). D-wave scripts lived only in scratch/ and were wiped at compaction — rebuilt from surviving src/ (no replication possible).
- TRAINER FIX: hints-only smoke (no hard/soft) learns PURE echo-the-key (killA 0.00/Hd 0.995/Hu 1.00) — converse of D1 null, control. Fixed trainer (hardW option, single backward). trainFaded-HINTED replicates trainModel recipe except rng stream (keep-draws shift order): s7 Hd 0.60 vs trainModel 0.185 — bistable under data order, same init. Determinism verified (s7 exact repeat).
- CACHE BUG: tutorCache stored LOGITS but trainer used them as PROBS (pt.set) → negative loss, garbage stage-1. Fixed via in-place softmaxInto. T0 retrain is deterministic (s8 verified 2x) so refresh-wipe is recoverable: retrain → verify → recache in one job. Also: cacheTutor needs async yields (froze page).
- T0 SEARCH: attn+bind+attnAux(1.0), fair pool, 1200 steps: s8 (1.00/0.675/1.00/0.62/1.00) ignites but weaker than lost K-M4 (1.00/0.88/1.00Hu) — documented limitation. Rejects (all fail §3.4 gate): geo-choosy-qhead-gist (0.38/0.00), geo-full-bind (0.315/0.355), attn-bind-only (0.435/0.20); seeds 7/8/9/10 → Hd 0.60/0.675/0.495/0.19 (2/4 ignite).
- G1 (T0 tutors seeds 201-208): severance Hd 0.92/0.995/1.00/0.89/0.905/0.95/0.64/1.00 = 8/8 (CI 0.68-1.00). Shapes seen+healed: stage-1 wobble (s204), memorize-lean (s206), slow climb (s207). No collapses. Blobs: scratch/gseries/g1.json + g1-s201..208 (8).
- G2 (tutor = perfect G1-s208; seeds 301-308): 0.97/0.48✗/0.765/1.00/0.745/0.64/0.495✗/0.99 = 6/8 (CI 0.41-0.93). New shapes: flat stall (s302 0.42/0.455/0.48, s307 0.48/0.495/0.495 — flat under bar all stages, severance no help); collapse-and-recover (s306: 1.00 → 0.335 at 50% → 0.64 at severance). Mean Hd 0.761 vs G1 0.913; best still perfect.
- G3 (tutor = perfect G2-s304, rebuilt deterministically + re-verified; seeds 401-408): 0.535✗/0.95/1.00/0.95/0.68/0.97/1.00/0.795 = 7/8 (CI 0.53-0.98). s402 exam-base slip (first stage-3 read on G2 base 0.945, re-read on correct 7000+402 base 0.95; corrected read counts, logged in g3.json).
- VERDICT: COMPOUNDS. 21/24 overall (CI 0.69-0.96); rates 8/8→6/8→7/8 stable, no downward trend; best perfect every gen; students often match/exceed tutors. Stopped at G3 (question answered). New hinge: past-G3 rates, other scales/arches.
- MEMORY FIX (user: D scripts lost — did memory fail?): yes, partial — numbers survived, method didn't. Skill assumed linked code paths were durable; scratch isn't. Added promote-or-recipe rule + durable-paths qualifier to memory SKILL.md. gseries.js already compliant (src/, tracked).
- PAPER (living-doc order §4→§6→§7→dict): §8.1 rewritten as ran-2026-11-09 (all numbers + T0 limitation + MEASURED); §8 intro "§8.1 has run, §8.2–§8.5 stay TBD"; abstract +chaining sentence +G3-roadmap sentence; §7 Generations item MEASURED (anchor had dict-link button — first edit missed, retried exact); d-g1g2 rewritten (title G1→G2→G3, 3 lvl).
- FRESH-EYES (premise check vs g1/g2/g3.json): all §8.1 numbers byte-match records; CIs recomputed OK (8/8 0.676→0.68; 6/8 0.409-0.930; 7/8 0.526-0.979; 21/24 0.690-0.957). Two patches: "routinely exceed tutors" OVERSTATED (s207 0.64 < T0 0.675; G2/G3 tutors already perfect) → "often match or exceed (7 of 8 G1 beat T0's 0.675...)" in §8.1 + d-g1g2. Record fix: g1.json had duplicate s207 block (9 entries, summary said 8) → deduped programmatically (8 students, 8 ignited). Verified live clean + renders.
- UNPUSHED: index.html (paper), src/tinynn/gseries.js (NEW — next push is 24 files), src/tinynn/train.js, src/CHATLOG.md, scratch/CURRENT_TASK.md (notebook only). Needs fresh user PAT.
