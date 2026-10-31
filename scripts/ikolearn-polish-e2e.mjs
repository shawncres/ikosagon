// End-to-end checks for the home node and the quieter cloud (PR 99), in a real browser, every /api/ikolearn call mocked
// (no model calls), at 390 and 1280: lines to finished topics take their colour and open ones are dark ink (read off the
// canvas); Iko is a pebble top-left, clear of the invite/return row; the selection card is compact (title, a short
// description, its three actions, a short path, no embedded cards); the name is centred on load and after Recentre, on a
// ringed plate, and tapping it opens the stats card (achievements, progress, recent activity, Save/Open IkoCloud, no "What do
// you notice"); "I've got it" saves first, then the card flies into the Deck and the Deck pulses (no flight with reduced
// motion); the intake's targets are all 44px and nothing overlaps.
// Run: IKOLEARN_PW=<path to node_modules/playwright-core> node scripts/ikolearn-polish-e2e.mjs [--root public]
import { passCheck } from "./fixtures/ikolearn-pass-check.mjs";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const ROOT = path.resolve(arg("--root", "public"));
if (!process.env.IKOLEARN_PW) { console.log("ikolearn polish e2e: skipped (set IKOLEARN_PW to a playwright-core folder)"); process.exit(0); }
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
const nd = (rows) => rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
const QS = [{ q: "What makes the tides rise and fall?", options: ["The moon's pull", "The wind", "Fish"], answer: 0 }];
const LESSON = nd([{ t: "start", model: "m" }, { t: "delta", text: "INTRO: Tides are the sea rising and falling twice a day.\nEXPLAIN: The moon pulls on the water, and the oceans bulge toward it." }, { t: "path", steps: [], next: "", choices: [], questions: QS, tricky: "Like a blanket pulled by a friend." }, { t: "done" }]);
const SEED = ({ now, hello, fresh, visits }) => {
  const C = window.IkoCloud, T = now - 20 * 864e5, c = C.create("Maya", T);
  const subs = [["Nature", "Ocean Life", ["Coral Reefs", "Whales", "Tides", "Deep Sea"]], ["Art", "Drawing", ["Shapes", "Shading", "Lines"]], ["Music", "Rhythm", ["Beats", "Tempo", "Drums"]]];
  subs.forEach(([sub, top, k], i) => C.applyCreate(c, { items: [{ node: { name: top, chain: [sub] }, card: { title: top, blurb: top + " in plain words.", goal: "" }, children: k.map((x, j) => ({ name: x, order: j + 1, score: 0.8 - j * 0.1, why: "", role: "core", blurb: x + " in plain words, step by step." })) }] }, { t: T + i * 1000 }));
  const id = (l) => c.order.find((x) => c.nodes[x].label === l);
  const act = { "Coral Reefs": { ago: 1, done: 1, right: 3 }, Whales: { ago: 2, done: 1, right: 2 }, Shapes: { ago: 3, done: 1, right: 2 }, Shading: { ago: 0, right: 1 }, "Ocean Life": { ago: 0, right: 1 } };
  Object.entries(act).forEach(([l, a]) => { const n = c.nodes[id(l)]; const at = now - a.ago * 864e5; n.ghost = false; n.opened = true; n.engaged = 2; n.touched = at; if (a.right) { n.correct = a.right; n.mastery = a.done ? 0.8 : 0.4; } if (a.done) n.doneAt = at; });
  ["Tides", "Lines", "Deep Sea"].forEach((l) => { const n = c.nodes[id(l)]; n.ghost = false; });
  C.applyPath(c, id("Ocean Life"), ["Coral Reefs", "Whales", "Tides", "Deep Sea"], "Tides", now - 864e5);
  C.attachCard(c, { topic: "Coral Reefs", parent: "Ocean Life", chain: ["Nature", "Ocean Life"], title: "Coral reefs are alive", body: "Coral reefs are built by tiny animals called polyps. Each one makes a little stony cup, and over hundreds of years the cups pile up into a reef that shelters a quarter of all sea life." }, now - 864e5);
  C.attachCard(c, { topic: "Ocean Life", parent: "", chain: ["Nature"], title: "The ocean is mostly dark", body: "Sunlight only reaches the top 200 metres of the sea. Below that, animals make their own light, and most of the ocean has never been seen by people." }, now - 2 * 864e5);
  c.order.forEach((x) => { if (!c.nodes[x].blurb) c.nodes[x].blurb = c.nodes[x].label + " in plain words, a little at a time."; });
  c.profile.onboarded = T; c.profile.visits = visits != null ? visits : hello ? 1 : 6; c.profile.lessonVisit = 6; c.profile.askedAt = now;
  Object.assign(C.dirOf(c), { off: now });
  C.joinDeck(c, now);
  localStorage.setItem("ikolearn.v1.name", "Maya"); localStorage.setItem("ikolearn.v1.cloud", C.serialize(c));
  localStorage.setItem("ikolearn.v1.seen", JSON.stringify({ c: {}, ev: 0, h: { aboutCloud: 1, aboutLesson: 1, aboutDeck: 1, cloud: 1, card: 1, deck: 1, iko: hello || fresh ? 0 : 1, grow: 1 } }));
  localStorage.setItem("ikolearn.v1.thread", JSON.stringify([{ id: "m1", at: T, role: "model", local: true, text: "Welcome back, Maya." }]));
};
async function open(width, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 860 }, timezoneId: "America/Toronto", ...opts });
  const p = await ctx.newPage();
  p.setDefaultTimeout(8000);
  const errs = [];
  p.on("pageerror", (e) => errs.push("pageerror " + e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await p.addInitScript(HOOK);
  await p.route("**/api/ikolearn/**", async (r) => {
    const at = new URL(r.request().url()).pathname.replace("/api/ikolearn", "");
    if (at === "/examples") return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, examples: ["Stars", "Rain", "Games", "Kites", "Chess", "Gardens"], growth: ["Patience"] }) });
    if (at === "/lesson") return r.fulfill({ status: 200, contentType: "application/x-ndjson", body: LESSON });
    return r.fulfill({ status: 503, contentType: "application/json", body: '{"ok":false,"reason":"off"}' });
  });
  return { ctx, p, errs };
}
async function boot(width, o = {}, opts = {}) { const x = await open(width, opts); await x.p.goto(BASE + "/ikolearn"); await x.p.evaluate(SEED, { now: Date.now(), ...o }); await x.p.goto(BASE + "/ikolearn", { waitUntil: "networkidle" }); await x.p.waitForTimeout(1300); return x; }
const idOf = (p, label) => p.evaluate((l) => { const c = window.IkoCloud.deserialize(localStorage.getItem("ikolearn.v1.cloud")); return c.order.find((x) => c.nodes[x].label === l); }, label);
const nodeAt = (p, label) => p.evaluate((l) => { const v = window.__views.filter((x) => x.id === "cloud-canvas").pop().view, C = window.IkoCloud, c = C.deserialize(localStorage.getItem("ikolearn.v1.cloud")), id = l === "root" ? "root" : c.order.find((x) => c.nodes[x].label === l), q = v.project(id), r = document.querySelector("#cloud-canvas").getBoundingClientRect(); return { x: r.left + q.x, y: r.top + q.y }; }, label);
const tap = async (p, label) => { const a = await nodeAt(p, label); await p.mouse.click(a.x, a.y); await p.waitForTimeout(1100); };
const homeAt = (p) => p.evaluate(() => { const v = window.__views.filter((x) => x.id === "cloud-canvas").pop().view, q = v.project("root"), c = document.querySelector("#cloud-canvas"); return { dx: Math.round(q.x - c.clientWidth / 2), dy: Math.round(q.y - c.clientHeight / 2), focus: v.state().focus }; });
const box = (p, sel) => p.evaluate((s) => { const e = document.querySelector(s); if (!e || !e.getClientRects().length) return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, b: r.bottom, r: r.right }; }, sel);
const meets = (a, b) => a && b && a.x < b.r && b.x < a.r && a.y < b.b && b.y < a.b;
/*
 * The colour of a line between a node and its parent, read off the canvas: samples along the middle of the segment and
 * keeps the most strongly drawn pixel (furthest from the paper). -> { off, dark, rgb }: off is how far that pixel is from
 * the paper-to-ink scale (0 for sepia ink at any strength, large for a coloured line); dark is how far along it is.
 */
const lineInk = (p, label) => p.evaluate((l) => {
  const v = window.__views.filter((x) => x.id === "cloud-canvas").pop().view, C = window.IkoCloud, c = C.deserialize(localStorage.getItem("ikolearn.v1.cloud"));
  const id = c.order.find((x) => c.nodes[x].label === l), a = v.project(c.nodes[id].parent), b = v.project(id), cv = document.querySelector("#cloud-canvas"), k = cv.width / cv.clientWidth;
  /* the canvas is see-through over the paper: each pixel is laid over the page's paper colour first */
  const bg = getComputedStyle(document.body).backgroundColor.match(/\d+/g).map(Number), ink = [0x2b, 0x21, 0x18];
  const g = cv.getContext("2d"), px = (x, y) => { const d = g.getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data, al = d[3] / 255; return [0, 1, 2].map((i) => d[i] * al + bg[i] * (1 - al)); };
  const axis = ink.map((x, i) => x - bg[i]), len2 = axis.reduce((s2, x) => s2 + x * x, 0);
  let best = null;
  for (let t = 0.3; t <= 0.7; t += 0.02) {
    const x0 = a.x + (b.x - a.x) * t, y0 = a.y + (b.y - a.y) * t;
    for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) {
      const d = px(x0 + dx * 0.5, y0 + dy * 0.5), rel = d.map((x, i) => x - bg[i]);
      const along = Math.max(0, rel.reduce((s2, x, i) => s2 + x * axis[i], 0) / len2), off = Math.hypot(...rel.map((x, i) => x - along * axis[i])), far = Math.hypot(...rel);
      if (!best || far > best.far) best = { far, off, dark: along, rgb: d.map(Math.round) };
    }
  }
  return { off: Math.round(best.off), dark: +best.dark.toFixed(2), rgb: best.rgb.join(",") };
}, label);

for (const width of [390, 1280]) {
  const tag = String(width);
  /* A. lines: a finished topic's line takes its colour; an open one is dark sepia ink */
  {
    const { ctx, p, errs } = await boot(width);
    await tap(p, "Ocean Life"); await p.click("#p-close"); await p.waitForTimeout(500);
    await p.evaluate(() => window.__views.filter((x) => x.id === "cloud-canvas").pop().view.setIdle && 0);
    const doneL = await lineInk(p, "Coral Reefs"), openL = await lineInk(p, "Tides");
    ok(doneL.off >= 30, `${tag}: lines: a finished topic's line is drawn in its colour`, JSON.stringify(doneL));
    ok(openL.off <= 14 && openL.dark >= 0.3, `${tag}: lines: an open topic's line is dark sepia ink`, JSON.stringify(openL));
    ok(errs.length === 0, `${tag}: lines: no page errors`, errs.join(" | "));
    await ctx.close();
  }
  /* B, C. Iko top-left clear of the invite/return row; the compact selection card */
  {
    const { ctx, p, errs } = await boot(width);
    const ik = await box(p, "#iko"), flow = await box(p, ".cloud-flow");
    ok(ik && ik.x < 24 && ik.y < 24 && ik.w >= 44 && ik.h >= 44, `${tag}: Iko: the pebble at the top left, 44px (PR 104)`, JSON.stringify(ik));
    ok(!flow || !meets(ik, flow), `${tag}: Iko: never over the invite/return row`, JSON.stringify([ik, flow]));
    await tap(p, "Ocean Life");
    const card = await p.evaluate(() => {
      const pn = document.querySelector("#panel"), vis = (s) => { const e = pn.querySelector(s); return Boolean(e && !e.hidden && e.getClientRects().length); };
      const steps = [...pn.querySelectorAll("#p-path ol li")];
      return { title: pn.querySelector("#p-title").textContent, desc: vis("#p-desc") ? pn.querySelector("#p-desc").textContent : "", lesson: vis("#p-lesson"), card: vis("#p-card"), chat: vis("#p-chat"), embedded: pn.querySelectorAll(".card, .tile, .deck-card").length, steps: steps.length, more: (pn.querySelector(".path-more") || {}).textContent || "", other: /Other branches/.test(pn.textContent), h: pn.getBoundingClientRect().height };
    });
    ok(card.title === "Ocean Life" && card.desc.length > 0 && card.desc.length <= 200, `${tag}: compact card: the title and a short description`, JSON.stringify(card));
    ok(card.lesson && card.card && card.chat, `${tag}: compact card: lesson, its card and Talk to Iko`);
    ok(card.embedded === 0 && !card.other, `${tag}: compact card: no embedded cards, no other branches`, JSON.stringify(card));
    ok(card.steps >= 1 && card.steps <= 3 && /4 steps in all/.test(card.more), `${tag}: compact card: a short path (3 steps around the next), the rest on its card`, JSON.stringify(card));
    ok(card.h <= (width < 500 ? 520 : 560), `${tag}: compact card: compact`, String(card.h));
    const pan = await box(p, "#panel"), ik2 = await box(p, "#iko");
    ok(!meets(pan, ik2), `${tag}: the card never covers Iko`, JSON.stringify([pan, ik2]));
    await p.click("#p-chat"); await p.waitForTimeout(500);
    ok(!(await p.isHidden("#iko-sheet")), `${tag}: Talk to Iko still opens Iko`);
    ok(errs.length === 0, `${tag}: card: no page errors`, errs.join(" | "));
    await ctx.close();
  }
  /* D, G. the home node: centred on load and after Recentre, a distinct root; tapping it opens the stats card */
  {
    const { ctx, p, errs } = await boot(width);
    const h0 = await homeAt(p);
    ok(Math.abs(h0.dx) <= 2 && h0.dy >= 0 && h0.dy <= 60 && !h0.focus, `${tag}: home: the name is centred on load`, JSON.stringify(h0));
    const c = await box(p, "#cloud-canvas");
    await p.mouse.move(c.x + c.w * 0.7, c.y + c.h * 0.6); await p.mouse.down(); await p.mouse.move(c.x + c.w * 0.3, c.y + c.h * 0.3, { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(400);
    const moved = await homeAt(p);
    await p.click("#zreset"); await p.waitForTimeout(1400);
    const h1 = await homeAt(p);
    ok(Math.abs(moved.dx) > 20 && Math.abs(h1.dx - h0.dx) <= 2 && Math.abs(h1.dy - h0.dy) <= 2, `${tag}: home: Recentre brings it back to the same place`, JSON.stringify([h0, moved, h1]));
    const plate = await p.evaluate(() => { const v = window.__views.filter((x) => x.id === "cloud-canvas").pop().view, q = v.project("root"), cv = document.querySelector("#cloud-canvas"), k = cv.width / cv.clientWidth, g = cv.getContext("2d"); let ring = 0; for (let dx = 20; dx < 140; dx++) { const d = g.getImageData(Math.round((q.x + dx) * k), Math.round(q.y * k), 1, 1).data; if (d[0] + d[1] + d[2] < 560) ring++; } return ring; });
    ok(plate >= 1, `${tag}: home: the name sits on a ringed plate (a distinct root)`, String(plate));
    await tap(p, "root");
    const st = await p.evaluate(() => { const pn = document.querySelector("#panel"); return { open: !pn.hidden, title: pn.querySelector("#p-title").textContent, heads: [...pn.querySelectorAll(".st-head")].map((x) => x.textContent), text: pn.textContent, save: Boolean(pn.querySelector(".ct-save")), open2: Boolean(pn.querySelector(".ct-open")), lesson: !pn.querySelector("#p-lesson").hidden, deck: window.IkoCloud.deserialize(localStorage.getItem("ikolearn.v1.cloud")).deck.length }; });
    ok(st.open && st.title === "Maya" && st.heads.includes("Achievements") && st.heads.includes("Progress"), `${tag}: home: tapping the name opens its stats card`, JSON.stringify(st.heads));
    ok(new RegExp(st.deck + " cards in your Deck").test(st.text) && /3 subjects/.test(st.text) && /3 of \d+ topics finished/.test(st.text) && /\d+ right answers/.test(st.text), `${tag}: home: achievements (Deck cards) and progress (subjects, topics finished, right answers)`, st.text.slice(0, 300));
    ok(/days in a row|of the last 7|Last time you learned/.test(st.text), `${tag}: home: recent activity or a streak`, st.text.slice(0, 300));
    ok(!/What do you notice/.test(st.text), `${tag}: home: no "What do you notice here?"`);
    ok(st.save && st.open2 && /Save IkoCloud · Open IkoCloud/.test(st.text), `${tag}: home: Save IkoCloud and Open IkoCloud on the stats card`);
    const h2 = await homeAt(p), pan = await box(p, "#panel"), q = await nodeAt(p, "root");
    /* centred in the room the card leaves: on a phone across the middle with the card under it, wide in the middle height with the card beside it */
    ok(width < 500 ? Math.abs(h2.dx) <= 4 && pan.y > q.y : Math.abs(h2.dy) <= 60 && pan.x > q.x, `${tag}: home: the camera centres on the name, its card beside it`, JSON.stringify([h2, pan]));
    ok(!(q.x > pan.x && q.x < pan.r && q.y > pan.y && q.y < pan.b), `${tag}: home: the stats card sits beside the name, not over it`, JSON.stringify([q, pan]));
    ok(errs.length === 0, `${tag}: home: no page errors`, errs.join(" | "));
    await ctx.close();
  }
  /* E. earned: the card flies into the Deck and the Deck pulses; progress saved before it flies; reduced motion: no flight */
  for (const reduce of [false, true]) {
    const { ctx, p, errs } = await boot(width, {}, reduce ? { reducedMotion: "reduce" } : {});
    const tid = await idOf(p, "Tides");
    await tap(p, "Tides"); await p.click("#p-lesson"); await p.waitForSelector("#l-cont:not([hidden])"); await p.waitForTimeout(400);
    await passCheck(p); await p.waitForTimeout(200); /* PR 103: Continue, a passed check, then the card */
    const deck0 = await p.evaluate(() => window.IkoCloud.deserialize(localStorage.getItem("ikolearn.v1.cloud")).deck.length);
    await p.click("#l-got");
    await p.waitForTimeout(80);
    const saved = await p.evaluate((id) => { const c = window.IkoCloud.deserialize(localStorage.getItem("ikolearn.v1.cloud")), l = JSON.parse(localStorage.getItem("ikolearn.v1.lessons") || "{}"); return { inDeck: window.IkoCloud.inDeck(c, id), got: Boolean(l[id] && l[id].got), deck: c.deck.length }; }, tid);
    await p.waitForTimeout(320);
    const mid = await p.evaluate(() => { const f = document.querySelector(".fly-card"); if (!f) return null; const r = f.getBoundingClientRect(), src = document.querySelector("#l-card").firstElementChild.getBoundingClientRect(); return { w: r.width, src: src.width, top: r.top, srcTop: src.top }; });
    const tg = reduce ? "reduced motion: " : "";
    ok(saved.inDeck && saved.got && saved.deck === deck0 + (saved.deck > deck0 ? 1 : 0), `${tag}: earned: ${tg}progress is saved straight away (the card in the Deck, "I've got it" kept)`, JSON.stringify(saved));
    if (!reduce) {
      ok(mid && mid.w < mid.src * 0.95 && mid.top < mid.srcTop, `${tag}: earned: mid-flight the card is smaller and on its way up to the Deck`, JSON.stringify(mid));
      await p.waitForTimeout(1100);
      const end = await p.evaluate(() => ({ fly: document.querySelectorAll(".fly-card").length, pulse: Boolean(document.querySelector(".minideck.pulse")) }));
      ok(end.fly === 0 && end.pulse, `${tag}: earned: it lands and the Deck pulses`, JSON.stringify(end));
    } else {
      await p.waitForTimeout(1100);
      const end = await p.evaluate(() => ({ fly: document.querySelectorAll(".fly-card").length, pulse: Boolean(document.querySelector(".minideck.pulse")) }));
      ok(mid === null && end.fly === 0 && !end.pulse, `${tag}: earned: reduced motion: no flight, no pulse`, JSON.stringify([mid, end]));
    }
    ok(errs.length === 0, `${tag}: earned: ${tg}no page errors`, errs.join(" | "));
    await ctx.close();
  }
  /* Iko is always here: a faint glow until it is first opened (still with reduced motion), and a cue for each screen */
  for (const reduce of [false, true]) {
    const { ctx, p, errs } = await boot(width, { fresh: true }, reduce ? { reducedMotion: "reduce" } : {});
    const tg = reduce ? "reduced motion: " : "";
    /* the ring and the halo, read from the computed box-shadow: [{ a: alpha, blur, spread }] */
    const glow = () => p.evaluate(() => {
      const b = document.querySelector("#iko"), s = getComputedStyle(b, "::before");
      const sh = (s.boxShadow.match(/rgba?\([^)]*\)[^,]*(?:,(?![^(]*\))|$)/g) || []).map((x) => { const c = x.match(/rgba?\(([^)]*)\)/)[1].split(",").map(Number), px = (x.replace(/rgba?\([^)]*\)/, "").match(/-?[\d.]+px/g) || []).map(parseFloat); return { a: c.length > 3 ? c[3] : 1, blur: px[2] || 0, spread: px[3] || 0 }; });
      return { on: b.classList.contains("glow"), anim: s.animationName, sh, opened: JSON.parse(localStorage.getItem("ikolearn.v1.seen")).h.iko || 0 };
    });
    const g0 = await glow(), ring = g0.sh[0] || {}, halo = g0.sh[1] || {};
    ok(g0.on && (reduce ? g0.anim === "none" : g0.anim === "iko-glow") && !g0.opened, `${tag}: Iko cue: ${tg}${reduce ? "a still ring" : "a slow breathing glow"} until Iko is first opened`, JSON.stringify(g0));
    ok(ring.a >= 0.35 && ring.spread >= 2 && halo.a >= 0.2 && halo.blur >= 9 && halo.spread >= 3, `${tag}: Iko cue: ${tg}the glow is clearly visible (a ring of at least .35 opacity and 2px, a soft halo of at least .2 and 9px blur)`, JSON.stringify(g0.sh));
    await p.click("#iko"); await p.waitForTimeout(300); await p.click("#iko-x"); await p.waitForTimeout(300);
    const g1 = await glow();
    ok(!g1.on && g1.opened === 1, `${tag}: Iko cue: ${tg}the glow stops once Iko has been opened, saved on the device`, JSON.stringify(g1));
    await p.reload({ waitUntil: "networkidle" }); await p.waitForTimeout(900);
    ok(!(await glow()).on, `${tag}: Iko cue: ${tg}and it stays off after a reload`);
    ok(errs.length === 0, `${tag}: Iko cue: ${tg}no page errors`, errs.join(" | "));
    await ctx.close();
  }
  {
    /* PR 104: one Iko at the top left; each screen gets a short bubble of its own (once a visit), clear of everything; Iko knows the screen */
    const { ctx, p, errs } = await open(width);
    await p.goto(BASE + "/ikolearn"); await p.evaluate(SEED, { now: Date.now(), visits: 1 }); await p.goto(BASE + "/ikolearn", { waitUntil: "networkidle" });
    const tip = (re, ms = 3000) => p.waitForFunction((src) => { const l = document.querySelector("#iko-line"); return !l.hidden && new RegExp(src).test(l.getAttribute("data-tip") || ""); }, re.source, { timeout: ms }).then(() => true, () => false);
    const clear = () => p.evaluate(() => {
      const mine = [document.querySelector("#iko"), document.querySelector("#iko-line")].filter((e) => !e.hidden && e.getClientRects().length).map((e) => e.getBoundingClientRect());
      const hit = [...document.querySelectorAll(".bar .brand > *, #deck-btn, .minideck, .home-nav > *, .cloud-top .zoom, .cloud-flow > *, #panel, #cloud-start, .cloud-hint, #l-done button, #hub-lesson")].filter((e) => !e.hidden && !e.closest("[hidden]") && e.getClientRects().length && getComputedStyle(e).visibility !== "hidden" && !e.contains(document.querySelector("#iko")) && !(document.querySelector("#cloud").hidden === false && e.closest("#chat")) && mine.some((m) => { const r = e.getBoundingClientRect(); return r.width && m.left < r.right - 0.5 && r.left < m.right - 0.5 && m.top < r.bottom - 0.5 && r.top < m.bottom - 0.5; }));
      return hit.map((e) => e.id || e.className);
    });
    const about = async () => { await p.click("#iko"); await p.waitForTimeout(350); const a = await p.textContent("#iko-about"); const open = !(await p.isHidden("#iko-sheet")); await p.click("#iko-x"); await p.waitForTimeout(300); return open ? a : "(not open)"; };
    ok(await tip(/^cloud\d$/), `${tag}: Iko bubble: the cloud has its own short bubble`);
    const h1 = await clear();
    ok(h1.length === 0, `${tag}: Iko bubble: clear of the header, the rows, the hint and the card`, JSON.stringify(h1));
    ok(!(await p.evaluate(() => Boolean(document.querySelector("#iko-cue")))), `${tag}: Iko bubble: no second cue beside it (one Iko, one bubble)`);
    ok((await about()) === "On your cloud", `${tag}: Iko from the cloud knows it's the cloud`);
    await tap(p, "Ocean Life");
    ok(await tip(/^topic\d$/), `${tag}: Iko bubble: a topic's card has its own`);
    ok((await about()) === "On your cloud · Ocean Life", `${tag}: Iko from a topic's card knows the topic`);
    await p.click("#p-card"); await p.waitForTimeout(700);
    ok(!(await tip(/^card\d$/, 1500)), `${tag}: Iko bubble: its card page speaks for itself (no second hint)`);
    ok((await clear()).length === 0, `${tag}: Iko bubble: clear of the card page`, JSON.stringify(await clear()));
    ok((await about()) === "On Ocean Life · its card", `${tag}: Iko from the card knows the card`);
    await p.click("#hub-back"); await p.waitForTimeout(700);
    if (!(await p.isHidden("#cloud"))) { await p.click("#cloud-deck"); await p.waitForTimeout(700); }
    ok(await tip(/^deck\d$/), `${tag}: Iko bubble: the Deck has its own`);
    ok((await about()) === "On your deck", `${tag}: Iko from the Deck knows the Deck`);
    await p.click("#d-back").catch(() => {}); await p.waitForTimeout(900);
    if (await p.isHidden("#cloud")) await p.click("#thumb").catch(() => {});
    await p.waitForSelector("#cloud:not([hidden])");
    ok(!(await tip(/^cloud\d$/, 1800)), `${tag}: Iko bubble: the cloud's isn't repeated in the same visit`);
    await tap(p, "Tides"); await p.click("#p-lesson"); await p.waitForSelector("#l-cont:not([hidden])");
    ok(await tip(/^learn\d$/), `${tag}: Iko bubble: a lesson -> what to do (read, then Continue)`);
    ok((await clear()).length === 0, `${tag}: Iko bubble: clear of the lesson's buttons`, JSON.stringify(await clear()));
    ok(/^On Tides · lesson$/.test(await about()), `${tag}: Iko from a lesson knows the lesson`);
    ok(errs.length === 0, `${tag}: Iko bubble: no page errors`, errs.join(" | "));
    await ctx.close();
  }
  /* F. intake: nothing crowds, every target 44px */
  {
    const { ctx, p, errs } = await open(width);
    await p.goto(BASE + "/ikolearn", { waitUntil: "networkidle" });
    await p.click('.who-opt[data-who="self"]'); await p.fill("#name-in", "Maya"); await p.press("#name-in", "Enter");
    await p.waitForSelector("#cloud:not([hidden])"); await p.waitForTimeout(900);
    /* PR 104: Iko asks the opening question himself (his speech beside him; no separate bubble) */
    ok((await p.isHidden("#iko-line")) && await p.evaluate(() => Boolean(document.querySelector("#cloud-start .cs-ask #iko"))), `${tag}: Iko welcomes and asks from the start`);
    await p.click("#iko"); await p.waitForTimeout(350);
    ok((await p.textContent("#iko-about")) === "Getting started", `${tag}: Iko from the intake knows it's the start`);
    await p.click("#iko-x"); await p.waitForTimeout(300);
    await p.click('#cs-ex .ex-chip:text-is("Stars")'); await p.waitForTimeout(500);
    const chip = await p.evaluate(() => ({ v: document.querySelector("#cs-in").value, chips: [...document.querySelectorAll("#cs-ex .ex-chip")].map((x) => x.textContent), pressed: document.querySelectorAll("#cs-ex [aria-pressed]").length }));
    ok(chip.v === "Stars" && !chip.chips.includes("Stars") && chip.chips.length <= 3 && chip.pressed === 0, `${tag}: intake: a chosen idea goes into the field and its chip moves on (nothing stays selected)`, JSON.stringify(chip));
    const t = await p.evaluate(() => {
      const els = [...document.querySelectorAll("#cloud-start button, #cloud-start input")].filter((e) => e.getClientRects().length && !e.hidden);
      const rs = els.map((e) => { const r = e.getBoundingClientRect(); return { t: e.textContent || e.id, x: r.left, y: r.top, r: r.right, b: r.bottom, h: r.height, w: r.width }; });
      const small = rs.filter((r) => r.h < 44 || r.w < 44).map((r) => r.t + ":" + Math.round(r.w) + "x" + Math.round(r.h));
      const hit = [];
      for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) { const a = rs[i], b = rs[j]; if (a.x < b.r - 0.5 && b.x < a.r - 0.5 && a.y < b.b - 0.5 && b.y < a.b - 0.5) hit.push(a.t + "/" + b.t); }
      const cs = document.querySelector("#cloud-start").getBoundingClientRect(), foot = document.querySelector(".cloud-foot"), fr = foot && foot.getClientRects().length ? foot.getBoundingClientRect() : null;
      return { n: rs.length, small, hit, inside: cs.left >= 0 && cs.right <= innerWidth, clearFoot: !fr || cs.bottom <= fr.top };
    });
    ok(t.n >= 4 && t.small.length === 0, `${tag}: intake: every target is at least 44px`, JSON.stringify(t.small));
    ok(t.hit.length === 0 && t.inside && t.clearFoot, `${tag}: intake: nothing overlaps, inside the screen, clear of the footer`, JSON.stringify(t));
    ok(errs.length === 0, `${tag}: intake: no page errors`, errs.join(" | "));
    await ctx.close();
  }
}

await browser.close();
server.close();
if (fails.length) {
  console.error(`ikolearn polish e2e: ${pass} passed, ${fails.length} FAILED`);
  for (const f of fails) console.error("  x " + f);
  process.exit(1);
}
console.log(`ikolearn polish e2e: ${pass} passed`);
