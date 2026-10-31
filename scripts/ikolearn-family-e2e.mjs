// End-to-end checks for the parents & teachers view (/ikolearn/family) in a real browser, every /api call refused and
// counted (it must make none). A neutral learner ("Sam": Ocean Life, Astronomy, Music) is built in Node with the real
// model (scripts/fixtures/ikolearn-family-seed.mjs) and put in localStorage the way the app saves it.
// Checks: 0 calls, storage byte-for-byte unchanged (read-only), the same numbers as IkoFamily.summary, Where Next equal
// to the lesson's rule, cards drawn, tests, Copy summary and Print, the quiet link in the app, no overflow, no errors.
// Run: IKOLEARN_PW=<path to node_modules/playwright-core> node scripts/ikolearn-family-e2e.mjs [--shots DIR] [--tag dashboard] [--root public]
// Skips when IKOLEARN_PW is not set.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { seedFamily } from "./fixtures/ikolearn-family-seed.mjs";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const SHOTS = arg("--shots", ""), TAG = arg("--tag", "dashboard"), ROOT = path.resolve(arg("--root", "public"));
if (!process.env.IKOLEARN_PW) { console.log("ikolearn family e2e: skipped (set IKOLEARN_PW to a playwright-core folder)"); process.exit(0); }
const PW = await import(pathToFileURL(path.join(process.env.IKOLEARN_PW, "index.mjs")).href), { chromium } = PW; /* IKOLEARN_BROWSER=webkit|firefox runs the same checks in that engine */
const require = createRequire(import.meta.url);
const C = require("../public/ikolearn/cloud-model.js"), P = require("../public/ikolearn/orchestrator.js"), F = require("../public/ikolearn/family.js");

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p === "/ikolearn" || p === "/ikolearn/") p = "/ikolearn/index.html";
  if (p === "/ikolearn/family") p = "/ikolearn/family.html";
  if (p === "/ikolearn/privacy") p = "/ikolearn/privacy.html";
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}`;

let pass = 0;
const fails = [];
const ok = (c, name, d = "") => (c ? (pass += 1) : fails.push(`${name}${d ? ` -> ${d}` : ""}`));
const eq = (a, b, n) => ok(JSON.stringify(a) === JSON.stringify(b), n, `${JSON.stringify(a)} != ${JSON.stringify(b)}`);
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

const NOW = Date.now();
const SAVED = C.serialize(seedFamily(C, P, NOW));
const LESSONS = JSON.stringify({});
const expect = F.summary(C.deserialize(SAVED), { now: NOW });
/* the page builds its own summary on load (its own clock); same facts, so the copied text equals this one unless a day boundary passes */

const browser = await (process.env.IKOLEARN_BROWSER ? PW[process.env.IKOLEARN_BROWSER].launch() : chromium.launch({ executablePath: process.env.IKOLEARN_CHROME || "/usr/bin/google-chrome" }));

async function page(width, seeded) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 900 }, timezoneId: "America/Toronto", locale: "en-CA" });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
  const p = await ctx.newPage();
  p.setDefaultTimeout(6000);
  const errs = [], calls = [];
  p.on("pageerror", (e) => errs.push("pageerror " + e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await p.route("**/api/**", (route) => { calls.push(new URL(route.request().url()).pathname); return route.fulfill({ status: 503, contentType: "application/json", body: '{"ok":false,"reason":"off"}' }); });
  if (seeded) {
    await p.addInitScript(([cloud, lessons]) => {
      if (sessionStorage.getItem("seeded")) return;
      sessionStorage.setItem("seeded", "1");
      localStorage.setItem("ikolearn.v1.name", "Sam"); localStorage.setItem("ikolearn.v1.cloud", cloud); localStorage.setItem("ikolearn.v1.lessons", lessons);
      localStorage.setItem("ikolearn.v1.seen", JSON.stringify({ c: {}, ev: 0, h: { aboutCloud: 1, aboutLesson: 1, aboutDeck: 1, cloud: 1, card: 1, deck: 1 } }));
      localStorage.setItem("ikolearn.v1.thread", JSON.stringify([{ id: "m1", at: Date.now(), role: "model", local: true, text: "Welcome back, Sam." }]));
    }, [SAVED, LESSONS]);
  }
  return { ctx, p, errs, calls };
}
const storage = (p) => p.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } return o; });
const shot = async (p, name, full) => { if (SHOTS) { await p.waitForTimeout(200); await p.screenshot({ path: path.join(SHOTS, `${TAG}-${name}.png`), fullPage: Boolean(full) }); } };
const step = async (tag, name, fn) => { try { await fn(); } catch (e) { fails.push(`${tag}: ${name} threw -> ${String(e.message || e).split("\n")[0]}`); } };

for (const w of [390, 1280]) {
  const tag = String(w);
  /* 1. nobody has started on this device: a calm empty state, no tools, nothing written */
  await step(tag, "empty", async () => {
    const { ctx, p, errs, calls } = await page(w, false);
    await p.goto(BASE + "/ikolearn/family", { waitUntil: "networkidle" });
    const r = await p.evaluate(() => ({ h1: document.querySelector("h1").textContent, lede: document.querySelector(".fam-lede").textContent, tools: document.querySelector("#fam-tools").hidden, open: Boolean([...document.querySelectorAll("#fam a")].find((a) => a.getAttribute("href") === "/ikolearn/")), keys: localStorage.length }));
    ok(/^Nothing here yet/.test(r.lede) && r.h1 === "Learning so far" && r.tools && r.open, `${tag}: empty state is calm, with a way into IkoLearn and no tools`, JSON.stringify(r));
    ok(r.keys === 0, `${tag}: the empty view writes nothing to storage`);
    ok(calls.length === 0 && errs.length === 0, `${tag}: empty view: 0 calls, no errors`, calls.concat(errs).join(" | "));
    await shot(p, `${w}-empty`);
    await ctx.close();
  });

  /* 2. the seeded learner */
  await step(tag, "seeded", async () => {
    const { ctx, p, errs, calls } = await page(w, true);
    await p.goto(BASE + "/ikolearn/family", { waitUntil: "networkidle" });
    const before = await storage(p);
    await p.reload({ waitUntil: "networkidle" });
    const r = await p.evaluate(() => {
      const t = (q) => [...document.querySelectorAll(q)].map((e) => e.textContent.trim());
      const C = window.IkoCloud, P = window.IkoPlan, c = C.deserialize(localStorage.getItem("ikolearn.v1.cloud"));
      const anchor = c.active, wn = P.whereNext(c, anchor, P.nextStep(c, anchor)).choices.map((x) => c.nodes[x.id].label);
      return {
        h1: document.querySelector("h1").textContent, kicker: document.querySelector(".fam-kicker").textContent, lede: document.querySelector(".fam-lede").textContent,
        sections: t(".fam-sec h2"), subjects: t("#fam-subjects ~ ul .fam-name, .fam-subject .fam-name"), counts: t(".fam-subject .fam-count"),
        next: [...document.querySelectorAll("section[aria-labelledby=fam-next] li .fam-name")].map((e) => e.textContent), wn,
        progress: t("section[aria-labelledby=fam-progress] li .fam-name"), recent: t("section[aria-labelledby=fam-recent] li .fam-name"),
        cards: document.querySelectorAll(".fam-deck .gcard").length, tests: t("section[aria-labelledby=fam-tests] li"),
        overflow: document.documentElement.scrollWidth - window.innerWidth, icons: document.querySelectorAll("#fam img, #fam svg:not(.gcard svg)").length,
        body: document.body.innerText,
      };
    });
    const after = await storage(p);
    ok(calls.length === 0, `${tag}: 0 network calls (no model calls)`, calls.join());
    eq(after, before, `${tag}: read-only: storage byte-for-byte unchanged after viewing`);
    ok(r.kicker === "For parents & teachers" && r.h1 === "Sam's learning", `${tag}: heading names the learner`, r.h1);
    ok(r.lede === expect.lede && /^Sam has explored \d+ topics across 3 subjects, earned \d+ cards and passed 1 test\.$/.test(r.lede), `${tag}: one encouraging line, from the counts`, r.lede);
    eq(r.sections, ["Subjects", "Where next", "In progress", "Recent lessons", "Cards in the Deck", "Tests"], `${tag}: sections in a calm order`);
    eq(r.subjects, expect.subjects.map((s) => s.label), `${tag}: subjects, as the model counts them`);
    ok(["Ocean Life", "Astronomy", "Music"].every((s) => r.subjects.includes(s)), `${tag}: all three subjects shown`);
    eq(r.counts, expect.subjects.map((s) => `${s.covered} of ${s.known} covered`), `${tag}: covered of known per subject`);
    eq(r.next, r.wn, `${tag}: Where Next = the lesson's own rule (whereNext + nextStep) from the last topic`);
    ok(r.next[0] === "Star Maps", `${tag}: Where Next continues the path first`, r.next.join());
    eq(r.progress, expect.progress.map((x) => x.label), `${tag}: in progress, newest first`);
    eq(r.recent, expect.recent.map((x) => x.label), `${tag}: recent lessons, newest first`);
    ok(r.cards === Math.min(3, expect.cards.total) && r.cards === 3, `${tag}: the three strongest cards drawn`, String(r.cards));
    ok(r.tests.some((x) => /^Coral Reefs\s*passed · best 80%$/.test(x)) && r.tests.some((x) => /ready to take/.test(x)), `${tag}: tests: passed (best %) and ready to take`, r.tests.join(" | "));
    ok(r.overflow <= 0, `${tag}: no horizontal overflow`, String(r.overflow));
    ok(r.icons === 0, `${tag}: no icons or images besides the cards`);
    ok(!/\b(grade|score card|behind|ahead of|percentile|age|years old|curriculum|standard)\b/i.test(r.body.replace(/best \d+%/g, "")), `${tag}: universal, gentle wording (no grades, ages or frameworks)`);
    ok(/about \d+ (hour|minute)/i.test(r.body) && /worked on in the last 7 days/.test(r.body), `${tag}: time with lessons open, from the stored minutes`);
    await shot(p, `${w}-top`);
    await shot(p, `${w}-full`, true);
    /* Copy summary and Print */
    await p.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed += 1; }; });
    await p.click("#fam-copy");
    await p.waitForFunction(() => document.querySelector("#fam-status").textContent.length > 0);
    const copied = await p.evaluate(() => navigator.clipboard.readText().catch(() => ""));
    const status = await p.textContent("#fam-status");
    ok(status === "Summary copied." && /^IkoLearn summary for Sam, /.test(copied) && copied.split("\n").slice(1).join("\n") === F.text(expect).split("\n").slice(1).join("\n"), `${tag}: Copy summary puts the plain-text summary on the clipboard`, status + "\n" + copied);
    await p.click("#fam-print");
    ok(await p.evaluate(() => window.__printed === 1), `${tag}: Print opens the print dialog`);
    await p.emulateMedia({ media: "print" });
    const hidden = await p.evaluate(() => ["#fam-tools", ".fam-back"].every((q) => getComputedStyle(document.querySelector(q)).display === "none"));
    ok(hidden, `${tag}: print hides the buttons and the back link`);
    if (w === 1280) await shot(p, "print-1280", true);
    await p.emulateMedia({ media: "screen" });
    ok(errs.length === 0, `${tag}: no console errors`, errs.join(" | "));
    ok(calls.length === 0, `${tag}: still 0 calls after copy and print`);
    await ctx.close();
  });

  /* 3. the quiet link from the app, and the app still opens as before */
  await step(tag, "link", async () => {
    const { ctx, p, errs, calls } = await page(w, true);
    await p.goto(BASE + "/ikolearn", { waitUntil: "networkidle" });
    /* the app opens on the cloud (home): the link is in its fine print (and in the chat's footer line) */
    await p.waitForSelector("#cloud:not([hidden])");
    const link = p.locator('.cloud-foot a[href="/ikolearn/family"]');
    ok(await link.isVisible() && (await link.textContent()) === "For parents & teachers" && (await p.textContent("#family-link")) === "For parents & teachers", `${tag}: a small "For parents & teachers" link in the cloud's fine print (and the chat's footer line)`);
    if (SHOTS && w === 390) { await link.scrollIntoViewIfNeeded(); await shot(p, "390-link"); }
    const n0 = calls.length; /* the app itself may fetch its shared examples; the view must add nothing */
    await link.click();
    await p.waitForURL(/\/ikolearn\/family$/);
    await p.waitForLoadState("networkidle");
    ok(calls.length === n0, `${tag}: the view opened from the app makes 0 calls`, calls.slice(n0).join());
    ok((await p.textContent("h1")) === "Sam's learning", `${tag}: the link opens the view for this learner`);
    await p.click("text=Back to IkoLearn");
    await p.waitForSelector("#cloud:not([hidden])"); /* back home: the cloud */
    ok(errs.length === 0, `${tag}: app + view: no console errors`, errs.join(" | "));
    await ctx.close();
  });
}
await browser.close();
server.close();
if (SHOTS) console.log("screenshots:", fs.readdirSync(SHOTS).filter((f) => f.startsWith(`${TAG}-`)).join(", "));
if (fails.length) { console.error(`ikolearn family e2e: ${pass} passed, ${fails.length} FAILED`); for (const f of fails) console.error("  x " + f); process.exit(1); }
console.log(`ikolearn family e2e: ${pass} passed`);
