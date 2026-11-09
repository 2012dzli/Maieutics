# Skills — steal these

A skill is a reusable recipe: a `SKILL.md` (when to use it, the exact
procedure, the rules learned the hard way) plus optional runnable scripts
beside it. Each skill below was built for real work, verified live, and
kept current — copy anything you want, that's what they're for.

## Index

| Skill | Path | Needs | One line |
|---|---|---|---|
| memory | `src/tools/memory/SKILL.md` | nothing (steal first) | Continuity across compactions: layered Proposal, snapshot rule, honest assessment |
| websearch | `src/tools/websearch/` (`SKILL.md` + `search.js`) | nothing | Agent-side web search with no key: DDG html + primary-source recipe |
| fresh-eyes | `src/tools/fresh-eyes/SKILL.md` | memory (log); websearch (armed only) | Stateless AI reviewers on demand: single checks to armed 10-agent critique rounds |
| rabbithole | `src/tools/rabbithole/SKILL.md` | websearch + memory; fresh-eyes optional | Long research in small cheap waves until the root question is answered |

## What a skill file contains

Every `SKILL.md` follows the same shape so both people and agents can
skim it the same way:

- **Purpose** — one paragraph: what job this does.
- **Trigger/command** — the exact words or situation that invoke it.
- **Procedure** — numbered steps, concrete enough to execute blind
  (file paths, caps, return shapes, thresholds).
- **Rules** — standing constraints (budgets, scope, stop conditions),
  each tagged with how it was earned (user-set vs learned-from-incident).
- **Evidence** — what it caught, what it cost, where it failed. A skill
  without a failure section is an advertisement, not a skill.
- **Scripts** — if a runnable lives beside it, how to run it and what
  it returns.

## How to steal one

1. Copy the whole folder (SKILL.md + any scripts). The skill is the
   folder, not just the markdown. Respect the Needs column — steal
   `memory` first, since the others log through it.
2. Adapt the nouns: file paths (`scratch/...`), project names, thresholds
   (seed counts, word caps, bars). Keep the structure; the structure is
   the tested part.
3. Keep the failure sections. They encode the incidents that shaped the
   rules — without them you'll re-pay the tuition.
4. Match your skill to your platform: ours assume `fetch_url` (fetch +
   save), `execute_js` (sandboxed worker with `fs` + `tools`), and
   `page_eval` (run JS in the live page). Map these to your equivalents:
   you need (a) fetch-to-file, (b) a place to run code with filesystem,
   (c) a way to call a stateless model with an artifact-only prompt.
5. Fresh-eyes needs a stateless model call — any LLM API with no
   conversation memory works. Memory needs four durability tiers (see
   the memory skill) — map yours: ephemeral notes < run logs <
   verbatim snapshots < version-controlled log.

## Status

Skills are living docs: when a rule changes, the entry changes the same
session, with the reason. Stale skills are worse than none — if you steal
one, re-verify the recipes (search-engine HTML shapes rot fastest).
