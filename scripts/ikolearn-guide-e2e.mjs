// End-to-end checks for "Who's learning?": learning for yourself (unchanged) or guiding other learners, each with their own
// cloud, Deck and progress, in a real browser with every /api call refused (nothing here may need the model).
// Covers: the welcome question, the self flow, a guide with 3 learners kept apart, switching, an existing v9 save becoming
// the first learner (no migration), Start over for one learner, switching modes later, and the dashboard overview.
// Run: IKOLEARN_PW=<path to node_modules/playwright-core> node scripts/ikolearn-guide-e2e.mjs [--shots DIR] [--root public]
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { seedFamily } from "./fixtures/ikolearn-family-seed.mjs";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const SHOTS = arg("--shots", ""), ROOT = path.resolve(arg("--root", "public"));
if (!process.env.IKOLEARN_PW) { console.log("ikolearn guide e2e: skipped (set IKOLEARN_PW to a playwright-core folder)"); process.exit(0); }
const { chromium } = await import(pathToFileURL(path.join(process.env.IKOLEARN_PW, "index.mjs")).href);
const require = createRequire(import.meta.url);
const C = require("../public/ikolearn/cloud-model.js"), P = require("../public/ikolearn/orchestrator.js");

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json" };
const PAGES = { "/ikolearn": "index", "/ikolearn/": "index", "/ikolearn/family": "family", "/ikolearn/learners": "learners", "/ikolearn/privacy": "privacy" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (PAGES[p]) p = `/ikolearn/${PAGES[p]}.html`;
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
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

/* Robin's learning (the neutral seed, renamed), and Sam's v9 save from before learners existed */
const NOW = Date.now();
const robinCloud = (() => { const c = seedFamily(C, P, NOW); c.name = "Robin"; return C.serialize(c); })();
const samCloud = C.serialize(seedFamily(C, P, NOW));
const browser = await chromium.launch({ executablePath: process.env.IKOLEARN_CHROME || "/usr/bin/google-chrome" });

async function open(width) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 900 }, timezoneId: "America/Toronto", locale: "en-CA" });
  const p = await ctx.newPage();
  p.setDefaultTimeout(6000);
  const errs = [], calls = [];
  p.on("pageerror", (e) => errs.push("pageerror " + e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  p.on("dialog", (d) => d.accept());
  await p.route("**/api/**", (route) => { calls.push(new URL(route.request().url()).pathname); return route.fulfill({ status: 503, contentType: "application/json", body: '{"ok":false,"reason":"off"}' }); });
  return { ctx, p, errs, calls };
}
const shot = async (p, name, full) => { if (SHOTS) { await p.waitForTimeout(250); await p.screenshot({ path: path.join(SHOTS, `guide-${name}.png`), fullPage: Boolean(full) }); } };
const step = async (tag, name, fn) => { try { await fn(); } catch (e) { fails.push(`${tag}: ${name} threw -> ${String(e.message || e).split("\n")[0]}`); } };
const ls = (p) => p.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } return o; });
const app = async (p) => { await p.goto(BASE + "/ikolearn/", { waitUntil: "networkidle" }); await p.waitForSelector("#chat:not([hidden])"); };
const liveCloud = (p) => p.evaluate(() => { const C = window.IkoCloud, c = C.deserialize(localStorage.getItem("ikolearn.v1.cloud")); return c ? { name: c.name, subjects: C.subjects(c).map((s) => s.label), topics: Object.values(c.nodes).filter((n) => !n.ghost).length, deck: (c.deck || []).length } : null; });
const ix = (p) => p.evaluate(() => JSON.parse(localStorage.getItem("ikolearn.v1.profiles") || "null"));

for (const w of [390, 1280]) {
  const tag = String(w);

  /* 1. the welcome asks first, with a quick tap; learning for yourself is the same name question as always */
  await step(tag, "self", async () => {
    const { ctx, p, errs, calls } = await open(w);
    await p.goto(BASE + "/ikolearn/", { waitUntil: "networkidle" });
    const q = await p.evaluate(() => ({ q: document.querySelector("#who-q").textContent, opts: [...document.querySelectorAll(".who-opt")].map((b) => b.textContent), form: document.querySelector("#name-form").hidden }));
    ok(q.q === "Who's learning?" && q.opts.join("|") === "Learning for yourself|Guiding other learners" && q.form, `${tag}: welcome: "Who's learning?" with two taps, the name waits`, JSON.stringify(q));
    await shot(p, `${w}-question`);
    await p.click("text=Learning for yourself");
    const f = await p.evaluate(() => ({ label: document.querySelector("#name-label").textContent, hint: document.querySelector("#name-hint").hidden, form: document.querySelector("#name-form").hidden, focus: document.activeElement.id }));
    ok(f.label === "What's your first name?" && f.hint && !f.form && f.focus === "name-in", `${tag}: yourself: the usual name question`, JSON.stringify(f));
    await p.fill("#name-in", "Ari");
    await p.click("#name-form button[type=submit]");
    await p.waitForSelector("#chat:not([hidden])");
    const s = await p.evaluate(() => ({ who: document.querySelector("#who-now").hidden, first: (document.querySelector("#thread") || {}).innerText || "" }));
    const i = await ix(p);
    ok(s.who && i && i.mode === "self" && i.list.length === 1 && i.list[0].name === "Ari", `${tag}: yourself: no switcher, one learner`, JSON.stringify(i));
    ok(/Ari/.test(s.first) && /Let's begin making a learning path together/.test(s.first), `${tag}: yourself: the same opening as before`, s.first.slice(0, 120));
    ok(calls.every((c) => c === "/api/ikolearn/examples"), `${tag}: yourself: no calls beyond the shared examples (as before)`, calls.join());
    ok(errs.length === 0, `${tag}: yourself: no console errors`, errs.join(" | "));
    await ctx.close();
  });

  /* 2. a guide with three learners, kept apart; switching; the dashboard overview; modes; Start over for one */
  await step(tag, "guide", async () => {
    const { ctx, p, errs, calls } = await open(w);
    await p.goto(BASE + "/ikolearn/", { waitUntil: "networkidle" });
    await p.click("text=Guiding other learners");
    const f = await p.evaluate(() => ({ label: document.querySelector("#name-label").textContent, hint: document.querySelector("#name-hint").hidden }));
    ok(f.label === "Your first learner's first name" && !f.hint, `${tag}: guide: names their first learner`, JSON.stringify(f));
    await shot(p, `${w}-guide-name`);
    await p.fill("#name-in", "Robin");
    await p.click("#name-form button[type=submit]");
    await p.waitForSelector("#chat:not([hidden])");
    ok((await p.textContent("#who-now")) === "Robin · switch" && await p.isVisible("#who-now"), `${tag}: guide: a quiet switcher by the brand`);
    /* home: the guide lands on the active learner's cloud, with the learner's name in the centre and the switcher on it */
    const home = await p.evaluate(() => ({ cloud: !document.querySelector("#cloud").hidden, who: document.querySelector("#cloud-who").hidden ? "" : document.querySelector("#cloud-who").textContent, start: !document.querySelector("#cloud-start").hidden, lede: document.querySelector("#cs-hi").textContent }));
    ok(home.cloud && home.who === "Robin · switch" && home.start && /^Hi Robin\. Let's begin your learning cloud together\.$/.test(home.lede), `${tag}: guide: lands on Robin's cloud (her name in the centre, a quiet start, the switcher)`, JSON.stringify(home));
    await shot(p, `${w}-guide-home`);
    // Robin learns (the seeded learning, as the app would have saved it)
    await p.evaluate((c) => localStorage.setItem("ikolearn.v1.cloud", c), robinCloud);
    await app(p);
    const r0 = await liveCloud(p);
    ok(r0.name === "Robin" && r0.subjects.length === 3 && r0.deck === 10, `${tag}: Robin's own cloud and Deck`, JSON.stringify(r0));
    // add Kai and Noor from the Learners page
    await p.click("#cloud-who"); /* the switcher on the cloud (home) */
    await p.waitForURL(/\/ikolearn\/learners$/);
    for (const n of ["Kai", "Noor"]) {
      if (!/learners$/.test(p.url())) { await p.goto(BASE + "/ikolearn/learners", { waitUntil: "networkidle" }); }
      if (n === "Noor") await shot(p, `${w}-learners`);
      await p.fill("#lrn-name", n);
      await p.click(".lrn-add button[type=submit]");
      await p.waitForSelector("#chat:not([hidden])");
      const c = await liveCloud(p);
      ok(!(await p.isHidden("#cloud")) && (await p.textContent("#cloud-who")) === n + " · switch" && (await p.textContent("#who-now")) === n + " · switch" && c.subjects.length === 0 && c.deck === 0 && c.name === n, `${tag}: ${n} starts fresh with their own first questions`, JSON.stringify(c));
      if (n === "Kai") { await shot(p, `${w}-switcher`); }
    }
    const thread = await p.evaluate(() => document.querySelector("#thread").innerText);
    ok(/Noor/.test(thread) && !/Robin/.test(thread), `${tag}: Noor's chat is her own`);
    // duplicates are refused quietly
    await p.goto(BASE + "/ikolearn/learners", { waitUntil: "networkidle" });
    await p.fill("#lrn-name", "kai"); await p.click(".lrn-add button[type=submit]");
    ok(/already a learner with that name/.test(await p.textContent(".lrn-add [role=status]")), `${tag}: no two learners with one name`);
    const names = await p.evaluate(() => [...document.querySelectorAll(".lrn-pick")].map((b) => b.textContent + (b.hasAttribute("aria-current") ? "*" : "")));
    ok(names.join() === "Robin,Kai,Noor*", `${tag}: Learners: all three, Noor learning now`, names.join());
    // switch back to Robin: her learning is exactly as it was
    await p.click(".lrn-pick[data-id=p1]");
    await p.waitForSelector("#chat:not([hidden])");
    const r1 = await liveCloud(p), live = await p.evaluate(() => localStorage.getItem("ikolearn.v1.cloud"));
    ok(r1.name === "Robin" && r1.subjects.join() === r0.subjects.join() && r1.deck === 10 && (await p.textContent("#who-now")) === "Robin · switch", `${tag}: switching back: Robin's cloud and Deck are hers`, JSON.stringify(r1));
    ok(C.deserialize(live).order.length === C.deserialize(robinCloud).order.length, `${tag}: Robin's saved cloud intact after two others learned`);
    const st = await ls(p);
    ok(C.deserialize(st["ikolearn.v1.p.p2.cloud"]).deck.length === 0 && C.deserialize(st["ikolearn.v1.p.p3.cloud"]).deck.length === 0 && !/Coral Reefs/.test(st["ikolearn.v1.p.p2.cloud"] + st["ikolearn.v1.p.p3.cloud"]), `${tag}: Kai and Noor share none of Robin's topics`);
    // the dashboard: an overview of everyone, each opening to their own view; read-only
    const before = await ls(p);
    await p.goto(BASE + "/ikolearn/family", { waitUntil: "networkidle" });
    const o = await p.evaluate(() => ({ h1: document.querySelector("h1").textContent, rows: [...document.querySelectorAll(".fam-learner")].map((li) => li.innerText.replace(/\s+/g, " ").trim()) }));
    ok(o.h1 === "Your learners" && o.rows.length === 3 && /^Robin learning now Robin has explored 10 topics across 3 subjects/.test(o.rows[0]) && /^Kai Hasn't started yet\.$/.test(o.rows[1]) && /^Noor Hasn't started yet\.$/.test(o.rows[2]), `${tag}: dashboard: one line per learner, from their own data`, JSON.stringify(o));
    await shot(p, `${w}-overview`);
    await p.click("a.fam-name:text('Robin')");
    await p.waitForURL(/learner=p1$/);
    ok((await p.textContent("h1")) === "Robin's learning" && await p.isVisible("#fam-all"), `${tag}: dashboard: a learner opens to their own view, with All learners`);
    await shot(p, `${w}-learner-view`);
    await p.click("#fam-all");
    await p.click("a.fam-name:text('Kai')");
    ok(/Nothing here yet/.test(await p.textContent(".fam-lede")), `${tag}: dashboard: Kai's own (empty) view`);
    const afterDash = await ls(p);
    ok(JSON.stringify(afterDash) === JSON.stringify(before), `${tag}: dashboard: viewing every learner changes nothing`);
    // modes later: back to learning for yourself (nobody lost), and back to guiding
    await p.goto(BASE + "/ikolearn/learners", { waitUntil: "networkidle" });
    await p.click("#lrn-self");
    await p.waitForSelector("#chat:not([hidden])");
    ok(await p.isHidden("#who-now") && (await liveCloud(p)).name === "Robin", `${tag}: switch to learning for yourself: Robin's view, no switcher`);
    await p.goto(BASE + "/ikolearn/learners", { waitUntil: "networkidle" });
    ok(/2 more saved on this device/.test(await p.textContent("#lrn")), `${tag}: the others stay saved`);
    await shot(p, `${w}-self-mode`);
    await p.click("#lrn-guide");
    ok((await p.evaluate(() => document.querySelectorAll(".lrn-pick").length)) === 3, `${tag}: back to guiding: all three again`);
    // Start over for Noor only
    await p.click(".lrn-pick[data-id=p3]");
    await p.waitForSelector("#chat:not([hidden])");
    await p.click("#iko"); await p.click("#iko-all"); /* Start over lives with Iko's fine print */
    await p.click("#reset");
    await p.waitForSelector("#chat:not([hidden])");
    const i2 = await ix(p), r2 = await liveCloud(p);
    ok(i2.list.map((x) => x.name).join() === "Robin,Kai" && r2.name === "Robin" && r2.deck === 10, `${tag}: Start over for Noor removes only Noor; Robin carries on`, JSON.stringify(i2));
    ok(calls.every((c) => c === "/api/ikolearn/examples"), `${tag}: guide: no calls beyond the shared examples`, calls.join());
    ok(errs.length === 0, `${tag}: guide: no console errors`, errs.join(" | "));
    await ctx.close();
  });

  /* 3. an existing v9 save: untouched, one learner, no question; becomes the first learner when a guide adds another */
  await step(tag, "migration", async () => {
    const { ctx, p, errs } = await open(w);
    await p.addInitScript((c) => { if (sessionStorage.getItem("s")) return; sessionStorage.setItem("s", "1"); localStorage.setItem("ikolearn.v1.name", "Sam"); localStorage.setItem("ikolearn.v1.cloud", c); localStorage.setItem("ikolearn.v1.seen", JSON.stringify({ c: {}, ev: 0, h: { cloud: 1, card: 1, deck: 1 } })); }, samCloud);
    await app(p);
    const s0 = await liveCloud(p), st0 = await ls(p);
    ok(await p.isHidden("#welcome") && await p.isHidden("#who-now") && !("ikolearn.v1.profiles" in st0) && s0.deck === 10, `${tag}: a v9 save opens as before (no question, no switcher, nothing new written)`);
    await p.goto(BASE + "/ikolearn/learners", { waitUntil: "networkidle" });
    ok(/Learning for yourself/.test(await p.textContent("h1")), `${tag}: Learners: a v9 save is "learning for yourself"`);
    await p.fill("#lrn-name", "Kai"); await p.click(".lrn-add button[type=submit]");
    await p.waitForSelector("#chat:not([hidden])");
    const st1 = await ls(p);
    ok(st1["ikolearn.v1.p.p1.cloud"] === st0["ikolearn.v1.cloud"] && st1["ikolearn.v1.p.p1.name"] === "Sam" && st1["ikolearn.v1.p.p1.seen"] === st0["ikolearn.v1.seen"], `${tag}: Sam's save is parked byte-for-byte`);
    await p.goto(BASE + "/ikolearn/learners", { waitUntil: "networkidle" });
    await p.click(".lrn-pick[data-id=p1]");
    await p.waitForSelector("#chat:not([hidden])");
    const s1 = await liveCloud(p);
    ok(s1.name === "Sam" && s1.deck === s0.deck && s1.subjects.join() === s0.subjects.join(), `${tag}: switching back: Sam exactly as before`);
    ok(errs.length === 0, `${tag}: migration: no console errors`, errs.join(" | "));
    await ctx.close();
  });
}
await browser.close();
server.close();
if (SHOTS) console.log("screenshots:", fs.readdirSync(SHOTS).filter((f) => f.startsWith("guide-")).join(", "));
if (fails.length) { console.error(`ikolearn guide e2e: ${pass} passed, ${fails.length} FAILED`); for (const f of fails) console.error("  x " + f); process.exit(1); }
console.log(`ikolearn guide e2e: ${pass} passed`);
