// End-to-end checks for the calmer intake and Iko, in a real browser, every /api/ikolearn call mocked (no model calls):
// the intake is one calm step under the name (one question, free text first, a few ideas only from the API's cached
// list, cycling with More); the grow question comes later, once, from Iko; Iko is a pebble on every screen but the whole
// conversation, opens its text field with the screen's context (sent in the chat request), opens with the prepared
// clarification on "Still tricky" (0 calls), and never covers the card, Where Next, the start or the fine print.
// Run: IKOLEARN_PW=<path to node_modules/playwright-core> node scripts/ikolearn-iko-e2e.mjs [--shots DIR] [--tag after] [--root public]
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const SHOTS = arg("--shots", ""), TAG = arg("--tag", "after"), ROOT = path.resolve(arg("--root", "public"));
if (!process.env.IKOLEARN_PW) { console.log("ikolearn home e2e: skipped (set IKOLEARN_PW to a playwright-core folder)"); process.exit(0); }
const { chromium } = await import(pathToFileURL(path.join(process.env.IKOLEARN_PW, "index.mjs")).href);
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p === "/ikolearn" || p === "/ikolearn/") p = "/ikolearn/index.html";
  if (p === "/ikolearn/learners") p = "/ikolearn/learners.html";
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const BASE = process.env.LIVE_BASE || `http://127.0.0.1:${server.address().port}`;
let pass = 0;
const fails = [];
const ok = (c, name, d = "") => (c ? (pass += 1) : fails.push(`${name}${d ? ` -> ${d}` : ""}`));
const browser = await chromium.launch({ executablePath: process.env.IKOLEARN_CHROME || "/usr/bin/google-chrome" });
const HOOK = () => { let real; Object.defineProperty(window, "IkoCloudView", { configurable: true, get: () => real, set: (v) => { real = Object.assign({}, v, { create: (c, o) => { const view = v.create(c, o); (window.__views = window.__views || []).push({ id: c.id, view }); return view; } }); } }); };

/* the mocked API. examples: the shared, cached list (the only source of the intake's ideas); off with ex: null */
const nd = (rows) => rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
const TRICKY = "Picture the ground as a thick warm quilt over a stove. Deep down it gets so hot that rock turns soft and runny, and that runny rock is magma.";
const LESSON = nd([{ t: "start", model: "m" }, { t: "delta", text: "INTRO: Magma is hot melted rock deep underground.\nEXPLAIN: When it comes out of a volcano, we call it lava.\nSTEP: It gathers in chambers under the volcano.\nEXAMPLE: Like thick soup bubbling in a pot." }, { t: "path", steps: [], next: "", choices: [], questions: [], tricky: TRICKY }, { t: "done" }]);
const kids = (n) => n.map((x, i) => ({ name: x, order: i + 1, score: 0.9 - i * 0.1, why: "A good first step", role: "core", blurb: x + " in plain words, one step at a time, for anyone." }));
const ITEMS = [
  { node: { name: "Ocean Life", chain: ["Nature"] }, card: { title: "Ocean Life", blurb: "Living things of the sea.", goal: "" }, children: kids(["Coral Reefs", "Whales", "Tides"]) },
  { node: { name: "Drawing", chain: ["Art"] }, card: { title: "Drawing", blurb: "Making pictures with lines.", goal: "" }, children: kids(["Shapes", "Shading", "Perspective"]) },
];
const GROW_ITEMS = [{ node: { name: "Patience", chain: ["Growing as a person"] }, card: { title: "Patience", blurb: "Staying calm while things take time.", goal: "" }, children: kids(["Waiting Well", "Slow Breaths"]) }];
const EX_A = ["Birdsong", "Baking bread", "How bridges stand", "Old maps", "Card tricks", "Rain", "Knots", "Chess openings"];
const EX_B = ["Tide pools", "Pottery", "Paper planes", "Moon phases"];
async function open(width, o = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 860 }, timezoneId: "America/Toronto", reducedMotion: o.reduce ? "reduce" : "no-preference" });
  const p = await ctx.newPage();
  p.setDefaultTimeout(6000);
  const errs = [], calls = [], bodies = [];
  p.on("pageerror", (e) => errs.push("pageerror " + e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await p.addInitScript(HOOK);
  const ex = "ex" in o ? o.ex : EX_A;
  await p.route("**/api/ikolearn/**", async (r) => {
    const at = new URL(r.request().url()).pathname.replace("/api/ikolearn", "");
    let b = {}; try { b = JSON.parse(r.request().postData() || "{}"); } catch { b = {}; }
    calls.push(at + (at === "/chat" ? ":" + b.mode : "")); bodies.push({ at, b });
    if (at === "/examples") return ex ? r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, examples: ex, growth: ["Patience", "Listening", "Courage", "Focus"] }) }) : r.fulfill({ status: 503, contentType: "application/json", body: '{"ok":false,"reason":"off"}' });
    if (at === "/lesson") return r.fulfill({ status: 200, contentType: "application/x-ndjson", body: LESSON });
    if (at === "/chat") return r.fulfill({ status: 200, contentType: "application/x-ndjson", body: nd([{ t: "start", model: "m" }, { t: "delta", text: "Happy to help with that. " }, { t: "delta", text: "Let's take it one small step at a time." }, { t: "cloud", topics: [], ghosts: [] }, { t: "done" }]) });
    if (at === "/create") { await new Promise((ok) => setTimeout(ok, 400)); const items = /grow in myself/.test(b.about || "") ? GROW_ITEMS : ITEMS; return r.fulfill({ status: 200, contentType: "application/x-ndjson", body: nd([...items.map((item) => ({ t: "item", item })), { t: "done", items }]) }); }
    return r.fulfill({ status: 503, contentType: "application/json", body: '{"ok":false,"reason":"off"}' });
  });
  return { ctx, p, errs, calls, bodies };
}
const shot = async (p, w, name) => { if (SHOTS) { await p.waitForTimeout(300); await p.screenshot({ path: path.join(SHOTS, `intake-iko-${TAG}-${w}-${name}.png`) }); } };
const screenOf = (bodies) => { const c = bodies.filter((x) => x.at === "/chat" && x.b.mode === "chat").pop(); return c ? c.b : null; };
/* Iko's pebble (and its line, when shown) against everything visible that it must not cover */
const overlap = (p, sels) => p.evaluate((sels) => {
  const vis = (e) => e && !e.closest("[hidden]") && getComputedStyle(e).visibility !== "hidden" && e.getClientRects().length;
  const mine = [document.querySelector("#iko"), document.querySelector("#iko-line")].filter(vis).map((e) => e.getBoundingClientRect());
  const hits = [];
  for (const s of sels) for (const e of document.querySelectorAll(s)) {
    if (!vis(e)) continue;
    const r = e.getBoundingClientRect();
    if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight) continue;
    if (mine.some((m) => m.left < r.right && r.left < m.right && m.top < r.bottom && r.top < m.bottom)) hits.push(s + ":" + (e.id || e.className || e.textContent.slice(0, 20)));
  }
  return { hits, shown: mine.length, iw: innerWidth, right: Math.max(0, ...mine.map((m) => m.right)) };
}, sels);
const CLOUD_PARTS = [".cloud-flow > *", "#cloud-start", "#panel", ".cloud-foot a", ".cloud-top button", ".cloud-top a", ".cloud-caption"];
const ikoState = (p) => p.evaluate(() => { const b = document.querySelector("#iko"), r = b.getBoundingClientRect(), w = document.querySelector("#iko-wrap"); return { shown: !w.hidden && getComputedStyle(w).visibility !== "hidden", label: b.getAttribute("aria-label"), w: r.width, h: r.height, line: document.querySelector("#iko-line").hidden ? "" : document.querySelector("#iko-line").textContent, sheet: !document.querySelector("#iko-sheet").hidden, about: document.querySelector("#iko-about").textContent, say: document.querySelector("#iko-say").textContent, svg: Boolean(b.querySelector("svg .iko-face")), img: Boolean(b.querySelector("img")), anim: getComputedStyle(b.querySelector(".iko-pebble")).animationName, active: document.activeElement ? document.activeElement.id || document.activeElement.className : "" }; });
async function name(p, who, n) { await p.goto(BASE + "/ikolearn", { waitUntil: "networkidle" }); await p.click(`.who-opt[data-who="${who}"]`); await p.fill("#name-in", n); await p.press("#name-in", "Enter"); await p.waitForSelector("#cloud:not([hidden])"); await p.waitForTimeout(500); }
async function ikoSend(p, t) { await p.fill("#iko-in", t); await p.press("#iko-in", "Enter"); await p.waitForFunction(() => /one small step/.test(document.querySelector("#iko-log").innerText), null, { timeout: 5000 }); }

const SEED = () => {
  const C = window.IkoCloud, T = Date.now() - 3 * 864e5, c = C.create("Maya", T);
  const kids = (n) => n.map((x, i) => ({ name: x, order: i + 1, score: 0.9 - i * 0.1, why: "", role: "core", blurb: x + " explained in plain words, step by step, for anyone." }));
  C.applyCreate(c, { items: [
    { node: { name: "Volcanoes", chain: ["Earth Science"] }, card: { title: "Volcanoes", blurb: "Mountains that let out melted rock.", goal: "" }, children: kids(["Magma", "Eruptions", "Lava Types"]) },
    { node: { name: "Sourdough Bread", chain: ["Baking"] }, card: { title: "Sourdough Bread", blurb: "Bread raised by a living starter.", goal: "" }, children: kids(["Starter Basics", "Kneading", "Proofing"]) },
    { node: { name: "Stargazing", chain: ["Astronomy"] }, card: { title: "Stargazing", blurb: "The night sky.", goal: "" }, children: kids(["Constellations", "Planets"]) }] }, { t: T });
  const id = (l) => c.order.find((x) => c.nodes[x].label === l);
  const touch = (l, at) => { const n = c.nodes[id(l)]; n.ghost = false; n.opened = true; n.engaged = 2; n.touched = at; n.mastery = Math.max(n.mastery, 0.2); };
  touch("Kneading", T + 1000); touch("Constellations", T + 2000);
  C.joinDeck(c, T + 4000);
  c.active = id("Magma");
  localStorage.setItem("ikolearn.v1.name", "Maya"); localStorage.setItem("ikolearn.v1.cloud", C.serialize(c));
  localStorage.setItem("ikolearn.v1.seen", JSON.stringify({ c: {}, ev: 0, h: { cloud: 1, card: 1, chat: 1, draw: 1 } }));
  localStorage.setItem("ikolearn.v1.thread", JSON.stringify([{ id: "m1", at: T, role: "model", local: true, text: "Welcome back, Maya." }]));
};

for (const width of [390, 1280]) {
  const tag = String(width);
  /* 1. the intake: one calm step under the name; free text first; light ideas from the API (More cycles them); Iko at hand */
  {
    const { ctx, p, errs, calls, bodies } = await open(width);
    try {
      await name(p, "self", "Maya");
      const st = await p.evaluate(() => { const cs = document.querySelector("#cloud-start"), b = cs.getBoundingClientRect(); return { text: cs.innerText, q: document.querySelector("#cs-q").textContent, hi: document.querySelector("#cs-hi").textContent, ph: document.querySelector("#cs-in").placeholder, inType: document.querySelector("#cs-in").tagName, chips: [...cs.querySelectorAll(".ex-chip")].map((c) => c.textContent), more: Boolean(cs.querySelector(".ex-more")), top: b.top, bottom: b.bottom, vh: innerHeight, thread: document.querySelector("#thread").innerText }; });
      ok(st.q === "What are you curious about, or what do you enjoy?" && (st.text.match(/\?/g) || []).length === 1 && !/grow in yourself/.test(st.text) && !/grow in yourself/.test(st.thread), `${tag}: intake: one question at a time (the grow question isn't asked yet)`, JSON.stringify(st));
      ok(st.hi === "Hi Maya. Let's begin your learning cloud together." && st.inType === "INPUT" && st.ph === "In your own words" && !/\b(age|years? old|kids?|child|student|grade)\b/i.test(st.text), `${tag}: intake: a short hello and free text first (no age wording)`, JSON.stringify(st));
      ok(JSON.stringify(st.chips) === JSON.stringify(EX_A.slice(0, 3)) && st.more, `${tag}: intake: a few light ideas, straight from the API's list, with More`, JSON.stringify(st.chips));
      ok(st.top > st.vh * 0.5 && st.top < st.vh * 0.68 && st.bottom < st.vh - 60, `${tag}: intake: near the optical centre, just under the name (not at the bottom)`, JSON.stringify({ top: st.top, bottom: st.bottom, vh: st.vh }));
      await p.click("#cs-ex .ex-more"); await p.waitForTimeout(100);
      const more = await p.evaluate(() => [...document.querySelectorAll("#cs-ex .ex-chip")].map((c) => c.textContent));
      ok(JSON.stringify(more) === JSON.stringify(EX_A.slice(3, 6)) && calls.filter((c) => c === "/examples").length === 1, `${tag}: intake: More cycles the ideas on the device (no new call)`, JSON.stringify(more));
      const k = await ikoState(p), ov = await overlap(p, CLOUD_PARTS);
      ok(k.shown && k.label === "Talk to Iko" && k.w >= 44 && k.h >= 44 && k.svg && !k.img && k.line === "Hi, I'm Iko. I'm here whenever you need me." && k.active !== "iko", `${tag}: Iko: a pebble (SVG, no image), a labelled button, a short hello; no focus jump`, JSON.stringify(k));
      ok(!ov.hits.length && ov.right <= ov.iw, `${tag}: Iko: clear of the start, the fine print and the top`, JSON.stringify(ov));
      ok(calls.filter((c) => c !== "/examples").length === 0, `${tag}: intake: landing makes no calls (the ideas are the shared cached list)`, calls.join());
      await shot(p, width, "1-intake");
      /* Iko during the intake: a gentle helper; the screen goes along with the message */
      await p.click("#iko"); await p.waitForTimeout(200);
      const io = await ikoState(p);
      ok(io.sheet && io.about === "Getting started" && /Not sure yet\?/.test(io.say) && io.active === "iko-in", `${tag}: Iko at the intake: opens the text field, knows where we are`, JSON.stringify(io));
      await ikoSend(p, "I like the sea, but I'm not sure");
      const b1 = screenOf(bodies);
      ok(b1 && JSON.stringify(b1.screen) === JSON.stringify({ view: "intake", step: "first" }) && calls.filter((c) => c === "/chat:chat").length === 1, `${tag}: Iko at the intake: one chat call, with the screen (intake, first)`, JSON.stringify(b1 && b1.screen));
      await shot(p, width, "1c-intake-iko");
      await p.keyboard.press("Escape"); await p.waitForTimeout(150);
      ok(!(await ikoState(p)).sheet && !(await p.isHidden("#cloud-start")), `${tag}: Escape closes Iko; the start is still there`);
      /* Begin: one start call, no grow question first; then Iko offers it once, quietly */
      await p.fill("#cs-in", "the ocean and drawing"); await p.click("#cs-form button[type=submit]");
      await p.waitForFunction(() => { const C = window.IkoCloud, c = C.deserialize(localStorage.getItem("ikolearn.v1.cloud")); return c && C.subjects(c).length >= 2 && !document.querySelector(".cloud-caption:not([hidden])"); }, null, { timeout: 15000 });
      await p.waitForTimeout(500);
      const start = bodies.filter((x) => x.at === "/create");
      ok(start.length === 1 && start[0].b.kind === "start" && start[0].b.about === "the ocean and drawing" && !start[0].b.grow, `${tag}: Begin: one start call, straight away (no second question in between)`, JSON.stringify(start.map((x) => x.b.kind)));
      /* two subjects: the "another direction" invite is on the cloud, so Iko's grow line waits; it comes once the invite is closed */
      const g0 = await ikoState(p);
      const inv = await p.evaluate(() => Boolean(document.querySelector(".cloud-flow:not([hidden]) .cf-note.dir-invite")));
      ok(inv && !/grow in yourself/.test(g0.line || ""), `${tag}: the grow line waits while the direction invite is on the cloud`, JSON.stringify({ inv, line: g0.line }));
      await p.click('.cf-note.dir-invite .cf-x'); await p.waitForTimeout(300);
      const g = await ikoState(p);
      const grow = await p.evaluate(() => [...document.querySelectorAll("#thread .ask")].map((e) => e.innerText).join(" | "));
      ok(/grow in yourself too/.test(g.line) && /When you like: is there something you'd like to grow in yourself\?/.test(grow) && /Optional\./.test(grow), `${tag}: the grow question comes after the path begins, once, from Iko (optional)`, JSON.stringify({ line: g.line, grow }));
      await shot(p, width, "6-grow-later");
      await p.click("#iko"); await p.waitForTimeout(200);
      const gi = await ikoState(p);
      ok(gi.about === "When you like" && /grow in yourself/.test(gi.say), `${tag}: Iko: the later question, in the sheet`, JSON.stringify(gi));
      await p.fill("#iko-in", "patience"); await p.press("#iko-in", "Enter");
      await p.waitForFunction(() => { const C = window.IkoCloud, c = C.deserialize(localStorage.getItem("ikolearn.v1.cloud")); return c && C.subjects(c).length >= 3; }, null, { timeout: 15000 });
      const cr = bodies.filter((x) => x.at === "/create");
      ok(cr.length === 2 && cr[1].b.kind === "more" && /Something I'd like to grow in myself: patience/.test(cr[1].b.about), `${tag}: answering it is one "more" call (only because they answered)`, JSON.stringify(cr.map((x) => x.b.kind + ":" + x.b.about)));
      await p.waitForTimeout(600);
      await p.reload({ waitUntil: "networkidle" }); await p.waitForSelector("#cloud:not([hidden])"); await p.waitForTimeout(400);
      const again = await ikoState(p);
      ok(again.shown && !again.line && (await p.evaluate(() => document.querySelectorAll("#thread .ask .ask-row").length)) === 0, `${tag}: Iko doesn't nag: after it was opened, just the pebble`, JSON.stringify(again));
      ok(errs.length === 0, `${tag}: intake: no console errors`, errs.join(" | "));
    } catch (e) { fails.push(`${tag}: intake threw -> ${String(e.message || e).split("\n")[0]}`); }
    await ctx.close();
  }
  /* 2. another list from the API means other ideas (nothing on the device); a guide's learner; no list: no ideas, no note */
  {
    const { ctx, p, errs } = await open(width, { ex: EX_B });
    try {
      await name(p, "guide", "Robin");
      const chips = await p.evaluate(() => [...document.querySelectorAll("#cs-ex .ex-chip")].map((c) => c.textContent));
      const who = await p.evaluate(() => ({ t: document.querySelector("#cloud-who").textContent, hi: document.querySelector("#cs-hi").textContent }));
      ok(JSON.stringify(chips) === JSON.stringify(EX_B.slice(0, 3)) && who.t === "Robin · switch" && /^Hi Robin\./.test(who.hi), `${tag}: guide: the learner's intake; the ideas follow the API (no static list)`, JSON.stringify({ chips, who }));
      const ov = await overlap(p, CLOUD_PARTS);
      ok(!ov.hits.length, `${tag}: guide: Iko clear of the switcher and the rest`, JSON.stringify(ov));
      ok(errs.length === 0, `${tag}: guide: no console errors`, errs.join(" | "));
    } catch (e) { fails.push(`${tag}: guide threw -> ${String(e.message || e).split("\n")[0]}`); }
    await ctx.close();
  }
  {
    const { ctx, p, errs } = await open(width, { ex: null });
    try {
      await name(p, "self", "Sam");
      const st = await p.evaluate(() => ({ chips: document.querySelectorAll("#cs-ex .ex-chip").length, text: document.querySelector("#cloud-start").innerText }));
      ok(st.chips === 0 && !/couldn't load|Try again/.test(st.text) && /In your own words|What are you curious/.test(st.text), `${tag}: no examples: free text only, no ideas, no note`, JSON.stringify(st));
      ok(errs.length === 0, `${tag}: no examples: no console errors`, errs.join(" | "));
    } catch (e) { fails.push(`${tag}: no-examples threw -> ${String(e.message || e).split("\n")[0]}`); }
    await ctx.close();
  }
  /* 3. returning: Iko by default, on a node with its context, in a lesson ("Still tricky"), on the deck; the whole conversation */
  {
    const { ctx, p, errs, calls, bodies } = await open(width);
    try {
      await p.goto(BASE + "/ikolearn", { waitUntil: "networkidle" });
      await p.evaluate(SEED);
      await p.reload({ waitUntil: "networkidle" }); await p.waitForSelector("#cloud:not([hidden])"); await p.waitForTimeout(600);
      const d = await ikoState(p), ov0 = await overlap(p, CLOUD_PARTS);
      ok(d.shown && d.line === "Hi, I'm Iko. I'm here whenever you need me." && !d.sheet && !ov0.hits.length, `${tag}: Iko by default: the pebble and its hello, clear of the Pick up row and the fine print`, JSON.stringify({ d, ov0 }));
      await shot(p, width, "2-iko-default");
      /* top left, just the pebble; its line under it while it has something to say, then it folds back to the pebble */
      const tl = await p.evaluate(() => { const r = document.querySelector("#iko").getBoundingClientRect(), l = document.querySelector("#iko-line"), lr = l.hidden ? null : l.getBoundingClientRect(), nav = document.querySelector(".home-nav > :not([hidden]):not(.home-brand)"), nr = nav ? nav.getBoundingClientRect() : null; return { x: r.left, y: r.top, w: r.width, below: Boolean(lr) && lr.top >= r.bottom - 1 && lr.left < 40, navClear: !nr || nr.left >= r.right, talking: document.body.classList.contains("iko-talking") }; });
      ok(tl.x < 24 && tl.y < 16 && tl.w >= 44 && tl.below && tl.navClear && tl.talking, `${tag}: Iko sits top left (a 44px+ pebble), its hello just under it, the cloud's links clear of it`, JSON.stringify(tl));
      await p.waitForFunction(() => document.querySelector("#iko-line").hidden, null, { timeout: 12000 }); await p.waitForTimeout(100); /* the hello's own 9 s */
      const fold = await p.evaluate(() => ({ pebble: !document.querySelector("#iko-wrap").hidden, line: !document.querySelector("#iko-line").hidden, talking: document.body.classList.contains("iko-talking") }));
      ok(fold.pebble && !fold.line && !fold.talking, `${tag}: once said, it folds back to just the pebble`, JSON.stringify(fold));
      /* a node: its card opens; Iko stays clear of it; tapping Iko takes that node along */
      const pt = await p.evaluate(() => { const v = window.__views.filter((x) => x.id === "cloud-canvas").pop().view, C = window.IkoCloud, c = C.deserialize(localStorage.getItem("ikolearn.v1.cloud")), id = c.order.find((x) => c.nodes[x].label === "Volcanoes"), q = v.project(id), r = document.querySelector("#cloud-canvas").getBoundingClientRect(); return { x: r.left + q.x, y: r.top + q.y }; });
      await p.mouse.click(pt.x, pt.y); await p.waitForTimeout(900);
      const title = await p.textContent("#p-title");
      const ov1 = await overlap(p, CLOUD_PARTS), k1 = await ikoState(p);
      ok(title === "Volcanoes" && !ov1.hits.length, `${tag}: a node's card: Iko clear of it (or steps aside)`, JSON.stringify({ title, ov1, shown: k1.shown }));
      if (k1.shown) await p.click("#iko"); else await p.click("#p-chat");
      await p.waitForTimeout(200);
      const k2 = await ikoState(p);
      ok(k2.sheet && k2.about === "On your cloud · Volcanoes" && /We're on Volcanoes/.test(k2.say) && k2.active === "iko-in" && !(await p.isHidden("#panel")), `${tag}: Iko on a node: opens the text field with that node as context (the card stays)`, JSON.stringify(k2));
      const n0 = calls.length;
      await ikoSend(p, "Why do they erupt?");
      const b2 = screenOf(bodies);
      ok(b2 && JSON.stringify(b2.screen) === JSON.stringify({ view: "cloud", topic: "Volcanoes" }) && b2.focus === "Volcanoes" && calls.length === n0 + 1, `${tag}: Iko on a node: one chat call, the screen and focus sent`, JSON.stringify(b2 && { screen: b2.screen, focus: b2.focus }));
      await shot(p, width, "3-iko-node");
      const sheetBox = await p.evaluate(() => { const r = document.querySelector("#iko-sheet").getBoundingClientRect(); return { l: r.left, r: r.right, b: r.bottom, iw: innerWidth, ih: innerHeight }; });
      ok(sheetBox.l >= 0 && sheetBox.r <= sheetBox.iw && sheetBox.b <= sheetBox.ih, `${tag}: Iko's sheet fits the screen`, JSON.stringify(sheetBox));
      await p.keyboard.press("Escape"); await p.waitForTimeout(150);
      ok(!(await ikoState(p)).sheet && !(await p.isHidden("#panel")), `${tag}: Escape closes Iko first (the card stays)`);
      await p.click("#p-close"); await p.waitForTimeout(250);
      /* a lesson: Iko there too, clear of Where Next; "Still tricky" opens Iko with the prepared clarification (0 calls) */
      await p.locator(".cloud-flow > .chip").first().click(); await p.waitForSelector("#l-done:not([hidden])");
      await p.evaluate(() => document.querySelector("#l-next").scrollIntoView({ block: "center" })); await p.waitForTimeout(200);
      const ov2 = await overlap(p, [".wn-opt", "#l-next button", "#l-done button"]), k3 = await ikoState(p);
      ok(k3.shown && !ov2.hits.length, `${tag}: lesson: Iko is there, clear of Where Next`, JSON.stringify(ov2));
      await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await p.waitForTimeout(200);
      const ov3 = await overlap(p, ["#l-chat", "#l-redo", "#l-path button", "#l-path a"]);
      ok(!ov3.hits.length, `${tag}: lesson: at the end of the page the last links sit clear of Iko`, JSON.stringify(ov3));
      await p.evaluate(() => document.querySelector("#l-done").scrollIntoView({ block: "center" }));
      const c0 = calls.length;
      await p.click("#l-tricky"); await p.waitForTimeout(400);
      const tr = await p.evaluate(() => ({ sheet: !document.querySelector("#iko-sheet").hidden, inSheet: Boolean(document.querySelector("#iko-slot #l-clar")), simpler: (document.querySelector('#iko-slot .clar[data-style="simpler"] .clar-body') || {}).innerText || "", focusIn: Boolean(document.activeElement && document.activeElement.closest("#iko-sheet")), about: document.querySelector("#iko-about").textContent, lesson: !document.querySelector("#lesson").hidden, opts: document.querySelectorAll("#iko-slot .clar-opt").length }));
      ok(tr.sheet && tr.inSheet && tr.simpler.startsWith("Picture the ground as a thick warm quilt") && tr.focusIn && tr.lesson && tr.opts === 3 && tr.about === "On Magma · lesson", `${tag}: Still tricky: Iko opens with the prepared clarification (the lesson stays)`, JSON.stringify(tr));
      ok(calls.length === c0, `${tag}: Still tricky: 0 calls (prepared with the lesson)`, calls.slice(c0).join());
      await shot(p, width, "4-tricky");
      /* the sheet covers the lesson's buttons on a phone, so it carries "I've got it": visible and on top, even after the page scrolls */
      const gotOk = () => p.evaluate(() => { const b = document.querySelector("#iko-got"), r = b.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return Boolean(b.offsetParent) && hit === b && r.top >= 0 && r.bottom <= innerHeight; });
      ok(await gotOk(), `${tag}: Still tricky: "I've got it" is in Iko's sheet, visible and tappable`);
      await p.mouse.move(Math.round(width / 4), 140); await p.mouse.wheel(0, 300); await p.waitForTimeout(250);
      await p.evaluate(() => window.scrollBy(0, -300)); await p.waitForTimeout(150);
      ok(await gotOk(), `${tag}: Still tricky: it stays visible and tappable when the page scrolls`);
      if (width >= 1100) {
        const wn = await p.evaluate(() => { const s = document.querySelector("#iko-sheet").getBoundingClientRect(); return [...document.querySelectorAll("#l-next .wn-opt, #l-next button, #l-done button")].filter((e) => { const r = e.getBoundingClientRect(); return r.width && r.left < s.right && r.right > s.left && r.top < s.bottom && r.bottom > s.top; }).map((e) => e.textContent.trim().slice(0, 30)); });
        ok(!wn.length, `${tag}: Still tricky: on a wide screen the sheet sits clear of Where Next and the lesson's buttons`, JSON.stringify(wn));
      }
      await ikoSend(p, "Which part is the hardest?");
      const b3 = screenOf(bodies);
      ok(b3 && JSON.stringify(b3.screen) === JSON.stringify({ view: "lesson", step: "tricky", topic: "Magma" }) && b3.focus === "Magma", `${tag}: Still tricky: a question to Iko carries the lesson, its step and topic`, JSON.stringify(b3 && b3.screen));
      await p.keyboard.press("Escape"); await p.waitForTimeout(150);
      const back = await p.evaluate(() => ({ sheet: !document.querySelector("#iko-sheet").hidden, inLesson: Boolean(document.querySelector(".l-main #l-clar .clar")), lesson: !document.querySelector("#lesson").hidden }));
      ok(!back.sheet && back.inLesson && back.lesson, `${tag}: closing Iko puts the clarification back in the lesson`, JSON.stringify(back));
      /* again, and done from the sheet: "I've got it" there finishes the lesson (0 calls) and closes the sheet */
      await p.evaluate(() => document.querySelector("#l-done").scrollIntoView({ block: "center" }));
      const c1 = calls.length;
      await p.click("#l-tricky"); await p.waitForTimeout(300);
      await p.click("#iko-got"); await p.waitForTimeout(300);
      const fin = await p.evaluate(() => ({ sheet: !document.querySelector("#iko-sheet").hidden, opts: document.querySelectorAll("#l-clar .clar-opt").length, status: document.querySelector("#l-status").innerText, lesson: !document.querySelector("#lesson").hidden, acts: !document.querySelector("#iko-acts").hidden }));
      ok(!fin.sheet && !fin.opts && fin.lesson && !fin.acts && /growing|stronger|That's it/.test(fin.status) && calls.length === c1, `${tag}: "I've got it" in the sheet finishes the lesson and closes it (0 calls)`, JSON.stringify(fin) + calls.slice(c1).join());
      await p.click("#l-back"); await p.waitForTimeout(900);
      if (!(await p.isHidden("#panel"))) { await p.click("#p-close"); await p.waitForTimeout(200); }
      /* the deck */
      await p.click("#cloud-deck"); await p.waitForTimeout(300);
      await p.click("#iko"); await p.waitForTimeout(200);
      const k4 = await ikoState(p);
      ok(k4.sheet && k4.about === "On your deck", `${tag}: deck: Iko knows it is the deck`, JSON.stringify(k4));
      await ikoSend(p, "What should I pick next?");
      const b4 = screenOf(bodies);
      ok(b4 && JSON.stringify(b4.screen) === JSON.stringify({ view: "deck" }), `${tag}: deck: the screen sent`, JSON.stringify(b4 && b4.screen));
      /* the whole conversation: the chat with its composer; no pebble there */
      await p.click("#iko-all"); await p.waitForTimeout(300);
      const ch = await p.evaluate(() => ({ cloud: !document.querySelector("#cloud").hidden, dock: !document.querySelector("#dock").hidden, pebble: !document.querySelector("#iko-wrap").hidden, thread: document.querySelector("#thread").innerText }));
      ok(!ch.cloud && ch.dock && !ch.pebble && /What should I pick next\?/.test(ch.thread) && /Why do they erupt\?/.test(ch.thread), `${tag}: the whole conversation: the composer, every message from Iko's sheet, no pebble`, JSON.stringify({ ...ch, thread: ch.thread.length }));
      await p.fill("#input", "And one more thing"); await p.press("#input", "Enter");
      await p.waitForTimeout(400);
      const b5 = screenOf(bodies);
      ok(b5 && JSON.stringify(b5.screen) === JSON.stringify({ view: "chat" }), `${tag}: the whole conversation sends view chat`, JSON.stringify(b5 && b5.screen));
      ok(calls.filter((c) => c === "/lesson").length === 1 && calls.filter((c) => /:clarify/.test(c)).length === 0 && calls.filter((c) => c === "/chat:chat").length === 4, `${tag}: returning: 1 lesson call, 0 clarify calls, 4 chat calls (one per message)`, calls.join());
      ok(errs.length === 0, `${tag}: returning: no console errors`, errs.join(" | "));
    } catch (e) { fails.push(`${tag}: returning threw -> ${String(e.message || e).split("\n")[0]}`); }
    await ctx.close();
  }
  /* 4. reduced motion: Iko is still */
  {
    const { ctx, p } = await open(width, { reduce: true });
    try {
      await name(p, "self", "Ana");
      const k = await ikoState(p);
      ok(k.shown && k.anim === "none", `${tag}: reduced motion: the pebble is still`, k.anim);
    } catch (e) { fails.push(`${tag}: reduced threw -> ${String(e.message || e).split("\n")[0]}`); }
    await ctx.close();
  }
}
await browser.close();
server.close();
if (fails.length) { console.error(`ikolearn iko e2e: ${pass} passed, ${fails.length} FAILED`); for (const f of fails) console.error("  x " + f); process.exit(1); }
console.log(`ikolearn iko e2e: ${pass} passed`);
