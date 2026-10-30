// End-to-end checks for a cloud with no fixed limits, in a real browser, every /api/ikolearn call mocked (no model
// calls). A seeded 40-subject, 2000+ node cloud at 390 (CPU throttled 4x) and 1280: it loads and renders, every subject
// has its own hue, Recentre frames it all, frames stay quick, tapping an outer-shell subject focuses it and opens its
// card, Iko makes subject #41 as a root (not under the focused subject) with one call and a bounded prompt, an existing
// subject outside the prompt's subset is focused (not duplicated), and a full browser store keeps the last good save.
// Prints the measured draw times and bytes per node.
// Run: IKOLEARN_PW=<path to node_modules/playwright-core> node scripts/ikolearn-limits-e2e.mjs [--shots DIR]
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const SHOTS = arg("--shots", ""), ROOT = path.resolve(arg("--root", "public"));
if (!process.env.IKOLEARN_PW) { console.log("ikolearn limits e2e: skipped (set IKOLEARN_PW to a playwright-core folder)"); process.exit(0); }
const PW = await import(pathToFileURL(path.join(process.env.IKOLEARN_PW, "index.mjs")).href), { chromium } = PW; /* IKOLEARN_BROWSER=webkit|firefox runs the same checks in that engine */
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p === "/ikolearn" || p === "/ikolearn/") p = "/ikolearn/index.html";
  if (p === "/ikolearn/learners") p = "/ikolearn/learners.html";
  if (p === "/ikolearn/family") p = "/ikolearn/family.html";
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

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const CM = require("../public/ikolearn/cloud-model.js");

/* A big seeded cloud, built here with the real model: 40 subjects, 50 topics each (half explored, half placeholders), every
   one with its description line -> 2040 nodes. */
const NAMES = ["Astronomy", "Botany", "Jazz", "Pottery", "Chess", "Origami", "Geology", "Sailing", "Poetry", "Robotics", "Cooking", "Italian",
  "Knitting", "Economics", "Archery", "Birdwatching", "Calligraphy", "Dance", "Ecology", "Fencing", "Gardening", "Hiking", "Illustration", "Juggling",
  "Kayaking", "Linguistics", "Magic Tricks", "Nutrition", "Oceanography", "Photography", "Quilting", "Rowing", "Sculpture", "Theatre", "Urban Design",
  "Violin", "Weaving", "Xylophone", "Yoga", "Zoology"];
const T = Date.UTC(2026, 9, 20, 12);
function bigCloud(perSubject) {
  const c = CM.create("Maya", T);
  NAMES.forEach((name, i) => {
    CM.applyTopics(c, [{ name, signal: "explored", asSubject: true, blurb: name + " in plain words, one small step at a time, for anyone." }], T + i * 1000);
    const s = CM.subjects(c)[i];
    for (let k = 0; k < perSubject; k++) {
      CM.applyTopics(c, [{ name: name.split(" ")[0] + " step " + (k + 1), signal: k % 2 ? "curious" : "explored", under: s.id }], T + i * 1000 + k + 1);
    }
  });
  c.order.forEach((x, j) => { const n = c.nodes[x]; if (!n.blurb) n.blurb = n.label + " explained in plain words, step by step, for anyone."; if (n.parent && j % 2) { n.ghost = true; n.weight = 0; } });
  return c;
}
const BIG = bigCloud(50);
const BIG_TEXT = CM.serialize(BIG);
const BYTES = Buffer.byteLength(BIG_TEXT);

const nd = (rows) => rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
const BL = (x) => x + " explained in plain words, one small step at a time, for anyone.";
const REPLY = (text) => {
  if (/beekeeping/i.test(text)) return { say: "Beekeeping is a lovely thing to learn.", topics: [{ name: "Beekeeping", parent: "", signal: "curious", chain: [], placement: "parent", target: "", why: "a whole subject of its own", blurb: BL("Beekeeping") }] };
  if (/calligraphy/i.test(text)) return { say: "You already have Calligraphy.", topics: [{ name: "Calligraphy", parent: "", signal: "curious", chain: [], placement: "parent", target: "", why: "a subject", blurb: BL("Calligraphy") }] };
  if (/falconry/i.test(text)) return { say: "Falconry is an old craft.", topics: [{ name: "Falconry", parent: "", signal: "curious", chain: [], placement: "parent", target: "", why: "its own subject", blurb: BL("Falconry") }] };
  return { say: "Happy to help with that.", topics: [] };
};
async function open(width) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 860 }, timezoneId: "America/Toronto" });
  const p = await ctx.newPage();
  p.setDefaultTimeout(8000);
  const errs = [], calls = [], bodies = [];
  p.on("pageerror", (e) => errs.push("pageerror " + e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await p.addInitScript(HOOK);
  await p.route("**/api/ikolearn/**", async (r) => {
    const at = new URL(r.request().url()).pathname.replace("/api/ikolearn", "");
    let b = {}; try { b = JSON.parse(r.request().postData() || "{}"); } catch { b = {}; }
    calls.push(at + (at === "/chat" ? ":" + b.mode : "")); bodies.push({ at, b });
    if (at === "/examples") return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, examples: ["Rain"], growth: ["Patience"] }) });
    if (at === "/chat") { const t = ((b.messages || []).filter((m) => m.role === "user").pop() || {}).text || ""; const rp = REPLY(t); return r.fulfill({ status: 200, contentType: "application/x-ndjson", body: nd([{ t: "start", model: "m" }, { t: "delta", text: rp.say }, { t: "cloud", topics: rp.topics, ghosts: [] }, { t: "done" }]) }); }
    return r.fulfill({ status: 503, contentType: "application/json", body: '{"ok":false,"reason":"off"}' });
  });
  return { ctx, p, errs, calls, bodies };
}
const shot = async (p, w, name) => { if (SHOTS) { await p.waitForTimeout(300); await p.screenshot({ path: path.join(SHOTS, `limits-${w}-${name}.png`) }); } };
const SEED = (text) => {
  localStorage.setItem("ikolearn.v1.name", "Maya"); localStorage.setItem("ikolearn.v1.cloud", text);
  localStorage.setItem("ikolearn.v1.seen", JSON.stringify({ c: {}, ev: 0, h: { cloud: 1, card: 1, chat: 1, draw: 1, iko: 1 } }));
  localStorage.setItem("ikolearn.v1.thread", JSON.stringify([{ id: "m1", at: Date.now(), role: "model", local: true, text: "Welcome back, Maya." }]));
};
const view = (p) => p.evaluate(() => window.__views.filter((x) => x.id === "cloud-canvas").pop().view.state());
const cloudOf = (p) => p.evaluate(() => { const C = window.IkoCloud, c = C.deserialize(localStorage.getItem("ikolearn.v1.cloud")); return { n: c.order.length, subjects: C.subjects(c).map((s) => ({ label: s.label, hue: s.hue, id: s.id })), parentOf: (() => { const o = {}; c.order.forEach((x) => { const n = c.nodes[x]; o[n.label] = n.parent ? c.nodes[n.parent].label : null; }); return o; })() }; });
const xyOf = (p, label) => p.evaluate((l) => { const v = window.__views.filter((x) => x.id === "cloud-canvas").pop().view, C = window.IkoCloud, c = C.deserialize(localStorage.getItem("ikolearn.v1.cloud")), id = c.order.find((x) => c.nodes[x].label === l), q = v.project(id), r = document.querySelector("#cloud-canvas").getBoundingClientRect(); return { x: r.left + q.x, y: r.top + q.y, inside: q.x > 8 && q.x < r.width - 8 && q.y > 8 && q.y < r.height - 8 }; }, label);
async function tap(p, label) {
  if (!(await p.isHidden("#panel"))) { await p.click("#p-close"); await p.waitForTimeout(250); }
  await p.click("#zreset"); await p.waitForTimeout(1400);
  for (const [dx, dy] of [[0, 0], [0, -8], [0, 8], [-10, 0], [10, 0], [0, -14], [0, 14]]) {
    const pt = await xyOf(p, label);
    const t0 = Date.now();
    await p.mouse.click(pt.x + dx, pt.y + dy);
    try { await p.waitForFunction((l) => !document.querySelector("#panel").hidden && document.querySelector("#p-title").textContent === l, label, { timeout: 1500 }); return Date.now() - t0; } catch { /* a neighbour */ }
    if (!(await p.isHidden("#panel"))) { await p.click("#p-close"); await p.waitForTimeout(250); }
    await p.click("#zreset"); await p.waitForTimeout(1200);
  }
  return 0;
}
async function ask(p, text) {
  await p.fill("#iko-in", text); await p.press("#iko-in", "Enter");
  await p.waitForFunction(() => !document.querySelector("#iko-log .streaming") && document.querySelectorAll("#iko-log .iko-msg.model").length > 0, null, { timeout: 8000 });
  await p.waitForTimeout(800);
}
/* frames: force a redraw every frame (turning a little) and read how long each draw took */
const frames = (p, n) => p.evaluate((n) => new Promise((done) => {
  const v = window.__views.filter((x) => x.id === "cloud-canvas").pop().view, ms = [], gaps = [];
  let last = performance.now(), i = 0;
  const step = () => {
    const now = performance.now(); gaps.push(now - last); last = now;
    if (i > 0) ms.push(v.state().drawMs);
    if (i++ >= n) { const s = (a) => a.slice().sort((x, y) => x - y); const q = (a, k) => s(a)[Math.min(a.length - 1, Math.floor(a.length * k))]; return done({ drawAvg: ms.reduce((a, b) => a + b, 0) / ms.length, drawP95: q(ms, 0.95), frameAvg: gaps.slice(2).reduce((a, b) => a + b, 0) / (gaps.length - 2), frameP95: q(gaps.slice(2), 0.95), drawn: v.state().drawn }); }
    v.setView({ yaw: v.state().yaw + 0.02 });
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}), n);
const perf = {};

for (const width of [390, 1280]) {
  const tag = String(width);
  const { ctx, p, errs, calls, bodies } = await open(width);
  try {
    await p.goto(BASE + "/ikolearn"); await p.evaluate(SEED, BIG_TEXT);
    const t0 = Date.now();
    await p.goto(BASE + "/ikolearn", { waitUntil: "networkidle" });
    if (await p.isHidden("#cloud")) await p.click("#thumb");
    await p.waitForFunction(() => !document.querySelector("#cloud").hidden && window.__views && window.__views.some((x) => x.id === "cloud-canvas"), null, { timeout: 8000 });
    await p.waitForTimeout(900);
    const bootMs = Date.now() - t0;
    let cl = await cloudOf(p);
    ok(cl.subjects.length === 40 && cl.n === BIG.order.length && cl.n >= 2000, `${tag}: a 40-subject, ${BIG.order.length}-node cloud loads (${BYTES} bytes saved)`, JSON.stringify({ s: cl.subjects.length, n: cl.n }));
    ok(new Set(cl.subjects.map((s) => s.hue)).size === 40, `${tag}: every one of the 40 subjects has its own hue`);
    let st = await view(p);
    ok(st.drawn > 40 && st.drawn <= 260, `${tag}: it renders (at most DRAW_CAP points at once)`, JSON.stringify(st));
    await p.click("#zreset"); await p.waitForTimeout(1400);
    const inside = [];
    for (const s of cl.subjects) inside.push((await xyOf(p, s.label)).inside);
    ok(inside.filter(Boolean).length >= 38, `${tag}: Recentre frames the whole cloud (subjects in view: ${inside.filter(Boolean).length}/40)`);
    st = await view(p);
    ok(st.zoom < 1 && st.zoom > 0.25, `${tag}: Recentre zooms out to fit a big cloud`, String(st.zoom));
    await p.mouse.move(5, 5);
    await shot(p, width, "zoomed-out");
    /* perf (390: CPU throttled 4x, as a slow phone) */
    const cdp = width < 500 ? await ctx.newCDPSession(p) : null;
    if (cdp) await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    const fr = await frames(p, 90);
    const work = await p.evaluate(() => { const C = window.IkoCloud, txt = localStorage.getItem("ikolearn.v1.cloud"), t = (f) => { const a = performance.now(); for (let i = 0; i < 5; i++) f(); return (performance.now() - a) / 5; }; const c = C.deserialize(txt); return { layoutMs: t(() => C.layout(c)), serializeMs: t(() => C.serialize(c)), deserializeMs: t(() => C.deserialize(txt)), promptMs: t(() => C.promptView(c, null, "tell me about weaving")) }; });
    perf[tag] = { bootMs, ...fr, ...work };
    ok(work.layoutMs + work.serializeMs < 100, `${tag}: a save and a re-layout of the big cloud take ${(work.layoutMs + work.serializeMs).toFixed(0)} ms${cdp ? " (CPU 4x slower)" : ""}`, JSON.stringify(work));
    ok(fr.drawP95 < 16, `${tag}: drawing a frame of the big cloud stays under 16 ms (p95 ${fr.drawP95.toFixed(1)} ms${cdp ? ", CPU 4x slower" : ""})`, JSON.stringify(fr));
    /* focus + card on an outer-shell subject */
    const tapMs = await tap(p, "Weaving");
    perf[tag].tapToCardMs = tapMs;
    ok(tapMs > 0 && tapMs < 1500, `${tag}: tapping Weaving (an outer-shell subject) opens its card (${tapMs} ms)`);
    await p.waitForTimeout(900);
    st = await view(p);
    const weave = cl.subjects.find((s) => s.label === "Weaving");
    ok(st.focus === weave.id, `${tag}: the camera focuses Weaving`, JSON.stringify(st.focus));
    await shot(p, width, "focused");
    if (cdp) await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    /* Iko from Weaving's card: a new broad subject is subject #41, a root (never under Weaving) */
    await p.click("#p-chat"); await p.waitForTimeout(300);
    const c0 = calls.length;
    await ask(p, "I want to learn beekeeping");
    const b = bodies.filter((x) => x.at === "/chat").pop().b;
    cl = await cloudOf(p);
    ok(cl.subjects.length === 41 && cl.parentOf.Beekeeping === null, `${tag}: Iko makes Beekeeping subject #41, a root (not under the focused Weaving)`, JSON.stringify({ n: cl.subjects.length, p: cl.parentOf.Beekeeping }));
    const bee = cl.subjects.find((s) => s.label === "Beekeeping");
    ok(bee && cl.subjects.every((s) => s === bee || s.hue !== bee.hue), `${tag}: #41 has its own hue`);
    ok(calls.slice(c0).join() === "/chat:chat", `${tag}: one chat call, nothing else`, calls.slice(c0).join());
    ok(Array.isArray(b.parents) && b.parents.length <= 12 && b.parents[0] === "Weaving" && String(b.cloud).length <= 2000 && /more subjects on the cloud/.test(b.cloud), `${tag}: the prompt sees a bounded subset (${b.parents.length} subjects, ${String(b.cloud).length} chars), the focused subject first`, JSON.stringify({ p: b.parents, n: String(b.cloud).length }));
    if (width < 700) { await p.keyboard.press("Escape"); await p.waitForTimeout(700); }
    await p.waitForTimeout(600);
    st = await view(p);
    ok(st.focus === bee.id && (await p.textContent("#p-title")) === "Beekeeping", `${tag}: the camera glides to Beekeeping and its card opens`, JSON.stringify({ f: st.focus }));
    await shot(p, width, "new-41");
    if (!(await p.isHidden("#iko-sheet"))) { await p.keyboard.press("Escape"); await p.waitForTimeout(300); }
    /* dedupe against the whole cloud: Calligraphy is not in the prompt's subset but already on the cloud */
    await p.click("#p-chat"); await p.waitForTimeout(300);
    const n1 = (await cloudOf(p)).n, c1 = calls.length;
    await ask(p, "tell me about calligraphy");
    const b2 = bodies.filter((x) => x.at === "/chat").pop().b;
    cl = await cloudOf(p);
    ok(cl.n === n1 && cl.subjects.filter((s) => s.label === "Calligraphy").length === 1 && calls.slice(c1).join() === "/chat:chat", `${tag}: an existing subject (named in the message) is focused, not duplicated`, JSON.stringify({ n: cl.n, n1 }));
    ok(b2.parents.includes("Calligraphy"), `${tag}: a subject named in the message is in the prompt's subset`, JSON.stringify(b2.parents));
    if (!(await p.isHidden("#iko-sheet"))) { await p.keyboard.press("Escape"); await p.waitForTimeout(300); }
    /* a full browser store: the last good save stays, the app keeps working, Iko says so once */
    const saved = await p.evaluate(() => localStorage.getItem("ikolearn.v1.cloud"));
    await p.evaluate(() => { const real = Storage.prototype.setItem; window.__realSet = real; Storage.prototype.setItem = function (k, v) { if (/^ikolearn\.v1\.(cloud|lessons|notes)$/.test(k)) { const e = new DOMException("full", "QuotaExceededError"); throw e; } return real.call(this, k, v); }; });
    if (!(await p.isHidden("#panel"))) { await p.click("#p-close"); await p.waitForTimeout(250); }
    await p.click("#iko"); await p.waitForTimeout(300);
    await ask(p, "and falconry?");
    const after = await p.evaluate(() => localStorage.getItem("ikolearn.v1.cloud"));
    const mem = await p.evaluate(() => { const v = window.__views.filter((x) => x.id === "cloud-canvas").pop().view; return v.state().focus; });
    const line = await p.evaluate(() => document.querySelector("#iko-line").textContent + " | " + document.querySelector("#iko-log").innerText);
    ok(after === saved, `${tag}: storage full: the last good save is left exactly as it was`);
    ok(Boolean(mem) && errs.length === 0, `${tag}: storage full: the app keeps working (Falconry is on the cloud for this visit)`, errs.join(" | "));
    ok(/storage is full/.test(line), `${tag}: storage full: a quiet note from Iko (in the sheet when it is open)`, line);
    await p.evaluate(() => { Storage.prototype.setItem = window.__realSet; });
    ok(!errs.length, `${tag}: no console errors`, errs.join(" | "));
  } catch (e) {
    ok(false, `${tag}: threw`, String(e && e.message).split("\n")[0]);
  } finally { await ctx.close(); }
}

await browser.close();
server.close();
console.log("perf " + JSON.stringify(perf) + " bytes " + BYTES + " nodes " + BIG.order.length + " chars/node " + (BIG_TEXT.length / BIG.order.length).toFixed(1));
if (fails.length) {
  console.error(`ikolearn limits e2e: ${pass} passed, ${fails.length} FAILED`);
  for (const f of fails) console.error("  x " + f);
  process.exit(1);
}
console.log(`ikolearn limits e2e: ${pass} passed`);
