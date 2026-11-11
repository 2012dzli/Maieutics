<!-- ORIGIN: built in-repo (Teaching Small Models lab, 2026-11-08/09). Not stolen. License: repo-internal. -->

---
name: rabbithole
description: Cautious long-running research in small cheap waves. This skill should be used when running deliberate open-ended research with sealed scouts and primary sources until stopped, capped, or blocked — with state, wave loop, and standing tangential slot.
---

# Rabbithole skill — cautious long-running research

Purpose: run deep research ("rabbitholes") under assistant ownership, in small
cheap waves, until the user says stop or a genuine block is hit.
The name is the spec: a rabbithole is DELIBERATE wandering. This is a shotgun
approach for unknown unknowns — we don't know what we don't know, so breadth
is the method, not a distraction from it. Nearly NOTHING is scope creep:
tangents, analogues, rival methods, neighboring fields are all legitimate game.
Narrowing to the root too early is the failure mode, not the discipline.

## Research agenda (project wall, most-promising first)

1. PCGrad / gradient surgery for the teachers-fight — nearest fix; might be ~20 lines.
2. Capacity math: one skull or three? — separated readouts vs bigger hidden size.
3. Trained settling dynamics — biggest idea; could dissolve the transit-vs-readout split.
4. Memory transport that actually moves bindings — successor to failed wedge/campfire/choosy.
5. Why evo climbed the wrong hill — find a selection signal that points at the exam.
6. STANDING SLOT — tangential analogues + different methods toward the same goal.
   Not a detour: every few waves, research something that solves the same problem
   a different way, or a neighboring field's version of it (even if it looks
   unrelated at first). Direct work optimizes the current path; this slot is
   how a better path gets found.

Most promising: #1. Most exciting: #3. No pressure to finish a topic before
hopping — follow whichever is most alive, hop freely, take as long as needed,
and decide next steps without asking.

Sidenote (user-set 2026-11-08): treat this research as personal experience,
not just facts. Notice how *you* learn while researching — which
scouting/synthesis habits work, where you fool yourself, what you'd teach the
lab's model about learning. We're teaching a model how to learn; the
researcher's own learning counts as data.

## Command

User says one of:

- `run rabbithole: <root question>` — no total budget; throttled stream by
  default. Optional `[cap: N waves]` only if the user sets a hard cap.
- `continue rabbithole` (resume latest state — valid but NEVER required: standing
  permission to resume is assumed YES, user-set 2026-11-10, so never ask for it
  and never wait for it; awaiting a continue message is itself a permission gate)
- `stop` / `pause rabbithole` (stop signal — honored on next turn)
- per-turn budget (user-set 2026-11-10): 10,000~20,000 waves per turn, i.e.
  effectively unbounded — the ONLY stop reasons mid-run are the user's manual
  stop, a genuine block, or an explicit cap. Soft rationing (1-2 waves then
  report) is BANNED; a turn ends when the work is done or blocked, never to
  force a check-in.

No root question given = default to the standing topic in
`scratch/CURRENT_TASK.md` (at writing: the project wall — capacity vs.
interference, current lead PCGrad). Slug = short kebab-case of the root;
`continue` resumes the most-recently-updated run; record active slugs in
`scratch/CURRENT_TASK.md`.

## State (all under `scratch/rabbithole/<slug>/`)

- `state.json`: `{ root, capWavesOrNull, wavesUsed, pace, branches: {open,
  dead, backlog}, findings, verdicts, scopeNotes, status,
  toBringUp: [items needing the user — reported first, never buried] }`
- `log.md`: append-only wave log (Q -> finding -> verdict). Opens with a
  `## To Bring Up` section: the live user-facing list, always output first
  in every report so it can never be buried.
- `STOP`: if this file exists, do not start another wave.

`scratch/` is private and may not survive forever; after compaction or disconnect,
reconcile state with `scratch/CURRENT_TASK.md` before continuing.

## Wave loop (cautious defaults)

1. Read state; honor `STOP`, any optional cap, and any user stop message.
2. Pick at most 2 next questions (disjoint, serving the root). Default shape is
   ONE DIRECT + ONE TANGENTIAL (agenda item 6) every wave — shotgun by
   default; two direct questions only when a hot lead needs both slots, and
   never more than 2 waves in a row without a tangential one.
3. Launch at most 2 scouts in ONE page_eval (`Promise.all`, sealed briefs,
   <=100-word replies, return shape enforced).
4. Fetch at most 2 PRIMARY sources (arxiv/repo/docs) via `fetch_url`.
5. Synthesize: per-branch verdict (useful / dead end + why); failed search =
   inconclusive (retry once, varied); clean empty search = negative evidence.
6. Update `state.json`, `log.md`, and `scratch/CURRENT_TASK.md` checkpoint.
7. Queue rule (user-set 2026-11-10): every finished wave MUST open at least 1
   new wave (append to `branches.open`). The queue never empties by finishing
   work — it empties only at run end (user stop, genuine block, explicit cap,
   or proven-dry: a wave that genuinely cannot spawn a follow-up, logged with
   why). If `branches.open` is ever empty outside run end, that is a bug.
8. pause/report: short status, then continue while the turn is active.
   pause/report is NON-blocking — never a permission gate. NEVER ask the user
   for `continue`: standing permission to resume is assumed YES (user-set
   2026-11-10); ending a turn with "say continue" as a precondition for more
   work is itself a permission gate.

Throttled stream, no total budget: pace is the control. Concretely, one wave =
at most 2 scouts at 100 words each + at most 2 primary fetches. A pause =
checkpoint + status + a breath before the next wave (no fixed minutes — wave
size, not the clock, is the throttle). Keep usage comfortably below a cautious
hourly pace. If pressure or failures appear, shrink waves (down to 1 scout)
and lengthen pauses. An optional user-set cap, if present, is the only
budget-like gate — reaching it means checkpoint + report + await extension.

## Marathon rule

A run ends only at the stop reasons (user stop, genuine block, optional cap).
"Root answered" is NOT a stop reason — it is a report milestone: file the
verdict and keep going on the open branches and the standing slot (agenda
item 6). Running out of direct questions never ends a run either — that is
what the tangential slot is for. There is no "final reply with no tools behind
it" mid-run: status reports ride along WITH continued tool calls, never
instead of them. A plain reply with no tools IS the handoff — emit one only
when the run is truly over (stopped, capped, or blocked). When in doubt, keep
chaining. Past behavior to not repeat: winding down after a few waves because
the agenda emptied — the hole is nearly endless by design.

## Interruptions

- errors: retry once, isolate, save good work, record failure.
- limits: smaller waves, longer pauses; no auto-stop except an explicit cap.
- compaction: reconcile after — read state.json + log tail + CURRENT_TASK;
  newest timestamped entry wins conflicts; mark uncertain fields UNKNOWN and
  re-derive with one wave rather than guessing.
- lost connection: RISK ACCEPTED — resume from last checkpoint.
- scope: nearly nothing is scope creep (see Purpose). Minor add/remove is mine
  to decide — ask "should this be in scope?", document the answer in
  `scopeNotes`/log. A DIFFERENT METHOD toward the SAME goal is in scope by
  default — never a scope change, never an escalation. A tangent that becomes
  a different GOAL is also not escalation — promote it to its own run
  (bookkeeping, log a pointer both ways). Escalation is only for leaving
  research-only or irreversible actions.
- forks: pursue competing branches in parallel until one is noticeably less
  productive, then prune the loser with a verdict. Pruned branches keep their
  verdict and stay revivable; pruning is a delegated judgment call, logged.
  Escalate only forks that need user values, major scope, or an irreversible
  choice.
- optional cap reached / irreversible action / ambiguous vision: escalate.

## Scope and ownership

Research + docs only. Read-only toward the lab/generator/repo: may write
scratch notes, task records, CHATLOG lines, and research docs. No shipped-code
changes, pushes, or irreversible actions without explicit instruction.
Assistant is final stakeholder for research direction within scope and throttle.

## Dependencies

- `websearch` (required) — primary-source fetches (step 4 of the wave
  loop) run through it. No websearch = no external facts, only synthesis.
- `memory` (required) — state.json/log.md/CURRENT_TASK checkpointing
  (steps 6-7) follows the memory skill. No memory = waves that evaporate
  on compaction.
- `fresh-eyes` (optional) — point at findings, plans, or this skill
  itself before committing to a direction. Used here for the agenda and
  the skill's own review (5 points, 2 real gaps fixed).

## Sandbox

- Root: `scratch/sandbox/`. Full root access: create, overwrite, or delete
  anything inside, especially while rabbitholing. Iterations are subfolders
  (`s01-...`, `s02-...`); never mutate the real model/training in place —
  copy it into the sandbox first.
- No new roots: tangents are branches or sandbox iterations, never new runs.
  Competing ideas get sandbox subfolders, not fresh root questions. A tangent
  that outgrows its root (it now serves a different goal, not just a different
  method) may be promoted to its own run — log a pointer both ways and keep
  going. Promotion is bookkeeping, not escalation.
- Docs stay OUT: run state, logs, and records live in
  `scratch/rabbithole/<slug>/` + task records, so the sandbox can be freely
  overwritten. Provenance of anything copied in is recorded in the run log
  (outside the sandbox), never inside it.
