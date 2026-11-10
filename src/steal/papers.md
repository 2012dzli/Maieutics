# Track C — paper rabbithole

Standing question: everything about teaching small models to learn — direct,
tangential, and different methods toward the same goal. Shotgun per the
rabbithole skill (nearly nothing is scope creep; default wave = one direct +
one tangential). Status per paper: FOUND → READ (notes below) → USED
(cited/ported into paper or lab) / SKIPPED (one-line why).

## Subpoints (in order)
- [ ] C1. Direct, survey first: "Looped Language Models: A Survey and
  Meta-Analysis of Recurrent-Depth ..." (preprints 202610.1404) — maps the
  space our paper sits in; read before the rest so the rest has a frame.
- [ ] C2. Direct, closest work: "Latent Chain-of-Thought? Decoding the
  Depth-Recurrent Transformer" (arxiv 2507.02199, Huginn internals on
  arithmetic) + "Loop, Think, & Generalize" (arxiv 2604.07822, small-scale
  looped studies with clean attribution — mirrors our bench method). Then the
  secondary guides (Locsic, aiwiki, Aha-Looped-Transformer, yjkim-stat blog).
- [ ] C3. Tangential with teeth: "Model Collapse as Cultural Evolution" (arxiv
  2605.23054) + code (github.com/bettyguo/iterated-collapse) + Ren et al. 2024
  (LLM self-evolution = Bayesian iterated learning). The tension to resolve: the
  theory predicts what should decay across self-trained generations — we saw
  NO decay through G5. Build the CONFLICT TABLE (added after critique C3,
  hardened R3): collapse-predicted decay vs G5-observed stability, column by
  column, PREDICTION FIRST ("theory predicts P-entropy rise; we observe O") —
  the resolution (winner-promotion? bottleneck?) is a primary contribution
  either way. The table measures DRIFT, not just accuracy (red-team C5: G5
  stability is accuracy-stability; collapse theory predicts distributional/
  semantic drift — R3 names the set: embedding distance + token-diversity TTR
  + entropy + held-out probe PATH-diversity (R4: accuracy can hold while
  reasoning paths collapse — probe the paths, not just the answers);
  describe-everything tables are vanity). Write the answer
  into the paper (§2/§7), whichever way it falls.
- [ ] C4. The old 2.5 method list, item by item, verdicts provisional until
  read: SDFT, curriculum-extraction distillation, SGSD + skill/mistake banks,
  emergent communication + reviews, cultural-evolution degeneration warnings +
  recursive bootstrapping, AlphaZero/MuZero self-play, OPD, teach-themselves
  (teacher proposes problems, paid by student gain), THINK-OR-REMEMBER +
  memorize-vs-derive split. Each: what it is, what to steal (code/theory/step
  recipe for D/curriculum/evo), or SKIPPED-why.
- [ ] C5. Bar: every paper ends USED, USED-CONFLICT, or SKIPPED (added after
  critique C3 — a precursor could downgrade invention to implementation).
  CONFLICT triggers an immediate Related-Works patch the same wave, never
  batched to v0.14. Every USED line carries a novelty delta in fixed form
  (refinement R3): "They [A] under [constraints]; we [B] under [constraints];
  claim [Y] holds/falls; goal impact: none/pivot; so-what: changes [named bench
  decision / nothing — R4: functionally irrelevant deltas are SKIPPED with
  teeth]" — a pivot triggers a gameplan snapshot + entry, never silent drift.
  CONFLICT verdicts also file one EXPERIMENTAL follow-up (R4: prose patches
  don't settle novelty — a run/comparison does). CONFLICT deltas get one
  fresh-eyes check each (refinement R3: confirmation bias is the failure mode);
  plain USED spot-checked per round. SYNTHESIS (R4): each round asks what the
  SKIPPED have in common — tag every SKIP (wrong-scale / redundant-method /
  no-code / no-fit — refinement R5) and let 3-of-a-kind trigger an Anti-Pattern
  note in the paper (why the common road was not taken). Surprising BENCH
  results from tracks A/B also file here as C3-style entries (R5: observations
  get theorized, not shrugged at). No unread pile.

## Shelf (FOUND, in priority order)
1. Looped-LM survey (preprints 202610.1404)
2. Latent-CoT decoding (2507.02199)
3. Loop, Think, & Generalize (2604.07822)
4. Model Collapse as Cultural Evolution (2605.23054) + iterated-collapse repo + Ren et al. 2024
5. Old-2.5 list (C4)

## Round 1 (2026-11-10): 2 searches, 16 results. Next: C1+C3 (fetch survey + collapse paper).
