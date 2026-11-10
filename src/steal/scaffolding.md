# Track B — borrowed-capability scaffolding

Thesis: individually thin free tiers, daisy-chained, beat a single laptop and
might pack real power. Preference: no-card persistent tiers first, expiring
credits second (credits get spent first once held). Status ladder per source:
CLAIM (roundup numbers) → VERIFIED (opened/tested by us) → WIRED (in use).

## Subpoints (in order)
- [ ] B1. Pin the free-GPU numbers CLAIM→VERIFIED: Kaggle (~30 GPU-h/wk, weekly
  quota), Colab free (no fixed allowance — map the real daily/runtime limits),
  HF ZeroGPU (daily minutes), Lightning (starting credits?), Paperspace (6h
  sessions, capacity gates). Sources: gpupicks free-gpu-cloud, aimultiple
  free-cloud-gpu, clusy colab-vs-kaggle 2026. One row per source: quota, reset,
  hardware, catch.
- [ ] B2. Pin the free-LLM numbers CLAIM→VERIFIED: Gemini AI Studio (15 RPM, 1M
  tok/day claimed), Groq (30 RPM / 14.4k req/day claimed, no card), Cerebras
  (limits unknown), OpenRouter $0 models (which models, caps?), HF inference.
  Sources: openrouter.ai free-llm-apis-compared, opengpuradar top-free-llm-apis.
  Record RPM/RPD/tokens-per-day/context/data-use per source.
- [ ] B3. Design the daisy-chain router on paper first: interleave providers by
  RPM cap, queue + backoff, expiring credits spent before persistent tiers,
  quotas mapped 1:1 onto the gameplan's consult coins. Batch GPU split: Kaggle
  weekly hours for long runs, Colab interactive, ZeroGPU bursts.
- [ ] B4. Wire it: keys live with the user (never in repo/scratch — scratch is
  private but not secret-safe); router as a small module the nursery (and the
  lab) can call. First live test = one real bench run through the chain.
- [ ] B5. Bar: the wired chain must beat a single laptop on a real bench run
  (wall time or throughput) or it stays a doc.

## Candidates (all CLAIM until B1/B2 verify)
GPU: Kaggle, Colab free, HF ZeroGPU, Lightning AI, Paperspace
(Buried: SageMaker Studio Lab — in transition per gpupicks.)
LLM: Gemini AI Studio, Groq, Cerebras, OpenRouter $0, HF inference, Ollama local (floor)

## Round 1 (2026-11-10): 2 searches, 16 results. Next: B1+B2 (fetch 2 comparison pages).
