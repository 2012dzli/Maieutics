# Teaching Small Models to Learn

Program: can small nets be taught genuine rule-learning? Paper draft v0.1 in `index.html`:
*Teaching Addressable Lookup to Small Recurrent Networks by Staged Hint Fading*.
Ported from a previous private repo (deleted; work log preserved in `src/CHATLOG.md`).

Long-term project: build our own AI inspired by Geiping et al. **arXiv:2502.05171**
(Huginn 0125) — recurrent-depth latent reasoning ("thinking without tokens").

Start here: `src/CHATLOG.md` (session log — decisions + measurements, newest last).

## What the paper did (Sec 3–7)
- Architecture triplet `(prelude, core, coda)`: `e = P(x)`, loop `s(i) = R(e, s(i-1))` from random `s(0)`, decode `p = C(s(r))`. Input `e` re-injected every step via concat adapter.
- Stable at scale via sandwich RMSNorm, RoPE base 50000, gated SiLU MLP, truncated backprop, random `r` per forward pass, standard LM loss (no CoT data).
- Test-time: unroll further than training. 3.5B / 800B tokens → up to ~50B-equivalent on reasoning. Math/reasoning gains a lot, facts flatline.
- Sec 7: latent trajectories orbit on numerical problems, settle fast on easy facts.
- Links: paper https://arxiv.org/abs/2502.05171, model https://huggingface.co/tomg-group-umd/huginn-0125, code https://github.com/seal-rg/recurrent-pretraining. Baselines: CoT https://arxiv.org/abs/2201.11903, s1 https://arxiv.org/abs/2501.19393.

## This generator (Phase 1 — done)
- `main.pjs`: title + `generateText` import + demo questions.
- `index.html`: 6-section lab —
  1. architecture explainer with depth slider,
  2. true-vs-emulation cost table,
  3. canvas orbit visualizer (fake 2D `R` dynamics, no LLM),
  4. live depth test with TWO backends (online Perchance LLM / offline local solver),
  5. papers + Phase 2 plan,
  6. offline / cluster / EKS runbook.
- Backends behind one seam: `window.TeachingLab.ask()` in `src/inference.js`;
  offline solver in `src/offline-solver.js` (demo subset only, honest about scope).
- Offline rule: only `index.html` + `src/*.js` ship. `main.pjs`/`imports/` ignored.
  `Dockerfile` (nginx static) + `k8s/deployment.yaml` + `src/DEPLOY.md` included.
- Key honesty rule kept: emulation costs K× tokens; true Huginn costs K× FLOPs / 1× tokens.

## Phase 2 (built — learning to learn, CPU-only, dependency-free)
`src/tinynn/`: `nn.js` (hand-rolled recurrent-depth MLP + manual BPTT + Adam,
grad-checked to 1e-9), `tasks.js` (parity, mod-add task families), `train.js`
(supervised training, test-time depth curves, few-shot adaptation).
- mod-add: train 2+3-term mod 7 → 100% in-dist; 4-term hard set shows the
  paper's shape (r=4 beats r=1, e.g. 59% vs 47%; r=16 collapses — stability
  cliff, reported honestly in the UI).
- parity: train len 3–6 → ~97% in-dist; len-10 generalization fails (concat
  padding is OOD by construction — documented in the UI as a negative result).
- meta: adapt to 4-term mod 7 — prior 86% vs from-scratch 19% in 60 steps.
- `window.TinyNN.quickSelfTest()` guards the pipeline (learning + depth effect).

## Phase 2b (built — running-state core + process supervision)
Answers "why can't we chunk longer strings?": the pooled net learned one
glance, not a procedure. `SeqModel` reuses one gated cell over POSITIONS (fresh
input each step) then DEPTH (sequence summary re-injected, paper-style); a gate
lets the state carry a bit. Per-step running-parity labels (process supervision
— the CoT analogue: outcome-only supervision memorizes, step supervision teaches
the rule) hold every position to the running answer.
- parity, train len ≤6: 100% in-dist, 100% len-10 at every depth, 100% len-20
  (3x train max) — generalization by construction, ~46s on CPU.
- UI verdict logic separates "solved at r=1, depth unneeded" (parity-R) from
  the mod-add depth curve — both reported honestly.
- adapt to len-7: zero-shot 100%, holds 100% vs scratch 57% — full transfer.
Gating + dense-label gradients grad-checked exact (1e-9).
Next: 2c attention core; Phase 3 Pokémon (type-chart + battle-reasoning tasks
on the same loop).
