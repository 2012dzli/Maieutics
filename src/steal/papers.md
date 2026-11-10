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
  NO decay through G5. Is winner-promotion the reason? Is our bottleneck the
  reason? Write the answer into the paper (§2/§7), whichever way it falls.
- [ ] C4. The old 2.5 method list, item by item, verdicts provisional until
  read: SDFT, curriculum-extraction distillation, SGSD + skill/mistake banks,
  emergent communication + reviews, cultural-evolution degeneration warnings +
  recursive bootstrapping, AlphaZero/MuZero self-play, OPD, teach-themselves
  (teacher proposes problems, paid by student gain), THINK-OR-REMEMBER +
  memorize-vs-derive split. Each: what it is, what to steal (code/theory/step
  recipe for D/curriculum/evo), or SKIPPED-why.
- [ ] C5. Bar: every paper ends USED or SKIPPED — no unread pile. Anything that
  renames our novelty claims goes into the paper the same wave.

## Shelf (FOUND, in priority order)
1. Looped-LM survey (preprints 202610.1404)
2. Latent-CoT decoding (2507.02199)
3. Loop, Think, & Generalize (2604.07822)
4. Model Collapse as Cultural Evolution (2605.23054) + iterated-collapse repo + Ren et al. 2024
5. Old-2.5 list (C4)

## Round 1 (2026-11-10): 2 searches, 16 results. Next: C1+C3 (fetch survey + collapse paper).
