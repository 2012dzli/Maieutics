# Track B — borrowed-capability scaffolding

Thesis: individually thin free tiers, drawn from as a POOL in parallel, beat a
single laptop and might pack real power. The scaffolding exists to manage free
resources we leverage online: slow ones run side-by-side (never in series —
the slowest tier must never gate the rest), banned/lost accounts rotate out
and the next source rotates in. Preference: no-card persistent tiers first,
expiring credits second (credits get spent first once held). Status ladder per
source: CLAIM (roundup numbers) → VERIFIED (opened/tested by us) → WIRED (in use).

## Subpoints (in order)
- [ ] B1. Pin the free-GPU numbers CLAIM→VERIFIED: Kaggle (~30 GPU-h/wk, weekly
  quota), Colab free (no fixed allowance — map the real daily/runtime limits),
  HF ZeroGPU (daily minutes), Lightning (starting credits?), Paperspace (6h
  sessions, capacity gates). Sources: gpupicks free-gpu-cloud, aimultiple
  free-cloud-gpu, clusy colab-vs-kaggle 2026. One row per source: quota, reset,
  hardware, catch. Plus a DATA-IN column (refinement R5): MB upload per task —
  sources needing heavy data movement are derated regardless of GPU speed
  (transfer latency kills the wall-time bar faster than slow compute). Plus a ToS line per source (added after red-team C5:
  automation + account rules — ONE ordinary account per provider (R2: not per
  quota unit, no identity farming); rotation is across SOURCES, never multiple
  accounts on one provider (that is ban-evasion); a banned source is a dead
  source).
- [ ] B2. Pin the free-LLM numbers CLAIM→VERIFIED: Gemini AI Studio (15 RPM, 1M
  tok/day claimed), Groq (30 RPM / 14.4k req/day claimed, no card), Cerebras
  (limits unknown), OpenRouter $0 models (which models, caps?), HF inference.
  Sources: openrouter.ai free-llm-apis-compared, opengpuradar top-free-llm-apis.
  Record RPM/RPD/tokens-per-day/context/data-use per source. Same ToS line as B1.
- [ ] B2b. Heartbeat (added after critique C2, refined R2): free tiers fail
  silently (unannounced quota changes, transient 429s). Two-tier, polite —
  the probe must never BE the ban (R2): (1) liveness ping (~5 requests,
  on-demand before a batch + daily re-verify); (2) 50-burst only where the
  ToS/limits allow, spaced. Record ACTUAL latency + failure rate + TAIL (p99)
  + COLD-START first-request latency (R2: cold-boot kills short tasks — route
  short tasks to warm sources). Triggers: heartbeat is scheduled health,
  circuit-breaker is the reactive trip; a trip forces re-verify before
  readmission. Flaky or long-tailed sources get derated or dropped.
- [ ] B3. Design the pool router on paper first (user correction: PARALLEL pool,
  never a series chain; final result is a scaffolding TOOL that dials out
  itself — the traffic cop reaches out and opens new connections at runtime:
  probe, handshake, add/drop providers, not just a static list): interleave providers by RPM cap, queue + backoff,
  expiring credits spent before persistent tiers, quotas mapped 1:1 onto
  consult coins. NO RUNTIME COIN MARKET (refinement R6, 6/6 SIMPLIFY: the router
  is a health-checked priority list, NOT a bank — the accountant costs more
  than the calls). Static priority queue, fastest→slowest→floor; heartbeat is
  LIVENESS only. Coins survive as the BUDGET unit (post-mortem spend log for
  the nursery's allowance, per-provider static weights set at design from
  heartbeat throughput — effective tokens/sec — and revised by hand when
  heartbeat drift shows, never auto-repriced). Per-call TOKEN CEILINGS stay
  (hard caps; hedge spend counts). The ROUTER holds the balances + rotation
  list (R2: spend logged in round notes, keys in local per-user kv at runtime, never repo/scratch). Slow sources run side-by-side with fast ones — tail latency is shed,
  not waited on: HEDGE after T ms (T from heartbeat p50 + jitter, capped at 2
  concurrent hedges per provider — refinement R3: uncalibrated hedges ARE the
  429-cascade), take the first result, with failover, not stall-and-retry (R2).
  FLOOR (refinement R3, 2/6): an exhausted pool degrades, never hangs — local
  CPU (or Ollama where present) is the defined floor; degraded mode is a
  status, not a surprise. Floor triggers: pool exhausted OR any heartbeat
  stale >5min (refinement R5: stale data routes to the floor immediately, no
  gambling). WARM-SENTRY (refinement R7, 2/6 BREAK on cold-start: hedges
  don't save a 10s boot, they double the load): prioritized sources get cheap
  keep-alive pings within ToS limits; sources where keep-alive is banned or
  uneconomical are marked COLD-ONLY and take long tasks exclusively. Short
  tasks (wall-time < 2× a source's measured cold-start) never route to cold
  sources — the router would be slower than the floor by construction. GLOBAL HARD TIMEOUT (R5): the router returns within X seconds
  (X from heartbeat p99 at design) or force-drops to the floor — the visitor's
  browser never hangs, whatever the hedges are doing. Cold-start is breaker-exempt (R3): first-request-
  after-idle gets a warm-up allowance from the B2b cold-start column, never
  counts toward the 2-strike trip. Include a CIRCUIT BREAKER (critique C2: 2
  consecutive failures → blacklist provider for X minutes, no coin burn on
  dead endpoints, no 429 cascades) plus ROTATION (user rule: a banned/lost
  account is replaced by the next source, never mourned, never evaded — one
  human account each). Batch GPU split: Kaggle weekly hours for long runs,
  Colab interactive, ZeroGPU bursts.
- [ ] B4. Wire it as the scaffolding tool: AUTOMATED after a one-time paste
  (user correction: the tool holds the keys itself so it can dial out on its
  own — but keys live ONLY in the visitor's local per-user kv at runtime,
  never in repo/scratch, which are public; user pastes once, router uses them
  automatically from there, including opening new connections). Router as a small module the nursery (and the
  lab) can call. DECIDER TEST FIRST (refinement R6): static pool vs
  single-best-source vs CPU bench — if the static list can't win, the pool
  thesis is dead and no router complexity will save it; only then wire the
  full router. DATA HYGIENE (refinement R4): bench-synthetic data only to
  third-party tiers by default; anything user-private needs an explicit flag
  + justification (no training-set donations by accident). SMOKE FIRST
  (critique C4): a 1-minute deterministic task must pass through the chain
  before the first real bench run.
- [ ] B5. Bar: the wired chain must beat our reference h48 CPU bench runs (same task, host controlled within each comparison — cloud may beat local,
that is the point; "relative" means no absolute spec sheets) and the bar is
quantified (R2): NET ≥2× wall-time win — ALL-IN accounting (refinement R4:
task time INCLUDING router overhead (hedge/heartbeat) + cold-start amortized
per run; a 2× compute win eaten by 10× plumbing is a loss), OR the run is
otherwise infeasible (e.g. bigger model, longer sweep); else it stays a doc. consult-coins = per-topic time+tokens+human-minutes allowance; quotas map 1:1 onto it.

## Candidates (all CLAIM until B1/B2 verify)
GPU: Kaggle, Colab free, HF ZeroGPU, Lightning AI, Paperspace
(Buried: SageMaker Studio Lab — in transition per gpupicks.)
LLM: Gemini AI Studio, Groq, Cerebras, OpenRouter $0, HF inference, Ollama local (floor)

## Round 1 (2026-11-10): 2 searches, 16 results. Next: B1+B2 (fetch 2 comparison pages).
