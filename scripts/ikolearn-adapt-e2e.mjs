// End-to-end checks for PR 107 (no model calls; every /api/ikolearn call mocked): the optional age band (asked lightly,
// changed through Iko or the quiet link, sent only with teaching calls); code shown as quiet blocks (escaped, indentation
// kept); starter ideas leaning on the time zone and language (no geolocation, nothing sent); earning a card on a phone
// keeps the page where it was; the cloud's fog never takes a tap; the cloud and deck widgets keep their places, with
// "Return to <topic>" in place of the screen's own; quieter cloud controls that overlap nothing. Storage stays v9.
// Run: IKOLEARN_PW=<path to node_modules/playwright-core> node scripts/ikolearn-adapt-e2e.mjs   (IKOLEARN_BROWSER=webkit|firefox)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve("public");
if (!process.env.IKOLEARN_PW) { console.log("ikolearn adapt e2e: skipped (set IKOLEARN_PW to a playwright-core folder)"); process.exit(0); }
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

/* the mocked API. examples: the shared, cached list (the only source of the intake's ideas); off with ex: null */
const nd = (rows) => rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
const TRICKY = "Picture the ground as a thick warm quilt over a stove. Deep down it gets so hot that rock turns soft and runny, and that runny rock is magma.";
const QS = [{ q: "What is magma?", options: ["Hot melted rock", "Cold ice", "Sea water"], answer: 0 }, { q: "Where does magma gather?", options: ["In clouds", "In chambers under the volcano", "In rivers"], answer: 1 }, { q: "What is magma called above ground?", options: ["Ash", "Steam", "Lava"], answer: 2 }];
const LESSON = nd([{ t: "start", model: "m" }, { t: "delta", text: "INTRO: Magma is hot melted rock deep underground.\nEXPLAIN: When it comes out of a volcano, we call it lava.\nSTEP: It gathers in chambers under the volcano.\nEXAMPLE: Like thick soup bubbling in a pot." }, { t: "path", steps: [], next: "", choices: [], questions: QS, tricky: TRICKY }, { t: "done" }]);
const kids = (n) => n.map((x, i) => ({ name: x, order: i + 1, score: 0.9 - i * 0.1, why: "A good first step", role: "core", blurb: x + " in plain words, one step at a time, for anyone." }));
const ITEMS = [
  { node: { name: "Ocean Life", chain: ["Nature"] }, card: { title: "Ocean Life", blurb: "Living things of the sea.", goal: "" }, children: kids(["Coral Reefs", "Whales", "Tides"]) },
  { node: { name: "Drawing", chain: ["Art"] }, card: { title: "Drawing", blurb: "Making pictures with lines.", goal: "" }, children: kids(["Shapes", "Shading", "Perspective"]) },
];
const GROW_ITEMS = [{ node: { name: "Patience", chain: ["Growing as a person"] }, card: { title: "Patience", blurb: "Staying calm while things take time.", goal: "" }, children: kids(["Waiting Well", "Slow Breaths"]) }];
const EX_A = ["Birdsong", "Baking bread", "How bridges stand", "Old maps", "Card tricks", "Rain", "Knots", "Chess openings"];
async function open(width, o = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 860 }, timezoneId: o.tz || "America/Toronto", locale: o.locale || "en-US", reducedMotion: o.reduce ? "reduce" : "no-preference", colorScheme: o.dark ? "dark" : "light" });
  const p = await ctx.newPage();
  p.setDefaultTimeout(6000);
  const errs = [], calls = [], bodies = [];
  p.on("pageerror", (e) => errs.push("pageerror " + e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await p.addInitScript(HOOK);
  /* no location is ever asked for (PR 107): any call to geolocation is recorded and fails the run */
  await p.addInitScript(() => { try { const g = navigator.geolocation; if (g) { g.getCurrentPosition = () => { window.__geo = (window.__geo || 0) + 1; }; g.watchPosition = () => { window.__geo = (window.__geo || 0) + 1; return 0; }; } } catch { /* fine */ } });
  const ex = "ex" in o ? o.ex : EX_A;
  await p.route("**/api/ikolearn/**", async (r) => {
    const at = new URL(r.request().url()).pathname.replace("/api/ikolearn", "");
    let b = {}; try { b = JSON.parse(r.request().postData() || "{}"); } catch { b = {}; }
    calls.push(at + (at === "/chat" ? ":" + b.mode : "")); bodies.push({ at, b });
    if (at === "/examples") return ex ? r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, examples: ex, growth: ["Patience", "Listening", "Courage", "Focus"] }) }) : r.fulfill({ status: 503, contentType: "application/json", body: '{"ok":false,"reason":"off"}' });
    if (at === "/lesson") return r.fulfill({ status: 200, contentType: "application/x-ndjson", body: o.lesson || LESSON });
    if (at === "/chat") return r.fulfill({ status: 200, contentType: "application/x-ndjson", body: nd([{ t: "start", model: "m" }, { t: "delta", text: "Happy to help with that. " }, { t: "delta", text: "Let's take it one small step at a time." }, { t: "cloud", topics: [], ghosts: [] }, { t: "done" }]) });
    if (at === "/create") { await new Promise((ok) => setTimeout(ok, 400)); const items = /grow in myself/.test(b.about || "") ? GROW_ITEMS : ITEMS; return r.fulfill({ status: 200, contentType: "application/x-ndjson", body: nd([...items.map((item) => ({ t: "item", item })), { t: "done", items }]) }); }
    return r.fulfill({ status: 503, contentType: "application/json", body: '{"ok":false,"reason":"off"}' });
  });
  return { ctx, p, errs, calls, bodies };
}

const SEED = (o = {}) => {
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
  if (o.band) C.setProfile(c, { band: o.band });
  localStorage.setItem("ikolearn.v1.seen", JSON.stringify({ c: {}, ev: 0, h: Object.assign({ aboutCloud: 1, aboutLesson: 1, aboutDeck: 1, cloud: 1, card: 1, chat: 1, draw: 1, iko: 1 }, o.h || {}) }));
  localStorage.setItem("ikolearn.v1.thread", JSON.stringify([{ id: "m1", at: T, role: "model", local: true, text: "Welcome back, Maya." }]));
};



const answer = async (p, i) => { await p.locator("#l-quiz fieldset.q").nth(i).locator("label.opt").nth(QS[i].answer).click(); await p.waitForTimeout(150); };
const rect = (p, sel) => p.evaluate((s) => { const e = document.querySelector(s); if (!e || e.hidden || !e.getClientRects().length || getComputedStyle(e).visibility === "hidden") return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, t: e.textContent.trim() }; }, sel);
const apart = (a, b) => !a || !b || a.r <= b.x + 0.5 || b.r <= a.x + 0.5 || a.b <= b.y + 0.5 || b.b <= a.y + 0.5;
const boot = async (p, o) => { await p.goto(BASE + "/ikolearn"); await p.evaluate(SEED, o || {}); await p.goto(BASE + "/ikolearn", { waitUntil: "networkidle" }); await p.waitForTimeout(700); };
const profile = (p) => p.evaluate(() => { const C = window.IkoCloud, c = C.deserialize(localStorage.getItem("ikolearn.v1.cloud")); return { band: C.bandOf(c), last: C.lastOf(c), v: JSON.parse(localStorage.getItem("ikolearn.v1.cloud")).v }; });
const toLesson = async (p) => { await p.locator(".cloud-flow > .chip").first().click(); await p.waitForSelector("#l-done:not([hidden])"); await p.waitForTimeout(300); };

const CODE_Q = [{ q: "What does twice(3) give?", code: "def twice(x):\n    return x * 2\n\nprint(twice(3))", options: ["6", "3", "9"], answer: 0 }, QS[1], QS[2]];
const CODE_LESSON = nd([{ t: "start", model: "m" }, { t: "delta", text: "INTRO: A function is a named set of steps, like `twice`.\nEXPLAIN: Here is one that doubles a number:\n```python\ndef twice(x):\n    # doubles it\n    return x * 2  # <b>not bold</b><script>window.__xss=1</script>\n```\n" }, { t: "delta", text: "STEP: Call it with `twice(3)` to get 6.\nEXAMPLE: Like a recipe card you can use again." }, { t: "path", steps: [], next: "", choices: [], questions: CODE_Q, tricky: TRICKY }, { t: "done" }]);

for (const width of [390, 1280]) {
  const tag = String(width), phone = width < 700;

  /* ---- 7. the widgets keep their places; "Return to <topic>" ---- */
  {
    const { ctx, p, errs } = await open(width);
    try {
      await boot(p);
      ok(await p.isHidden("#cloud-ret"), `${tag}: no lesson or card yet: no "Return to" on the cloud`);
      await toLesson(p);
      const L = await rect(p, ".bar-r .minideck"), T = await rect(p, "#thumb");
      ok(L && T && T.r <= L.x + 0.5 && L.r >= width - 70, `${tag}: on a lesson the deck is the far-right widget, the cloud just left of it`, JSON.stringify({ L, T }));
      await p.click("#thumb"); await p.waitForSelector("#cloud:not([hidden])"); await p.waitForTimeout(500);
      const D = await rect(p, "#cloud-deck"), R = await rect(p, "#cloud-ret");
      ok(D && L && Math.abs(D.r - L.r) <= 3 && Math.abs((D.y + D.b) / 2 - (L.y + L.b) / 2) <= 10, `${tag}: the deck sits in the same place on the cloud as on a lesson (no jumping sides)`, JSON.stringify({ D, L }));
      ok(R && R.t === "Return to Magma" && R.r <= D.x + 0.5 && await p.isHidden("#cloud .thumb"), `${tag}: on the cloud, "Return to Magma" takes the cloud widget's place (left of the deck)`, JSON.stringify(R));
      const B = { iko: await rect(p, "#iko"), line: await rect(p, "#iko-line"), nav: await rect(p, ".home-nav"), zoom: await rect(p, ".zoom"), flow: await rect(p, ".cloud-flow"), hint: await rect(p, ".cloud-hint") };
      ok(Object.entries(B).every(([k, b]) => apart(R, b) && apart(D, b)), `${tag}: "Return to" and the deck overlap nothing (Iko, his line, the nav, the controls, the pick-up row)`, JSON.stringify({ R, D, B }));
      ok(apart(B.zoom, B.iko) && apart(B.zoom, B.flow) && apart(B.zoom, B.line) && B.zoom && B.zoom.r <= width - 8 && B.zoom.b <= (B.flow ? B.flow.y : 9999) + 0.5, `${tag}: the cloud controls clear Iko, the pick-up row and the edge`, JSON.stringify(B));
      await p.click("#cloud-ret"); await p.waitForSelector("#lesson:not([hidden])"); await p.waitForTimeout(300);
      ok((await p.textContent("#l-title")) === "Magma" && await p.isHidden("#cloud"), `${tag}: "Return to" opens the last lesson`);
      await p.click(".bar-r .minideck"); await p.waitForSelector("#deck:not([hidden])"); await p.waitForTimeout(300);
      const BR = await rect(p, "#bar-ret"), T2 = await rect(p, "#thumb");
      ok(BR && BR.t === "Return to Magma" && await p.isHidden(".bar-r .minideck") && Math.abs(BR.r - L.r) <= 3 && T2 && T2.r <= BR.x + 0.5, `${tag}: on the deck, "Return to" takes the deck widget's place; the cloud stays left of it`, JSON.stringify({ BR, L, T2 }));
      await p.click("#bar-ret"); await p.waitForSelector("#lesson:not([hidden])"); await p.waitForTimeout(300);
      const L2 = await rect(p, ".bar-r .minideck");
      ok(L2 && Math.abs(L2.r - L.r) <= 1 && Math.abs(L2.y - L.y) <= 1 && await p.isHidden("#bar-ret"), `${tag}: back on the lesson, the deck is where it was`, JSON.stringify({ L, L2 }));
      const pf = await profile(p);
      ok(pf.last && pf.v === 9, `${tag}: the last-lesson pointer is kept with the cloud (storage v9)`, JSON.stringify(pf));
      await p.goto(BASE + "/ikolearn", { waitUntil: "networkidle" }); await p.waitForTimeout(700);
      ok((await p.textContent("#cloud-ret").catch(() => "")) === "Return to Magma" && await p.isVisible("#cloud-ret"), `${tag}: after a reload, the cloud still offers "Return to Magma"`);
      /* 8. the controls: a phone shows one small icon (it recentres); a desktop the three, smaller */
      const z = await p.evaluate(() => { const v = (s) => { const e = document.querySelector(s); return e && e.getClientRects().length ? e.getBoundingClientRect() : null; }; const zr = v("#zreset"); return { zin: Boolean(v("#zin")), zout: Boolean(v("#zout")), w: zr && zr.width, h: zr && zr.height, ico: Boolean(v("#zreset .zr-ico")), label: document.querySelector("#zreset").getAttribute("aria-label") }; });
      if (phone) ok(!z.zin && !z.zout && z.w <= 40 && z.h <= 40 && z.ico && /drag/i.test(z.label), `${tag}: on a phone, no big + / - / Recentre: one small quiet icon that hints the gestures`, JSON.stringify(z));
      else ok(z.zin && z.zout && z.h <= 30 && !z.ico, `${tag}: on a desktop the controls stay, smaller`, JSON.stringify(z));
      await p.evaluate(() => { const v = window.__views.filter((x) => x.id === "cloud-canvas").pop().view; v.zoomBy(2.2); });
      await p.waitForTimeout(300);
      await p.click("#zreset"); await p.waitForTimeout(1500);
      const zs = await p.evaluate(() => window.__views.filter((x) => x.id === "cloud-canvas").pop().view.state().zoom);
      ok(zs < 1.6, `${tag}: the icon (or Recentre) eases the cloud back`, String(zs));
      ok(errs.length === 0, `${tag}: widgets: no page errors`, errs.join(" | "));
    } finally { await ctx.close(); }
  }

  /* ---- 5. earning a card keeps the page where it was; Iko points down when the next step is below ---- */
  if (phone) {
    const { ctx, p, errs } = await open(width);
    try {
      await boot(p);
      await toLesson(p);
      await p.click("#l-cont"); await p.waitForSelector("#l-quiz fieldset.q");
      for (let i = 0; i < 3; i += 1) await answer(p, i);
      await p.waitForSelector("#l-got:not([hidden])");
      await p.evaluate(() => document.querySelector("#l-got").scrollIntoView({ block: "center" })); await p.waitForTimeout(400);
      const y0 = await p.evaluate(() => scrollY);
      await p.click("#l-got");
      const ys = [];
      for (let i = 0; i < 8; i += 1) { await p.waitForTimeout(200); ys.push(await p.evaluate(() => scrollY)); }
      ok(y0 > 200 && ys.every((y) => Math.abs(y - y0) <= 4), `${tag}: after "I've got it" and the card's flight, the page stays where it was (no jump to the top)`, JSON.stringify({ y0, ys }));
      const st = await p.evaluate(() => { const n = [document.querySelector("#l-fork"), document.querySelector("#l-next")].find((x) => x && x.firstElementChild && x.getClientRects().length); const line = document.querySelector("#iko-line"); return { below: Boolean(n) && n.getBoundingClientRect().top > innerHeight - 40, line: line && !line.hidden ? line.textContent : "", done: document.querySelector("#l-status").textContent }; });
      ok(!st.below || /Scroll down to pick another topic/.test(st.line), `${tag}: with the next step below the fold, Iko says to scroll down for it`, JSON.stringify(st));
      ok(errs.length === 0, `${tag}: earn: no page errors`, errs.join(" | "));
    } finally { await ctx.close(); }
  }

  /* ---- 2. code: quiet blocks, escaped, indentation kept, in the lesson and the check ---- */
  {
    const { ctx, p, errs } = await open(width, { lesson: CODE_LESSON, dark: !phone });
    try {
      await boot(p);
      await toLesson(p);
      const c = await p.evaluate(() => { const b = document.querySelector("#l-body pre.code"); const cs = b && getComputedStyle(b); return b && { text: b.textContent, ws: cs.whiteSpace, ox: cs.overflowX, font: cs.fontFamily, kids: b.querySelectorAll("b, script").length, xss: Boolean(window.__xss), inline: [...document.querySelectorAll("#l-body code.ic")].map((x) => x.textContent), fits: b.getBoundingClientRect().right <= innerWidth + 0.5 }; });
      ok(c && /def twice\(x\):\n {4}# doubles it\n {4}return x \* 2/.test(c.text) && /^pre/.test(c.ws) && c.ox === "auto" && /mono/i.test(c.font) && c.fits, `${tag}: a fenced block is a quiet monospace block: line breaks and indentation kept, it scrolls sideways`, JSON.stringify(c));
      ok(c && c.kids === 0 && !c.xss && /<b>not bold<\/b><script>/.test(c.text), `${tag}: code is shown as text (escaped, nothing runs)`, JSON.stringify(c && { kids: c.kids, xss: c.xss }));
      ok(c && c.inline.includes("twice") && c.inline.includes("twice(3)"), `${tag}: single backticks show as inline code`, JSON.stringify(c && c.inline));
      await p.click("#l-cont"); await p.waitForSelector("#l-quiz fieldset.q");
      const q = await p.evaluate(() => { const b = document.querySelector("#l-quiz fieldset.q pre.code"); return b && b.textContent; });
      ok(q && /def twice\(x\):\n {4}return x \* 2\n\nprint\(twice\(3\)\)/.test(q), `${tag}: a question's code shows as the same block`, String(q));
      ok(errs.length === 0, `${tag}: code: no page errors`, errs.join(" | "));
    } finally { await ctx.close(); }
  }

  /* ---- 1. the optional age band ---- */
  {
    const { ctx, p, errs, bodies } = await open(width);
    try {
      await boot(p);
      ok((await profile(p)).band === "", `${tag}: no age band unless the learner gives one`);
      await p.click("#age-link"); await p.waitForTimeout(500);
      const opts = await p.locator("#iko-log .age-opt").allTextContents();
      ok(opts.length === 5 && opts.some((t) => /prefer not/i.test(t)), `${tag}: the quiet link offers the five bands (prefer not to say among them)`, JSON.stringify(opts));
      await p.locator('#iko-log .age-opt[data-band="10-13"]').click(); await p.waitForTimeout(400);
      ok((await profile(p)).band === "10-13", `${tag}: a band is kept on this device, with the learner`);
      await p.keyboard.press("Escape"); await p.waitForTimeout(300);
      await toLesson(p);
      const lb = bodies.filter((x) => x.at === "/lesson").pop();
      ok(lb && lb.b.band === "10-13", `${tag}: the band goes with the lesson call (to set the reading level)`, JSON.stringify(lb && lb.b.band));
      ok(bodies.filter((x) => x.at !== "/lesson" && x.at !== "/test" && !(x.at === "/chat" && x.b.mode === "clarify")).every((x) => !("band" in x.b)), `${tag}: no other call carries it`, JSON.stringify(bodies.map((x) => x.at + ":" + ("band" in x.b))));
      ok(bodies.every((x) => !/Toronto|America\//.test(JSON.stringify(x.b))), `${tag}: the time zone is never sent`);
      /* Iko: "I'm 15", then "forget my age" (no model call) */
      const before = bodies.length;
      await p.click("#l-back"); await p.waitForTimeout(600);
      await p.click("#iko"); await p.waitForSelector("#iko-in");
      await p.fill("#iko-in", "I'm 15"); await p.press("#iko-in", "Enter"); await p.waitForTimeout(500);
      ok((await profile(p)).band === "14-17", `${tag}: telling Iko "I'm 15" sets 14 to 17`);
      await p.fill("#iko-in", "forget my age"); await p.press("#iko-in", "Enter"); await p.waitForTimeout(500);
      ok((await profile(p)).band === "" && bodies.slice(before).every((x) => x.at !== "/chat"), `${tag}: "forget my age" clears it, and neither needed a model call`, JSON.stringify(bodies.slice(before).map((x) => x.at)));
      ok(!(await p.evaluate(() => window.__geo || 0)), `${tag}: location is never asked for`);
      ok(errs.length === 0, `${tag}: age: no page errors`, errs.join(" | "));
    } finally { await ctx.close(); }
  }

  /* ---- 6. the fog: under the cloud, never a target; still with reduced motion ---- */
  {
    const { ctx, p, errs } = await open(width, { reduce: true });
    try {
      await boot(p);
      const f = await p.evaluate(async () => {
        const fc = document.querySelector("#cloud .cloud-fog"), cv = document.querySelector("#cloud-canvas");
        if (!fc) return null;
        const cs = getComputedStyle(fc), px = () => { const g = fc.getContext("2d"), d = g.getImageData(0, 0, fc.width, fc.height).data; let s = 0, a = 0; for (let i = 3; i < d.length; i += 4) { s += d[i] * (i % 997); if (d[i]) a += 1; } return { s, a }; };
        const one = px(); await new Promise((r) => setTimeout(r, 900)); const two = px();
        return { pe: cs.pointerEvents, hidden: fc.getAttribute("aria-hidden"), under: Boolean(fc.compareDocumentPosition(cv) & Node.DOCUMENT_POSITION_FOLLOWING), one, two, small: fc.width < cv.width / 3 };
      });
      ok(f && f.pe === "none" && f.hidden === "true" && f.under && f.small, `${tag}: the fog is a small canvas under the cloud's, aria-hidden, never hit`, JSON.stringify(f));
      ok(f && f.one.a > 20 && f.one.s === f.two.s, `${tag}: there is a haze, and with reduced motion it holds still`, JSON.stringify(f && { one: f.one, two: f.two }));
      const xy = await p.evaluate(() => { const v = window.__views.filter((x) => x.id === "cloud-canvas").pop().view, C = window.IkoCloud, c = C.deserialize(localStorage.getItem("ikolearn.v1.cloud")), id = c.order.find((x) => c.nodes[x].label === "Volcanoes"), q = v.project(id), r = document.querySelector("#cloud-canvas").getBoundingClientRect(); return { x: r.left + q.x, y: r.top + q.y }; });
      await p.mouse.click(xy.x, xy.y); await p.waitForTimeout(900);
      ok((await p.textContent("#p-title").catch(() => "")) === "Volcanoes", `${tag}: a tap through the fog still opens the node`);
      ok(errs.length === 0, `${tag}: fog: no page errors`, errs.join(" | "));
    } finally { await ctx.close(); }
  }

  /* ---- 3. starter ideas lean on the time zone and language (never sent or shown); 4. first-visit lines ---- */
  for (const [tz, locale, want] of [["America/Toronto", "en-CA", "Northern lights|Great Lakes|Bison and prairies|Maple trees"], ["Asia/Tokyo", "ja-JP", "Origami|Earthquakes|Rice farming|Paper and printing"]]) {
    const { ctx, p, errs, bodies } = await open(width, { tz, locale });
    try {
      await p.goto(BASE + "/ikolearn", { waitUntil: "networkidle" });
      await p.click('.who-opt[data-who="self"]'); await p.fill("#name-in", "Maya"); await p.press("#name-in", "Enter");
      await p.waitForSelector("#cloud:not([hidden]) #cloud-start:not([hidden])"); await p.waitForTimeout(1000);
      const chips = [];
      for (let i = 0; i < 4; i += 1) { chips.push(...await p.locator("#cs-ex .ex-chip").allTextContents()); if (await p.isVisible("#cs-ex .ex-more")) { await p.click("#cs-ex .ex-more"); await p.waitForTimeout(250); } }
      const re = new RegExp("^(" + want + ")$");
      ok(chips.some((c) => re.test(c)) && chips.some((c) => EX_A.includes(c)), `${tag} ${tz}: a few starter ideas lean on where the device is set (mixed with the usual ideas)`, JSON.stringify(chips));
      const shown = await p.evaluate(() => document.body.innerText);
      ok(!/Toronto|Tokyo|America\/|Asia\//.test(shown) && bodies.every((x) => !/Toronto|Tokyo|America\/|Asia\//.test(JSON.stringify(x.b))) && !(await p.evaluate(() => window.__geo || 0)), `${tag} ${tz}: the place is never shown, sent, or asked for`);
      const kept = await p.evaluate(() => Object.keys(localStorage).map((k) => localStorage.getItem(k)).join(" "));
      ok(!/Toronto|Tokyo|America\/|Asia\/|eastasia|"na"/.test(kept), `${tag} ${tz}: nor kept on the device`);
      ok(errs.length === 0, `${tag} ${tz}: starters: no page errors`, errs.join(" | "));
    } finally { await ctx.close(); }
  }
  {
    const { ctx, p, errs } = await open(width);
    try {
      await boot(p);
      await p.evaluate(() => { const s = JSON.parse(localStorage.getItem("ikolearn.v1.seen")); delete s.h.aboutCloud; delete s.h.aboutLesson; delete s.h.aboutDeck; localStorage.setItem("ikolearn.v1.seen", JSON.stringify(s)); sessionStorage.clear(); });
      await p.goto(BASE + "/ikolearn", { waitUntil: "networkidle" }); await p.waitForTimeout(1500);
      const say = async () => p.evaluate(() => { const l = document.querySelector("#iko-line"); return l && !l.hidden && l.getClientRects().length ? l.textContent : ""; });
      const s1 = await say();
      ok(/This is your cloud/.test(s1), `${tag}: the first time on the cloud, Iko says what it is for`, s1);
      if (await p.isVisible("#iko-line")) { await p.click("#iko-line"); await p.waitForTimeout(300); }
      await toLesson(p); await p.waitForTimeout(1200);
      const s2 = await say();
      ok(/This is a lesson/.test(s2), `${tag}: the first lesson: what the lesson screen is for`, s2);
      if (await p.isVisible("#iko-line")) { await p.click("#iko-line"); await p.waitForTimeout(300); }
      await p.click(".bar-r .minideck"); await p.waitForTimeout(1200);
      const s3 = await say();
      ok(/This is your deck/.test(s3), `${tag}: the first time on the deck: what it is for`, s3);
      if (await p.isVisible("#iko-line")) { await p.click("#iko-line"); await p.waitForTimeout(300); }
      await p.goto(BASE + "/ikolearn", { waitUntil: "networkidle" }); await p.waitForTimeout(1500);
      ok(!/This is your cloud/.test(await say()), `${tag}: each is said once`);
      ok(errs.length === 0, `${tag}: first visits: no page errors`, errs.join(" | "));
    } finally { await ctx.close(); }
  }
}

await browser.close();
server.close();
console.log(`ikolearn adapt e2e: ${pass} passed${fails.length ? `, ${fails.length} failed` : ""}`);
if (fails.length) { fails.forEach((f) => console.log("  x " + f)); process.exit(1); }
