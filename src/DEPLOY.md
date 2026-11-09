# Offline + cluster / EKS deployment

Rule: every perchance-only
dependency must have a non-perchance path or be optional — no exceptions.

This lab has **two backends** behind one seam (`window.TeachingLab.ask()` in `src/inference.js`):

| Backend | File | Needs | Cost per K | Scope |
|---|---|---|---|---|
| online | Perchance `root.generateText` | Perchance engine + network | K+1 LLM calls (tokens) | general questions |
| offline | `src/offline-solver.js` | nothing (static JS) | K local rounds, 0 tokens | built-in demo questions only |

## 1. Prove offline here (no deploy needed)
1. Open the generator, go to section 4.
2. Tick **force offline**.
3. Ask the bat-and-ball question with K=1 (expect the intuitive wrong answer, ~10c), then K=4 (expect the corrected 5c). Ask the capital of France with any K (always Paris — the paper's flatline pattern).
4. The log line says `[offline, zero network]`.

## 2. Laptop / air-gapped cluster node
Only these files matter offline:
- `index.html`
- `src/offline-solver.js`
- `src/inference.js`

Any static server works:
- `python3 -m http.server 8000` (from the folder containing `index.html`)
- nginx / Apache / S3+CloudFront / intranet file share.

`main.pjs` and `imports/` are Perchance-only and safely ignored offline
(the page self-heals the `[title]` template tag via JS).

## 3. EKS
1. `docker build -t latent-lab:offline .` (see `Dockerfile` — copies only `index.html` + `src/`).
2. Tag + push to ECR.
3. Edit `k8s/deployment.yaml` image, then `kubectl apply -f k8s/`.
4. CPU-only nodes are fine for the lab. Expose via your usual Ingress/ALB.

## 4. Full offline reasoning (open questions, no Perchance)
The bundled offline solver is intentionally narrow (demo subset). For open
questions without Perchance, run a model server and adapt the one seam:
- Option A (paper-faithful): Huginn 3.5B weights (`tomg-group-umd/huginn-0125`)
  under vLLM / text-generation-inference on a GPU node group, lab `fetch()`es it.
- Option B (cheap): Phase-2 tiny recurrent net (planned `src/tinynn/`), CPU-served.
- In both cases only `src/inference.js` changes; sections 1–3/5/6 stay static.

## 5. What to verify after any move
- Page loads with JS enabled and no console errors.
- Depth slider + orbit canvas animate (pure local JS).
- Section 4 in offline mode: K=1 vs K=4 differ on trick questions, identical on facts.
- No requests leave the box (devtools Network tab, apart from your model server if you added one).
