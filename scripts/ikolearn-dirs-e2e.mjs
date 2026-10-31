// End-to-end checks for directions (the cloud as a map), in a real browser, every /api/ikolearn call mocked (no model
// calls), at 390 and 1280 (guide mode): after the first subject a quiet "Want to add another direction?" (a second and
// a third, then quiet; Not now is remembered); a direction is one "more" creation call that lands as a new parent under
// the name, never in the last branch; on a return visit (simulated clock) one or two branches left alone for a while,
// beside "or something new" (closable, rests a week); insights absent with little activity and one soft note after
// real activity across branches (closable, remembered); 0 calls for all of it except adding a direction.
// Run: IKOLEARN_PW=<path to node_modules/playwright-core> node scripts/ikolearn-dirs-e2e.mjs [--shots DIR] [--tag after] [--root public]
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const SHOTS = arg("--shots", ""), TAG = arg("--tag", "after"), ROOT = path.resolve(arg("--root", "public"));
if (!process.env.IKOLEARN_PW) { console.log("ikolearn dirs e2e: skipped (set IKOLEARN_PW to a playwright-core folder)"); process.exit(0); }
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

/* the mocked API: the start builds one subject; a new direction builds one more, by the learner's words */
const nd = (rows) => rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
const kids = (n) => n.map((x, i) => ({ name: x, order: i + 1, score: 0.9 - i * 0.1, why: "A good first step", role: "core", blurb: x + " in plain words, one step at a time, for anyone." }));
const item = (top, sub, k) => ({ node: { name: top, chain: [sub] }, card: { title: top, blurb: top + " in plain words.", goal: "" }, children: kids(k) });
const BY = [
  [/grow in myself/, item("Patience", "Growing as a person", ["Waiting Well", "Slow Breaths"])],
  [/draw/i, item("Drawing", "Art", ["Shapes", "Shading", "Perspective"])],
  [/music|rhythm/i, item("Rhythm", "Music", ["Beats", "Tempo", "Drums"])],
  [/./, item("Ocean Life", "Nature", ["Coral Reefs", "Whales", "Tides"])],
];
/* the start, as the server shapes it: one item per idea in the intake, each its own subject, at most 4 subjects; the rest as later */
const IDEAS = [[/ocean|sea/i, item("Ocean Life", "Nature", ["Coral Reefs", "Whales", "Tides"])], [/draw/i, item("Drawing", "Art", ["Shapes", "Shading", "Lines"])],
  [/music/i, item("Rhythm", "Music", ["Beats", "Tempo", "Drums"])], [/bak/i, item("Baking", "Cooking", ["Bread", "Cakes"])], [/stars/i, item("Stars", "Space", ["Planets", "Constellations"])],
  [/rain/i, item("Rain", "Weather", ["Clouds", "Storms"])], [/games/i, item("Board Games", "Play", ["Dice", "Strategy"])], [/kites/i, item("Kites", "Flight", ["Wind", "Paper Kites"])]];
function startItems(about) {
  const parts = about.split(/,|\band\b/).map((x) => x.trim()).filter(Boolean), items = [], later = [], roots = [];
  parts.forEach((pt) => { const hit = IDEAS.find(([re]) => re.test(pt)); if (!hit || items.includes(hit[1])) return; const root = hit[1].node.chain[0]; if (!roots.includes(root) && roots.length >= 4) { later.push(hit[1].node.name); return; } if (!roots.includes(root)) roots.push(root); items.push(hit[1]); });
  return { items: items.length ? items : [IDEAS[0][1]], later };
}
const QS = [{ q: "What is a tide?", options: ["The sea rising and falling", "A fish", "A boat"], answer: 0 }];
const LESSON = nd([{ t: "start", model: "m" }, { t: "delta", text: "INTRO: Tides are the sea rising and falling.\nEXPLAIN: The moon pulls the water." }, { t: "path", steps: [], next: "", choices: [], questions: QS, tricky: "Like a blanket pulled by a friend." }, { t: "done" }]);
const shot = async (p, w, name) => { if (SHOTS) { await p.waitForTimeout(350); await p.screenshot({ path: path.join(SHOTS, `dirs-${TAG === "after" ? "" : TAG + "-"}${w}-${name}.png`) }); } };
const DAY = 864e5, T0 = Date.UTC(2026, 9, 1, 16);
/* a seeded cloud: subjects [[subject, parent topic, [children]]], activity { label: { ago (days), done, right } } (relative to `now`) */
const SEED = ({ subs, act, visits, active, guide, now, dir }) => {
  const C = window.IkoCloud, T = now - 30 * 864e5, c = C.create("Maya", T);
  subs.forEach(([sub, top, k], i) => C.applyCreate(c, { items: [{ node: { name: top, chain: [sub] }, card: { title: top, blurb: top + " in plain words.", goal: "" }, children: k.map((x, j) => ({ name: x, order: j + 1, score: 0.8 - j * 0.1, why: "", role: "core", blurb: x + " in plain words, step by step." })) }] }, { t: T + i * 1000 }));
  const id = (l) => c.order.find((x) => c.nodes[x].label === l);
  Object.entries(act || {}).forEach(([l, a]) => { const n = c.nodes[id(l)]; const at = now - a.ago * 864e5; n.ghost = false; n.opened = true; n.engaged = 2; n.touched = at; if (a.right) { n.correct = a.right; n.mastery = 0.5; } if (a.done) n.doneAt = at; });
  c.order.forEach((x) => { if (!c.nodes[x].blurb) c.nodes[x].blurb = c.nodes[x].label + " in plain words, a little at a time."; });
  if (active) c.active = id(active);
  c.profile.onboarded = T; c.profile.visits = visits; c.profile.lessonVisit = visits; c.profile.askedAt = now;
  if (dir) Object.assign(C.dirOf(c), dir);
  localStorage.setItem("ikolearn.v1.name", "Maya"); localStorage.setItem("ikolearn.v1.cloud", C.serialize(c));
  if (guide) window.IkoProfiles.begin(localStorage, "guide", "Maya");
  localStorage.setItem("ikolearn.v1.seen", JSON.stringify({ c: {}, ev: 0, h: { aboutCloud: 1, aboutLesson: 1, aboutDeck: 1, cloud: 1, card: 1, chat: 1, draw: 1, iko: 1, grow: 1 } }));
  localStorage.setItem("ikolearn.v1.thread", JSON.stringify([{ id: "m1", at: T, role: "model", local: true, text: "Welcome back, Maya." }]));
};
async function open(width, ctx0) {
  const ctx = ctx0 || await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 860 }, timezoneId: "America/Toronto" });
  const p = await ctx.newPage();
  p.setDefaultTimeout(6000);
  const errs = [], calls = [], bodies = [];
  p.on("pageerror", (e) => errs.push("pageerror " + e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await p.addInitScript(HOOK);
  await p.route("**/api/ikolearn/**", async (r) => {
    const at = new URL(r.request().url()).pathname.replace("/api/ikolearn", "");
    let b = {}; try { b = JSON.parse(r.request().postData() || "{}"); } catch { b = {}; }
    calls.push(at); bodies.push({ at, b });
    if (at === "/examples") return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, examples: ["Stars", "Rain", "Games", "Kites", "Chess", "Gardens"], growth: ["Patience", "Focus"] }) });
    if (at === "/lesson") return r.fulfill({ status: 200, contentType: "application/x-ndjson", body: LESSON });
    if (at === "/create") {
      await new Promise((ok) => setTimeout(ok, 300));
      const idea = /grow in myself/.test(b.about || "") ? null : IDEAS.find(([re]) => re.test(b.about || "") && !/ocean|sea/i.test(String(re)));
      let items = [idea ? idea[1] : BY.find(([re]) => re.test(b.about || ""))[1]], later;
      if (b.kind === "start") ({ items, later } = startItems(b.about || ""));
      return r.fulfill({ status: 200, contentType: "application/x-ndjson", body: nd([...items.map((it) => ({ t: "item", item: it })), { t: "done", items, ...(later && later.length ? { later } : {}) }]) });
    }
    return r.fulfill({ status: 503, contentType: "application/json", body: '{"ok":false,"reason":"off"}' });
  });
  return { ctx, p, errs, calls, bodies };
}
async function boot(width, spec, at) {
  const o = await open(width);
  if (at) await o.p.clock.install({ time: at });
  await o.p.goto(BASE + "/ikolearn"); await o.p.evaluate(SEED, { now: at || Date.now(), ...spec }); await o.p.goto(BASE + "/ikolearn", { waitUntil: "networkidle" }); await o.p.waitForTimeout(800);
  return o;
}
/* a later visit in the same browser: a new tab (a new session), the clock set to `at` */
async function revisit(o, width, at) {
  const n = await open(width, o.ctx);
  if (at) await n.p.clock.install({ time: at });
  await n.p.goto(BASE + "/ikolearn", { waitUntil: "networkidle" }); await n.p.waitForTimeout(800);
  return n;
}
const cloudNow = (p) => p.evaluate(() => { const C = window.IkoCloud, c = C.deserialize(localStorage.getItem("ikolearn.v1.cloud")); return { subjects: C.subjects(c).map((s) => s.label), roots: C.subjects(c).every((s) => !s.parent), parentOf: Object.fromEntries(c.order.map((x) => [c.nodes[x].label, c.nodes[x].parent ? c.nodes[c.nodes[x].parent].label : null])), dir: C.dirOf(c), visits: c.profile.visits }; });
const note = (p) => p.evaluate(() => {
  const n = document.querySelector(".cloud-flow:not([hidden]) .cf-note"), w = document.querySelector("#iko-wrap");
  if (!n) return null;
  const r = n.getBoundingClientRect(), ir = w && !w.hidden ? w.getBoundingClientRect() : null;
  const kids = [...n.querySelectorAll("button, .kicker, input")].map((e) => e.getBoundingClientRect()).concat([...n.querySelectorAll(".dir-text")].map((e) => e.getBoundingClientRect()));
  return { cls: n.className, text: [...n.querySelectorAll(".kicker, .dir-chip, .dir-ask, .dir-new, .dir-text")].map((e) => { const c = e.cloneNode(true); c.querySelectorAll(".cf-x").forEach((x) => x.remove()); return c.textContent; }).join(" ").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim(), chips: [...n.querySelectorAll(".dir-chip")].map((b) => b.textContent),
    inView: r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight, noScroll: document.documentElement.scrollWidth <= innerWidth,
    ikoClear: !ir || kids.every((k) => k.right <= ir.left || k.left >= ir.right || k.bottom <= ir.top || k.top >= ir.bottom),
    x: [...n.querySelectorAll(".cf-x")].map((b) => b.getAttribute("aria-label")), xWithLast: (() => { const x = n.querySelector(".cf-x"); if (!x) return true; const a = x.getBoundingClientRect(), prev = x.previousElementSibling; if (prev) { const b = prev.getBoundingClientRect(); return Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2) < 8; } const r = document.createRange(), t = x.parentNode.firstChild; r.setStart(t, 0); r.setEnd(t, Math.max(1, t.textContent.trim().length)); const b = r.getBoundingClientRect(); return Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2) < 10; })() };
});
/* PR 103: Iko's reassurance after the first interests has its say first; the grow line follows it */
/* PR 107: Iko's first reassurance stays until it is tapped (the grow line follows it); tap it away if it shows */
const growSoon = async (p) => { await p.waitForTimeout(400); await p.evaluate(() => { const l = document.querySelector("#iko-line"); if (l && !l.hidden && l.getAttribute("data-react") === "start") l.click(); }); return growWait(p); };
const growWait = (p) => p.waitForFunction(() => { const l = document.querySelector("#iko-line"); return Boolean(l && !l.hidden && /grow in yourself/.test(l.textContent)); }, null, { timeout: 12000 }).then(() => true, () => false);
const growLine = (p) => p.evaluate(() => { const l = document.querySelector("#iko-line"); return Boolean(l && !l.hidden && /grow in yourself/.test(l.textContent)); });
const inviteOn = (p) => p.evaluate(() => Boolean(document.querySelector(".cloud-flow:not([hidden]) .cf-note.dir-invite")));
/* name, then the intake on the cloud */
async function toIntake(p, guide) {
  await p.goto(BASE + "/ikolearn", { waitUntil: "networkidle" });
  await p.click(`.who-opt[data-who="${guide ? "guide" : "self"}"]`); await p.fill("#name-in", "Maya"); await p.press("#name-in", "Enter");
  await p.waitForSelector("#cloud:not([hidden])"); await p.waitForTimeout(500);
}
const built = (p, n) => p.waitForFunction((k) => { const C = window.IkoCloud, c = C.deserialize(localStorage.getItem("ikolearn.v1.cloud")); return c && C.subjects(c).length >= k && !document.querySelector(".cloud-caption:not([hidden])"); }, n, { timeout: 15000 });
const chipState = (p) => p.evaluate(() => [...document.querySelectorAll("#cs-ex .ex-chip")].map((b) => b.textContent + (b.getAttribute("aria-pressed") === "true" ? "*" : "")));
const flowOk = (p) => p.evaluate(() => { const f = document.querySelector(".cloud-flow"); return Boolean(f && !f.hidden && f.querySelector(".draw-btn")); });

for (const width of [390, 1280]) {
  const tag = String(width), guide = width === 1280;
  /* 0. the intake invites one thing or a few: ideas picked together with the typed words, one start call, several parents */
  {
    const { ctx, p, errs, calls, bodies } = await open(width);
    try {
      await toIntake(p, guide);
      const few = await p.evaluate(() => { const f = document.querySelector("#cs-few"), q = document.querySelector("#cs-q"); return { text: f && !f.hidden ? f.textContent : "", below: f && q && f.getBoundingClientRect().top >= q.getBoundingClientRect().bottom - 1, qs: (document.querySelector("#cloud-start").innerText.match(/\?/g) || []).length }; });
      ok(few.text === "One thing or a few, whatever's on your mind." && few.below && few.qs === 1, `${tag}: intake: one question, with a quiet "one thing or a few" under it`, JSON.stringify(few));
      /* PR 107: a starter idea (from the device's time zone and language) may sit between the API's while the cloud is small */
      const cs0 = await chipState(p), starters = await p.evaluate(() => { const P = window.IkoPlan; return P.starterIdeas(P.areaOf(Intl.DateTimeFormat().resolvedOptions().timeZone, navigator.language), ""); });
      const apiOnly = cs0.filter((c) => !starters.includes(c));
      ok(cs0.length === 3 && JSON.stringify(apiOnly) === JSON.stringify(["Stars", "Rain", "Games"].slice(0, apiOnly.length)) && apiOnly.length >= 2 && cs0.every((c) => typeof c === "string"), `${tag}: intake: a few plain idea chips (nothing toggled)`, JSON.stringify(cs0));
      /* PR 103: a tap adds the idea to the field and that chip moves on to an idea not yet used (they never pile up) */
      await p.fill("#cs-in", "the ocean");
      await p.click('#cs-ex .ex-chip:text-is("Stars")'); await p.waitForTimeout(100);
      const one = { v: await p.inputValue("#cs-in"), chips: await chipState(p) };
      ok(one.v === "the ocean, Stars" && !one.chips.includes("Stars") && one.chips.length === 3 && one.chips.every((c) => !/\*$/.test(c)) && calls.filter((c) => c !== "/examples").length === 0, `${tag}: intake: a tapped idea goes into the field; its chip moves on (no call yet)`, JSON.stringify(one));
      await p.focus('#cs-ex .ex-chip:text-is("Rain")'); await p.keyboard.press("Enter"); await p.waitForTimeout(100);
      const kb = await p.evaluate(() => ({ v: document.querySelector("#cs-in").value, on: document.activeElement && document.activeElement.classList.contains("ex-chip") ? document.activeElement.textContent : "" }));
      ok(kb.v === "the ocean, Stars, Rain" && kb.on && kb.on !== "Rain" && !(await chipState(p)).some((c) => /^(Stars|Rain)$/.test(c)), `${tag}: intake: Enter adds an idea too and keeps the focus on the chips`, JSON.stringify(kb));
      const before = await chipState(p);
      await p.click("#cs-ex .ex-more"); await p.waitForTimeout(100);
      const more = await chipState(p);
      ok(more.length >= 2 && more.length <= 3 && JSON.stringify(more) !== JSON.stringify(before) && !more.some((c) => /^(Stars|Rain)$/.test(c)), `${tag}: intake: More shows other ideas (never one already in the field)`, JSON.stringify({ before, more }));
      if (SHOTS) await p.screenshot({ path: path.join(SHOTS, `dirs-intake-${tag}-picked.png`) });
      await p.click("#cs-form button[type=submit]");
      await built(p, 3); await p.waitForTimeout(1200);
      const st = bodies.filter((x) => x.at === "/create");
      const cl = await cloudNow(p);
      ok(st.length === 1 && st[0].b.kind === "start" && st[0].b.about === "the ocean, Stars, Rain", `${tag}: intake: the typed words and the picked ideas go as one answer, in one start call`, JSON.stringify(st.map((x) => x.b.about)));
      ok(cl.subjects.join() === "Nature,Space,Weather" && cl.roots && cl.parentOf["Ocean Life"] === "Nature" && cl.parentOf.Stars === "Space" && cl.parentOf.Rain === "Weather", `${tag}: intake: each idea its own parent under the name`, JSON.stringify(cl.subjects));
      ok(!(await inviteOn(p)) && await growSoon(p), `${tag}: intake made 3 subjects: no invite, and Iko's grow line comes (after its reassurance)`);
      await p.click("#zreset"); await p.waitForTimeout(1400);
      if (SHOTS) await p.screenshot({ path: path.join(SHOTS, `dirs-intake-${tag}-fanned.png`) });
      ok((await p.inputValue("#cs-in")) === "", `${tag}: intake: the field is cleared once used`);
      ok(!errs.length, `${tag}: no console errors (intake)`, errs.join(" | "));
    } catch (e) { fails.push(`${tag}: intake threw -> ${String(e.message || e).split("\n")[0]}`); }
    await ctx.close();
  }
  /* 0b. free text with several ideas; more ideas than one intake grows: 4 subjects, the rest waiting as "Also on your mind" */
  {
    const { ctx, p, errs, calls } = await open(width);
    try {
      await toIntake(p, guide);
      await p.fill("#cs-in", "drawing and music"); await p.click("#cs-form button[type=submit]");
      await built(p, 2); await p.waitForTimeout(1200);
      let cl = await cloudNow(p);
      ok(cl.subjects.join() === "Art,Music" && cl.roots && calls.filter((c) => c === "/create").length === 1, `${tag}: free text with two ideas: two parents from one start call`, JSON.stringify(cl.subjects));
      ok(await inviteOn(p) && !(await growLine(p)), `${tag}: two subjects: the invite asks for a third, the grow line waits`);
      ok(!errs.length, `${tag}: no console errors (two ideas)`, errs.join(" | "));
    } catch (e) { fails.push(`${tag}: two-ideas threw -> ${String(e.message || e).split("\n")[0]}`); }
    await ctx.close();
    const o = await open(width);
    try {
      await toIntake(o.p, guide);
      await o.p.fill("#cs-in", "the sea, drawing, music and baking");
      await o.p.click('#cs-ex .ex-chip:text-is("Stars")'); await o.p.click('#cs-ex .ex-chip:text-is("Rain")'); await o.p.click('#cs-ex .ex-chip:text-is("Games")');
      await o.p.click("#cs-form button[type=submit]");
      await built(o.p, 4); await o.p.waitForTimeout(1300);
      const cl = await cloudNow(o.p), n = await note(o.p);
      ok(o.calls.filter((c) => c === "/create").length === 1 && cl.subjects.join() === "Nature,Art,Music,Cooking" && JSON.stringify(cl.dir.later) === JSON.stringify(["Stars", "Rain", "Board Games"]), `${tag}: seven ideas: 4 subjects now (one call); the rest kept for later`, JSON.stringify({ s: cl.subjects, later: cl.dir.later }));
      ok(n && /dir-later/.test(n.cls) && /Also on your mind/.test(n.text) && JSON.stringify(n.chips) === JSON.stringify(["Stars", "Rain", "Board Games"]) && n.inView && n.noScroll && n.ikoClear && n.xWithLast && !(await inviteOn(o.p)), `${tag}: "Also on your mind" offers them, quietly (no invite with 4 subjects)`, JSON.stringify(n));
      ok(!(await growLine(o.p)), `${tag}: the grow line waits while those are offered`);
      await shot(o.p, tag, "later");
      const c0 = o.calls.length;
      const zc = await o.p.evaluate(() => { const n = document.querySelector(".cf-note").getBoundingClientRect(), z = document.querySelector(".zoom").getBoundingClientRect(); return { clear: z.bottom <= n.top || z.top >= n.bottom || z.right <= n.left || z.left >= n.right, n: [n.top, n.bottom], z: [z.top, z.bottom] }; });
      ok(zc.clear, `${tag}: the zoom controls sit above the note, never over it (PR 106)`, JSON.stringify(zc));
      await o.p.click('.cf-note .dir-chip:text-is("Rain")');
      await built(o.p, 5); await o.p.waitForTimeout(1300);
      const b2 = o.bodies.filter((x) => x.at === "/create").pop().b, cl2 = await cloudNow(o.p);
      ok(o.calls.slice(c0).join() === "/create" && b2.kind === "more" && b2.about === "Rain" && b2.favorites.length === 0 && cl2.subjects.includes("Weather") && JSON.stringify(cl2.dir.later) === JSON.stringify(["Stars", "Board Games"]), `${tag}: one of them, tapped: one "more" call, a new parent; it leaves the list`, JSON.stringify({ about: b2.about, later: cl2.dir.later, s: cl2.subjects }));
      await o.p.click('.cf-note.dir-later .cf-x'); await o.p.waitForTimeout(300);
      ok(!(await o.p.$(".cf-note.dir-later")) && (await cloudNow(o.p)).dir.later.length === 0 && await growSoon(o.p), `${tag}: Not now clears them; then the grow line comes`);
      ok(!o.errs.length, `${tag}: no console errors (later)`, o.errs.join(" | "));
    } catch (e) { fails.push(`${tag}: later threw -> ${String(e.message || e).split("\n")[0]}`); }
    await o.ctx.close();
  }
  /* 1. the first subject from the intake: the invite appears; two more directions fan the cloud out; then it goes quiet */
  {
    const { ctx, p, errs, calls, bodies } = await open(width);
    try {
      await p.goto(BASE + "/ikolearn", { waitUntil: "networkidle" });
      if (guide) { await p.click('.who-opt[data-who="guide"]'); await p.fill("#name-in", "Maya"); await p.press("#name-in", "Enter"); }
      else { await p.click('.who-opt[data-who="self"]'); await p.fill("#name-in", "Maya"); await p.press("#name-in", "Enter"); }
      await p.waitForSelector("#cloud:not([hidden])"); await p.waitForTimeout(400);
      ok(!(await note(p)), `${tag}: no invite on an empty cloud (the opening question is there instead)`);
      await p.fill("#cs-in", "the ocean"); await p.click("#cs-form button[type=submit]");
      await p.waitForFunction(() => { const C = window.IkoCloud, c = C.deserialize(localStorage.getItem("ikolearn.v1.cloud")); return c && C.subjects(c).length >= 1 && !document.querySelector(".cloud-caption:not([hidden])"); }, null, { timeout: 15000 });
      await p.waitForTimeout(900);
      let n = await note(p), cl = await cloudNow(p);
      ok(cl.subjects.join() === "Nature" && n && /dir-invite/.test(n.cls) && /^Want to add another direction\?/.test(n.text) && n.x.join() === "Not now", `${tag}: after the first subject, a quiet "Want to add another direction?" (closable)`, JSON.stringify({ n, s: cl.subjects }));
      ok(n && n.inView && n.noScroll && n.ikoClear && n.xWithLast && await flowOk(p), `${tag}: the invite sits above Pick up, in view, clear of Iko`, JSON.stringify(n));
      await shot(p, tag, "invite");
      ok(!(await growLine(p)), `${tag}: Iko's grow line waits while the invite is on the cloud (never both at once)`);
      if (width === 390 && SHOTS) {
        /* the intake's 9 s hello has run its course: the invite on its own, the grow line still waiting */
        await p.waitForFunction(() => document.querySelector("#iko-line").hidden, null, { timeout: 12000 });
        ok(await inviteOn(p) && !(await growLine(p)), `${tag}: after the hello, still only the invite (the grow line waits)`);
        await p.screenshot({ path: path.join(SHOTS, "dirs-390-invite-staggered.png") });
      }
      /* open the field: 0 calls; it takes focus; Escape closes it */
      let c0 = calls.length;
      await p.click(".cf-note .dir-ask"); await p.waitForTimeout(250);
      ok(await p.evaluate(() => document.activeElement && document.activeElement.classList.contains("dir-in")), `${tag}: the invite opens a small field, focused`);
      await p.keyboard.press("Escape"); await p.waitForTimeout(200);
      ok(await p.isVisible(".cf-note .dir-ask") && calls.length === c0, `${tag}: Escape folds it back, 0 calls`);
      await p.click(".cf-note .dir-ask"); await p.waitForTimeout(200);
      await p.keyboard.type("drawing"); await p.keyboard.press("Enter");
      await p.waitForFunction(() => window.IkoCloud.subjects(window.IkoCloud.deserialize(localStorage.getItem("ikolearn.v1.cloud"))).length >= 2, null, { timeout: 10000 });
      await p.waitForTimeout(1400);
      const b1 = bodies.filter((x) => x.at === "/create").pop().b;
      cl = await cloudNow(p);
      ok(calls.slice(c0).join() === "/create" && b1.kind === "more" && Array.isArray(b1.favorites) && b1.favorites.length === 0 && !b1.focusId && !b1.focus, `${tag}: a direction is one "more" creation call, no focus, not leaning on the last branch`, JSON.stringify({ calls: calls.slice(c0), kind: b1.kind, fav: b1.favorites, focus: b1.focusId }));
      ok(cl.subjects.join() === "Nature,Art" && cl.roots && cl.parentOf.Drawing === "Art" && cl.parentOf.Art === null && cl.dir.n === 1, `${tag}: it lands as a new parent under the name, beside Nature`, JSON.stringify({ s: cl.subjects, d: cl.parentOf.Drawing }));
      n = await note(p);
      ok(n && /dir-invite/.test(n.cls), `${tag}: with 2 subjects, it still invites a third`, JSON.stringify(n));
      c0 = calls.length;
      await p.click(".cf-note .dir-ask"); await p.waitForTimeout(200); await p.fill(".dir-in", "music"); await p.click(".dir-form button[type=submit]");
      await p.waitForFunction(() => window.IkoCloud.subjects(window.IkoCloud.deserialize(localStorage.getItem("ikolearn.v1.cloud"))).length >= 3, null, { timeout: 10000 });
      await p.waitForTimeout(1400);
      cl = await cloudNow(p); n = await note(p);
      ok(calls.slice(c0).join() === "/create" && cl.subjects.join() === "Nature,Art,Music" && cl.roots && cl.parentOf.Rhythm === "Music", `${tag}: a third direction: 3 parents, fanned out from the name`, JSON.stringify(cl.subjects));
      ok(!n || !/dir-invite/.test(n.cls), `${tag}: with 3 subjects the invite goes quiet`, JSON.stringify(n));
      ok(await growSoon(p) && !(await inviteOn(p)), `${tag}: once the invite has gone, Iko's grow line comes (once)`);
      await p.click("#zreset"); await p.waitForTimeout(1400);
      await shot(p, tag, "fanned");
      /* the next visit: still quiet */
      const v = await revisit({ ctx }, width);
      ok(!(await v.p.$(".cf-note.dir-invite")), `${tag}: the invite stays quiet on the next visit`);
      ok(!errs.length && !v.errs.length, `${tag}: no console errors (invite)`, errs.concat(v.errs).join(" | "));
    } catch (e) { fails.push(`${tag}: invite threw -> ${String(e.message || e).split("\n")[0]}`); }
    await ctx.close();
  }
  /* 2. dismissing the invite is remembered; nothing is forced into the last branch */
  {
    const { ctx, p, errs, calls } = await boot(width, { subs: [["Nature", "Ocean Life", ["Coral Reefs", "Whales", "Tides"]]], act: { Tides: { ago: 0.1 } }, active: "Tides", visits: 1, guide });
    try {
      ok(await p.isVisible(".cf-note.dir-invite"), `${tag}: a 1-subject cloud shows the invite`);
      await p.click('.cf-note .cf-x[aria-label="Not now"]'); await p.waitForTimeout(300);
      ok(!(await p.$(".cf-note")) && await flowOk(p) && calls.filter((c) => c !== "/examples").length === 0, `${tag}: Not now: gone, Pick up stays, 0 calls`, calls.join());
      const v = await revisit({ ctx }, width);
      ok(!(await v.p.$(".cf-note.dir-invite")) && (await cloudNow(v.p)).dir.off > 0, `${tag}: the dismissal is remembered (saved with the cloud)`);
      ok(!errs.length && !v.errs.length, `${tag}: no console errors (dismiss)`, errs.concat(v.errs).join(" | "));
    } catch (e) { fails.push(`${tag}: dismiss threw -> ${String(e.message || e).split("\n")[0]}`); }
    await ctx.close();
  }
  /* 3. a return visit (simulated clock): branches left alone for a while, beside something new */
  {
    const SUBS = [["Nature", "Ocean Life", ["Coral Reefs", "Whales", "Tides"]], ["Art", "Drawing", ["Shapes", "Shading", "Lines"]], ["Music", "Rhythm", ["Beats", "Tempo", "Drums"]], ["Cooking", "Baking", ["Bread", "Cakes"]]];
    const ACT = { Tides: { ago: 0.2 }, Shapes: { ago: 0.5 }, Beats: { ago: 1 }, Bread: { ago: 1 } };
    const o = await boot(width, { subs: SUBS, act: ACT, active: "Tides", visits: 0, guide }, T0);
    const { ctx, p, errs } = o;
    try {
      let n = await note(p);
      ok(!n || !/dir-back/.test(n.cls), `${tag}: the first visit: nothing surfaced`, JSON.stringify(n));
      const v1 = await revisit(o, width, T0 + 2 * DAY);
      n = await note(v1.p);
      ok(!n || !/dir-back/.test(n.cls), `${tag}: two days later: nothing has been left alone long enough`, JSON.stringify(n));
      /* ten days on, she was back once in between and learned in Nature: the others waited */
      await v1.p.evaluate((at) => { const C = window.IkoCloud, c = C.deserialize(localStorage.getItem("ikolearn.v1.cloud")); const t = c.order.find((x) => c.nodes[x].label === "Whales"); c.nodes[t].touched = at; c.nodes[t].opened = true; c.nodes[t].ghost = false; localStorage.setItem("ikolearn.v1.cloud", C.serialize(c)); }, T0 + 9 * DAY);
      await v1.p.close();
      const v2 = await revisit(o, width, T0 + 10 * DAY);
      n = await note(v2.p);
      ok(n && /dir-back/.test(n.cls) && n.chips.length === 2 && n.chips.every((x) => ["Art", "Music", "Cooking"].includes(x)) && !n.chips.includes("Nature") && /Waiting for you/.test(n.text) && /or something new/.test(n.text), `${tag}: ten days later: two branches left alone, beside "or something new" (not the one in use)`, JSON.stringify(n));
      ok(n && n.inView && n.noScroll && n.ikoClear && n.xWithLast, `${tag}: the return row fits, clear of Iko; its close stays beside "or something new"`, JSON.stringify(n));
      ok(v2.calls.filter((c) => c !== "/examples").length === 0, `${tag}: the return row makes no calls`, v2.calls.join());
      await shot(v2.p, tag, "return");
      /* a chip opens that subject's card (beside its node) */
      await v2.p.click(".cf-note .dir-chip >> nth=0"); await v2.p.waitForTimeout(700);
      ok((await v2.p.textContent("#p-title")) === n.chips[0] && await v2.p.isVisible("#panel"), `${tag}: a waiting branch opens its card`, await v2.p.textContent("#p-title"));
      await v2.p.click("#p-close"); await v2.p.waitForTimeout(300);
      /* "or something new" opens the same small field */
      await v2.p.click(".cf-note .dir-new"); await v2.p.waitForTimeout(250);
      ok(await v2.p.isVisible(".dir-form .dir-in"), `${tag}: "or something new" opens the field`);
      await v2.p.keyboard.press("Escape"); await v2.p.waitForTimeout(200);
      await v2.p.click('.cf-note .cf-x[aria-label="Not now"]'); await v2.p.waitForTimeout(300);
      ok(!(await v2.p.$(".cf-note.dir-back")), `${tag}: Not now hides the return row`);
      await v2.p.close();
      const v3 = await revisit(o, width, T0 + 12 * DAY);
      ok(!(await v3.p.$(".cf-note.dir-back")), `${tag}: it rests for a while after a dismissal (2 days later)`);
      await v3.p.close();
      const v4 = await revisit(o, width, T0 + 18 * DAY);
      ok(Boolean(await v4.p.$(".cf-note.dir-back")), `${tag}: and comes back a week later`);
      ok(!errs.length && !v1.errs.length && !v2.errs.length && !v3.errs.length && !v4.errs.length, `${tag}: no console errors (return)`, errs.concat(v2.errs, v4.errs).join(" | "));
    } catch (e) { fails.push(`${tag}: return threw -> ${String(e.message || e).split("\n")[0]}`); }
    await ctx.close();
  }
  /* 4. insights: none with little activity; one soft note after real activity across branches */
  {
    const SUBS = [["Nature", "Ocean Life", ["Coral Reefs", "Whales", "Tides"]], ["Art", "Drawing", ["Shapes", "Shading", "Lines"]], ["Music", "Rhythm", ["Beats", "Tempo", "Drums"]]];
    const little = { Tides: { ago: 1, done: 1, right: 3 }, Shapes: { ago: 1 }, Beats: { ago: 1 } };
    let o = await boot(width, { subs: SUBS, act: little, active: "Tides", visits: 4, guide });
    try {
      const n = await note(o.p);
      ok(!n, `${tag}: insights: none after a little activity (1 lesson, 3 right answers)`, JSON.stringify(n));
    } catch (e) { fails.push(`${tag}: little threw -> ${String(e.message || e).split("\n")[0]}`); }
    await o.ctx.close();
    const real = { Tides: { ago: 3, done: 1, right: 3 }, "Coral Reefs": { ago: 2, done: 1, right: 3 }, Whales: { ago: 2, done: 1, right: 3 }, Shapes: { ago: 1, done: 1, right: 2 }, Beats: { ago: 1 } };
    o = await boot(width, { subs: SUBS, act: real, active: "Tides", visits: 4, guide });
    try {
      const n = await note(o.p);
      ok(n && /dir-insight/.test(n.cls) && /^(You've been exploring (Nature and Art|Art and Nature) side by side this week\.|Nature has been growing: 3 topics finished in the last two weeks\.|You've built a steady base in Nature: 9 right answers so far\.)$/.test(n.text) && n.x.join() === "Hide this note", `${tag}: insights: after real activity across branches, one soft note from the saved progress`, JSON.stringify(n));
      ok(n && !/career|job|should|must|you are a|talent|future/i.test(n.text) && n.inView && n.noScroll && n.ikoClear && n.xWithLast, `${tag}: insights: soft wording, in view, clear of Iko; the close sits at the end of the sentence`, JSON.stringify(n));
      ok(o.calls.filter((c) => c !== "/examples").length === 0, `${tag}: insights: 0 calls`, o.calls.join());
      await shot(o.p, tag, "insight");
      await o.p.click('.cf-note .cf-x[aria-label="Hide this note"]'); await o.p.waitForTimeout(300);
      const after = await note(o.p);
      ok(!after || after.text !== n.text, `${tag}: insights: a closed note is gone`, JSON.stringify(after));
      const v = await revisit(o, width);
      const again = await note(v.p);
      ok((!again || again.text !== n.text) && (await cloudNow(v.p)).dir.hide.length === 1, `${tag}: insights: and stays gone on the next visit`, JSON.stringify(again));
      ok(!o.errs.length && !v.errs.length, `${tag}: no console errors (insights)`, o.errs.concat(v.errs).join(" | "));
    } catch (e) { fails.push(`${tag}: insight threw -> ${String(e.message || e).split("\n")[0]}`); }
    await o.ctx.close();
  }
}
await browser.close(); server.close();
if (fails.length) {
  console.error(`ikolearn dirs e2e: ${pass} passed, ${fails.length} FAILED`);
  for (const f of fails) console.error("  x " + f);
  process.exit(1);
}
console.log(`ikolearn dirs e2e: ${pass} passed`);
