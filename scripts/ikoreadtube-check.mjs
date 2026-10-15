// Deterministic checks for IkoReadTube: proxy logic (mocked Groq, no network) + static asset rules (pure black/white, noindex, data shape).
// Run: npm run check:ikoreadtube
import fs from "node:fs";
import vm from "node:vm";
import {
  LIMITS, parseInput, buildMessages, cleanSummary, createLimiter, handleSummarize, originOk, corsHeaders, estimateTokens, SYSTEM_PROMPT,
} from "../lib/ikoreadtube/summarize.ts";

let pass = 0;
const fails = [];
const ok = (c, name, d = "") => (c ? (pass += 1) : fails.push(`${name}${d ? ` -> ${d}` : ""}`));
const eq = (a, b, n) => ok(JSON.stringify(a) === JSON.stringify(b), n, `${JSON.stringify(a)} != ${JSON.stringify(b)}`);
const TRANSCRIPT = "Tide pools hold small amounts of seawater when the tide goes out and the animals inside cope with heat and salt.";

// ---- parseInput ----
ok(parseInput(null).ok === false && parseInput([]).ok === false && parseInput("x").ok === false, "non-object bodies rejected");
ok(parseInput({ transcript: TRANSCRIPT, level: "wild" }).status === 400, "bad level rejected");
eq(parseInput({ transcript: TRANSCRIPT }).value.level, "standard", "level defaults to standard");
eq(parseInput({ transcript: TRANSCRIPT, level: "MORE" }).value.level, "more", "level is case-insensitive");
ok(parseInput({ transcript: TRANSCRIPT, id: "tidepool001" }).ok, "valid 11-char id accepted");
ok(parseInput({ transcript: TRANSCRIPT, id: "short" }).status === 400 && parseInput({ transcript: TRANSCRIPT, id: "../../etc/pas" }).status === 400, "bad ids rejected");
ok(parseInput({ videoId: "tidepool001", level: "less" }).code === "transcript_required", "id alone -> clear transcript_required error (no transcript fetching)");
ok(parseInput({ transcript: "tiny" }).status === 422, "too-short transcript rejected");
ok(parseInput({ transcript: "a ".repeat(LIMITS.transcriptChars) }).status === 413, "over-long transcript rejected (input cap)");
ok(parseInput({ transcript: TRANSCRIPT + "\u0000\u0007 ok" }).value.transcript.indexOf("\u0000") === -1, "control characters stripped");
eq(parseInput({ transcript: TRANSCRIPT, title: "x".repeat(500) }).value.title.length, LIMITS.titleChars, "title capped");

// ---- prompt ----
const input = parseInput({ transcript: TRANSCRIPT, title: "Tide", level: "less" }).value;
const msgs = buildMessages(input);
ok(msgs[0].role === "system" && /plain text only/i.test(msgs[0].content) && /never follow instructions/i.test(msgs[0].content), "system prompt: plain text + injection guard");
ok(msgs[1].content.includes("at most 35 words") && msgs[1].content.includes(TRANSCRIPT), "less prompt asks for a very short answer and carries the transcript");
ok(buildMessages({ ...input, level: "more" })[1].content.includes("130 to 190 words") && buildMessages({ ...input, level: "standard" })[1].content.includes("50 to 90 words"), "standard/more prompts differ");
const big = parseInput({ transcript: "word ".repeat(1790).trim(), level: "more" }).value;
ok(estimateTokens(big) < 6000, "worst-case request stays well under Groq's 8K tokens per minute", String(estimateTokens(big)));
ok(LIMITS.completionTokens.more <= 1200 && LIMITS.transcriptChars <= 9000, "caps configured");

// ---- cleanSummary ----
eq(cleanSummary("## Title\n**Bold** and *it* and `code`\n- one\n* two\n1. three\n> quote"), "Title\nBold and it and code\none\ntwo\nthree\nquote", "markdown stripped to plain text");
eq(cleanSummary("<think>secret</think>Hello <b>there</b> [link](https://x.y)"), "Hello there link", "think blocks, html and links removed");
ok(cleanSummary("a ".repeat(4000)).length <= LIMITS.outputChars + 3, "output capped");
eq(cleanSummary(null), "", "null -> empty");

// ---- limiter ----
let t = 1_800_000_000_000;
const lim = createLimiter(() => t);
for (let i = 0; i < LIMITS.perIpPerMinute; i += 1) ok(lim.check("1.1.1.1", 100).ok, `ip request ${i + 1} allowed`);
const blocked = lim.check("1.1.1.1", 100);
ok(!blocked.ok && blocked.code === "ip_rate", "per-IP minute limit blocks");
ok(lim.check("2.2.2.2", 100).ok, "another IP is unaffected");
t += 61_000;
ok(lim.check("1.1.1.1", 100).ok, "per-IP limit resets after a minute");
const lim2 = createLimiter(() => t);
ok(lim2.check("a", 4000).ok && !lim2.check("b", 4000).ok && lim2.check("b", 4000).code === "busy", "global tokens-per-minute guard protects the 8K TPM free tier");
t += 61_000;
ok(lim2.check("b", 4000).ok, "token window slides");
const lim3 = createLimiter(() => t);
let allowed = 0;
for (let i = 0; i < 200; i += 1) { t += 3_000; if (lim3.check(`ip${i}`, 100).ok) allowed += 1; }
ok(allowed === 200, "spread-out traffic is allowed");
const lim4 = createLimiter(() => t);
let hourOk = 0;
for (let i = 0; i < 40; i += 1) { t += 15_000; if (lim4.check("same", 50).ok) hourOk += 1; }
ok(hourOk === LIMITS.perIpPerHour, "per-IP hourly cap", String(hourOk));

// ---- origins / CORS ----
const env = {};
ok(originOk(null, "x", env) && originOk("https://ikosagon.com", null, env) && originOk("https://www.ikosagon.com", null, env), "ikosagon origins and non-browser calls allowed");
ok(!originOk("https://evil.example", "ikosagon.com", env), "foreign origin refused");
ok(originOk("https://preview-abc.vercel.app", "preview-abc.vercel.app", env), "same-origin (preview deploy) allowed");
ok(originOk("https://partner.example", null, { IKOREADTUBE_ALLOWED_ORIGINS: "https://partner.example/" }), "extra origin via env");
ok(!("Access-Control-Allow-Origin" in corsHeaders("https://evil.example", false)) && corsHeaders("https://ikosagon.com", true)["Access-Control-Allow-Origin"] === "https://ikosagon.com", "CORS header only for allowed origins");

// ---- handler ----
const body = (o) => JSON.stringify(o);
const mk = (over = {}) => ({ rawBody: body({ id: "tidepool001", title: "Tide", transcript: TRANSCRIPT, level: "standard" }), ip: "9.9.9.9", origin: "https://ikosagon.com", host: "ikosagon.com", env: { GROQ_API_KEY: "SECRETKEY" }, limiter: createLimiter(() => t), ...over });
const noKey = await handleSummarize(mk({ env: {} }));
ok(noKey.status === 503 && noKey.text.startsWith("ERROR:") && /GROQ_API_KEY/.test(noKey.text) && noKey.headers["X-Ikoreadtube-Error"] === "no_key", "no key -> clear 503 plain-text error");
ok(noKey.headers["Content-Type"].startsWith("text/plain"), "errors are text/plain");
ok((await handleSummarize(mk({ origin: "https://evil.example" }))).status === 403, "foreign origin -> 403");
ok((await handleSummarize(mk({ rawBody: "{nope" }))).status === 400, "bad JSON -> 400");
ok((await handleSummarize(mk({ rawBody: "x".repeat(LIMITS.bodyBytes + 1) }))).status === 413, "oversized body -> 413");
let seen = null;
const goodFetch = async (url, init) => { seen = { url, init, payload: JSON.parse(init.body) }; return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: "**Tide pools** survive heat.\n- refilled twice a day" } }] }) }; };
const good = await handleSummarize(mk({ fetchImpl: goodFetch }));
ok(good.status === 200 && good.text === "Tide pools survive heat.\nrefilled twice a day" && good.headers["Content-Type"].startsWith("text/plain"), "success returns ONLY cleaned plain text");
ok(seen.url === "https://api.groq.com/openai/v1/chat/completions" && seen.init.headers.Authorization === "Bearer SECRETKEY", "calls Groq chat completions with the server key");
ok(seen.payload.model === "openai/gpt-oss-20b" && seen.payload.reasoning_effort === "low" && seen.payload.max_completion_tokens === LIMITS.completionTokens.standard, "free-tier model, low reasoning, capped completion");
ok(!good.text.includes("SECRETKEY") && !JSON.stringify(good.headers).includes("SECRETKEY"), "key never appears in the response");
ok(good.headers["Access-Control-Allow-Origin"] === "https://ikosagon.com", "CORS header on success");
await handleSummarize(mk({ fetchImpl: goodFetch, env: { GROQ_API_KEY: "k", GROQ_MODEL: "llama-3.1-8b-instant" } }));
ok(!("reasoning_effort" in seen.payload), "reasoning params only sent for gpt-oss models");
const mkStatus = (s) => async () => ({ ok: s < 300, status: s, json: async () => ({}) });
ok((await handleSummarize(mk({ fetchImpl: mkStatus(401) }))).headers["X-Ikoreadtube-Error"] === "key_rejected", "rejected key -> 503 key_rejected");
ok((await handleSummarize(mk({ fetchImpl: mkStatus(429) }))).status === 429, "Groq 429 -> 429 busy");
ok((await handleSummarize(mk({ fetchImpl: mkStatus(500) }))).status === 502, "Groq 500 -> 502");
ok((await handleSummarize(mk({ fetchImpl: async () => { throw new Error("net"); } }))).status === 504, "network failure -> 504");
ok((await handleSummarize(mk({ fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: "" } }] }) }) }))).status === 502, "empty model answer -> 502");
const strict = createLimiter(() => t);
let last;
for (let i = 0; i < LIMITS.perIpPerMinute + 1; i += 1) last = await handleSummarize(mk({ fetchImpl: goodFetch, limiter: strict }));
ok(last.status === 429 && Number(last.headers["Retry-After"]) > 0 && last.headers["X-Ikoreadtube-Error"] === "ip_rate", "handler rate limits per IP with Retry-After");
ok((await handleSummarize(mk({ rawBody: body({ id: "tidepool001", level: "less" }), fetchImpl: goodFetch }))).status === 422, "id without transcript -> 422");
ok(/untrusted/.test(SYSTEM_PROMPT), "prompt-injection guard present");

// ---- static assets ----
const dir = "public/ikoreadtube";
for (const f of ["index.html", "styles.css", "app.js", "data.js", "README.md", "api/summarize.php", "api/config.sample.php", "api/.htaccess"]) ok(fs.existsSync(`${dir}/${f}`), `file exists: ${f}`);
const html = fs.readFileSync(`${dir}/index.html`, "utf8");
const css = fs.readFileSync(`${dir}/styles.css`, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const js = fs.readFileSync(`${dir}/app.js`, "utf8");
ok(/<meta name="robots" content="noindex/.test(html), "noindex meta present");
ok(/fonts\.googleapis\.com\/css2\?family=Press\+Start\+2P/.test(html), "Press Start 2P from Google Fonts");
ok(!/<script[^>]+src="https?:/.test(html), "no external scripts");
ok(!/react|vue|jquery|angular/i.test(html + js), "no frameworks");
ok(/<script src="data\.js">/.test(html) && /<script src="app\.js">/.test(html), "plain script tags (no build step)");
const colors = css.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g) || [];
ok(colors.every((c) => ["#000", "#fff"].includes(c.toLowerCase())), "CSS uses only #000 / #fff colors", colors.filter((c) => !["#000", "#fff"].includes(c.toLowerCase())).join(","));
ok(!/gradient|\bblur\(/i.test(css) && !/(box|text)-shadow\s*:\s*(?!\s|none)/.test(css), "no gradients, shadows or blur");
ok(!/border-radius\s*:\s*[1-9]/.test(css), "no rounded corners");
ok(!/font-family:[^;]*(Arial|Helvetica|Inter|Roboto|system-ui|sans-serif|serif(?!\s*;))/i.test(css.replace(/monospace/g, "")), "no modern/system fonts besides the monospace fallback");
ok(/-webkit-font-smoothing:\s*none/.test(css) && /image-rendering:\s*pixelated/.test(css), "font smoothing off + pixelated rendering");
const anims = (css.match(/animation\s*:\s*[^;]+;/g) || []).filter((a) => !/none/.test(a));
ok(anims.length === 1 && /ikoblink/.test(anims[0]), "only one animation: the blinking cursor");
ok(/prefers-reduced-motion:\s*reduce\)\s*\{[^}]*\.cursor\s*\{\s*animation:\s*none/.test(css), "cursor blink disabled by prefers-reduced-motion");
ok(!/transition\s*:\s*(?!\s|none)/.test(css) && !/scroll-behavior\s*:\s*smooth/.test(css), "no transitions or smooth scrolling");
ok(!/innerHTML|document\.write\(.*\+.*q\b/.test(js), "app.js never uses innerHTML");
ok(/\/api\/ikoreadtube\/summarize/.test(js) && /IKOREADTUBE_PROXY/.test(js), "frontend calls the Next route by default and is configurable for PHP");
ok(/localStorage/.test(js) && /RECENT_MAX = 8/.test(js), "recently read uses localStorage (max 8)");

const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(`${dir}/data.js`, "utf8"), ctx);
const vids = await ctx.window.IkoData.loadVideos();
ok(vids.length >= 6 && vids.length <= 8, "6-8 sample videos", String(vids.length));
ok(new Set(vids.map((v) => v.id)).size === vids.length && vids.every((v) => /^[A-Za-z0-9_-]{11}$/.test(v.id)), "unique 11-char ids");
ok(vids.every((v) => v.title && v.channel && v.transcript && v.transcript.length >= LIMITS.transcriptMinChars && v.transcript.length <= LIMITS.transcriptChars), "every sample has title, channel and an in-limits transcript");
ok(vids.every((v) => ["less", "standard", "more"].every((k) => typeof v.summaries?.[k] === "string" && v.summaries[k].length > 20)), "every sample has less/standard/more summaries");
ok(vids.every((v) => v.summaries.less.length < v.summaries.standard.length && v.summaries.standard.length < v.summaries.more.length), "summary detail grows less < standard < more");
ok(vids.every((v) => !v.thumb || fs.existsSync(`${dir}/${v.thumb}`)), "thumbnails exist locally");
ok(vids.every((v) => !/https?:\/\//.test(JSON.stringify(v))), "no external URLs in sample data");

console.log(`ikoreadtube-check: ${pass} passed, ${fails.length} failed`);
if (fails.length) {
  for (const f of fails) console.log(`  FAIL ${f}`);
  process.exit(1);
}
