<!-- ORIGIN: built in-repo (Teaching Small Models lab, 2026-11-08/09). Not stolen. License: repo-internal. -->

---
name: fresh-eyes
description: Stateless AI reviewers on demand. This skill should be used when a second opinion is needed on plans, premises, lab reports, or skill docs — via single checks, sealed answers, barrages, blind tests, armed rounds, red-teams, steelman, tie-breaks, or tooling self-reviews.
---

# Fresh-eyes skill — stateless reviewers on demand

Purpose: get a second opinion from an AI that has never seen your project.
One `generateText` call carries zero conversation memory, so one call handed
ONLY an artifact is a brand-new contextless reviewer. Cheap, blunt, and
surprisingly good at catching what you can't see anymore.

## Principle

- Fresh eyes = statelessness, not intelligence. The reviewer is no smarter
  than you; it just hasn't read your 200 lines of context. That alone is
  worth real money: it reads what you WROTE, not what you MEANT.
- Proven in this lab across 30+ reviews (2026-11-08/09): single checks,
  10-reviewer barrages, blind tests, research-armed critics (14 rounds),
  red-teams, steelman defenses, and tooling self-reviews. Real catches
  include: a missing UI default the docs promised, a mislabeled metric the
  whole scoreboard inherited, an impossible suggestion that exposed a wrong
  mental model, and a blind spot (notebook overwrite) nobody had listed.

## When to use

- Before a next-experiment claim (standing checklist: 1. check the log for
  already-run, 2. run fresh-eyes, 3. one search for prior art).
- On any plan, premise, gameplan rewrite, or critique round.
- When you feel certain. Certainty is the trigger, not doubt.
- NOT for: numeric benchmarks (deterministic tests already do that job),
  game content, or anything needing conversation context.

## Formats, cheapest first

1. **Single check** (1 call). Hand the current report + task label to a
   stateless reviewer with a ruthless prompt (see patterns). The lab's §7
   "fresh-eyes check" button does exactly this live.
2. **Sealed answer.** Give YOUR verdict first, sealed; reviewer judges
   independently; compare. Used for the resources question (steps/h/size/
   seeds/hyperparams) — reviewer agreed on all four, and its two errors
   were caught against the code.
3. **Barrage** (N parallel, same premise). N reviewers, one shared premise
   artifact, each capped at ~100-150 words with an enforced return shape
   (verdict + single hardest test/falsifier, numbered). Run via the fleet
   pattern: N concurrent `generateText` calls in one `Promise.all`, sealed
   briefs, scouts never see each other, you synthesize after. Verify each
   reply is on-brief before merging.
4. **Blind test.** Give NO argument, just the artifact; see which objections
   emerge spontaneously. Our triple-blind on the memorization complaint:
   0/3 raised it — evidence the complaint is imported, not obvious.
5. **Armed reviewers.** Reviewers get their own search and must cite their
   own primary sources (papers/repos/docs, not blogs). 14 critique rounds
   × 10 agents each on the gameplan. Armed reviewers find nearest prior
   art and concrete falsifiers (SDFT, curriculum-extraction, SGSD
   skill-bank, MuZero, cultural-evolution warnings); unarmed reviewers
   produce generic mainstream complaints (three independent "stochastic
   parrots" verdicts — correctable, but shallow).
6. **Red-team.** Attack the whole plan by discipline (one kill-shot each).
   Adopted 9 findings (synthesis + symmetry + zero-knowledge probes as
   graduation gates, cross-teacher validation, trace portability checks).
7. **Steelman.** Defenders argue every load-bearing claim holds; each
   verdict must name the priced residual. 10/10 HOLDS → declare
   satisfaction and STOP the loop.
8. **Tie-break.** Ask the reviewer to design the hardest test between two
   options, then adjudicate the DESIGN before running (we revised a
   >0.6-gate out: selection bias; kept the matched pair + unlucky seeds).
9. **Tooling self-review.** Point fresh eyes at your OWN skill docs. Our
   rabbithole-skill review found 2 real gaps (fixed), 2 clarifications,
   1 rejection-by-design. Review the reviewer-instructions too.

## The premise artifact (the thing you hand them)

Reviewers argue from the artifact, so artifact errors become reviewer
errors. Structure that worked (`scratch/fresh-eyes-premise-10x.md`):

1. Project (2-3 lines: what, scale, what exists vs what is destination).
2. Scope agreement (numbered, user-confirmed — ability-not-drive, who
   curates what, what is/isn't a goal).
3. Verified claims with NUMBERS (numbers sacred; regime-bound unless a
   scaling hypothesis + field test exists; say which claims are
   scale-free — usually only the null claims).
4. Done / Next (what ran, what's spec'd, what's parked).
5. The ask (e.g. "Hammer this premise. Verdict + single hardest
   test/falsifier. <=150 words, numbered.").

Premise hygiene (learned the hard way):
- Keep it current. Reviewers corrected us with STALE facts twice ("A3
  0.823 is best" — it was M4 1.00 by then). When they argue from old
  numbers, that's YOUR artifact bug: log the correction, refresh, re-run.
- Reviewers misread exact quantities (a 1.2e-9 cross-run DIFF read as a
  magnitude). One-line derivations in the artifact beat bare numbers.
- Label convenience stats as convenience (bars heuristic, n=3 thin,
  Spearman 0.61 moderate). Reviewers WILL grade your stats; pre-grade them.

## Prompt patterns (copy verbatim, adapt the nouns)

- Single check: "You are a ruthless ML reviewer. No prior conversation
  exists; judge ONLY the lab report below. Be blunt, terse, technical.
  No ELI5, no padding. Point at: confounds, numbers that don't prove
  what the author thinks, missing controls, and the one cheapest next
  experiment."
- Barrage ask: "Hammer this premise. State verdict + single hardest
  test/falsifier. <=150 words, numbered."
- Sealed briefs: question + background + word cap + return shape, one
  brief per scout, questions disjoint, cap scout count per wave.

## Adjudication (you own the verdict, never the reviewers)

- Every reviewer point gets YOUR ruling: ACCEPT (adopt + file), REJECT
  (reason recorded), or PARTIALLY (split it). Log all three; the rejects
  are as valuable as the accepts.
- Reviewer errors are data: log them ("zero aux at eval" was already true
  — proves reviewers need code verification; "aux leakage at test" is
  impossible — aux is train-only gradients; the real version was
  recency/position heuristics). Correct the reviewer in the log.
- Score the round: adoption count, real gaps found, diminishing returns?

## Equipping reviewers with the research skill (reviewers can search, if you let them)

By default a reviewer only sees your artifact. You can GIVE it the websearch
skill inside the brief — paste the recipe, authorize 1-2 searches, and
require cited primaries. This is what turns an unarmed barrage into an
armed critique round.

How to grant it (copy into the reviewer brief):
- Paste the search recipe: DDG html endpoint via fetch, parse
  `result__a`/`result__snippet` links, return top ~8, then read the 1-2
  most relevant PRIMARY sources (arxiv/repo/docs, not blogs).
- Budget: max 1-2 searches per reviewer, <=100-word replies stay. Name
  the allowance explicitly ("you may run up to 2 searches") or reviewers
  won't use it — same lesson as self-calling: capability without explicit
  invocation stays unused.
- Require citations: every external claim must name its URL + verdict
  (useful / dead end + why). Uncited external claims are rejected in
  adjudication, same as uncited internal ones.
- Require verification: "double-check every external claim against the
  premise artifact before using it; research errs like reviewers do."
  Adopted points still need a run afterward.

What changes (measured across 14 armed rounds × 10 reviewers):
- Unarmed: generic mainstream objections ("stochastic parrots" ×3),
  shallow prior art, good kill-shot phrasing. Cheap, fast, best for
  blind-spot hunts and "what test kills this."
- Armed: nearest real prior art named (SDFT, curriculum-extraction,
  SGSD skill-bank, MuZero, cultural-evolution/iterated-learning
  warnings), concrete falsifiers proposed, 9 red-team findings adopted
  into the plan. Costs more per round; worth it on load-bearing
  documents (gameplan, scope, graduation criteria) only.

Rules for armed rounds:
- Same premise artifact for all reviewers in the round (shared context,
  comparable verdicts). Results file per round with raw replies +
  your adjudication.
- Reviewers never see each other (sealed briefs, parallel calls).
- Diminishing returns applies faster when armed: our R11 attack round
  yielded almost nothing ("yield small by design") — that closed the
  attack phase, not the loop; later rounds moved to new layers.
- Full recipe lives in `src/tools/websearch/SKILL.md`; the standing
  pre-step rule (max ~2 searches, primary sources, cite URL + verdict)
  is the same rule reviewers get.
- Neither replaces measurement. Every adopted point still needs a run.
  "Research errs like fresh-eyes reviewers do" — verify against your own
  code/numbers before using anything.

## Iteration: the version loop (review → patch → re-run)

One round tells you what's wrong; only the loop makes the document
better. This is the method that took the gameplan v1→v5, and the one
to use on any load-bearing document (the paper draft's upcoming
battery is steps 1–2 of this loop).

**Battery definition (user-set 2026-11-10, generalized — do NOT memorize the
number): a battery is N fresh reviewers on EACH artifact/list, then adjudicate
every reply (accept / reject / partial), then patch once. That whole thing is
ONE round. Then repeat the entire battery on the new version until the stop
rule fires (two barren rounds in a row, or unanimous steelman). N defaults to
10; scale it to the artifact and the stakes — small/settled artifacts earn
fewer, load-bearing ones earn more. A single pass is never the battery; the
repetition is the battery.**

1. **Version and freeze.** Tag the artifact (v0.1, v0.2...) and hand
   reviewers the frozen copy. Never review a moving target — a finding
   against v0.1 must still be checkable after you patch.
2. **Run a battery.** One or more formats against the frozen version
   (barrage for breadth, armed round for prior art, red-team for
   kill-shots). Same artifact for every reviewer in the round.
3. **Adjudicate once.** Accept / reject / partially, all logged. The
   output of a round is a patch list, not a mood.
4. **Patch in one pass.** Batch all accepted findings into a single
   revision, then version up. Preserve-what-works: sections no
   reviewer faulted stay untouched — rewrites reset the evidence you
   already banked.
5. **Re-run on the new version.** Same ask, fresh reviewers (never
   reuse reviewers across versions — they grade their own advice).
   Compare across versions: adoptions-per-round should fall; repeat
   complaints should die. A complaint that survives the patch meant
   to fix it is a finding about YOUR patch, not the document.
6. **Stop by the stop rule.** Two barren rounds in a row = done; a
   10/10 steelman = satisfaction declared. Version-tag the finale.

Worked example: gameplan v1→v5 — single checks + 10-reviewer
barrages + blind tests + 14 armed rounds + red-team (9 findings
adopted) + steelman close. Each version froze the premise artifact;
stale-number corrections went back into the artifact before the next
round (premise hygiene).

Version log: one line per version in the durable log — what changed,
which round's findings it answers, battery score (adoptions /
reviewers). Results files carry the version:
`scratch/fresh-eyes-<topic>-v<k>-<n>x-results.md`.

## Dependencies

- `websearch` (optional) — required only for armed rounds; paste its recipe
  into the reviewer brief (see "Equipping reviewers"). Unarmed formats
  need nothing.
- `memory` (logging) — round results and adjudications are filed per the
  memory skill (results files + durable log + working record). Fresh-eyes
  produces verdicts; memory keeps them.

## Stop rule

- Diminishing returns is a finding: our R11 consolidation round yielded
  almost nothing new ("yield small by design") — that ENDED the attack
  phase; R12+ moved to new layers (diploma criteria), R14 steelman
  closed the loop. When 10/10 agree or rounds stop producing adoptions,
  stop and declare satisfaction. Don't keep reviewing out of anxiety.
- One round that finds nothing is negative evidence (log it), not a
  wasted round. Two in a row = stop.

## Honest limitations

- Thin seeds: reviewers rightly flag n=3 seed-means as fragile. Accept it;
  say which claims survive it (deterministic replicas, exact lesions)
  and which don't (means, rankings).
- Reviewers can't run code. Anything they assert about your implementation
  must be checked against the code, not trusted.
- Reviewers inherit your framing. The blind test exists because of this:
  if nobody spontaneously raises the objection, it may be your frame
  doing the work, not the evidence.
- Self-calling is NOT automatic: a newborn handed the helpers used NONE
  spontaneously and re-proposed an already-run experiment. Explicit
  invocation (the 3-step checklist) or it doesn't happen.

## Logging

- Results files: `scratch/fresh-eyes-<topic>-<n>x-results.md` (raw replies
  + your adjudication). Premise artifacts kept beside them.
- Verdicts filed in the durable log (CHATLOG) + working record
  (CURRENT_TASK). Numbers sacred: reviewer scores quoted exactly, then
  your ruling.
