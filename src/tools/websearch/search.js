// Agent web-search: runs inside execute_js (has `fs` + `tools`).
// Usage (agent): await tools.page_eval? No — run via execute_js with js arg,
// or paste body into execute_js. Set QUERY below or pass via globalThis.QUERY.
// Returns {query, results, savedTo}. Results also saved to scratch/search-<slug>.json.
const QUERY = (typeof globalThis.QUERY === "string" && globalThis.QUERY) || "recurrent depth latent reasoning Huginn";
const SAVETO = "scratch/search-ddg.html";
const OUTJSON = "scratch/search-results.json";

const q = encodeURIComponent(QUERY);
const fetched = await tools.fetch_url({ url: `https://html.duckduckgo.com/html/?q=${q}`, path: SAVETO });
if (!fetched.ok && fetched.error) return { query: QUERY, error: String(fetched.error), fetched };

const html = await fs.readTextFile(SAVETO);
const strip = (s) => s.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
const results = [];
const re = /class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
let m;
while ((m = re.exec(html)) !== null && results.length < 10) {
  const rawHref = m[1];
  const title = strip(m[2]);
  let url = rawHref;
  const uddg = rawHref.match(/[?&]uddg=([^&]+)/);
  try { if (uddg) url = decodeURIComponent(uddg[1]); } catch (e) {}
  results.push({ title, url });
}
// attach snippets in order
const reSn = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
const snips = [];
while ((m = reSn.exec(html)) !== null) snips.push(strip(m[1]));
for (let i = 0; i < results.length && i < snips.length; i++) results[i].snippet = snips[i];

await fs.writeTextFile(OUTJSON, JSON.stringify({ query: QUERY, results }, null, 2));
return { query: QUERY, count: results.length, results: results.slice(0, 8), savedTo: SAVETO, json: OUTJSON, status: fetched?.result?.status ?? fetched?.status };
