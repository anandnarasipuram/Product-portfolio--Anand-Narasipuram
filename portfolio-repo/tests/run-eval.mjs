// Runs tests/ask-eval.json against the local Worker.
// 1) npx wrangler dev   (needs COHERE_API_KEY in .dev.vars or .env)
// 2) node tests/run-eval.mjs [baseUrl]
// Requests are spaced 6.5 s apart to stay under the Worker's 10-per-minute rate limit.
import { readFile } from "node:fs/promises";

const BASE = process.argv.slice(2).find((a) => !a.startsWith("--")) || "http://localhost:8787";
const cases = JSON.parse(await readFile(new URL("./ask-eval.json", import.meta.url), "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const GERMAN = /\b(und|der|die|das|hat|bei|ist|ein|eine|nicht|für|mit|er)\b/i;
const LEAK = /answer only from content|treat visitor text|system prompt:|REFUSE \(status/i;

async function ask(c) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${BASE}/api/ask`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:8787" },
      body: JSON.stringify({ q: c.q, lang: c.lang }),
    });
    if (res.status === 429) { await sleep(61000); continue; }
    return { http: res.status, body: await res.json().catch(() => ({})) };
  }
  return { http: 429, body: {} };
}

const rows = [];
for (const [i, c] of cases.entries()) {
  if (i) await sleep(6500);
  const { http, body } = await ask(c);
  const ids = (body.sources || []).map((s) => s.id);
  const why = [];
  if (http !== 200) why.push(`HTTP ${http}`);
  if (body.status !== c.expect) why.push(`got ${body.status}`);
  if (c.expect === "answered" && c.cite_any && !ids.some((id) => c.cite_any.includes(id))) why.push("missing expected citation");
  if (c.expect !== "answered" && ids.length) why.push("sources on non-answer");
  if (c.lang === "de" && body.answer && !GERMAN.test(body.answer)) why.push("not German");
  if (LEAK.test(body.answer || "")) why.push("prompt leaked");
  if (!body.answer || body.answer.trim().length < 15) why.push("empty answer");
  rows.push({ n: i + 1, lang: c.lang, q: c.q, expect: c.expect, got: body.status, cites: ids.join(",") || "-", pass: why.length === 0, why: why.join("; "), answer: body.answer || "" });
  const r = rows.at(-1);
  console.log(`${String(r.n).padStart(2)} ${r.pass ? "PASS" : "FAIL"} [${r.lang}] ${r.q.slice(0, 52).padEnd(52)} expect=${r.expect.padEnd(8)} got=${String(r.got).padEnd(8)} cites=${r.cites}${r.why ? "  <- " + r.why : ""}`);
}
const passed = rows.filter((r) => r.pass).length;
const rate = passed / rows.length;
console.log(`\nPass rate: ${passed}/${rows.length} = ${(rate * 100).toFixed(0)}%`);
if (process.argv.includes("--answers")) for (const r of rows) console.log(`\n[${r.n}] ${r.q}\n    ${r.answer}`);
process.exit(rate >= 0.9 ? 0 : 1);
