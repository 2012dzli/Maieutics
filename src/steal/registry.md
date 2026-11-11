# Track A — steal plugins/skills/tools (code and/or AI instructions)

Registry of everything found, just in case. Append-only: never delete a line,
only change its status. Status ladder: UNFETCHED → FETCHED (one-line what-it-does)
→ STOLEN (ported, with pointer) / SKIPPED (one-line why).

## Subpoints (in order)
- [x] A0. Gaps locked (user delegated 2026-11-10 — my shopping list, my call):
  G1 = visitors forget everything on reload (lab/nursery settings, paper place, bench progress). Fix = remember (persistent storage).
  G2 = paper/docs text painful (markdown rendering + bracket-escaping). Fix = markdown + literal.
  G3 = sharing/export clunky (no one-click save). Fix = download-button (trivial Utility).
  P1 frontmatter APPROVED (my call): every future steal file wears folder + SKILL.md name/description/license tag.
  Pilot = G1 remember first (my call): smallest, zero-dep, Utility bar = persistence works across reload + guards pass + no bench regression + shipped bundle <=100KB. If pilot fails to move, pause Track A per pilot rule.
- [x] A1. Enumerate ALL Perchance plugins via https://perchance.org/plugins (official
  directory). We only know ~10 (ai-text, text-to-image, kv, upload, comments,
  secret, server, super-fetch, +docs/literal glimpsed). Every unknown one gets a
  FOUND line below with status UNFETCHED.
- [x] A2. Triage the plugin list against our gaps: runtime search for visitors?
  docs for the paper? training/eval helpers? Anything that moves a number or
  removes code is a steal candidate; the rest stays FETCHED.
- [x] A3. Mine the agent-skills directories for portable skills AND portable AI
  instructions (system prompts, procedures, eval rubrics, training recipes —
  steals are code and/or AI instructions, user correction): VoltAgent
  awesome-agent-skills (1000+), skillcreatorai list, then marketplaces
  (awesomeskills.dev, skillmd.com, awesomeskill.ai, agentskill.sh) deduped
  against the github lists. Shopping list: websearch-at-runtime, training /
  eval-harness / dataset skills, compute-orchestration skills.
- [x] A3b. Portability filter (added after critique C1, 2/3 reviewers): every
  FETCHED skill gets a class — Logic (portable code), API (needs key/cost →
  coin check in Track B first), Framework (needs an environment we don't have
  → SKIPPED with reason). Only Logic reaches A4; API reaches A4 only with a
  priced coin budget. Logic must be dependency-light (red-team C5: stdlib /
  zero-dep preferred — a "removes 10 lines" port that imports a framework is
  a loss). DEPENDENCY (critique C4, 3/3): no API-class skill reaches
  A4 before Track B's router interface (B3) exists — porting uncallable code
  is not stealing.

## The two workshops (user: delve deeper — this is what "fit" means)
There isn't one workshop, there are two — and the awesome-lists assume a
third we don't have. Every FETCHED skill gets fit-checked against all three:

- **Workshop 1 — the shipped generator (the lab/nursery as visitors run it).**
  Browser page, CPU-only, seconds-to-minutes per interaction (bench runs run
  ~1–20 min on unknown host hardware). May fetch (super-fetch beats CORS) and
  import esm.sh modules at runtime. NEVER ships a secret (all code is public).
  Storage = kv-plugin (local per-user) + upload-plugin (public URLs). Ship
  limits (2GB/100MB/10k files) exist but don't bind code. No build step, no
  npm install, no backend. Fit test: runs on a stranger's laptop browser with
  no key and no server? If no → not Workshop 1.
- **Workshop 2 — agent tooling (my side of the bench).** execute_js worker:
  live workspace fs, tools.*, esm.sh imports, big files, long runs, scratch/
  intermediates. May be heavy (repos, datasets, headless sims). Still never
  holds secrets in files (tokens live in chat, keys live with the user).
  Fit test: runs in a fresh worker with fs + tools + fetch? If yes → Workshop 2.
- **Workshop 3 — the one we DON'T have (what most listed skills assume).**
  A server with secrets + GPUs + Python + pip + dollars. Anything that needs
  this and can't be re-homed to 1 or 2 is Framework-class → SKIPPED with the
  reason named (or API-class with a priced coin budget if keys are user-held).

Fit-check checklist (A3b procedure, one line each in the registry):
1. Which workshop — 1, 2, or 3?  2. Secrets — none / user-held key / hardcoded (= reject).
3. Compute — CPU ms–min / GPU / cluster.  4. Deps — zero / vendored / CDN / pip+server.
5. Runtime network — none / fetch-only / keyed API.  6. Weight — lines + MB shipped.
7. Runtime target — Main-Thread / Worker / both (refinement R1+R3: a Logic skill
on a browser-only API can pass the filter and die in a Worker or odd visitor
env — name where it must run). BLOCKING gate (R3): fail here = Framework,
not "we'll handle it in porting". Weight cap (R3): Logic ports ship ≤100KB
unless Utility-named with a written justification; CDN imports count.
Verdict: all-green W1 = Logic(W1); keyed = API (coin check); W3-only = Framework/SKIPPED.
Rule of thumb (refinement R1): runtime fetch, however thin the wrapper, makes
it API-class, not Logic. Vendored lines count IN the "removes code" math.
- [x] A4. Port the winners (code and/or AI instructions, user correction):
  runnable code as Perchance plugins via {import:} or vendored modules;
  AI instructions (prompts, procedures, rubrics, recipes) as
  src/tools/<name>/SKILL.md in our steal format, or prompt/recipe files where
  that fits better. Each port gets a STOLEN line
  with what it replaced. REGRESSION CHECK (critique C4): a port is STOLEN only
  after a reference bench task shows no regressions vs the unported baseline.
  ROLLBACK (refinement R4, 2/6): every STOLEN line names its revert (commit/
  files to remove) + the guard-test snapshot it passed — 60-second recovery,
  recorded in the registry (append-only: removals are new lines, never edits).
  PORT-TAX (R4): glue/boilerplate/invocation-shim lines count AGAINST "removes
  code"; >50 lines of glue needs a Utility name or the port is SKIPPED.
  Reference set (refinement R1, 3/6 asked): the repo's guard tests
  (quickSelfTest, quickAttnTest, and the task-family smoke for the skill's
  target) — frozen, named, no subjective "feels fine". The PILOT additionally
  re-runs one hard exam (refinement R3: smoke tests miss distributional drift)
  and is stress-broken in its target env first ("port-slayer": Worker ports
  die in a Worker before they can die in prod). HIDDEN-API AUDIT (refinement
  R5): "no network" must be verified, not claimed — static grep for
  fetch/XHR/WebSocket/telemetry in the port + runtime smoke confirming zero
  undocumented calls (a phoning-home "Logic" port is a data leak, not a port).
  PILOT RULE (red-team C5): the FIRST port must move its bench metric beyond
  noise on its own — if the model/bench can't use it, pause Track A porting
  and re-scope instead of porting a second one.
- [x] A5. Bar (split after critique C1, 1/3): PERFORMANCE (moves a bench
  metric beyond noise, or removes code) or UTILITY (enables a named required
  feature — e.g. persistent storage, paper docs — with the feature named in
  the STOLEN line). Utility is not a blank check: name the feature or SKIPPED.

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
## Wave 1 census (rabbithole steal-track-a, 2026-11-10): /plugins static fetch = JS
shell (no list); 'plugins' generator is a joke entry. Census via
perchance-platform skill official directory — all FOUND (UNFETCHED):
create-instance-plugin, select-leaf-plugin, dynamic-import-plugin,
remember-plugin, goto-plugin, dice-plugin, image-layer-combiner-plugin,
pattern-maker-plugin, tap-plugin, tap-anywhere-plugin, press-enter-plugin,
favicon-plugin, layout-maker-plugin, select-range-plugin, wheel-plugin,
random-integer-plugin, random-decimal-plugin, seeder-plugin,
url-params-plugin, tooltip-plugin, generator-stats-plugin, tldraw-plugin,
rpg-icon-plugin, font-plugin, custom-font-importer, google-sheets-plugin,
sum-odds-plugin, background-image-plugin, background-audio-plugin,
select-until-plugin, random-select-plugin, typewriter-plugin,
make-table-plugin, lockable-list-plugin, locker-plugin,
fixed-until-reload-plugin, number-set-plugin, numerals-to-words-plugin,
numerals-to-ordinal-words-plugin, numerals-to-ordinals-plugin,
roman-numerals-plugin, text-to-speech-plugin, join-lists-plugin,
exclude-items-plugin, filter-list-plugin, markov-chain-plugin,
roll-table-plugin, nested-plugin, navbar-plugin, markdown-plugin,
consumable-list-loop-plugin, consumable-leaf-list-plugin,
select-leaves-plugin, select-all-leaves-plugin, download-button-plugin,
print-button-plugin, copy-text-plugin, fullscreen-button-plugin,
tabs-plugin, conjugate-plugin, title-case-plugin, random-image-plugin,
image-plugin, flat-avatar-plugin, a-an-plugin, be-plugin, plural-plugin,
date-plugin, bug-report-plugin, pride-plugin, tornado-plugin,
create-instances-plugin. Scout-named random-plugin, text-plugin,
table-plugin, map-plugin, sound-plugin NOT in directory — UNVERIFIED.
## Wave 4 source reads (rabbithole steal-track-a, 2026-11-10):
- remember-plugin: FETCHED (main.pjs 8015 + index.html 7467 chars) — pure localStorage persistence (vars-only, prefix-scoped, 500ms save, @forget/@inputs). Hidden-API audit CLEAN. Verdict V7: FIT-W1 (Logic), port-eligible for G1 when confirmed.
- download-button-plugin: FETCHED (main.pjs 233 + index.html 2922 chars) — 3-line anchor to first-party downloadGenerator API. Verdict V8: FIT-W1 (trivial/Utility).
## Wave 10 source read (rabbithole steal-track-a, 2026-11-10):
- markdown-plugin: FETCHED (main.pjs 33666 + index.html 3495 chars) — vendored marked 0.5.0 inlined, no runtime network. Main-Thread-only (document style injection). Verdict V17: FIT-W1 (Logic), 37KB PORT-TAX note.
## Wave 11 source reads (rabbithole steal-track-a, 2026-11-10):
- docs-plugin: FETCHED (main.pjs 62276 + index.html 4041 chars) — in-page markdown docs app, vendored marked, highlight.js via esm.sh dynamic import (CDN-allowed). No fetch/XHR/WS. Verdict V18: FIT-W1 (Logic/Utility), Main-Thread-only, ~66KB.
- google-sheets-plugin: FETCHED (main.pjs 3307 + index.html 8105 chars) — fetch() of author-supplied URLs + TSV parse, no key in code. Verdict V19: API-class (R1 fetch rule), keyless iff public TSV; port-blocked on B3 gate + coin check.
- literal-plugin: FETCHED (main.pjs 454 + index.html 2838 chars) — pure regex escape ([ ] { } + opt HTML-entity), zero-dep, no runtime net (only docs link). Verdict V20: FIT-W1 (Logic), port-eligible, smallest of the set.
## A-list close-out (2026-11-10, pre-fetch battery 22 reviewers + hidden-API audit)
- KEEP (Logic W1): remember, markdown (Main-Thread-only note, ~37KB PORT-TAX), literal (454B), download-button (trivial Utility, first-party link only).
- DROP: docs-plugin (SKIPPED-redundant + overweight vs markdown + CDN highlight.js).
- BLOCKED: google-sheets-plugin (API-class, B3 gate).
- Hidden-API audit (grep fetch/XHR/WS/esm.sh + dynamic import in init path): literal CLEAN, remember CLEAN (localStorage only, docs-links only), markdown CLEAN-runtime (vendored marked, comment-URL only; document style-inject = Main-Thread-only flag), download-button CLEAN (anchor only, no fetch).
- Pre-fetch checks before any A4 port: (1) init-path network grep, (2) 10KB/16ms main-thread parse test, (3) combined shipped bundle <=100KB. A1 census + A2 triage + A3b filter DONE for this scope; A0 gaps + A4 ports still gated on user (G1-G3 confirm, P1 nod).
## Wave 12 full-pull audit (2026-11-10, user: pull everything we'd want for Track A)
- Fetched ALL census names (73 fetch_generator calls, 0 errors — but text/table/map/sound-plugin returned EMPTY files: scout names confirmed MISSING, not in directory. custom-font-importer-plugin also empty — real name is custom-font-importer (empty main.pjs, docs only). background-image-plugin present after all (1331 chars).
- Audit method: main.pjs char size + regex for fetch/XHR/WS/esm.sh/CDN/runtime-https + document/window/localStorage flags (scratch/steal-audit.json). Nearly all "network hits" are docs/comments/example URLs (codecademy/khanacademy/stackoverflow/reddit) — NOT runtime calls. Real runtime-network: bug-report (jsdelivr ua-parser + uploads.dev script), tldraw (tldraw.com rooms), font (googleapis), random-image (unsplash — dead API), background-audio (soundcloud/youtube embeds), generator-stats (first-party stats fetch), google-sheets (author-URL fetch), dynamic-import (first-party XHR — its core mechanism).
- VERDICTS (grouped, A3b classes):
  - HAVE already (8, skip): ai-text, text-to-image, kv, upload, comments, secret, server, super-fetch.
  - STOLEN (4): remember, markdown, literal, download-button.
  - SKIPPED-redundant (docs-plugin) / BLOCKED-API (google-sheets, B3 gate) — unchanged.
  - WANT-G4 bench-repro-share: seeder (2915, seeded RNG — bench determinism), url-params (183! one-liner query parse — shareable configs), copy-text (1037, clipboard — share run configs), select-until (288, retry-until — bench sampling), random-select (1336, odds choice — bench sampling), fixed-until-reload (547, stable pick per reload), lockable-list (2002) + locker (1994, experiment locking — wiring = bench-flow work, needs design).
  - WANT-G5 paper-polish-demo: be (3359) + plural (8232, vendored pluralize) + a-an (7698) + title-case (1499, author grammar helpers, no DOM wiring like literal), print-button (219, window.print + print CSS), fullscreen-button (1916, demo mode).
  - HOLD (no gap yet): generator-stats (first-party view counter), text-to-speech (6081, SpeechSynthesis, no net — read-aloud), dynamic-import (lazy-load deps — we ship static).
  - SKIPPED-weight (vendored data >30KB, no gap fits the bytes): conjugate (251KB), wheel (173KB), rpg-icon (129KB), flat-avatar (656KB!), tooltip (45KB tippy), date (59KB moment — native Date suffices), numerals-to-words (36KB), numerals-to-ordinal-words (37KB), markov-chain (181KB html corpus), image-layer-combiner, pattern-maker (21KB + wav), navbar (11KB).
  - SKIPPED-nogap (clean but nothing named): dice, roll-table, random-integer/decimal, select-range, sum-odds (85!), numerals-to-ordinals (436), roman-numerals, title-case→(moved to WANT-G5), join/exclude/filter-lists, make-table, consumable-*-loop/leaf, select-leaf/leaves/all-leaves, number-set, goto, nested, create-instance(s), tabs, typewriter, layout-maker, image, background-image (cosmetic), favicon ($meta.icon covers it), tap, tap-anywhere, press-enter, copy→(moved to WANT-G4), print→(G5), fullscreen→(G5), pride, tornado (jokes), font-plugin (runtime googleapis), custom-font-importer (empty), text/table/map/sound (MISSING).
  - SKIPPED-external (runtime third-party service): tldraw, random-image (unsplash), background-audio (soundcloud/youtube), bug-report (jsdelivr + uploads scripts).
- G4/G5 (my call, delegation stands): G4 = bench reproducibility + shareability (seeder/url-params/copy-text/select-until/random-select/fixed-until-reload/lockable/locker). G5 = paper polish + demo (grammar-4/print/fullscreen; stats/tts/dynamic-import on HOLD inside G5). Ports NOT started — tranche proposal to user, no unilateral bench rewiring.
## STOLEN wave 14 (2026-11-10, user: pull everything + Appendix H — full G4/G5 tranche)
- Imports (main.pjs, +14): urlParams, copyText, printButton, fullScreen, aAn, beVerb, pluralize, titleCase, seeder, selectUntil, randomSelect, fixedReload, lockable, locker. All verified present; titleCase/pluralize verified callable ("Stolen Tools", "geese").
- Wired: hero gets print + fullscreen next to download (3 buttons verified in DOM); lab gets copy-run-config button (copies ?task=&steps=… suffix; headless clipboard writeText fails unfocused — real browsers fine, status message still shows); URL-apply at 1500ms (late so shared links win over remember restore; verified assocR/600/short/pcgrad=1 round-trip incl. checkbox, bad values skipped, controls reset after).
- NOT wired (import-only, integration spec'd — no bench rewiring per pilot rule): seeder + selectUntil + randomSelect + fixedReload + lockable/locker (train.js/bench-flow design needed); beVerb + aAn (prose use UNSAFE — see hazard).
- HAZARD (new, measured): be-verb + a-an in one parent = infinite MutationObserver ping-pong (identical textContent sets still mutate; guards only cover self-mutations) → two frozen loads at ~75s each. Rule: never co-locate observer plugins; beVerb prose use reverted, both stay import-only. pluralize + titleCase are pure (safe anywhere).
- Bench-integration spec (for later): seeder wraps Math.random — integrate at train.js entry with seed from URL (?seed=) + record in run ledger; selectUntil/randomSelect for exam sampling loops; fixedReload/lockable for experiment arms. Each needs its own guard run before wiring.
- skill-creator guide vendored to src/tools/skill-creator/SKILL.md (Apache-2.0, provenance header) — META steal for P1 format.
- Revert: remove import lines + hero/lab wiring + Appendix H blurbs. Guard snapshot: quickSelfTest learned:true + quickAttnTest ok:true (identical pre/post), persistence intact, console clean.
## Wave 13 agent-skill directories pulled (2026-11-10, user: and the directories too)
- VoltAgent zip = 5 files, 0 SKILL.md (243KB README link-index to officialskills.sh + github repos — a directory OF directories, not vendored skills). Keyword-mined for shopping list: websearch hits are ALL keyed APIs (serpapi/firecrawl/brave/browserbase — API-class, B3-gated; we already have websearch skill + superFetch); HF dataset/eval/jobs/trainer + datadog eval-bootstrap (eval-harness-adjacent but keyed/cluster — API/Framework, B/C territory); trailofbits/venice (no gap). Yield for Track A Logic: ZERO.
- skillcreatorai zip = 363 files, 27 SKILL.md vendored, read 5 closest: sales/marketing/productivity throughout (leads, invoices, meetings, brand). Shopping-list yield: skill-creator (SKILL.md authoring guide — META-WANT for our own P1 steal format) ; webapp-testing (Playwright/Python — W3, SKIP, we test via page_eval); lead/content-research (business research, SKIP); mcp-builder (MCP servers — Framework, SKIP). Rest SKIP.
- A3 verdict: directories pulled + indexed (scratch/skill-dirs-pull.json) — the 1000+ skill world assumes keys/servers (W3). Track A Logic yield = skill-creator only (proposed: adopt as P1 format guide). Keyed eval/search items noted for Track B (post-B3).
## STOLEN (2026-11-10, user go "bring them all in" — pilot G1 first per rule, then G2/G3 same batch)
- STOLEN remember-plugin (G1 pilot, Utility: reload persistence) via {import:remember-plugin} + hidden [remember(root, "@inputs")] span. Replaces: nothing (new feature; lab inputs previously forgot on reload). Revert: remove import line + span. Guard snapshot: quickSelfTest learned:true + quickAttnTest ok:true + persistence probe kPick 2/depth 32 survive full reload. Pilot bar MET (reload persistence works, guards pass, no bench regression, ~0 shipped bytes).
- STOLEN markdown-plugin (G2, Utility: paper-docs authoring) via {import:markdown-plugin}, verified callable root.markdown("**hi**") -> <strong>hi</strong>. No DOM wiring (paper numbers stay byte-identical by design). Revert: remove import line. Guard snapshot: same as above, post-G2 refresh.
- STOLEN literal-plugin (G2, Utility: bracket-escaping for paper text) via {import:literal-plugin}, verified root.literal("[x]{y}") -> \[x\]\{y\}, +html entity-escapes. No DOM wiring (author helper). Revert: remove import line.
- STOLEN download-button-plugin (G3, Utility: one-click export) via {import:download-button-plugin} + hero #dlCtnEl filled from root.downloadBtn (first-party downloadGenerator href, verified in DOM, 153x22px laid out). Revert: remove import line + hero <p> + wiring script. Guard snapshot: same as above, post-G3 refresh, console + perchanceErrors clean throughout.

## Wave 15 marketplace sweep (2026-11-10, user: go inside, list everything we'd love)
- Fetched all 4 marketplaces + joohw index: awesomeskills.dev (172KB JS shell, 10 slugs), skillmd.com (307KB, REAL catalog — /api/search?q= works), awesomeskill.ai (683KB JS shell, 54 slugs), agentskill.sh (487KB, search BROKEN — openclaw monoculture regardless of query, SKIP), joohw README (49KB, 247 entries/40+ cats, agent-skill.co — best for official skills). Raw-verified: eval-harness SKILL.md = pure markdown+bash (Logic, no key). Wishlist in scratch/steal/mkt-wishlist.json (17 Tier-1 Logic wants).
- TIER-1 LOVE (Logic, gap-mapped): keyargo/web-search (DuckDuckGo zero-key, W1 — nursery harvest); pdf family (anthropic/openai/seb1n/nutrient, W2 — papers pipeline); paper family (academic-paper/paper-write/paper-compile/latex-scaffold/latex-workflow/write-pandoc-markdown/paper-tex — G2/G5); eval family (eval-harness x2/eval/self-eval/project-evals/vitest-evals/evals — bench rigor); benchmark x2; playwright family (webapp-testing/generate-test/playwright-pro/e2e-testing/expert/openai-playwright/develop-web-game, W2 — lab harness); xlsx; HF family (datasets/dataset-viewer/hf-cli/transformers.js browser-ML W1!); dataset gen/docs (woodfishhhh/phuryn/data-designer/generator/datasheet); training recipes (pytorch-lightning/pytorch-checklist/sparse-autoencoder/pyvene/nemo-rl, W2); memory (claude-memory-skill/memory-systems/context-compression/data-structure-protocol — G1-adjacent); teaching/prose (tutor-skills/beautiful_prose/creative-director TRIZ); quality (static-analysis/audit-context/qa/coderabbit); research (research/pulse/patent/grants/mattpocock/athola-GH-HN-arXiv/deep-research/jarbitechure/storm — papers.md); frontend (frontend-design/frontend-skill/taste-skill — G5); jupyter-notebook (G4); tc-tracker (Track B note).
- TIER-2 Track-B (API/Framework, B3-gated): keyed search (exa/tavily/serpapi/brave/browserbase/firecrawl), hardware/cluster/paid media (jetson-benchmark/HF trainer+jobs/replicate/sora/speech/imagegen), mcp-builder (servers).
- TIER-3 SKIP: sales/marketing/productivity bulk. A3 marketplaces now MINED (agentskill.sh explicitly dead, JS-shells partially indexed); next = fetch raw SKILL.md for Tier-1 + A3b fit-check each + A4 ports.

## Wave 16 final list (2026-11-10, user: second check + fresh eyes + final)
- Battery: v1 premise frozen (scratch/fresh-eyes-marketplace-v1-premise.md) + 3x unarmed barrage (results file above). Unanimous: CUT Python family (pytorch/SAE/pyvene/nemo = Framework, 3/3); playwright-in-worker impossible as runtime (ACCEPTED as port, PARTIAL as procedures — keep webapp-testing + playwright-expert for page_eval use); C dedupes paper 7->2 / eval 7->2 / pdf 4->1 (ACCEPTED).
- FINAL 14 wants in scratch/steal/mkt-wishlist-final.json (search, pdf-single, compile-path x2, eval x2, benchmark, playwright-procedures x2, transformers.js + dataset-viewer, datasheet, memory x2, tutor + prose, static-analysis, research x2, taste, jupyter). CUT list recorded. Next: raw SKILL.md fetch + A3b each + A4 by gap.

## Wave 16b ruling on pushback (2026-11-10, user pushed back, final override mine)
- Pushback: does Track B's extra punch rescue the cut Python family (pytorch/SAE/pyvene/nemo)?
- Evidence: B1-B5 ALL unchecked, every source CLAIM (Kaggle/Colab/ZeroGPU/Lightning/Paperspace, Gemini/Groq/Cerebras/OpenRouter/HF — zero VERIFIED/WIRED). B thesis = parallel pool of thin free tiers, keys in visitor-local kv, 2x all-in bar (B5), one-account-per-provider ToS. Free-tier hostile to exactly this workload: timeouts/queues/cold-starts/DATA-IN transfer (B1 R5), long checkpoint-heavy RL loops worst of all.
- Verified just now: congmnguyen/pytorch-training body_md via skillmd API = pure markdown conventions+debug checklist, zero runtime. So the cut mixed two things: (a) RUNTIME (needs Python/GPU — stays cut for shipped scope), (b) INSTRUCTIONS (KB of text, needs no compute to read).
- OVERRIDE (mine, partial accept): shipped-port cut STANDS (no Python runtime in W1/W2 — reviewers right, visitors run keyless browsers). Re-admit narrow slice as B-DEPENDENT agent-side instructions, NOT A4 shipped: pytorch-training checklist + sparse-autoencoder/pyvene concept notes as text-only SKILL candidates, usable by me now, GPU runs only after B4 wired + B5 2x bar. Nemo-RL stays fully cut (cluster-scale, free-tier hostile). Track B changes WHERE survivors live (agent-side behind B), never whether visitors run them.

## Wave 17 pull (2026-11-10, user: pull what you want + explain/credit in H)
- Second-check done first: own websearch skill already covers keyargo (SKIP-redundant; keyargo body also Custodian-wrapped = Framework).
- Fetched 20 bodies via skillmd API + 2 github raws (eval-harness, webapp-testing). Flag audit: pdf "secret" = sandbox guidance (benign); HF bearer = gated/private only (public reads keyless) — HF viewer still API-class/caution, DEFERRED post-B3 with note; transformers-js full+browser-runnable but NO named gap, DEFERRED (revisit if nursery targets browser inference).
- STOLEN x18 as src/tools/*/SKILL.md with P1 frontmatter + provenance (what/why per file): eval-harness, project-evals, benchmark (G4); paper-compile, latex-workflow (MIT), pdf-processing (G5/pipeline); research sweep (papers.md); webapp-testing, playwright-expert (MIT) (lab harness); dataset-datasheet, jupyter-notebook (G4 repro); context-compression (hygiene, G1-adjacent); tutor-skills, beautiful-prose (sickn33 substantive variant; SHADOWPR0 original, rootcastleco stub noted); taste-skill (alunadev, pass verdict; Leonxlnx original 404); B-DEPENDENT: pytorch-training, sparse-autoencoder-training (MIT), pyvene-notes (MIT).
- NOT vendored (recorded): keyargo (redundant), storm-research + memory-systems (dedupe picks), transformers-js + huggingface-datasets (no-gap / API-deferred), trailofbits/static-analysis + Leonxlnx/taste (raw 404, no body). storm/memory-systems/HF/transformers bodies banked in scratch/steal/wants/.
- Revert: delete listed dirs + Appendix H block. Guard snapshot: quickSelfTest learned:true + quickAttnTest ok:true post-refresh, Appendix H 24 blurbs counted in DOM, console clean.
- Appendix H: 15 -> 24 blurbs (9 grouped, links to github upstream or skillmd).

## Wave 18 skills trials (2026-11-10, user: try them out — paper in index.html + skills)
Artifacts: scratch/steal/trials/T1-T16 (16 files). Guards green throughout (quickSelfTest learned:true + quickAttnTest ok:true).
- USED live: beautiful-prose (T1: §5 rewrite passes lint; original fails it — 3 em dashes), paper-compile verify (T2: CLEAN 0 TODO/FIXME/XXX/UNCONFIRMED, 3 tables/3 canvas/56 dict-links), eval-harness (T3: seeder-integration EDD filed, code graders), project-evals style (T4: URL-apply 2/2 PASS live), benchmark Mode 4 (T5: appendixH 15->24 PASS), dataset-datasheet (T7: assoc-recall sheet filed), tutor-skills vault-lite (T8: §3.3 note + 8 Qs), taste-skill (T9: read editorial V6/M4/D3, 1 PASS + 2 flags to G5), webapp-testing recon (T10: H24 + hero + guards PASS), playwright-expert pollFor (T11: helper demoed live, replaces ad-hoc waits), pdf-processing (T15: pdf.js + blob-worker shim extracts 37pp Huginn PDF, 9608 chars pp1-2 — reusable recipe).
- Procedure-USED, toolchain-adapted: research sweep (T6: all channels ERROR — fetch_url outage + DDG/arxiv blocked from worker; reported per exit criteria, no empty report; tome package = Framework-note), context-compression (T13: v1 summary kept 1/8 probes — the skill caught it; v2 5/7 fair, misses named not silent. Checklist works).
- Readiness-only (no target in repo): jupyter-notebook (T12: conventions already match via guards/waves; notebook DEFERRED), latex-workflow (T14: IMRaD maps cleanly; figure-export gap noted — canvas->PNG for \includegraphics).
- Parked per gate: pytorch-training / SAE / pyvene (T16: first-use triggers named, no runs).
- Environment findings: GitHub PAT revoked post-push (401 Bad credentials — pushes need fresh PAT); fetch_url tool outage this session (worker-fetch partial: arxiv PDF OK, DDG/arxiv-API blocked).

## Wave 19 seeder wiring (2026-11-11, user: do it)
- Vendored string-seed core to src/tinynn/seeded.js (xfnv1a + stream from seeder-plugin; no $output wrapper, no Math.random hijack, no network). Numeric seeds use legacy mulberry32 bit-identically; strings hash then stream. Exposed as T.makeSeededRng/stringToSeed/parseSeed.
- Wired: trainModel/trainPCGrad/adapt/logRegTrain via rngFromSeed (numeric adapt offset +50 preserved); lab seed box (default 7) + ?seed= in copy/URL-apply + seed in run report + session carry to adapt; Appendix H blurb updated.
- Verified live: makeSeededRng(7) == makeRng(7) sequences; "milo"x2 identical curves (60-step parity6), 7x2 identical, str!=num; quickSelfTest learned:true + quickAttnTest ok:true post-wiring.
## Wave 20 Track A close-out (2026-11-11, user: do the rest)
- Samplers: weightedPick/sampleUntil/stableIndex + SURPRISE list vendored to src/tinynn/seeded.js (pure, seeded; plugin semantics without Perchance lists); bridged to window.TinyNN export (Wave-19 bug: seeded fns lived only on __tinyNN while lab used TinyNN — dice silently no-op'd; fixed + verified).
- Wired visible: 🎲 lucky-dip (weighted word ≠ current, retry-until capped 12, status reports draws) + 🔐 seed lock (locked value wins over URL-apply reassert + disabled box; unlock restores). Verified live: milo→moss 1 draw; lock at X, overwrite attempt reasserts X; unlock clean.
- G5 polish (taste flags): .dict-link.term now tertiary (transparent + dotted underline); Appendix H 24 blurbs grouped under 4 headers (7/4/3/10 = 24 verified in DOM).
- Figure export: download loss/curve PNG buttons (toDataURL, filenames carry seed; verified data URLs). Closes latex figure-export gap mechanically.
- T6 retry: egress recovered — DDG 10 hits, 2 primaries read (DreamingGoose staged-distillation lineage; hint-distill closest analogue, KL self-distill, no fading). Verdict: no exact prior, nothing contradicts. Report: scratch/steal/trials/T6-retry-report.md.
- Guards green throughout (quickSelfTest learned:true + quickAttnTest ok:true).
- A-boxes: A1 census DONE (74 audited) / A2 triage DONE (G1-G5 wants) / A3 mine DONE (github lists + 4 marts) / A3b filter DONE (Logic/API/Framework + ≤100KB) / A4 ports DONE (19 imports + 18 skills + seeded vendor) / A5 bar DONE (each STOLEN names feature or bench move; cuts recorded). Remainder is B-gated (Track B) or no-gap HOLD by design.
- Revert: Wave 19 revert + delete 🎲/🔐/export wiring + H groups (single commit each). Guard snapshot: self learned:true + attn ok:true (this entry).
