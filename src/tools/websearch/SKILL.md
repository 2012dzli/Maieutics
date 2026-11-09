# Web-search skill (agent-side, no key, no quota)

Use when latent-model work needs an external fact: paper, repo, baseline,
error message, API doc. Prefer primary sources (arxiv, github, hf, docs).

## Recipe (verified 2026-11-08)
1. Fetch `https://html.duckduckgo.com/html/?q=<encodeURIComponent(query)>`
   via `tools.fetch_url` to `scratch/search-ddg.html` (bypasses CORS).
   DDG html is ~35KB and parseable; Google html is ~530KB and brittle —
   use Google only as fallback.
2. Parse `scratch/search-ddg.html`:
   - titles/urls: `<a ... class="result__a" href="//duckduckgo.com/l/?uddg=<ENC>&rut=...">TITLE</a>`
     → real URL = `decodeURIComponent(ENC)`, title = strip tags.
   - snippet: following `<a class="result__snippet" ...>TEXT</a>` → strip tags.
3. Return top ~8 as `{title, url, snippet}`. Then `fetch_url` the 1–2 most
   promising urls to `scratch/` and grep/read them.
4. Rules: 1 search → read primary source, don't spiral. Cite the fetched URL
   in CHATLOG. Never put secrets in queries. `scratch/search-*.html` is
   throwaway; primary-source notes go in CHATLOG/README.

## Re-runnable script
`src/tools/websearch/search.js` — runs in `execute_js`
(`await tools.page_eval` style: it calls `tools.fetch_url` + `fs` itself).
Returns `{query, results: [{title, url, snippet}], savedTo}`.

## Dependencies

None. Standalone by design — `fresh-eyes` (armed rounds) and
`rabbithole` (primary-source fetches) both build on it.
