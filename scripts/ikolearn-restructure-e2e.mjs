// End-to-end checks for tidying the cloud (PR 120), in a real browser on a phone (390x844, real touch), every
// /api/ikolearn call mocked. A seeded cloud with 8 topics loose under one subject is tidied from the name card's
// Preferences ("Tidy my cloud"): two grouping branches appear, nodes glide to their new places, Iko says one calm line
// with Undo, taps on the name and on moved nodes still open their cards, and Undo restores the previous tree.
// Run: IKOLEARN_PW=<path to node_modules/playwright-core> node scripts/ikolearn-restructure-e2e.mjs [--root public] [--shots dir]
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const ROOT = path.resolve(arg("--root", "public")), SHOTS = arg("--shots", "");
if (!process.env.IKOLEARN_PW) { console.log("ikolearn mobile e2e: skipped (set IKOLEARN_PW to a playwright-core folder)"); process.exit(0); }
const PW = await import(pathToFileURL(path.join(process.env.IKOLEARN_PW, "index.mjs")).href), { chromium } = PW; /* IKOLEARN_BROWSER=webkit|firefox runs the same checks in that engine */
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p === "/ikolearn" || p === "/ikolearn/") p = "/ikolearn/index.html";
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
/* PR 108: Iko's first step at the opening asks the optional age range; most checks skip it (the adapt suite covers it) */
const skipAge = async (p) => { try { await p.waitForSelector("#cs-age-skip", { timeout: 4000 }); await p.click("#cs-age-skip"); await p.waitForTimeout(150); } catch { /* no age step here */ } };
const browser = await (process.env.IKOLEARN_BROWSER ? PW[process.env.IKOLEARN_BROWSER].launch() : chromium.launch({ executablePath: process.env.IKOLEARN_CHROME || "/usr/bin/google-chrome" }));
/* a visualViewport the test can shrink, as an on-screen keyboard would */
const HOOK = () => {
  let real; Object.defineProperty(window, "IkoCloudView", { configurable: true, get: () => real, set: (v) => { real = Object.assign({}, v, { create: (c, o) => { const view = v.create(c, o); (window.__views = window.__views || []).push({ id: c.id, view }); return view; } }); } }); /* PR 110: the cloud view, to find a node on screen */
  const vv = new EventTarget(); let kb = 0;
  Object.defineProperties(vv, { height: { get: () => window.innerHeight - kb }, width: { get: () => window.innerWidth }, offsetTop: { get: () => 0 }, offsetLeft: { get: () => 0 }, scale: { get: () => 1 } });
  window.__keyboard = (h) => { kb = h; vv.dispatchEvent(new Event("resize")); };
  Object.defineProperty(window, "visualViewport", { configurable: true, get: () => vv });
};
const nd = (rows) => rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
const kids = (n) => n.map((x, i) => ({ name: x, order: i + 1, score: 0.9 - i * 0.1, why: "A good first step", role: "core", blurb: x + " in plain words, one step at a time, for anyone." }));
const QS = [{ q: "What is a tide?", options: ["The sea rising and falling", "A fish", "A boat"], answer: 0 }];
const LESSON = nd([{ t: "start", model: "m" }, { t: "delta", text: "INTRO: A short look at this topic.\nEXPLAIN: One idea at a time." }, { t: "path", steps: [], next: "", choices: [], questions: QS, tricky: "Like a blanket pulled by a friend." }, { t: "done" }]);
const CHAT = nd([{ t: "start", model: "m" }, { t: "delta", text: "Happy to help with that. " }, { t: "delta", text: "Let's take it one small step at a time." }, { t: "cloud", topics: [], ghosts: [] }, { t: "done" }]);
const SUBS = [];
/* a seeded cloud: activity { label: { ago (days), done } }; the deck holds every opened card (finished ones too) */
const SEED = ({ subs, act, now }) => {
  const C = window.IkoCloud, T = now - 30 * 864e5, c = C.create("Maya", T);
  ["Coral Reefs", "Whales", "Tides", "Kelp", "Oak Trees", "Ferns", "Moss", "Rivers"].forEach((top, i) => C.applyCreate(c, { items: [{ node: { name: top, chain: ["Nature"] }, card: { title: top, blurb: top + " in plain words.", goal: "" }, children: [] }] }, { t: T + i * 1000 }));
  subs.forEach(([sub, top, k], i) => C.applyCreate(c, { items: [{ node: { name: top, chain: [sub] }, card: { title: top, blurb: top + " in plain words.", goal: "" }, children: k.map((x, j) => ({ name: x, order: j + 1, score: 0.8 - j * 0.1, why: "", role: "core", blurb: x + " in plain words, step by step." })) }] }, { t: T + i * 1000 }));
  const id = (l) => c.order.find((x) => c.nodes[x].label === l);
  Object.entries(act || {}).forEach(([l, a]) => { const n = c.nodes[id(l)]; const at = now - a.ago * 864e5; n.ghost = false; n.opened = true; n.engaged = 3; n.touched = at; n.spent = 600; if (a.done) { n.doneAt = at; n.mastery = 0.95; n.correct = 3; } if (!c.deck.some((e) => e.id === n.id)) c.deck.push({ id: n.id, label: n.label, subject: "", hue: "#7a5c3e", at, best: 0, chain: [], blurb: "", ach: 0, tb: 0, ml: 0, inn: null, co: [] }); });
  c.order.forEach((x) => { if (!c.nodes[x].blurb) c.nodes[x].blurb = c.nodes[x].label + " in plain words, a little at a time."; });
  c.profile.onboarded = T; c.profile.visits = 5; c.profile.lessonVisit = 5; c.profile.askedAt = now;
  localStorage.setItem("ikolearn.v1.name", "Maya"); localStorage.setItem("ikolearn.v1.cloud", C.serialize(c));
  localStorage.setItem("ikolearn.v1.seen", JSON.stringify({ c: {}, ev: 0, h: { aboutCloud: 1, aboutLesson: 1, aboutDeck: 1, cloud: 1, card: 1, chat: 1, draw: 1, iko: 1, grow: 1, deck: 1 } }));
  localStorage.setItem("ikolearn.v1.thread", JSON.stringify([{ id: "m1", at: T, role: "model", local: true, text: "Welcome back, Maya." }]));
};
async function boot(spec, touch) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: Boolean(touch), hasTouch: Boolean(touch), timezoneId: "America/Toronto" });
  const p = await ctx.newPage();
  p.setDefaultTimeout(8000);
  const errs = [], calls = [];
  p.on("pageerror", (e) => errs.push("pageerror " + e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await p.addInitScript(HOOK);
  await p.route("**/api/ikolearn/**", async (r) => {
    const at = new URL(r.request().url()).pathname.replace("/api/ikolearn", "");
    calls.push(at);
    if (at === "/examples") return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, examples: ["Stars", "Rain", "Games"], growth: ["Patience"] }) });
    if (at === "/lesson") return r.fulfill({ status: 200, contentType: "application/x-ndjson", body: LESSON });
    if (at === "/chat") return r.fulfill({ status: 200, contentType: "application/x-ndjson", body: CHAT });
    if (at === "/restructure") {
      const tree = JSON.parse(r.request().postData()).tree, id = (l) => (tree.find((x) => x.t === l) || {}).id, nat = id("Nature");
      const g = { "Coral Reefs": "g1", Whales: "g1", Tides: "g1", Kelp: "g1", "Oak Trees": "g2", Ferns: "g2", Moss: "g2" };
      const proposal = { groups: [{ key: "g1", title: "Ocean Life", parent: nat }, { key: "g2", title: "Forests", parent: nat }], moves: tree.map((x) => ({ id: x.id, parent: g[x.t] || x.p })) };
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, proposal }) });
    }
    if (at === "/create") {
      const it = { node: { name: "Rhythm", chain: ["Music"] }, card: { title: "Rhythm", blurb: "Rhythm in plain words.", goal: "" }, children: kids(["Beats", "Tempo"]) };
      return r.fulfill({ status: 200, contentType: "application/x-ndjson", body: nd([{ t: "item", item: it }, { t: "done", items: [it] }]) });
    }
    return r.fulfill({ status: 503, contentType: "application/json", body: '{"ok":false,"reason":"off"}' });
  });
  await p.goto(BASE + "/ikolearn"); await p.evaluate(SEED, { now: Date.now(), subs: SUBS, ...spec });
  await p.goto(BASE + "/ikolearn", { waitUntil: "networkidle" }); await p.waitForSelector("#cloud:not([hidden])"); await p.waitForTimeout(700);
  return { ctx, p, errs, calls };
}
{
  const { ctx, p, errs, calls } = await boot({}, true);
  const at = (label) => p.evaluate((l) => { const v = window.__views.filter((x) => x.id === "cloud-canvas").pop().view, C = window.IkoCloud, c = C.deserialize(localStorage.getItem("ikolearn.v1.cloud")), id = l === "root" ? "root" : c.order.find((x) => c.nodes[x].label === l), q = v.project(id), r = document.querySelector("#cloud-canvas").getBoundingClientRect(); return q && { x: r.left + q.x, y: r.top + q.y, on: document.elementFromPoint(r.left + q.x, r.top + q.y) === document.querySelector("#cloud-canvas") }; }, label);
  const card = () => p.evaluate(() => ({ open: !document.querySelector("#panel").hidden, title: document.querySelector("#p-title").textContent }));
  const shut = async () => { if (await p.isVisible("#p-close")) { await p.tap("#p-close"); await p.waitForTimeout(450); } };
  const tree = () => p.evaluate(() => { const C = window.IkoCloud, c = C.deserialize(localStorage.getItem("ikolearn.v1.cloud")); return Object.fromEntries(c.order.map((x) => [c.nodes[x].label, C.trail(c, x)])); });
  const tapAt = async (l) => { const a = await at(l); await p.touchscreen.tap(a.x, a.y); await p.waitForTimeout(500); return { a, c: await card() }; };
  try {
    const t0 = await tree();
    ok(t0.Whales === "Nature > Whales" && t0.Moss === "Nature > Moss", "seed: topics loose under their subject", JSON.stringify(t0));
    const r0 = await tapAt("root");
    ok(r0.c.open && r0.c.title === "Maya", "touch: the name opens its card", JSON.stringify(r0));
    const gb = await p.evaluate(() => { const r = document.querySelector("#hc-t-prefs").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await p.touchscreen.tap(gb.x, gb.y); await p.waitForTimeout(250);
    ok(await p.isVisible(".tidy-btn"), "prefs: Tidy my cloud is in the name card's Preferences");
    await p.locator(".tidy-btn").tap(); await p.waitForTimeout(400);
    const st = await p.textContent(".tidy-status");
    ok(/Related topics now sit together/.test(st), "prefs: the tidy reports back calmly", st);
    ok(calls.filter((x) => x === "/restructure").length === 1, "one restructure call", JSON.stringify(calls));
    const t1 = await tree();
    ok(t1.Whales === "Nature > Ocean Life > Whales" && t1.Ferns === "Nature > Forests > Ferns" && t1.Rivers === "Nature > Rivers", "tidied: topics re-nest under new branches", JSON.stringify(t1));
    const line = await p.evaluate(() => { const e = document.querySelector("#iko-line"); return { t: e.textContent, shown: !e.hidden, undo: Boolean(e.querySelector("button.iko-yes")) }; });
    ok(line.shown && /I tidied your cloud so related topics sit together\./.test(line.t) && line.undo, "Iko: one calm line with Undo", JSON.stringify(line));
    await shut(); await p.waitForTimeout(1500); /* the glide settles */
    if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, "restructured-cloud-390.png") }); }
    let tapped = 0;
    for (const l of ["root", "Whales", "Ocean Life", "Coral Reefs", "Tides", "Forests", "Ferns", "Moss", "Kelp"]) {
      const pre = await at(l);
      if (!pre || !pre.on || pre.x < 10 || pre.x > 380 || pre.y < 60 || pre.y > 800) continue; /* off screen at this angle */
      tapped += 1;
      const r = await tapAt(l);
      ok(r.a && r.a.on && r.c.open && r.c.title === (l === "root" ? "Maya" : l), `touch after tidy: a tap on ${l} opens its card`, JSON.stringify(r));
      await shut();
    }
    ok(tapped >= 4, "touch after tidy: the name and at least 3 moved or new nodes were tapped", String(tapped));
    const u = await p.evaluate(() => window.__ikoTidy.say());
    await p.locator("#iko-line button.iko-yes").tap({ force: true }); await p.waitForTimeout(1500);
    const t2 = await tree();
    ok(t2.Whales === "Nature > Whales" && !("Ocean Life" in t2) && !("Forests" in t2), "Undo: the previous tree comes back", JSON.stringify(t2));
    const r2 = await tapAt("Whales");
    ok(r2.c.open && r2.c.title === "Whales", "touch after Undo: taps still work", JSON.stringify(r2));
    ok(errs.length === 0, "restructure: no page errors", errs.join(" | "));
  } finally { await ctx.close(); }
}
await browser.close(); server.close();
console.log(`ikolearn restructure e2e: ${pass} passed${fails.length ? `, ${fails.length} FAILED` : ""}`);
fails.forEach((f) => console.log("  x " + f));
process.exit(fails.length ? 1 : 0);
