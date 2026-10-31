// End-to-end checks for Draw a card and Iko on a phone (PR 100), in a real browser, every /api/ikolearn call mocked.
// Draw: with finished and unfinished cards mixed (some finished ones in the deck), repeated draws never open a finished
// card, the current path's next unfinished step comes first, and when everything is finished the cloud offers a new
// topic or direction instead (no lesson re-opened). Iko on touch (390x844, a visualViewport the test shrinks like an
// on-screen keyboard): opening the sheet doesn't take the focus (no keyboard covering it), and with the keyboard up the
// field and the latest message stay inside the visible part of the screen; "Still tricky" still opens its clarification.
// Run: IKOLEARN_PW=<path to node_modules/playwright-core> node scripts/ikolearn-mobile-e2e.mjs [--root public] [--shots dir]
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
const SUBS = [["Nature", "Ocean Life", ["Coral Reefs", "Whales", "Tides", "Kelp"]], ["Art", "Drawing", ["Shapes", "Shading", "Lines"]]];
/* a seeded cloud: activity { label: { ago (days), done } }; the deck holds every opened card (finished ones too) */
const SEED = ({ subs, act, now }) => {
  const C = window.IkoCloud, T = now - 30 * 864e5, c = C.create("Maya", T);
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
const shot = async (p, name) => { if (SHOTS) { await p.waitForTimeout(350); await p.screenshot({ path: path.join(SHOTS, `pr100-after-390-${name}.png`) }); } };
/* the Pick up row (and the Waiting for you chips): each chip's card and whether it's finished; a test and "what comes next" kept apart */
const pickUp = (p) => p.evaluate(() => {
  const C = window.IkoCloud, P = window.IkoPlan, c = C.deserialize(localStorage.getItem("ikolearn.v1.cloud")), by = (l) => c.order.find((x) => c.nodes[x].label === l);
  const f = document.querySelector(".cloud-flow:not([hidden])");
  if (!f) return { shown: false, chips: [], kicker: false };
  const chips = [...f.querySelectorAll(":scope > .chip, :scope > button.chip, .cf-note .dir-chip")].map((b) => { const t = b.textContent.trim(), kind = /^Test: /.test(t) ? "test" : /^Next in /.test(t) ? "grow" : b.classList.contains("dir-chip") ? "waiting" : "card"; const l = t.replace(/^Test: |^Next in /, ""), id = by(l); return { t, kind, finished: kind === "waiting" ? !c.order.some((x) => { let n = c.nodes[x]; while (n && n.parent && n.parent !== id) n = c.nodes[n.parent]; return n && n.parent === id && P.unfinished(c, x); }) : id ? P.finished(c, id) : null }; });
  const cont = [...document.querySelectorAll("button, a")].filter((b) => /^Continue /.test(b.textContent) && b.offsetParent).map((b) => b.textContent);
  return { shown: true, kicker: Boolean(f.querySelector(":scope > .kicker")), chips, cont };
});
const DONE = ["Coral Reefs", "Whales", "Shapes", "Ocean Life"];
const MIXED = { act: { "Coral Reefs": { ago: 3, done: true }, Shapes: { ago: 2, done: true }, "Ocean Life": { ago: 2.5, done: true }, Shading: { ago: 1.5 }, Whales: { ago: 0.1, done: true } } };

/* 1. Draw, mixed: the current path's next unfinished step first; repeated draws never a finished card */
{
  const { ctx, p, errs } = await boot(MIXED, true);
  try {
    /* the orchestrator itself, many times over (different seeds, each with the card in hand skipped) */
    const many = await p.evaluate((done) => {
      const C = window.IkoCloud, P = window.IkoPlan, src = localStorage.getItem("ikolearn.v1.cloud"), got = {}, bad = [];
      for (let i = 0; i < 60; i++) {
        const c = C.deserialize(src), skip = i % 3 ? null : c.order.find((x) => c.nodes[x].label === "Tides");
        const id = P.draw(c, { seed: i, skip, now: Date.now() + i * 3600e3 });
        const l = id ? c.nodes[id].label : null; got[l] = (got[l] || 0) + 1;
        if (!id || done.includes(l) || P.finished(c, id)) bad.push(l);
      }
      const c0 = C.deserialize(src), first = c0.nodes[P.draw(c0, { now: Date.now() })].label;
      const deckDone = c0.deck.filter((e) => done.includes(c0.nodes[e.id].label)).length;
      return { got, bad, first, deckDone };
    }, DONE);
    ok(!many.bad.length && many.deckDone >= 3, "draw: 60 draws (some seeds skipping the card in hand) never return a finished card, though the deck holds finished ones", JSON.stringify(many));
    const pu = await pickUp(p);
    ok(pu.kicker && pu.chips.filter((x) => x.kind === "card").length >= 2 && pu.chips.filter((x) => x.kind === "card" || x.kind === "waiting").every((x) => x.finished === false), "Pick up (mixed): every card chip is unfinished, the freed places filled with the next unfinished ones", JSON.stringify(pu));
    await shot(p, "pickup");
    ok(many.first === "Tides", "draw: the current path's next unfinished step comes first (Whales was last; Tides is next in Ocean Life)", JSON.stringify(many));
    /* the button, over and over: each lesson it opens is unfinished */
    const seen = [];
    for (let i = 0; i < 5; i++) {
      await p.locator(".cloud-flow .draw-btn").tap(); await p.waitForSelector("#lesson:not([hidden])"); await p.waitForTimeout(300);
      const t = await p.evaluate(() => { const C = window.IkoCloud, P = window.IkoPlan, c = C.deserialize(localStorage.getItem("ikolearn.v1.cloud")), id = c.active || null; return { title: document.querySelector("#l-title") ? document.querySelector("#l-title").textContent : "", fin: id ? P.finished(c, id) : null }; });
      seen.push(t);
      if (i === 0) await shot(p, "draw");
      if (i < 4) { await p.locator("#l-back").tap(); await p.waitForSelector("#cloud:not([hidden])"); await p.waitForTimeout(400); if (await p.isVisible("#p-close")) { await p.tap("#p-close"); await p.waitForTimeout(250); } } /* back on the cloud, its card beside it: closed */
    }
    ok(seen.every((t) => t.title && !DONE.includes(t.title) && t.fin === false), "draw: tapping Draw a card five times opens only unfinished cards", JSON.stringify(seen));
    ok(seen[0].title === "Tides", "draw: the first tap opens the current path's next step", JSON.stringify(seen[0]));
    ok(!errs.length, "draw: no page errors", errs.join(" | "));
  } finally { await ctx.close(); }
}
/* 2. Draw, everything finished: a new topic or direction is offered; nothing finished re-opens */
{
  const all = { act: {} };
  SUBS.forEach(([, top, k], i) => [top, ...k].forEach((l, j) => { all.act[l] = { ago: 4 - i - j * 0.1, done: true }; }));
  const { ctx, p, errs, calls } = await boot(all, true);
  try {
    const none = await p.evaluate(() => { const C = window.IkoCloud, P = window.IkoPlan, c = C.deserialize(localStorage.getItem("ikolearn.v1.cloud")); return [0, 1, 2].map((s) => P.draw(c, { seed: s })); });
    ok(none.every((x) => x === null), "all finished: the draw returns nothing (no finished card as active work)", JSON.stringify(none));
    const pa = await pickUp(p);
    ok(pa.chips.every((x) => x.kind === "test" || x.kind === "grow") && !pa.cont.length, "Pick up (all finished): no finished card chip and no Continue (only an optional test or what comes next)", JSON.stringify(pa));
    const c0 = calls.length;
    await p.locator(".cloud-flow .draw-btn").tap(); await p.waitForTimeout(500);
    const st = await p.evaluate(() => { const n = document.querySelector(".cloud-flow:not([hidden]) .cf-note.dir-done"), a = n && n.querySelector(".dir-ask"), r = n ? n.getBoundingClientRect() : null; return { lesson: !document.querySelector("#lesson").hidden, note: n ? n.innerText.replace(/\s+/g, " ") : "", focus: document.activeElement === a, inView: Boolean(r) && r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth }; });
    ok(!st.lesson && /Every card here is finished/.test(st.note) && /Add a new topic or direction\?/.test(st.note) && st.inView && calls.slice(c0).every((x) => x !== "/lesson"), "all finished: Draw offers a new topic or direction, no lesson re-opened, no lesson call", JSON.stringify(st));
    await shot(p, "draw-all-done");
    await p.locator(".dir-done .dir-ask").tap(); await p.waitForSelector(".dir-form .dir-in");
    await p.fill(".dir-form .dir-in", "music"); await p.locator(".dir-form button[type=submit]").tap();
    await p.waitForFunction(() => { const C = window.IkoCloud, c = C.deserialize(localStorage.getItem("ikolearn.v1.cloud")); return C.subjects(c).length >= 3; }, null, { timeout: 15000 });
    await p.waitForTimeout(600);
    const after = await p.evaluate(() => { const C = window.IkoCloud, P = window.IkoPlan, c = C.deserialize(localStorage.getItem("ikolearn.v1.cloud")), id = P.draw(c, {}); return { subjects: C.subjects(c).map((s) => s.label), drawn: id ? c.nodes[id].label : null, note: Boolean(document.querySelector(".cf-note.dir-done")) }; });
    ok(calls.includes("/create") && after.subjects.includes("Music") && ["Rhythm", "Beats", "Tempo"].includes(after.drawn) && !after.note, "all finished: the new direction is built through the usual creation call, and the next draw is from it", JSON.stringify(after));
    ok(!errs.length, "all finished: no page errors", errs.join(" | "));
  } finally { await ctx.close(); }
}
/* 3. Iko on touch: no focus on open; with the keyboard up the field and the latest message stay in view */
{
  const { ctx, p, errs } = await boot(MIXED, true);
  try {
    await p.waitForFunction(() => document.querySelector("#iko-line").hidden || true);
    await p.tap("#iko"); await p.waitForSelector("#iko-sheet:not([hidden])"); await p.waitForTimeout(400);
    const o = await p.evaluate(() => { const r = document.querySelector("#iko-sheet").getBoundingClientRect(); return { active: document.activeElement ? document.activeElement.id || document.activeElement.tagName : "", coarse: matchMedia("(pointer: coarse)").matches, l: r.left, r: r.right, t: r.top, b: r.bottom, ih: innerHeight, iw: innerWidth }; });
    ok(o.coarse && o.active !== "iko-in" && o.t >= 0 && o.b <= o.ih && o.l >= 0 && o.r <= o.iw, "Iko on touch: the sheet opens without taking the focus (no keyboard covering it) and fits the screen", JSON.stringify(o));
    await shot(p, "iko-open");
    const vis = () => p.evaluate(() => {
      const vh = window.visualViewport.height, vt = window.visualViewport.offsetTop, body = document.querySelector("#iko-body").getBoundingClientRect(), f = document.querySelector("#iko-in").getBoundingClientRect(), send = document.querySelector("#iko-form button") ? document.querySelector("#iko-form button").getBoundingClientRect() : f, s = document.querySelector("#iko-sheet").getBoundingClientRect();
      const msgs = [...document.querySelectorAll("#iko-log .iko-msg")], last = msgs.length ? msgs[msgs.length - 1].getBoundingClientRect() : null;
      return { vh, n: msgs.length, field: { t: f.top, b: f.bottom }, sendB: send.bottom, sheet: { t: s.top, b: s.bottom }, last: last && { t: last.top, b: last.bottom }, body: { t: body.top, b: body.bottom }, focus: document.activeElement && document.activeElement.id,
        inView: f.top >= vt && f.bottom <= vt + vh && send.bottom <= vt + vh && s.top >= vt - 1 && s.bottom <= vt + vh + 1, lastIn: !last || (last.bottom <= Math.min(vt + vh, body.bottom) + 1 && last.bottom > Math.max(vt, body.top)) };
    });
    /* the learner taps the field: the keyboard comes up (the visible part shrinks by 340px) */
    await p.tap("#iko-in"); await p.evaluate(() => window.__keyboard(340)); await p.waitForTimeout(350);
    const k1 = await vis();
    ok(k1.focus === "iko-in" && k1.inView, "Iko + keyboard: the field and send stay above the keyboard (the sheet sits inside the visible part)", JSON.stringify(k1));
    for (const t of ["What is a tide?", "And why twice a day?", "Does the moon pull lakes too?"]) {
      await p.fill("#iko-in", t); await p.press("#iko-in", "Enter");
      await p.waitForFunction((n) => document.querySelectorAll("#iko-log .iko-msg.model:not(.streaming)").length >= n, ["What is a tide?", "And why twice a day?", "Does the moon pull lakes too?"].indexOf(t) + 1, { timeout: 6000 });
      await p.waitForTimeout(250);
    }
    const k2 = await vis();
    ok(k2.n >= 6 && k2.inView && k2.lastIn, "Iko + keyboard: after a few messages the latest one is in view above the keyboard, with the field", JSON.stringify(k2));
    await shot(p, "iko-keyboard");
    await p.evaluate(() => { document.activeElement.blur(); window.__keyboard(0); }); await p.waitForTimeout(300);
    const k3 = await p.evaluate(() => { const s = document.querySelector("#iko-sheet"), r = s.getBoundingClientRect(); return { bottom: s.style.bottom, b: r.bottom, ih: innerHeight }; });
    ok(k3.bottom === "" && k3.b <= k3.ih && k3.b > k3.ih - 40, "Iko: with the keyboard gone the sheet settles back at the bottom", JSON.stringify(k3));
    await p.tap("#iko-x"); await p.waitForTimeout(200);
    /* Still tricky, on touch: Iko opens with the clarification ready */
    await p.locator(".cloud-flow .draw-btn").tap(); await p.waitForSelector("#l-done:not([hidden])"); await p.waitForTimeout(300);
    await p.evaluate(() => document.querySelector("#l-tricky").scrollIntoView({ block: "center" }));
    await p.tap("#l-tricky"); await p.waitForTimeout(500);
    const tr = await p.evaluate(() => { const r = document.querySelector("#iko-sheet").getBoundingClientRect(); return { sheet: !document.querySelector("#iko-sheet").hidden, inSheet: Boolean(document.querySelector("#iko-slot #l-clar")), text: (document.querySelector("#iko-slot") || {}).innerText || "", notField: document.activeElement !== document.querySelector("#iko-in"), fits: r.top >= 0 && r.bottom <= innerHeight }; });
    ok(tr.sheet && tr.inSheet && tr.text.length > 20 && tr.notField && tr.fits, "Still tricky on touch: Iko opens with the clarification ready (no keyboard)", JSON.stringify(tr));
    ok(!errs.length, "Iko on touch: no page errors", errs.join(" | "));
  } finally { await ctx.close(); }
}
/* 4. Iko with a mouse: still opens straight into its text field */
{
  const { ctx, p, errs } = await boot(MIXED, false);
  try {
    await p.click("#iko"); await p.waitForSelector("#iko-sheet:not([hidden])"); await p.waitForTimeout(200);
    const a = await p.evaluate(() => document.activeElement && document.activeElement.id);
    ok(a === "iko-in", "Iko with a mouse: opens straight into its text field", a);
    ok(!errs.length, "Iko with a mouse: no page errors", errs.join(" | "));
  } finally { await ctx.close(); }
}
/* 5. WhatsApp's in-app browser on an iPhone (390x664, the iOS keyboard ~340px): the opening question with the name above it,
   and tapping Iko (on the question, and on the cloud) never brings the keyboard up */
{
  const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 WhatsApp/24.20.79";
  const ctx = await browser.newContext({ viewport: { width: 390, height: 664 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA, timezoneId: "America/Toronto" });
  const p = await ctx.newPage();
  p.setDefaultTimeout(8000);
  const errs = [];
  p.on("pageerror", (e) => errs.push("pageerror " + e.message));
  if (!process.env.IKOLEARN_BROWSER) { const cdp = await ctx.newCDPSession(p); await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 47, bottom: 34 } }); } /* safe-area emulation is Chromium's (CDP) */
  await p.addInitScript(HOOK);
  /* every focus() on Iko's field, from anywhere (an open handler, a transitionend, a timer) */
  await p.addInitScript(() => { const f = HTMLElement.prototype.focus; HTMLElement.prototype.focus = function (...a) { if (this.id === "iko-in") (window.__ikoFocus = window.__ikoFocus || []).push(new Error().stack.split("\n")[2] || ""); return f.apply(this, a); }; });
  await p.route("**/api/ikolearn/**", (r) => { const at = new URL(r.request().url()).pathname.replace("/api/ikolearn", ""); if (at === "/examples") return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, examples: ["Stars", "Rain", "Games", "Kites"], growth: ["Patience"] }) }); return r.fulfill({ status: 503, contentType: "application/json", body: '{"ok":false,"reason":"off"}' }); });
  try {
    await p.goto(BASE + "/ikolearn", { waitUntil: "networkidle" });
    ok(!(await p.$("[autofocus]")), "WhatsApp iOS: nothing on the page has autofocus");
    await p.tap('.who-opt[data-who="self"]'); await p.fill("#name-in", "Shawn"); await p.press("#name-in", "Enter"); await skipAge(p);
    await p.waitForSelector("#cloud-start:not([hidden])"); await p.waitForTimeout(1800);
    const geo = () => p.evaluate(() => { const r = (s) => { const e = document.querySelector(s); if (!e || e.hidden || !e.getClientRects().length || getComputedStyle(e).visibility === "hidden") return null; const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, r: b.right, b: b.bottom }; };
      /* what shows of the name: the column scrolls on a short screen (the keyboard up), and clips what's scrolled past */
      const cs = r("#cloud-start"), n0 = r("#cs-name"), nc = n0 && cs ? { x: Math.max(n0.x, cs.x), y: Math.max(n0.y, cs.y), r: Math.min(n0.r, cs.r), b: Math.min(n0.b, cs.b) } : null;
      const name = nc && nc.r > nc.x && nc.b > nc.y ? nc : null, parts = ["#cs-hi", "#cs-q", "#cs-in", "#cs-go", "#iko", "#iko-line", "#iko-cue"].map((s) => [s, r(s)]).concat([...document.querySelectorAll("#cs-ex .ex-chip, #cs-ex .ex-more")].map((e, i) => ["chip" + i, (() => { const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, r: b.right, b: b.bottom }; })()])).filter((x) => x[1]);
      const hit = (a, b) => a.x < b.r - 0.5 && b.x < a.r - 0.5 && a.y < b.b - 0.5 && b.y < a.b - 0.5;
      const vv = window.visualViewport, top = vv.offsetTop, bot = vv.offsetTop + vv.height;
      return { name, q: r("#cs-q"), over: name ? parts.filter((x) => hit(name, x[1])).map((x) => x[0]) : [], shows: Boolean(name), clipped: Boolean(n0) && !name, inView: name ? name.y >= top && name.b <= bot : false, cx: name ? (name.x + name.r) / 2 : 0, iw: innerWidth };
    });
    const g1 = await geo();
    ok(g1.shows && g1.name && g1.q && g1.name.b <= g1.q.y && !g1.over.length && Math.abs(g1.cx - g1.iw / 2) < 4, "WhatsApp iOS: the name sits centred above the question, over nothing (Iko, the text, the field, Begin, the chips)", JSON.stringify(g1));
    if (SHOTS) { await p.waitForTimeout(300); await p.screenshot({ path: path.join(SHOTS, "pr100-after-whatsapp-ios-intake.png") }); }
    /* the iOS keyboard: the name is never ghosted over the chips */
    await p.tap("#cs-in"); await p.evaluate(() => window.__keyboard(340)); await p.waitForTimeout(450);
    const g2 = await geo();
    if (SHOTS) await p.screenshot({ path: path.join(SHOTS, "pr100-after-whatsapp-ios-keyboard.png") });
    ok(!g2.over.length, "WhatsApp iOS + keyboard (340px): the name never shows over Iko, the text or the chips (scrolled out of the short column, or clear)", JSON.stringify(g2));
    await p.evaluate(() => { document.activeElement.blur(); window.__keyboard(0); }); await p.waitForTimeout(400);
    /* tapping Iko: the sheet opens, the field is never focused (now, after its transition, or a moment later) */
    await p.tap("#iko"); await p.waitForSelector("#iko-sheet:not([hidden])"); await p.waitForTimeout(900);
    const k = await p.evaluate(() => { const s = document.querySelector("#iko-sheet").getBoundingClientRect(); return { active: document.activeElement && (document.activeElement.id || document.activeElement.tagName), calls: window.__ikoFocus || [], coarse: matchMedia("(pointer: coarse)").matches, fits: s.top >= 0 && s.bottom <= innerHeight }; });
    ok(k.coarse && k.active !== "iko-in" && !k.calls.length && k.fits, "WhatsApp iOS: tapping Iko opens its sheet without focusing the field (no keyboard), not even after the transition", JSON.stringify(k));
    if (SHOTS) { await p.waitForTimeout(300); await p.screenshot({ path: path.join(SHOTS, "pr100-after-whatsapp-ios-iko-open.png") }); }
    ok(!errs.length, "WhatsApp iOS: no page errors", errs.join(" | "));
  } finally { await ctx.close(); }
}
await browser.close(); server.close();
console.log(`ikolearn mobile e2e: ${pass} passed${fails.length ? `, ${fails.length} FAILED` : ""}`);
fails.forEach((f) => console.log("  x " + f));
process.exit(fails.length ? 1 : 0);
