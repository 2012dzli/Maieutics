# Track A — steal plugins/skills/tools

Registry of everything found, just in case. Append-only: never delete a line,
only change its status. Status ladder: UNFETCHED → FETCHED (one-line what-it-does)
→ STOLEN (ported, with pointer) / SKIPPED (one-line why).

## Subpoints (in order)
- [ ] A1. Enumerate ALL Perchance plugins via https://perchance.org/plugins (official
  directory). We only know ~10 (ai-text, text-to-image, kv, upload, comments,
  secret, server, super-fetch, +docs/literal glimpsed). Every unknown one gets a
  FOUND line below with status UNFETCHED.
- [ ] A2. Triage the plugin list against our gaps: runtime search for visitors?
  docs for the paper? training/eval helpers? Anything that moves a number or
  removes code is a steal candidate; the rest stays FETCHED.
- [ ] A3. Mine the agent-skills directories for portable skills: VoltAgent
  awesome-agent-skills (1000+), skillcreatorai list, then marketplaces
  (awesomeskills.dev, skillmd.com, awesomeskill.ai, agentskill.sh) deduped
  against the github lists. Shopping list: websearch-at-runtime, training /
  eval-harness / dataset skills, compute-orchestration skills.
- [ ] A4. Port the winners: Perchance plugins via {import:}; agent skills as
  src/tools/<name>/SKILL.md in our steal format. Each port gets a STOLEN line
  with what it replaced.
- [ ] A5. Bar: a skill enters the generator only if it moves a number or
  removes code. Everything else stays in the registry for later.

## Registry
### Perchance plugins
- FOUND perchance.org/plugins — official directory (UNFETCHED)
- HAVE ai-text-plugin, text-to-image-plugin, kv-plugin, upload-plugin,
  comments-plugin, secret-plugin, server-plugin, super-fetch-plugin
- FOUND docs-plugin (multi-page markdown docs — candidate for paper/lab docs)
- FOUND literal-plugin (escape perchance chars — useful for paper text)
### Agent-skills directories
- FOUND github.com/VoltAgent/awesome-agent-skills (1000+, UNFETCHED)
- FOUND github.com/skillcreatorai/Awesome-Agent-Skills (UNFETCHED, diff vs VoltAgent)
- FOUND awesomeskills.dev / awesomeagentskills.dev / skillmd.com /
  awesomeskill.ai / agentskill.sh (marketplaces — mine AFTER github lists)
- FOUND joohw/awesome-agent-skills website index (tutorials + standards)

## Round 1 (2026-11-10): 2 searches, 16 results. Next: A1 (fetch /plugins).
