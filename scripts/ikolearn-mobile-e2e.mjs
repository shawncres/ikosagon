// End-to-end checks for Draw a card and Iko on a phone (PR 100), in a real browser, every /api/ikolearn call mocked.
// Draw: with finished and unfinished cards mixed (some finished ones in the deck), repeated draws never open a finished
// card, the current path's next unfinished step comes first, and when everything is finished the cloud offers a new
// topic or direction instead (no lesson re-opened). Iko on touch (390x844, a visualViewport the test shrinks like an
// on-screen keyboard): opening the sheet doesn't take the focus (no keyboard covering it), and with the keyboard up the
// field and the latest message stay inside the visible part of the screen; a lesson with no check has one "I've got it" (PR 109).
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
      if (i < 4) { await (await p.isVisible("#l-back") ? p.tap("#l-back") : p.evaluate(() => document.querySelector("#l-back").click())); await p.waitForSelector("#cloud:not([hidden])"); await p.waitForTimeout(400); if (await p.isVisible("#p-close")) { await p.tap("#p-close"); await p.waitForTimeout(250); } } /* back on the cloud, its card beside it: closed */
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
    /* PR 109: on touch, a lesson with no check: one "I've got it" (no "Still tricky"); tapping it shows the confirmation */
    await p.locator(".cloud-flow .draw-btn").tap(); await p.waitForSelector("#l-done:not([hidden])"); await p.waitForTimeout(300);
    const hasQ = await p.evaluate(() => document.querySelectorAll("#l-quiz fieldset.q").length > 0 || !document.querySelector("#l-cont").hidden);
    ok(!(await p.$("#l-tricky")), "no Still tricky on touch either");
    if (!hasQ) {
      await p.evaluate(() => document.querySelector("#l-got").scrollIntoView({ block: "center" }));
      await p.tap("#l-got"); await p.waitForTimeout(500);
      const tr = await p.evaluate(() => { const c = document.querySelector("#l-conf"), r = c.getBoundingClientRect(); return { conf: !c.hidden, top: r.top, ih: innerHeight, sheet: !document.querySelector("#iko-sheet").hidden }; });
      ok(tr.conf && !tr.sheet && tr.top < tr.ih, "I've got it on touch: the confirmation, on screen (no sheet, no keyboard)", JSON.stringify(tr));
    } else ok(await p.isHidden("#l-got"), "a lesson with a check has no \u201cI've got it\u201d (the pass earns it)");
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

/* PR 110 (Shawn on an iPhone: "tapping nodes do not work", "the gesture also turns things weirdly", no Support link,
   deck tiles breaking mid-word, "Back to your cloud" beside the cloud widget). Real touch (hasTouch, isMobile, tap())
   in Chromium and WebKit, and a finger's tap as an iPhone reports it: a few pixels of wobble between down and up. */
{
  const LONG = { subs: [["Crafts", "Woodworking", ["Woodworking Basics", "Clearing The Workspace", "Tool Safety", "Sharpening Chisels Properly"]], ["Nature", "Ocean Life", ["Coral Reefs", "Tides"]]], act: { "Woodworking Basics": { ago: 2, done: true }, "Clearing The Workspace": { ago: 1, done: true }, "Tool Safety": { ago: 0.5 }, "Sharpening Chisels Properly": { ago: 0.2 } } };
  const { ctx, p, errs } = await boot(LONG, true);
  const V = () => p.evaluate(() => { const v = window.__views.filter((x) => x.id === "cloud-canvas").pop().view.state(); return { yaw: v.yaw, zoom: v.zoom, panX: v.panX, panY: v.panY }; });
  const at = (label) => p.evaluate((l) => { const v = window.__views.filter((x) => x.id === "cloud-canvas").pop().view, C = window.IkoCloud, c = C.deserialize(localStorage.getItem("ikolearn.v1.cloud")), id = l === "root" ? "root" : c.order.find((x) => c.nodes[x].label === l), q = v.project(id), r = document.querySelector("#cloud-canvas").getBoundingClientRect(); return q && { x: r.left + q.x, y: r.top + q.y, on: document.elementFromPoint(r.left + q.x, r.top + q.y) === document.querySelector("#cloud-canvas") }; }, label);
  /* touch pointers as a phone sends them: steps of [dx, dy] from the start for each finger */
  const fingers = (paths) => p.evaluate(async (paths) => {
    const cv = document.querySelector("#cloud-canvas");
    const send = (t, id, x, y) => cv.dispatchEvent(new PointerEvent(t, { pointerId: id, pointerType: "touch", isPrimary: id === 61, bubbles: true, cancelable: true, button: 0, buttons: t === "pointerup" ? 0 : 1, clientX: x, clientY: y }));
    paths.forEach((f, i) => send("pointerdown", 61 + i, f.x, f.y));
    const n = Math.max(...paths.map((f) => f.steps.length));
    for (let k = 0; k < n; k++) { await new Promise((r) => setTimeout(r, 16)); paths.forEach((f, i) => { const s = f.steps[Math.min(k, f.steps.length - 1)]; send("pointermove", 61 + i, f.x + s[0], f.y + s[1]); }); } /* about a frame apart, as a finger's moves come */
    await new Promise((r) => setTimeout(r, 120)); /* held still a moment before lifting: no fling */
    paths.forEach((f, i) => { const s = f.steps[f.steps.length - 1]; send("pointerup", 61 + i, f.x + s[0], f.y + s[1]); });
  }, paths);
  const card = () => p.evaluate(() => ({ open: !document.querySelector("#panel").hidden, title: document.querySelector("#p-title").textContent }));
  const shut = async () => { if (await p.isVisible("#p-close")) { await p.tap("#p-close"); await p.waitForTimeout(450); } };
  try {
    /* 1. tap(): the learner's name, then a node, each opens its card */
    const rp = await at("root");
    await p.touchscreen.tap(rp.x, rp.y); await p.waitForTimeout(500);
    const rc = await card();
    ok(rp.on && rc.open && rc.title === "Maya", "touch: a tap on the learner's name opens its card", JSON.stringify({ rp, rc }));
    await shut();
    const rp2 = await at("root");
    await fingers([{ x: rp2.x, y: rp2.y, steps: [[1, 2], [-2, 1], [2, 3]] }]); await p.waitForTimeout(500);
    const rc2 = await card();
    ok(rc2.open && rc2.title === "Maya", "touch: a wobbly tap on the learner's name opens its card", JSON.stringify(rc2));
    await shut();
    for (const l of ["Ocean Life", "Woodworking"]) {
      const a = await at(l);
      await p.touchscreen.tap(a.x, a.y); await p.waitForTimeout(500);
      const c = await card();
      ok(a.on && c.open && c.title === l, `touch: a tap on ${l} opens its card`, JSON.stringify({ a, c }));
      await shut();
    }
    /* 2. a finger's real tap: it wobbles 2-3 px between down and up (summed, well over 6 px: read as a drag before) */
    for (const l of ["Ocean Life", "Woodworking"]) {
      const a = await at(l);
      await fingers([{ x: a.x, y: a.y, steps: [[2, 1], [3, -1], [1, 2], [-1, 1], [2, 2], [3, 1]] }]); await p.waitForTimeout(500);
      const c = await card();
      ok(c.open && c.title === l, `touch: a wobbly tap (a few px, as an iPhone reports it) on ${l} still opens its card`, JSON.stringify(c));
      await shut();
    }
    /* 3. one finger drags: the cloud pans under it by the whole way (no card; nothing turns beyond the slow drift) */
    const sky = await p.evaluate(() => { const r = document.querySelector("#cloud-canvas").getBoundingClientRect(); return { x: r.left + r.width * 0.5, y: r.top + r.height * 0.3 }; });
    const v0 = await V();
    await fingers([{ x: sky.x, y: sky.y, steps: [[4, 0], [10, 2], [20, 4], [30, 6], [40, 8]] }]); await p.waitForTimeout(80);
    const v1 = await V(), c3 = await card();
    ok(!c3.open && Math.abs(v1.panX - v0.panX - 40) < 1.5 && Math.abs(v1.panY - v0.panY - 8) < 1.5 && Math.abs(v1.yaw - v0.yaw) < 0.03, "touch: a one-finger drag pans by exactly the finger's way, no card, no turn", JSON.stringify({ dx: v1.panX - v0.panX, dy: v1.panY - v0.panY, yaw: v1.yaw - v0.yaw, c3 }));
    await p.waitForTimeout(1200); /* any glide settles */
    /* 4. a pinch (fingers spreading, their angle wobbling a little as real fingers do): it zooms, it does not turn */
    const z0 = await V();
    await fingers([{ x: sky.x - 40, y: sky.y + 60, steps: [[-6, 2], [-14, -3], [-22, 4], [-30, -2], [-38, 5]] }, { x: sky.x + 40, y: sky.y + 60, steps: [[6, 3], [14, -4], [22, 5], [30, -3], [38, 4]] }]); await p.waitForTimeout(80);
    const z1 = await V();
    ok(z1.zoom > z0.zoom * 1.3 && Math.abs(z1.yaw - z0.yaw) < 0.03, "touch: a pinch zooms cleanly; its small angle wobble does not turn the cloud", JSON.stringify({ zoom: [z0.zoom, z1.zoom], yaw: z1.yaw - z0.yaw }));
    /* 5. a clear twist (fingers circling at the same spread) still turns it */
    const t0 = await V(), R = 60, ang = [0, 0.15, 0.3, 0.45, 0.6, 0.75];
    await fingers([{ x: sky.x - R, y: sky.y + 60, steps: ang.map((q) => [R - R * Math.cos(q), -R * Math.sin(q)]) }, { x: sky.x + R, y: sky.y + 60, steps: ang.map((q) => [-(R - R * Math.cos(q)), R * Math.sin(q)]) }]); await p.waitForTimeout(80);
    const t1 = await V();
    ok(Math.abs(t1.yaw - t0.yaw) > 0.3 && Math.abs(t1.zoom / t0.zoom - 1) < 0.1, "touch: a clear two-finger twist turns the cloud (and doesn't zoom)", JSON.stringify({ yaw: t1.yaw - t0.yaw, zoom: t1.zoom / t0.zoom }));
    /* 6. Support & feedback and Follow on X on the cloud, in the fine print, on screen and clear of the Pick up row */
    const foot = await p.evaluate(() => { const r = (e) => e && e.getBoundingClientRect(); const fb = document.querySelector("#cloud .cloud-foot .fb-link"), x = document.querySelector('#cloud .cloud-foot a[href="https://x.com/IkosagonAI"]'), flow = document.querySelector(".cloud-flow:not([hidden])"); return { fb: fb && fb.getClientRects().length ? [r(fb).top, r(fb).bottom, r(fb).left, r(fb).right] : null, href: fb && fb.href, x: Boolean(x && x.getClientRects().length && r(x).bottom <= innerHeight), flowB: flow ? r(flow).bottom : 0, footT: r(document.querySelector("#cloud .cloud-foot")).top, h: innerHeight, w: innerWidth }; });
    ok(foot.fb && foot.fb[1] <= foot.h && foot.fb[0] >= 0 && foot.fb[3] <= foot.w && foot.x && /contact\?name=Maya&subject=IkoLearn%20Feedback$/.test(foot.href), "phone: Support & feedback (with the name) and Follow on X are on the cloud's screen", JSON.stringify(foot));
    ok(!foot.flowB || foot.flowB <= foot.footT + 0.5, "phone: the Pick up row sits above the two-line fine print", JSON.stringify(foot));
    /* 7. the deck: no "Back to your cloud" beside the cloud widget; the page ends with the support links */
    await p.tap("#cloud-deck"); await p.waitForSelector("#deck:not([hidden])"); await p.waitForTimeout(900);
    const dk = await p.evaluate(() => { const vis = (e) => Boolean(e && e.getClientRects().length); window.scrollTo(0, document.documentElement.scrollHeight); return { back: vis(document.querySelector("#d-back")), thumb: vis(document.querySelector("#thumb")), fb: vis(document.querySelector("#page-foot .fb-link")), x: vis(document.querySelector('#page-foot a[href="https://x.com/IkosagonAI"]')), href: (document.querySelector("#page-foot .fb-link") || {}).href }; });
    ok(!dk.back && dk.thumb, "deck: no \"Back to your cloud\" link beside the cloud widget", JSON.stringify(dk));
    ok(dk.fb && dk.x && /name=Maya&subject=IkoLearn%20Feedback$/.test(dk.href), "deck: the page ends with Support & feedback and Follow on X", JSON.stringify(dk));
    /* 8. the deck's tiles: titles wrap between words, the chain has its own whole line, the tier row fits */
    await p.evaluate(() => window.scrollTo(0, 0));
    const tiles = await p.evaluate(() => [...document.querySelectorAll("#d-album .ap-grid > .gcard.size-tile")].map((c) => {
      const R = (e) => e.getBoundingClientRect(), cr = R(c), cs = getComputedStyle(c), padR = parseFloat(cs.paddingRight), t = c.querySelector(".gc-title"), ch = c.querySelector(".gc-chain"), pips = c.querySelector(".gc-pips"), mark = c.querySelector(".gc-mark");
      const words = []; const tn = t.firstChild; let i = 0; for (const w of t.textContent.split(" ")) { const rg = document.createRange(); rg.setStart(tn, i); rg.setEnd(tn, i + w.length); words.push([w, rg.getClientRects().length]); i += w.length + 1; }
      return { title: t.textContent, words, chain: ch ? [Math.round(R(ch).height), ch.scrollHeight, Math.round(R(ch).bottom - cr.top)] : null, foot: [Math.round(R(pips).right - cr.left), Math.round(cr.width - padR), Math.round(R(mark).right - cr.left), Math.round(R(pips).left - cr.left)], h: Math.round(cr.height), footB: Math.round(R(c.querySelector(".gc-foot")).bottom - cr.top) };
    }));
    const wb = tiles.filter((x) => x.words.some(([w, n]) => w === "Woodworking" && n !== 1));
    ok(tiles.length >= 4 && !wb.length, "deck tiles: \"Woodworking Basics\" wraps between words (never Woodworkin / g)", JSON.stringify(tiles.map((x) => x.words)));
    const clip = tiles.filter((x) => !x.chain || x.chain[0] + 0.5 < x.chain[1]);
    ok(!clip.length, "deck tiles: the chain (Crafts › …) keeps its own whole line, not cut in height", JSON.stringify(clip));
    const over = tiles.filter((x) => x.foot[0] > x.foot[1] + 0.5 || x.foot[2] > x.foot[3] + 0.5 || x.footB > x.h);
    ok(!over.length, "deck tiles: the tier and its pips (Achieved ●●●) fit inside the card", JSON.stringify(over.map((x) => [x.title, x.foot, x.footB, x.h])));
    /* 9. a lesson opened from the cloud: no "Back to your cloud" (the widget is right there); its card's way back stays */
    await p.tap("#thumb"); await p.waitForSelector("#cloud:not([hidden])"); await p.waitForTimeout(600);
    await shut();
    await p.locator(".cloud-flow .draw-btn").tap(); await p.waitForSelector("#lesson:not([hidden])"); await p.waitForTimeout(400);
    const ls = await p.evaluate(() => { const b = document.querySelector("#l-back"); window.scrollTo(0, document.documentElement.scrollHeight); return { text: b.textContent, shown: Boolean(b.getClientRects().length), thumb: Boolean(document.querySelector("#thumb").getClientRects().length), fb: Boolean(document.querySelector("#page-foot .fb-link")?.getClientRects().length) }; });
    ok(ls.thumb && (ls.text === "Back to your cloud" ? !ls.shown : ls.shown), "lesson: a \"Back to your cloud\" link hides beside the cloud widget (\"Back to its card\" stays)", JSON.stringify(ls));
    ok(ls.fb, "lesson: the page ends with Support & feedback", JSON.stringify(ls));
    await p.tap("#thumb"); await p.waitForSelector("#cloud:not([hidden])");
    ok(errs.length === 0, "PR 110 phone checks: no page errors", errs.join(" | "));
  } finally { await ctx.close(); }
}
await browser.close(); server.close();
console.log(`ikolearn mobile e2e: ${pass} passed${fails.length ? `, ${fails.length} FAILED` : ""}`);
fails.forEach((f) => console.log("  x " + f));
process.exit(fails.length ? 1 : 0);
