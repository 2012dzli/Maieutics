# Memory skill — continuity across compactions and sessions

## Dependencies

None — this is the foundational skill. `fresh-eyes` and `rabbithole`
both log through it (results files, durable log, working record). Steal
this one first; the others assume it exists.

Purpose: survive context loss. Long projects outlive any single context
window (compaction), tab, or day. This skill is the layer stack + rules
that let a future session — or a contextless you — reconstruct state and
keep working without re-deriving everything. Battle-tested across weeks
of bench-science sessions with dozens of compactions.

## The stack (four layers, cheapest first)

1. **Working record** (`scratch/CURRENT_TASK.md`). The live notebook: what
   the task is, what's done, what's queued, key decisions, pointers to
   run records. Rule: newest timestamped entry wins conflicts. After any
   compaction or disconnect, reconcile it against the other layers before
   continuing. Grows unbounded — keep entries short, link files not prose.
2. **Run/wall logs** (`scratch/rabbithole/<slug>/log.md`, `state.json`).
   Append-only wave logs: question → finding → verdict. The wall log is
   the mirror for the main research line. State files hold machine-
   readable status (open/dead/backlog branches, findings, caps).
3. **Verbatim snapshots** (`scratch/gameplan-snapshots/<date>-<label>.md`).
   Exact copies, no paraphrase (see the gap below for why). MANDATORY
   before any gameplan rewrite or critique round; log the snapshot path
   in the working record. Reconstruction from memory is how drift starts;
   snapshots are how you prove it didn't.
4. **Durable log** (`src/CHATLOG.md`, shipped + git-pushed). Append-only,
   one dated entry per session: decisions, MEASURED numbers (numbers
   sacred — wall time, accuracy, loss, never "feels faster"), failures
   and why. This + git is the only layer that survives everything. Rule:
   link code paths, not whole code.

Durability order (weakest → strongest): working record < run logs <
snapshots (all `scratch/`, private, may not survive a reload or a new
chat) < shipped files + git pushes (survive everything). Anything that
matters must climb to layer 4. The climb needs a push token (PAT) — an
unpushed session is a session at risk; say so in the log.

## Rules

- **Snapshot rule.** Before rewriting a plan or running a critique round,
  save the verbatim current version + log the path. No exceptions; the
  one time it was skipped is what created the rule.
- **Newest wins.** After compaction, read all layers; on conflict, the
  newest timestamped entry wins. Mark anything unresolvable UNKNOWN and
  re-derive it with one wave rather than guessing.
- **Checkpoint after every wave.** Results files are written incrementally
  (every run appends + saves), so an interrupted run resumes from the
  file, not from scratch. Scripts filter `done` from the results file on
  start. Proven: an 8-seed wave interrupted mid-run resumed cleanly.
- **Append-only logs.** Never rewrite history; supersede explicitly
  ("X retracted, Y measured instead") with a pointer. Retractions are
  first-class entries — the log must show the error AND the correction.
- **Living vs record.** Living docs get renamed/corrected freely
  (vocabulary upgrades); run records and attributed quotes keep original
  wording. Say which is which when you touch them.
- **Handoff notes.** When context is about to drop, leave a note with:
  Goal / Current state / Files / Next steps — specific enough to continue
  with zero prior context. The note must stand alone even if the working
  record is missing.

## Reconcile-after-compaction procedure

1. Read working record + newest log tails + newest snapshot.
2. Newest timestamped entry wins; mark conflicts UNKNOWN.
3. One wave to re-derive each UNKNOWN (never guess).
4. Log the reconciliation itself (one line: what was reconciled, from what).

## Has this helped? (honest assessment)

Yes — with receipts:
- **Compaction survival.** Multiple sessions continued across context
  checkpoints using handoff note + working record alone. The current
  session is one: the D-rate/D-slow waves were specified two checkpoints
  ago and executed exactly as specified.
- **Interruption resume.** A long wave killed mid-run lost nothing: the
  results file held 4/8 seeds, the script resumed the rest. Checkpointing
  turned a lost hour into a lost minute.
- **Retread prevention.** A "quick retest" request was checked against
  the log first and turned out to be genuinely new ground (prior runs
  were a different regime) — the log answered in seconds what re-running
  would have cost minutes.
- **Retraction chain.** A published mechanism ("global is noise") was
  measured wrong, then corrected in the log with the exact numbers that
  killed it. Without the append-only record, the wrong version would
  still be load-bearing.
- **The gap it caught.** Once, a plan was reconstructed from memory and
  came back substance-right but wording-wrong. A user hypothesis ("was
  that a memory gap?") adjudicated it as REAL — and that verdict created
  the snapshot rule. The system diagnosed its own failure mode.

Costs and limits (don't steal the skill without these):
- `scratch/` is private and temporary. Only shipped + pushed survives.
  Treat everything else as a cache with a good hit rate, not storage.
- Logs grow. The working record needs pruning discipline (short entries,
  pointers not prose) or it becomes a second context window.
- Newest-wins needs timestamps. Undated entries are unorderable — date
  everything.
- The PAT bottleneck: durability depends on pushes, pushes need the
  user's token. Log what's unpushed every session so the risk is visible.
