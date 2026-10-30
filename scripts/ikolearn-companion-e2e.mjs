// End-to-end checks for PR 103, in a real browser, every /api/ikolearn call mocked (no model calls): Iko at the bottom of
// every screen (clear of the inputs, chips, fine print, deck and safe areas), its bubbles (one a screen, rotating, never
// repeated) and reactions (less often over time); the lesson's read -> check -> earn loop (a missed check: a clearer telling,
// fresh questions, no card; a pass: the next paths and the card); the deck (suggestions only new or sketched, the album only
// earned cards, the cloud's deck icon and count); the onboarding (several learners at once, ideas that cycle, a rotating
// placeholder, the reassurance); and the cloud (quiet fading, vividness). Dark mode contrast and reduced motion too.
// DOM and geometry assertions only.
// Run: IKOLEARN_PW=<path to node_modules/playwright-core> node scripts/ikolearn-companion-e2e.mjs [--root public]
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const ROOT = path.resolve(arg("--root", "public"));
if (!process.env.IKOLEARN_PW) { console.log("ikolearn companion e2e: skipped (set IKOLEARN_PW to a playwright-core folder)"); process.exit(0); }
const PW = await import(pathToFileURL(path.join(process.env.IKOLEARN_PW, "index.mjs")).href), { chromium } = PW; /* IKOLEARN_BROWSER=webkit|firefox runs the same checks in that engine */
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
const browser = await (process.env.IKOLEARN_BROWSER ? PW[process.env.IKOLEARN_BROWSER].launch() : chromium.launch({ executablePath: process.env.IKOLEARN_CHROME || "/usr/bin/google-chrome" }));
const HOOK = () => { let real; Object.defineProperty(window, "IkoCloudView", { configurable: true, get: () => real, set: (v) => { real = Object.assign({}, v, { create: (c, o) => { const view = v.create(c, o); (window.__views = window.__views || []).push({ id: c.id, view }); return view; } }); } }); };


const nd = (rows) => rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
const Q = (k) => [
  { q: k + ": what is magma?", options: ["Melted rock underground", "A kind of cloud", "Cold ice"], answer: 0 },
  { q: k + ": what is it called above ground?", options: ["Sand", "Lava", "Steam"], answer: 1 },
];
const TRICKY = "Think of the ground as a thick warm quilt over a stove: deep down rock gets so hot it turns runny. That runny rock is magma.";
const lessonBody = (b) => nd([{ t: "start", model: "m" }, { t: "delta", text: "INTRO: " + (b.again ? "Again, more simply: " : "") + "Magma is hot melted rock deep underground.\nEXPLAIN: When it comes out of a volcano, we call it lava." },
  { t: "path", steps: [], next: "", choices: [{ name: "Eruptions", kind: "deeper", why: "" }, { name: "Lava Types", kind: "side", why: "" }], questions: Q(b.again ? "Retold" : "First"), retry: Q("Fresh"), tricky: TRICKY }, { t: "done" }]);
const EX = ["Birdsong", "Baking bread", "How bridges stand", "Old maps", "Card tricks", "Rain", "Knots", "Chess openings", "Tide pools"];
const kids = (n) => n.map((x, i) => ({ name: x, order: i + 1, score: 0.9 - i * 0.1, why: "A good first step", role: "core", blurb: x + " in plain words, one step at a time, for anyone." }));
const ITEMS = [
  { node: { name: "Ocean Life", chain: ["Nature"] }, card: { title: "Ocean Life", blurb: "Living things of the sea.", goal: "" }, children: kids(["Coral Reefs", "Whales", "Tides"]) },
  { node: { name: "Drawing", chain: ["Art"] }, card: { title: "Drawing", blurb: "Making pictures with lines.", goal: "" }, children: kids(["Shapes", "Shading", "Perspective"]) },
];
async function open(width, o = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 860 }, timezoneId: "America/Toronto", reducedMotion: o.reduce ? "reduce" : "no-preference", colorScheme: o.dark ? "dark" : "light" });
  const p = await ctx.newPage();
  p.setDefaultTimeout(8000);
  const errs = [], calls = [], bodies = [];
  p.on("pageerror", (e) => errs.push("pageerror " + e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await p.addInitScript(HOOK);
  await p.route("**/api/ikolearn/**", async (r) => {
    const at = new URL(r.request().url()).pathname.replace("/api/ikolearn", "");
    let b = {}; try { b = JSON.parse(r.request().postData() || "{}"); } catch { b = {}; }
    calls.push(at); bodies.push({ at, b });
    if (at === "/examples") return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, examples: EX, growth: ["Patience", "Listening", "Courage"] }) });
    if (at === "/lesson") return r.fulfill({ status: 200, contentType: "application/x-ndjson", body: lessonBody(b) });
    if (at === "/create") { await new Promise((ok) => setTimeout(ok, 300)); return r.fulfill({ status: 200, contentType: "application/x-ndjson", body: nd([...ITEMS.map((item) => ({ t: "item", item })), { t: "done", items: ITEMS }]) }); }
    return r.fulfill({ status: 503, contentType: "application/json", body: '{"ok":false,"reason":"off"}' });
  });
  return { ctx, p, errs, calls, bodies };
}
/* a returning learner: three subjects; two sketched cards and one inked card in the deck; Stargazing untouched for 100 days */
const SEED = () => {
  const C = window.IkoCloud, now = Date.now(), T = now - 3 * 864e5, OLD = now - 100 * 864e5, c = C.create("Maya", OLD);
  const kids = (n) => n.map((x, i) => ({ name: x, order: i + 1, score: 0.9 - i * 0.1, why: "", role: "core", blurb: x + " explained in plain words, step by step, for anyone." }));
  C.applyCreate(c, { items: [
    { node: { name: "Volcanoes", chain: ["Earth Science"] }, card: { title: "Volcanoes", blurb: "Mountains that let out melted rock.", goal: "" }, children: kids(["Magma", "Eruptions", "Lava Types"]) },
    { node: { name: "Sourdough Bread", chain: ["Baking"] }, card: { title: "Sourdough Bread", blurb: "Bread raised by a living starter.", goal: "" }, children: kids(["Starter Basics", "Kneading", "Proofing"]) }] }, { t: T });
  C.applyCreate(c, { items: [{ node: { name: "Stargazing", chain: ["Astronomy"] }, card: { title: "Stargazing", blurb: "The night sky.", goal: "" }, children: kids(["Constellations", "Planets"]) }] }, { t: OLD });
  const id = (l) => c.order.find((x) => c.nodes[x].label === l);
  const touch = (l, at, extra) => { const n = c.nodes[id(l)]; n.ghost = false; n.opened = true; n.engaged = 2; n.touched = at; n.mastery = Math.max(n.mastery, 0.2); Object.assign(n, extra || {}); };
  touch("Kneading", T + 1000); touch("Proofing", T + 1500, { correct: 1 }); touch("Constellations", OLD + 1000);
  c.order.forEach((x) => { const n = c.nodes[x]; if (n.born > OLD && (x === id("Stargazing") || n.parent === id("Stargazing"))) n.born = OLD; });
  C.joinDeck(c, T + 4000);
  c.active = id("Magma");
  localStorage.setItem("ikolearn.v1.name", "Maya"); localStorage.setItem("ikolearn.v1.cloud", C.serialize(c));
  localStorage.setItem("ikolearn.v1.seen", JSON.stringify({ c: {}, ev: 0, h: { cloud: 1, card: 1, chat: 1, draw: 1, iko: 1 } }));
  localStorage.setItem("ikolearn.v1.thread", JSON.stringify([{ id: "m1", at: T, role: "model", local: true, text: "Welcome back, Maya." }]));
};
const rect = (p, sel) => p.evaluate((s) => { const e = document.querySelector(s); if (!e || e.closest("[hidden]") || !e.getClientRects().length) return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; }, sel);
const hit = (a, b) => Boolean(a && b && a.x < b.r - 0.5 && b.x < a.r - 0.5 && a.y < b.b - 0.5 && b.y < a.b - 0.5);
/* Iko (pebble and bubble) against every visible element matching sels */
const clear = (p, sels) => p.evaluate((sels) => {
  const vis = (e) => e && !e.closest("[hidden]") && getComputedStyle(e).visibility !== "hidden" && e.getClientRects().length;
  const mine = [document.querySelector("#iko"), document.querySelector("#iko-line")].filter(vis).map((e) => e.getBoundingClientRect());
  const hits = [], wrap = document.querySelector("#iko-wrap"), ln = document.querySelector("#iko-line"), was = [wrap.style.visibility, ln.style.visibility];
  wrap.style.visibility = "hidden"; ln.style.visibility = "hidden"; /* so what lies under Iko can be read (elementFromPoint) */
  for (const s of sels) for (const e of document.querySelectorAll(s)) {
    if (!vis(e) || e.closest("#iko-wrap") || e.contains(wrap)) continue; /* Iko himself, and the header slot he sits in */
    const r = e.getBoundingClientRect();
    if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight) continue;
    /* under another layer (the chat's dock below the cloud): not on screen; only Iko itself may be over it */
    const cx = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), cy = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2)), top = document.elementFromPoint(cx, cy);
    if (top && !e.contains(top) && !top.contains(e)) continue;
    if (mine.some((m) => m.left < r.right - 0.5 && r.left < m.right - 0.5 && m.top < r.bottom - 0.5 && r.top < m.bottom - 0.5)) hits.push(s + ":" + (e.id || e.className || e.textContent.slice(0, 20)));
  }
  wrap.style.visibility = was[0]; ln.style.visibility = was[1];
  return { hits, shown: mine.length };
}, sels);
const line = (p) => p.evaluate(() => { const l = document.querySelector("#iko-line"); return l.hidden ? null : { text: l.textContent, tip: l.getAttribute("data-tip"), react: l.getAttribute("data-react") }; });
const waitLine = (p, f, ms = 4000) => p.waitForFunction(f, null, { timeout: ms }).then(() => true, () => false);
const seeded = async (width, o = {}) => { const s = await open(width, o); await s.p.goto(BASE + "/ikolearn", { waitUntil: "networkidle" }); await s.p.evaluate(SEED); if (o.before) await s.p.evaluate(o.before); await s.p.reload({ waitUntil: "networkidle" }); await s.p.waitForSelector("#cloud:not([hidden])"); await s.p.waitForTimeout(700); return s; };
const CLOUD_PARTS = [".cloud-flow > *", "#cloud-start", "#panel", ".cloud-foot a", ".cloud-top button", ".cloud-top a", ".home-nav > *", "#cloud-deck", ".theme-tg"];

for (const width of [390, 1280]) {
  const tag = String(width);
  /* 1. Iko top left on the cloud (#104): in the header row, his bubble under him, clear of everything; one bubble a screen */
  {
    const { ctx, p, errs } = await seeded(width);
    try {
      await waitLine(p, () => !document.querySelector("#iko-line").hidden);
      const pb = await rect(p, "#iko"), vh = await p.evaluate(() => innerHeight), l1 = await line(p);
      ok(pb && pb.x < 30 && pb.y < 24 && pb.w >= 44 && pb.h >= 44 && vh > 0, `${tag}: Iko sits at the top left, a 44px+ target`, JSON.stringify({ pb, vh }));
      ok(await p.evaluate(() => Boolean(document.querySelector(".home-nav #iko")) && document.querySelectorAll("#iko, .iko").length === 1 && !document.querySelector("#iko-cue, #thumb, .thumb") && /^(none|normal)$/.test(getComputedStyle(document.body, "::after").content)), `${tag}: one Iko, in the header row; no strip at the bottom, no stray circle`);
      const c1 = await clear(p, CLOUD_PARTS);
      ok(c1.shown === 2 && !c1.hits.length, `${tag}: cloud: Iko and its bubble clear of the Pick up row, the deck, the fine print and the controls`, JSON.stringify(c1));
      ok(l1 && /^cloud\d$/.test(l1.tip) && /^(I like your cloud, it's growing!|I can add new topics anytime\.)/.test(l1.text), `${tag}: cloud: a short context bubble (local, the screen's own)`, JSON.stringify(l1));
      const lane = await p.evaluate(() => { const f = document.querySelector(".cloud-flow:not([hidden])"), fr = f && f.getBoundingClientRect(), ft = document.querySelector(".cloud-foot").getBoundingClientRect(); return { flowB: fr ? fr.bottom : 0, footB: ft.bottom, vh: innerHeight, lane: getComputedStyle(document.documentElement).getPropertyValue("--iko-lane") }; });
      ok(lane.footB > lane.vh - 8 && lane.flowB > lane.vh - 120 && !lane.lane, `${tag}: cloud: the Pick up row and the fine print sit at the foot again (no room kept for Iko)`, JSON.stringify(lane));
      /* the hello no longer meets "Your deck" (the header's or the cloud's) */
      const dk = await p.evaluate(() => [...document.querySelectorAll("#cloud-deck, #deck-btn, .minideck")].filter((e) => e.getClientRects().length && !e.closest("[hidden]")).map((e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, r: r.right, b: r.bottom }; }));
      const lr = await rect(p, "#iko-line");
      ok(dk.length >= 1 && dk.every((d) => !hit(lr, d)), `${tag}: the hello bubble no longer overlaps "Your deck"`, JSON.stringify({ lr, dk }));
      /* tapping the bubble opens the chat with the text field focused (the PR 98 focus) */
      await p.click("#iko-line"); await p.waitForTimeout(250);
      const sh = await p.evaluate(() => ({ sheet: !document.querySelector("#iko-sheet").hidden, active: document.activeElement && document.activeElement.id }));
      ok(sh.sheet && sh.active === "iko-in", `${tag}: tapping the bubble opens Iko's chat, its field focused`, JSON.stringify(sh));
      await p.keyboard.press("Escape"); await p.waitForTimeout(200);
      /* no repeats: a new visit shows another variant; once each has been shown, the screen stays quiet */
      const seen = [l1.tip];
      for (let i = 0; i < 3; i++) {
        await p.evaluate(() => sessionStorage.removeItem("ikolearn.v1.cues")); await p.reload({ waitUntil: "networkidle" }); await p.waitForSelector("#cloud:not([hidden])");
        const got = await waitLine(p, () => !document.querySelector("#iko-line").hidden, 2500);
        const l = got ? await line(p) : null;
        seen.push(l ? l.tip : null);
      }
      ok(seen[1] && new Set(seen.slice(0, 2)).size === 2 && seen[2] === null && seen[3] === null, `${tag}: bubbles rotate and never repeat (then the screen stays quiet)`, JSON.stringify(seen));
      const mem = await p.evaluate(() => JSON.parse(localStorage.getItem("ikolearn-iko") || "{}"));
      const own = Object.values(mem)[0], cloudRaw = await p.evaluate(() => localStorage.getItem("ikolearn.v1.cloud"));
      ok(Object.keys(mem).length === 1 && own && Object.values(own.t).every((n) => n === 1) && Object.keys(own.t).length === 2 && !/cloud0/.test(cloudRaw), `${tag}: what Iko has said lives in its own key per learner, outside the cloud`, JSON.stringify(mem));
      ok(errs.length === 0, `${tag}: cloud: no console errors`, errs.join(" | "));
    } catch (e) { fails.push(`${tag}: bottom threw -> ${String(e.message || e).split("\n")[0]}`); }
    await ctx.close();
  }
  /* 2. the lesson: read -> Continue -> check in its own pane; a miss: a clearer telling, a fresh set, no card; a pass: Where next and the card */
  {
    const { ctx, p, errs, calls, bodies } = await seeded(width);
    try {
      const deck0 = await p.evaluate(() => window.IkoCloud.deserialize(localStorage.getItem("ikolearn.v1.cloud")).deck.length);
      await p.evaluate(() => { const C = window.IkoCloud, c = C.deserialize(localStorage.getItem("ikolearn.v1.cloud")); window.__magma = c.order.find((x) => c.nodes[x].label === "Magma"); });
      await p.locator(".cloud-flow > .chip", { hasText: "Magma" }).first().click();
      await p.waitForSelector("#l-done:not([hidden])");
      await p.waitForTimeout(300);
      const r0 = await p.evaluate(() => ({ quiz: !document.querySelector("#l-quiz").hidden, cont: !document.querySelector("#l-cont").hidden, got: !document.querySelector("#l-got").hidden, next: document.querySelectorAll("#l-next .wn-opt:not([data-kind=progress])").length, grow: document.querySelectorAll("#l-next .wn-grow:not([hidden])").length, phase: document.querySelector(".l-main").getAttribute("data-phase"), on: document.querySelector("#ph-learn").className }));
      ok(!r0.quiz && r0.cont && !r0.got && r0.next === 0 && r0.phase === "learn" && r0.on === "on", `${tag}: lesson: reading first; Continue, no questions yet, no card, no Where next`, JSON.stringify(r0));
      const c0 = await clear(p, ["#l-done button", "#l-cont", ".l-text", "#l-card"]);
      ok(!c0.hits.length, `${tag}: lesson: Iko clear of the reading and its buttons`, JSON.stringify(c0));
      await p.click("#l-cont"); await p.waitForTimeout(250);
      const r1 = await p.evaluate(() => { const qz = document.querySelector("#l-quiz"); return { quiz: !qz.hidden, pane: qz.classList.contains("l-pane-on"), legends: [...qz.querySelectorAll("legend")].map((l) => l.textContent), cont: !document.querySelector("#l-cont").hidden, got: !document.querySelector("#l-got").hidden, focus: Boolean(document.activeElement && document.activeElement.closest("#l-quiz")), phase: document.querySelector(".l-main").getAttribute("data-phase"), check: document.querySelector("#ph-check").className }; });
      ok(r1.quiz && r1.pane && r1.legends.length === 2 && /^First/.test(r1.legends[0]) && !r1.cont && !r1.got && r1.focus && r1.phase === "check" && r1.check === "on", `${tag}: Continue: the check in its own pane, focused`, JSON.stringify(r1));
      const order = await p.evaluate(() => { const a = document.querySelector("#l-quiz").getBoundingClientRect(), t = document.querySelector("#l-text, .l-text, #l-body"); return t ? t.getBoundingClientRect().bottom <= a.top + 1 : true; });
      ok(order, `${tag}: the check comes after the reading`);
      const pick = (qi, oi) => p.locator("#l-quiz .q").nth(qi).locator("input").nth(oi).check();
      await pick(0, 1); await p.waitForTimeout(150); await pick(1, 1); await p.waitForTimeout(300);
      const m1 = await p.evaluate(() => { const C = window.IkoCloud, c = C.deserialize(localStorage.getItem("ikolearn.v1.cloud")), n = c.nodes[window.__magma]; return { miss: Boolean(document.querySelector("#l-quiz .q-miss")), again: (document.querySelector("#l-quiz .q-again") || {}).innerText || "", fresh: Boolean(document.querySelector("#l-quiz .q-fresh")), got: !document.querySelector("#l-got").hidden, next: document.querySelectorAll("#l-next .wn-opt:not([data-kind=progress])").length, deck: c.deck.length, inDeck: C.inDeck(c, window.__magma), correct: n.correct || 0, ez: (JSON.parse(localStorage.getItem("ikolearn.v1.cloud")).ez || {}) }; });
      ok(m1.miss && /quilt over a stove/.test(m1.again) && m1.fresh && !m1.got && m1.next === 0, `${tag}: a miss: a clearer telling (prepared, 0 calls), then a fresh check; no card, no Where next`, JSON.stringify(m1));
      ok(m1.deck === deck0 && !m1.inDeck && m1.correct === 0, `${tag}: a miss earns nothing (no deck, no credit)`, JSON.stringify({ deck0, m1 }));
      ok(Object.values(m1.ez).some((v) => v < 0), `${tag}: a miss is noted as this branch's difficulty (ez, additive)`, JSON.stringify(m1.ez));
      const lessonCalls = calls.filter((c) => c === "/lesson").length;
      await p.click("#l-quiz .q-fresh"); await p.waitForTimeout(300);
      const f1 = await p.evaluate(() => [...document.querySelectorAll("#l-quiz legend")].map((l) => l.textContent));
      ok(f1.length === 2 && f1.every((t) => /^Fresh/.test(t)) && calls.filter((c) => c === "/lesson").length === lessonCalls, `${tag}: fresh questions (the lesson's spare set, 0 calls)`, JSON.stringify(f1));
      /* a pass */
      await pick(0, 0); await p.waitForTimeout(150); await pick(1, 1); await p.waitForTimeout(400);
      const p1 = await p.evaluate(() => { const C = window.IkoCloud, c = C.deserialize(localStorage.getItem("ikolearn.v1.cloud")); return { got: !document.querySelector("#l-got").hidden, next: document.querySelectorAll("#l-next .wn-opt:not([data-kind=progress])").length, phase: document.querySelector(".l-main").getAttribute("data-phase"), earn: document.querySelector("#ph-earn").className, correct: c.nodes[window.__magma].correct || 0, react: document.querySelector("#iko-line").getAttribute("data-react") }; });
      ok(p1.got && p1.next >= 1 && p1.phase === "passed" && p1.earn === "on" && p1.correct >= 2, `${tag}: a pass: the next paths open and the card can be earned`, JSON.stringify(p1));
      ok(p1.react === "pass", `${tag}: Iko reacts to a passed check`, JSON.stringify(p1));
      await p.click("#l-got"); await p.waitForTimeout(1300);
      const e1 = await p.evaluate(() => { const C = window.IkoCloud, c = C.deserialize(localStorage.getItem("ikolearn.v1.cloud")); return { inDeck: C.inDeck(c, window.__magma), deck: c.deck.length, mini: (document.querySelector(".minideck .md-n") || {}).textContent }; });
      ok(e1.inDeck && e1.deck === deck0 + 1 && e1.mini === String(deck0 + 1), `${tag}: earned: the card joins the deck (the count follows)`, JSON.stringify(e1));
      ok(errs.length === 0, `${tag}: lesson: no console errors`, errs.join(" | "));
      /* two misses on another lesson: a clearer version is written (1 call, gentle, "again"), with its own fresh questions */
      await p.click("#l-back"); await p.waitForTimeout(800);
      if (!(await p.isHidden("#panel"))) { await p.click("#p-close"); await p.waitForTimeout(200); }
      await p.evaluate(() => { const C = window.IkoCloud, c = C.deserialize(localStorage.getItem("ikolearn.v1.cloud")); window.__er = c.order.find((x) => c.nodes[x].label === "Eruptions"); });
      await p.evaluate(() => { document.querySelector("#iko-line").hidden = true; });
      await p.goto(BASE + "/ikolearn", { waitUntil: "networkidle" }); await p.waitForSelector("#cloud:not([hidden])"); await p.waitForTimeout(500);
      const chip = p.locator(".cloud-flow > .chip", { hasText: "Eruptions" });
      if (await chip.count()) {
        await chip.first().click(); await p.waitForSelector("#l-cont:not([hidden])");
        await p.click("#l-cont"); await p.waitForTimeout(200);
        await pick(0, 2); await p.waitForTimeout(100); await pick(1, 2); await p.waitForTimeout(300);
        await p.click("#l-quiz .q-fresh"); await p.waitForTimeout(250);
        await pick(0, 2); await p.waitForTimeout(100); await pick(1, 2); await p.waitForTimeout(300);
        const m2 = await p.evaluate(() => ({ retell: Boolean(document.querySelector("#l-quiz .q-retell")), got: !document.querySelector("#l-got").hidden }));
        ok(m2.retell && !m2.got, `${tag}: a second miss offers a clearer version of the lesson (still no card)`, JSON.stringify(m2));
        const n0 = calls.filter((c) => c === "/lesson").length;
        await p.click("#l-quiz .q-retell"); await p.waitForSelector("#l-cont:not([hidden])"); await p.waitForTimeout(300);
        const last = bodies.filter((x) => x.at === "/lesson").pop().b;
        ok(calls.filter((c) => c === "/lesson").length === n0 + 1 && last.again === true && last.pace === "gentle", `${tag}: the clearer version: one lesson call, gentle, marked again`, JSON.stringify({ again: last.again, pace: last.pace }));
        await p.click("#l-cont"); await p.waitForTimeout(200);
        const f2 = await p.evaluate(() => [...document.querySelectorAll("#l-quiz legend")].map((l) => l.textContent));
        ok(f2.length === 2 && f2.every((t) => /^Retold/.test(t)), `${tag}: ...then its own fresh questions`, JSON.stringify(f2));
      } else ok(false, `${tag}: Eruptions offered to pick up`);
    } catch (e) { fails.push(`${tag}: lesson threw -> ${String(e.message || e).split("\n")[0]}`); }
    await ctx.close();
  }
  /* 3. the deck: suggestions only new or sketched; the album only earned cards; the cloud's deck icon and count */
  {
    const { ctx, p, errs } = await seeded(width);
    try {
      const home = await p.evaluate(() => { const b = document.querySelector("#cloud-deck"), n = b && b.querySelector(".md-n"), C = window.IkoCloud, c = C.deserialize(localStorage.getItem("ikolearn.v1.cloud")); return { shown: Boolean(b && !b.hidden && b.getClientRects().length), fan: Boolean(b && b.querySelector(".md-fan .md-card")), n: n && n.textContent, deck: c.deck.length, head: (document.querySelector(".minideck:not(.home-deck) .md-n") || {}).textContent }; });
      ok(home.shown && home.fan && home.n === String(home.deck) && home.head === home.n, `${tag}: the cloud shows the same deck icon with its count`, JSON.stringify(home));
      const sugg = await p.evaluate(() => { const C = window.IkoCloud, P = window.IkoPlan, c = C.deserialize(localStorage.getItem("ikolearn.v1.cloud")); const items = P.suggest(c).filter((x) => x.kind === "new" || x.kind === "path" || x.kind === "topic" || !x.kind); return { ranks: items.map((x) => { const t = C.tierOf(c, x.id); return t ? t.rank : 0; }), labels: items.map((x) => c.nodes[x.id] && c.nodes[x.id].label), inked: c.order.filter((x) => { const t = c.nodes[x].parent && C.tierOf(c, x); return t && t.rank >= 1; }).map((x) => c.nodes[x].label) }; });
      const chips = await p.evaluate(() => [...document.querySelectorAll(".cloud-flow > .chip")].map((c) => c.textContent));
      ok(sugg.inked.includes("Proofing") && sugg.ranks.every((r) => r === 0) && !chips.some((t) => sugg.inked.includes(t)), `${tag}: Pick up offers only new or sketched cards (never Inked or further)`, JSON.stringify({ sugg, chips }));
      await p.click("#cloud-deck"); await p.waitForSelector("#deck:not([hidden])"); await p.waitForTimeout(300);
      const d = await p.evaluate(() => { const C = window.IkoCloud, c = C.deserialize(localStorage.getItem("ikolearn.v1.cloud")); const album = [...document.querySelectorAll("#d-album [data-card]")].map((e) => e.dataset.card), collect = [...document.querySelectorAll("#d-collect [data-card]")].map((e) => e.dataset.card); const nx = document.querySelector("#d-next").getBoundingClientRect(), al = document.querySelector("#d-album").getBoundingClientRect(); return { album, allIn: album.length > 0 && album.every((id) => C.inDeck(c, id)), collect: collect.length, collectOut: collect.every((id) => !C.inDeck(c, id)), collectShown: !document.querySelector("#d-collect").hidden, nextBelow: nx.top >= al.bottom - 1, deck: c.deck.length, lede: document.querySelector("#d-lede").textContent, sugg: [...document.querySelectorAll("#d-suggest .chip")].map((x) => x.textContent) }; });
      ok(d.allIn && d.album.length === d.deck, `${tag}: Your deck shows the earned cards only`, JSON.stringify(d));
      ok(d.collectShown && d.collect > 0 && d.collectOut && d.nextBelow, `${tag}: suggestions and uncollected topics sit apart, below the album`, JSON.stringify(d));
      ok(/^\d+ cards? you've earned/.test(d.lede), `${tag}: the deck's lede counts earned cards`, d.lede);
      ok(!d.sugg.some((t) => t === "Proofing"), `${tag}: the deck's Pick up never offers an Inked card`, JSON.stringify(d.sugg));
      await waitLine(p, () => !document.querySelector("#iko-line").hidden, 2500);
      const dc = await clear(p, ["#d-title", "#d-lede", "#d-back"]);
      ok(!dc.hits.length, `${tag}: deck: Iko clear of the title and the lede`, JSON.stringify(dc));
      /* #104: no strip at the bottom; Iko in the header beside "Your cloud"; the page has its space back */
      const strip = await p.evaluate(() => { const a = getComputedStyle(document.body, "::after"), w = document.querySelector("#iko").getBoundingClientRect(), tc = document.querySelector("#to-cloud").getBoundingClientRect(); return { content: a.content, pad: parseFloat(getComputedStyle(document.querySelector("#chat")).paddingBottom), inBar: Boolean(document.querySelector("#chat .bar #iko")), x: w.left, y: w.top, beside: w.right <= tc.left && Math.abs((w.top + w.bottom) / 2 - (tc.top + tc.bottom) / 2) < 8, name: getComputedStyle(document.querySelector(".chat-name")).display }; });
      ok(/^(none|normal)$/.test(strip.content) && strip.pad === 0 && strip.inBar && strip.x < 24 && strip.y < 24 && strip.beside && strip.name === "none", `${tag}: deck: no strip at the bottom; Iko top left in the header beside "Your cloud" (no second "Iko")`, JSON.stringify(strip));
      const lr = await rect(p, "#iko-line"), tt = await rect(p, "#d-title");
      ok(!hit(lr, tt), `${tag}: deck: the bubble never covers "Your deck"`, JSON.stringify({ lr, tt }));
      await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await p.waitForTimeout(250);
      const end = await clear(p, ["#d-tools *", "#d-collect .gslot", "#top li", ".theme-tg", "#d-next .chip", "#d-next .btn"]);
      ok(!end.hits.length, `${tag}: deck: at the end of the page nothing covers the last links`, JSON.stringify(end));
      ok(errs.length === 0, `${tag}: deck: no console errors`, errs.join(" | "));
    } catch (e) { fails.push(`${tag}: deck threw -> ${String(e.message || e).split("\n")[0]}`); }
    await ctx.close();
  }
  /* 4. the cloud: a branch left alone fades (never removed); more life as topics are finished */
  {
    const { ctx, p } = await seeded(width);
    try {
      const st = await p.evaluate(() => { const v = window.__views.filter((x) => x.id === "cloud-canvas").pop().view, C = window.IkoCloud, c = C.deserialize(localStorage.getItem("ikolearn.v1.cloud")), s = v.state(), id = (l) => c.order.find((x) => c.nodes[x].label === l); return { star: s.fade[id("Stargazing")], kid: s.fade[id("Constellations")], vol: s.fade[id("Volcanoes")], vivid: s.vivid, fill: s.fill, n: c.order.length, all: c.order.filter((x) => c.nodes[x].label === "Stargazing").length }; });
      ok(st.star < 1 && st.star >= 0.55 && st.kid === st.star && st.vol === 1 && st.all === 1, `${tag}: a branch untouched for months is drawn quieter (to no less than 55%), never removed`, JSON.stringify(st));
      ok(typeof st.vivid === "number" && st.vivid >= 0 && st.vivid <= 1 && Object.keys(st.fill).length === 3, `${tag}: the cloud's vividness and each subject's fill are known to the drawing`, JSON.stringify(st));
      await p.evaluate(() => { const C = window.IkoCloud, c = C.deserialize(localStorage.getItem("ikolearn.v1.cloud")); c.order.forEach((x) => { const n = c.nodes[x]; if (n.parent && n.parent !== c.order.find((y) => c.nodes[y].label === "Stargazing")) { n.ghost = false; n.opened = true; n.correct = 2; n.mastery = 0.7; } }); localStorage.setItem("ikolearn.v1.cloud", C.serialize(c)); });
      await p.reload({ waitUntil: "networkidle" }); await p.waitForSelector("#cloud:not([hidden])"); await p.waitForTimeout(500);
      const st2 = await p.evaluate(() => { const v = window.__views.filter((x) => x.id === "cloud-canvas").pop().view, s = v.state(); return { vivid: s.vivid, fills: Object.values(s.fill) }; });
      ok(st2.vivid > st.vivid && st2.fills.filter((f) => f === 1).length === 2, `${tag}: finishing topics makes the cloud more vivid and fills its branches`, JSON.stringify({ before: st.vivid, st2 }));
    } catch (e) { fails.push(`${tag}: cloud threw -> ${String(e.message || e).split("\n")[0]}`); }
    await ctx.close();
  }
  /* 5. onboarding: Iko from the start, several learners at once, ideas that cycle, a rotating placeholder, the reassurance */
  {
    const { ctx, p, errs, calls } = await open(width);
    try {
      await p.goto(BASE + "/ikolearn", { waitUntil: "networkidle" });
      const wel = await p.evaluate(() => { const k = document.querySelector(".who .iko-still"), q = document.querySelector("#who-q"), kr = k && k.getBoundingClientRect(), qr = q.getBoundingClientRect(); return { k: Boolean(kr && kr.width >= 40), say: q.classList.contains("say"), beside: Boolean(kr) && kr.right <= qr.left && kr.bottom >= qr.top }; });
      ok(wel.k && wel.say && wel.beside, `${tag}: the very first screen: Iko asks "Who's learning?" (his speech beside him)`, JSON.stringify(wel));
      await p.click('.who-opt[data-who="guide"]');
      ok(await p.evaluate(() => getComputedStyle(document.querySelector("#name-form .iko-still")).visibility === "hidden" && document.querySelector("#name-label").classList.contains("say")), `${tag}: the next question follows as his speech (one Iko on screen)`);
      const lab = await p.evaluate(() => ({ t: document.querySelector("label[for=name-in]") ? document.querySelector("label[for=name-in]").textContent : "", max: document.querySelector("#name-in").maxLength }));
      ok(/first names/.test(lab.t) && lab.max >= 100, `${tag}: a guide can name several learners at once`, JSON.stringify(lab));
      await p.fill("#name-in", "Maya, Leo and Sam"); await p.press("#name-in", "Enter");
      await p.waitForSelector("#cloud:not([hidden])"); await p.waitForTimeout(400);
      const ix = await p.evaluate(() => { const PR = window.IkoProfiles, x = PR.current(localStorage); return { names: x.list.map((l) => l.name), active: x.list.find((l) => l.id === x.active).name, who: document.querySelector("#cloud-who").textContent }; });
      ok(JSON.stringify(ix.names) === JSON.stringify(["Maya", "Leo", "Sam"]) && ix.active === "Maya" && /^Maya/.test(ix.who), `${tag}: three learners added; the first starts, the others wait`, JSON.stringify(ix));
      const l = await p.evaluate(() => ({ asks: Boolean(document.querySelector("#cloud-start .cs-ask #iko")), hi: document.querySelector(".cs-ask .say #cs-hi").textContent, q: document.querySelector(".cs-ask .say #cs-q").textContent, line: !document.querySelector("#iko-line").hidden }));
      ok(l.asks && /^Hi Maya\./.test(l.hi) && /curious/.test(l.q) && !l.line, `${tag}: Iko welcomes and asks the question himself`, JSON.stringify(l));
      const ph1 = await p.evaluate(() => document.querySelector("#cs-in").placeholder);
      await p.waitForTimeout(4100);
      const ph2 = await p.evaluate(() => document.querySelector("#cs-in").placeholder);
      ok(ph1 && ph2 && ph1 !== ph2 && [ph1, ph2].every((x) => x.length <= 34 && x.split(", ").every((y) => EX.map((e) => e.toLowerCase()).includes(y))), `${tag}: the placeholder rotates through a few of the API's ideas`, JSON.stringify([ph1, ph2]));
      for (let i = 0; i < 4; i++) { await p.locator("#cs-ex .ex-chip").first().click(); await p.waitForTimeout(120); }
      const ch = await p.evaluate(() => ({ v: document.querySelector("#cs-in").value, chips: [...document.querySelectorAll("#cs-ex .ex-chip")].map((c) => c.textContent), more: Boolean(document.querySelector("#cs-ex .ex-more")) }));
      ok(ch.chips.length >= 2 && ch.chips.length <= 3 && ch.v.split(",").length === 4 && ch.chips.every((c) => !ch.v.toLowerCase().includes(c.toLowerCase())), `${tag}: 2-3 idea chips that cycle as they're added (no pile-up)`, JSON.stringify(ch));
      await p.click("#cs-form button[type=submit]");
      const re = await waitLine(p, () => document.querySelector("#iko-line").getAttribute("data-react") === "start", 6000);
      const rl = await line(p);
      ok(re && /no wrong picks/.test(rl.text) && /watch here to see what's growing/.test(rl.text), `${tag}: after the interests, a reassurance from Iko`, JSON.stringify(rl));
      ok(calls.filter((c) => c === "/create").length === 1, `${tag}: onboarding: one creation call`, calls.join());
      const c5 = await clear(p, CLOUD_PARTS);
      ok(!c5.hits.length, `${tag}: the reassurance sits clear of the new cloud's controls`, JSON.stringify(c5));
      ok(errs.length === 0, `${tag}: onboarding: no console errors`, errs.join(" | "));
    } catch (e) { fails.push(`${tag}: onboarding threw -> ${String(e.message || e).split("\n")[0]}`); }
    await ctx.close();
  }
}
/* 9. #104: Iko top left in the header at 320, 390, 768 and 1280, in the same place on every screen (no drift); his bubble
   never covers the header's controls or the page; the chat a sheet from below on a phone or tablet, a panel from him on a
   wide screen that sits clear of the deck and the reading */
const boxOf = (p, sels) => p.evaluate((sels) => { const out = {}; for (const s of sels) { const e = document.querySelector(s); if (e && !e.closest("[hidden]") && e.getClientRects().length && getComputedStyle(e).visibility !== "hidden") { const r = e.getBoundingClientRect(); if (r.width && r.height) out[s] = { x: r.left, y: r.top, r: r.right, b: r.bottom }; } } return out; }, sels);
const overl = (a, list) => Object.entries(list).filter(([, b]) => hit(a, b)).map(([k]) => k);
for (const width of [320, 390, 768, 1280]) {
  const tag = "header " + width;
  const { ctx, p, errs } = await seeded(width);
  try {
    await waitLine(p, () => !document.querySelector("#iko-line").hidden, 2500);
    const c = await boxOf(p, ["#iko", "#iko-line", "#cloud-deck", ".zoom", ".home-brand", "#cloud-who", ".cloud-flow", "#panel"]);
    const vw = await p.evaluate(() => innerWidth);
    ok(c["#iko"] && c["#iko"].x < 24 && c["#iko"].y < 24 && c["#iko"].r - c["#iko"].x >= 44, `${tag}: cloud: Iko top left`, JSON.stringify(c["#iko"]));
    const cl = c["#iko-line"];
    ok(cl && cl.y >= c["#iko"].b - 8 && cl.x >= 0 && cl.r <= vw + 0.5 && !overl(cl, { d: c["#cloud-deck"], z: c[".zoom"], b: c[".home-brand"], w: c["#cloud-who"], f: c[".cloud-flow"] }).length, `${tag}: cloud: his bubble under him, clear of the header's controls and the Pick up row`, JSON.stringify(c));
    await p.click("#cloud-deck"); await p.waitForSelector("#deck:not([hidden])"); await p.waitForTimeout(700);
    const HEAD = ["#to-cloud", ".bar .minideck", "#deck-btn", "#who-now"], PAGE = ["#d-back", "#d-title", "#d-lede", "#d-album", "#d-next"];
    const d = await boxOf(p, ["#iko", "#iko-line", ".bar", ...HEAD, ...PAGE]);
    ok(d["#iko"] && Math.abs(d["#iko"].x - c["#iko"].x) <= 1 && Math.abs(d["#iko"].y - c["#iko"].y) <= 1, `${tag}: deck: Iko in the same top-left place as on the cloud (no drift)`, JSON.stringify([c["#iko"], d["#iko"]]));
    const hd = Object.fromEntries(HEAD.map((k) => [k, d[k]]).filter(([, v]) => v)), pg = Object.fromEntries(PAGE.map((k) => [k, d[k]]).filter(([, v]) => v));
    ok(!d["#iko-line"] || (!overl(d["#iko-line"], hd).length && !overl(d["#iko-line"], pg).length && d["#iko-line"].r <= vw + 0.5), `${tag}: deck: his bubble covers neither the header's controls nor the page`, JSON.stringify(d));
    ok(!overl(d["#iko"], hd).length && !overl(d["#iko"], pg).length, `${tag}: deck: Iko covers nothing`, JSON.stringify(d));
    const strip = await p.evaluate(() => ({ after: getComputedStyle(document.body, "::after").content, pad: parseFloat(getComputedStyle(document.querySelector("#chat")).paddingBottom), circles: [...document.querySelectorAll(".bar *")].filter((e) => e.getClientRects().length && getComputedStyle(e).borderRadius === "50%" && !e.closest("#iko-wrap") && !e.textContent.trim() && !e.querySelector("svg, canvas, img")).length }));
    ok(/^(none|normal)$/.test(strip.after) && strip.pad === 0 && strip.circles === 0, `${tag}: deck: no strip or room kept at the bottom, no empty circle in the header`, JSON.stringify(strip));
    await p.click("#iko"); await p.waitForTimeout(400);
    const s = await boxOf(p, ["#iko-sheet", ".bar", "#d-title", "#d-album", "#d-lede", "#d-back"]), ih = await p.evaluate(() => innerHeight);
    const sh = s["#iko-sheet"];
    if (width < 1100) ok(sh && Math.abs(sh.b - ih) < 1 && (width < 600 ? sh.x === 0 && Math.abs(sh.r - vw) < 1 : Math.abs((sh.x + sh.r) / 2 - vw / 2) < 2), `${tag}: the chat rises from below as a sheet`, JSON.stringify({ sh, ih, vw }));
    else ok(sh && sh.x < 24 && sh.y >= s[".bar"].b - 1 && !overl(sh, { t: s["#d-title"], a: s["#d-album"], l: s["#d-lede"], b: s["#d-back"] }).length, `${tag}: the chat hangs from Iko as a panel at the left, clear of the deck`, JSON.stringify(s));
    ok(await p.evaluate(() => document.activeElement && document.activeElement.id === "iko-in"), `${tag}: the chat's field is focused once it's open (mouse and keyboard)`);
    await p.keyboard.press("Escape"); await p.waitForTimeout(250);
    ok(await p.evaluate(() => !document.body.classList.contains("iko-side") && document.querySelector("#iko-sheet").hidden), `${tag}: closing it gives the page its room back`);
    /* the lesson: the same place; the reading's own bubble; the panel clear of the reading and the card */
    await p.click("#to-cloud"); await p.waitForTimeout(500);
    if (!(await p.isHidden("#panel"))) { await p.click("#p-close"); await p.waitForTimeout(200); }
    await p.locator(".cloud-flow > .chip", { hasText: "Magma" }).first().click(); await p.waitForSelector("#l-cont:not([hidden])");
    await waitLine(p, () => !document.querySelector("#iko-line").hidden, 2500);
    const LP = ["#l-back", "#l-title", "#l-body", ".holder", "#l-phase"];
    const l = await boxOf(p, ["#iko", "#iko-line", "#to-cloud", ".bar .minideck", ...LP]), lt = await line(p);
    ok(l["#iko"] && Math.abs(l["#iko"].x - c["#iko"].x) <= 1 && Math.abs(l["#iko"].y - c["#iko"].y) <= 1, `${tag}: lesson: Iko in the same top-left place`, JSON.stringify(l["#iko"]));
    ok(lt && /^Read along and (click|tap) me if you have questions\.$/.test(lt.text) && !overl(l["#iko-line"], Object.fromEntries(["#to-cloud", ".bar .minideck", ...LP].map((k) => [k, l[k]]).filter(([, v]) => v))).length, `${tag}: lesson: "Read along and click me…", clear of the header and the reading`, JSON.stringify({ lt, l }));
    await p.click("#iko"); await p.waitForTimeout(400);
    const ls = await boxOf(p, ["#iko-sheet", ".l-main", ".holder", "#l-body"]);
    if (width >= 1100) ok(!overl(ls["#iko-sheet"], { m: ls[".l-main"], h: ls[".holder"], b: ls["#l-body"] }).length, `${tag}: lesson: the panel sits clear of the reading and the card`, JSON.stringify(ls));
    await p.keyboard.press("Escape");
    ok(errs.length === 0, `${tag}: no console errors`, errs.join(" | "));
  } catch (e) { fails.push(`${tag}: threw -> ${String(e.message || e).split("\n")[0]}`); }
  await ctx.close();
}
/* 6. reactions grow quieter: the 4th pass says nothing (shown the first 3 times, then every 3rd to 12, then every 8th) */
{
  const { ctx, p } = await seeded(390);
  try {
    await p.evaluate(() => { const PR = window.IkoProfiles, who = (PR && PR.current(localStorage) || {}).active || "me"; localStorage.setItem("ikolearn-iko", JSON.stringify({ [who]: { t: { cloud0: 1, cloud1: 1, cloud2: 1, learn0: 1, learn1: 1, check0: 1, check1: 1 }, r: { pass: 3 }, last: "" } })); });
    await p.reload({ waitUntil: "networkidle" }); await p.waitForSelector("#cloud:not([hidden])"); await p.waitForTimeout(400);
    await p.locator(".cloud-flow > .chip", { hasText: "Magma" }).first().click(); await p.waitForSelector("#l-cont:not([hidden])");
    await p.click("#l-cont"); await p.waitForTimeout(200);
    await p.locator("#l-quiz .q").nth(0).locator("input").nth(0).check(); await p.waitForTimeout(100);
    await p.locator("#l-quiz .q").nth(1).locator("input").nth(1).check(); await p.waitForTimeout(400);
    const r = await p.evaluate(() => ({ got: !document.querySelector("#l-got").hidden, react: document.querySelector("#iko-line").hidden ? "" : document.querySelector("#iko-line").getAttribute("data-react"), n: Object.values(JSON.parse(localStorage.getItem("ikolearn-iko")))[0].r.pass }));
    ok(r.got && r.react !== "pass" && r.n === 4, "reactions: the 4th passed check passes quietly (counted, not said)", JSON.stringify(r));
  } catch (e) { fails.push(`reactions threw -> ${String(e.message || e).split("\n")[0]}`); }
  await ctx.close();
}
/* 7. reduced motion: no breathing, bobbing or blinking */
{
  const { ctx, p } = await seeded(390, { reduce: true });
  try {
    const a = await p.evaluate(() => ({ pebble: getComputedStyle(document.querySelector(".iko-pebble")).animationName, eye: getComputedStyle(document.querySelector(".iko-eye")).animationName, line: getComputedStyle(document.querySelector("#iko-line")).animationName }));
    ok(a.pebble === "none" && a.eye === "none" && a.line === "none", "reduced motion: Iko is still", JSON.stringify(a));
  } catch (e) { fails.push(`reduced threw -> ${String(e.message || e).split("\n")[0]}`); }
  await ctx.close();
  const m = await seeded(390);
  try {
    const a = await m.p.evaluate(() => ({ pebble: getComputedStyle(document.querySelector(".iko-pebble")).animationName, eye: getComputedStyle(document.querySelector(".iko-eye")).animationName }));
    ok(/iko-breathe/.test(a.pebble) && /iko-bob/.test(a.pebble) && /iko-blink/.test(a.eye), "motion: Iko breathes, bobs and blinks", JSON.stringify(a));
  } catch (e) { fails.push(`motion threw -> ${String(e.message || e).split("\n")[0]}`); }
  await m.ctx.close();
}
/* 8. dark mode: the new pieces use the palette and read at AA */
{
  const { ctx, p } = await seeded(390, { dark: true, before: () => localStorage.setItem("ikolearn-theme", "dark") });
  try {
    await waitLine(p, () => !document.querySelector("#iko-line").hidden, 2500);
    const contrast = () => p.evaluate(() => {
      const rgb = (s) => (s.match(/[\d.]+/g) || []).map(Number);
      const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      const bgOf = (e) => { for (let x = e; x; x = x.parentElement) { const c = rgb(getComputedStyle(x).backgroundColor); if (c.length >= 3 && (c.length < 4 || c[3] > 0.5)) return c; } return rgb(getComputedStyle(document.body).backgroundColor); };
      const out = {};
      for (const s of ["#iko-line", "#l-cont", "#l-quiz .q-lede", "#l-quiz legend", "#l-quiz .q-miss .l-head", "#l-quiz .q-miss .clar", ".d-sec", "#d-collect .fine", "#cloud-deck .md-n"]) {
        const e = document.querySelector(s); if (!e || !e.getClientRects().length) continue;
        const a = lum(rgb(getComputedStyle(e).color)), b = lum(bgOf(e));
        out[s] = Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100;
      }
      return { out, theme: document.documentElement.getAttribute("data-theme") };
    });
    const a = await contrast();
    await p.locator(".cloud-flow > .chip", { hasText: "Magma" }).first().click(); await p.waitForSelector("#l-cont:not([hidden])"); await p.waitForTimeout(200);
    const b = await contrast();
    await p.click("#l-cont"); await p.waitForTimeout(200);
    await p.locator("#l-quiz .q").nth(0).locator("input").nth(1).check(); await p.waitForTimeout(100);
    await p.locator("#l-quiz .q").nth(1).locator("input").nth(0).check(); await p.waitForTimeout(300);
    const c = await contrast();
    await p.click("#l-back"); await p.waitForTimeout(700); if (!(await p.isHidden("#panel"))) { await p.click("#p-close"); await p.waitForTimeout(200); }
    await p.click("#cloud-deck"); await p.waitForSelector("#deck:not([hidden])"); await p.waitForTimeout(200);
    const d = await contrast();
    const all = Object.assign({}, a.out, b.out, c.out, d.out);
    const need = ["#iko-line", "#l-cont", "#l-quiz .q-miss .l-head", "#l-quiz .q-miss .clar", ".d-sec", "#d-collect .fine"];
    ok(a.theme === "dark" && need.every((k) => all[k] >= 4.5) && Object.values(all).every((v) => v >= 4.5), "dark mode: Iko's bubble, Continue, the missed-check box and the deck's sections read at AA", JSON.stringify(all));
  } catch (e) { fails.push(`dark threw -> ${String(e.message || e).split("\n")[0]}`); }
  await ctx.close();
}
await browser.close();
server.close();
if (fails.length) { console.error(`ikolearn companion e2e: ${pass} passed, ${fails.length} FAILED`); for (const f of fails) console.error("  x " + f); process.exit(1); }
console.log(`ikolearn companion e2e: ${pass} passed`);
