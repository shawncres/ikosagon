// End-to-end checks for Also in progress with a big cloud, in a real browser, every /api/ikolearn call mocked (no model
// calls). A seeded 40-subject cloud at 390 and 1280 (guide mode): the 3 most recent by default, a quiet "more · N"
// button (aria-expanded) that opens the whole list inline in its own scrolling area and folds it again ("fewer"),
// selecting and opening in the long list, most recent activity first, nothing from the lesson's own line, Where Next
// unchanged, no link with 3 or fewer, 0 calls; after I've got it, after Continue, from a card, with Iko's sheet at 1280.
// Run: IKOLEARN_PW=<path to node_modules/playwright-core> node scripts/ikolearn-aip-e2e.mjs [--shots DIR] [--tag after] [--root public]
import { passCheck } from "./fixtures/ikolearn-pass-check.mjs";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const SHOTS = arg("--shots", ""), TAG = arg("--tag", "after"), ROOT = path.resolve(arg("--root", "public"));
if (!process.env.IKOLEARN_PW) { console.log("ikolearn aip e2e: skipped (set IKOLEARN_PW to a playwright-core folder)"); process.exit(0); }
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
const REPLY = () => ({ say: "Happy to help with that.", topics: [] });
const shot = async (p, w, name) => { if (SHOTS) { await p.waitForTimeout(300); await p.screenshot({ path: path.join(SHOTS, `aip-${TAG}-${w}-${name}.png`) }); } };
/* 40 subjects, each with a 3-step path; many=true: one started topic in each (40 in progress, distinct times), else two */
const SEED = ({ guide, many, hello, stuck }) => {
  const C = window.IkoCloud, T = Date.now() - 5 * 864e5, c = C.create("Maya", T);
  const NAMES = ["Volcanoes", "Botany", "Jazz", "Pottery", "Chess", "Origami", "Geology", "Sailing", "Poetry", "Robotics", "Cooking", "Italian",
    "Knitting", "Economics", "Archery", "Birdwatching", "Calligraphy", "Dance", "Ecology", "Fencing", "Gardening", "Hiking", "Illustration", "Juggling",
    "Kayaking", "Linguistics", "Magic Tricks", "Nutrition", "Oceanography", "Photography", "Quilting", "Rowing", "Sculpture", "Theatre", "Urban Design",
    "Violin", "Weaving", "Xylophone", "Yoga", "Zoology"];
  const kids = (n) => n.map((x, i) => ({ name: x, order: i + 1, score: 0.9 - i * 0.1, why: "", role: "core", blurb: x + " explained in plain words, step by step, for anyone." }));
  C.applyCreate(c, { items: NAMES.map((nm) => ({ node: { name: nm + " Basics", chain: [nm] }, card: { title: nm, blurb: nm + " in plain words.", goal: "" }, children: kids([nm + " One", nm + " Two", nm + " Three"]) })) }, { t: T });
  const id = (l) => c.order.find((x) => c.nodes[x].label === l);
  const touch = (l, at) => { const n = c.nodes[id(l)]; n.ghost = false; n.opened = true; n.engaged = 2; n.touched = at; n.mastery = Math.max(n.mastery, 0.2); };
  (many ? NAMES : NAMES.slice(0, 3)).forEach((nm, i) => touch(nm + " Two", T + 1000 + i * 60000)); /* the later in NAMES, the more recent */
  touch("Volcanoes One", T + 1e8); /* the topic the learner is on now */
  C.joinDeck(c, T + 4000);
  c.active = id("Volcanoes One");
  c.order.forEach((x) => { if (!c.nodes[x].blurb) c.nodes[x].blurb = c.nodes[x].label + " in plain words, a little at a time, for anyone."; });
  c.profile.onboarded = T; c.profile.visits = stuck ? 6 : hello ? 0 : 3; c.profile.lessonVisit = 0; c.profile.askedAt = 0;
  localStorage.setItem("ikolearn.v1.name", "Maya"); localStorage.setItem("ikolearn.v1.cloud", C.serialize(c));
  if (guide) window.IkoProfiles.begin(localStorage, "guide", "Maya");
  localStorage.setItem("ikolearn.v1.seen", JSON.stringify({ c: {}, ev: 0, h: hello ? { cloud: 1, card: 1, chat: 1, draw: 1 } : { cloud: 1, card: 1, chat: 1, draw: 1, iko: 1, grow: 1 } }));
  localStorage.setItem("ikolearn.v1.thread", JSON.stringify([{ id: "m1", at: T, role: "model", local: true, text: "Welcome back, Maya." }]));
};
async function open(width, o = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 860 }, timezoneId: "America/Toronto", reducedMotion: o.reduce ? "reduce" : "no-preference" });
  const p = await ctx.newPage();
  p.setDefaultTimeout(6000);
  const errs = [], calls = [], bodies = [];
  p.on("pageerror", (e) => errs.push("pageerror " + e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await p.addInitScript(HOOK);
  const ex = ["Rain"];
  await p.route("**/api/ikolearn/**", async (r) => {
    const at = new URL(r.request().url()).pathname.replace("/api/ikolearn", "");
    let b = {}; try { b = JSON.parse(r.request().postData() || "{}"); } catch { b = {}; }
    calls.push(at + (at === "/chat" ? ":" + b.mode : "")); bodies.push({ at, b });
    if (at === "/examples") return ex ? r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, examples: ex, growth: ["Patience", "Listening", "Courage", "Focus"] }) }) : r.fulfill({ status: 503, contentType: "application/json", body: '{"ok":false,"reason":"off"}' });
    if (at === "/lesson") return r.fulfill({ status: 200, contentType: "application/x-ndjson", body: LESSON });
    if (at === "/chat") { const t = ((b.messages || []).filter((m) => m.role === "user").pop() || {}).text || ""; const rp = REPLY(t, b); return r.fulfill({ status: 200, contentType: "application/x-ndjson", body: nd([{ t: "start", model: "m" }, { t: "delta", text: rp.say }, { t: "cloud", topics: rp.topics, ghosts: [] }, { t: "done" }]) }); }
    if (at === "/create") { await new Promise((ok) => setTimeout(ok, 400)); const items = /grow in myself/.test(b.about || "") ? GROW_ITEMS : ITEMS; return r.fulfill({ status: 200, contentType: "application/x-ndjson", body: nd([...items.map((item) => ({ t: "item", item })), { t: "done", items }]) }); }
    return r.fulfill({ status: 503, contentType: "application/json", body: '{"ok":false,"reason":"off"}' });
  });
  return { ctx, p, errs, calls, bodies };
}
const xyOf = (p, label) => p.evaluate((l) => { const v = window.__views.filter((x) => x.id === "cloud-canvas").pop().view, C = window.IkoCloud, c = C.deserialize(localStorage.getItem("ikolearn.v1.cloud")), id = c.order.find((x) => c.nodes[x].label === l), q = v.project(id), r = document.querySelector("#cloud-canvas").getBoundingClientRect(); return { x: r.left + q.x, y: r.top + q.y }; }, label);
async function tap(p, label) {
  if (!(await p.isHidden("#panel"))) { await p.click("#p-close"); await p.waitForTimeout(250); }
  await p.click("#zreset"); await p.waitForTimeout(1400); /* Recentre: the whole cloud in view */
  const pt = await xyOf(p, label);
  let got = "";
  for (const [dx, dy] of [[0, 0], [0, -8], [0, 8], [-10, 0], [10, 0]]) { /* a neighbour's label can overlap the node's centre */
    await p.mouse.click(pt.x + dx, pt.y + dy); await p.waitForTimeout(900);
    got = await p.textContent("#p-title");
    if (got === label) return true;
    if (!(await p.isHidden("#panel"))) { await p.click("#p-close"); await p.waitForTimeout(250); }
  }
  if (process.env.TOPICS_DEBUG) console.log("TAP", label, JSON.stringify(pt), "got", got);
  return false;
}
const sheet = (p) => p.evaluate(() => ({ open: !document.querySelector("#iko-sheet").hidden, about: document.querySelector("#iko-about").textContent, log: document.querySelector("#iko-log").innerText, opts: [...document.querySelectorAll("#iko-log .place-opts button")].map((b) => b.textContent), panel: document.querySelector("#panel").hidden ? "" : document.querySelector("#p-title").textContent }));
async function boot(width, guide, many = true, extra = {}) {
  const o = await open(width);
  await o.p.goto(BASE + "/ikolearn"); await o.p.evaluate(SEED, { guide, many, ...extra }); await o.p.goto(BASE + "/ikolearn", { waitUntil: "networkidle" }); await o.p.waitForTimeout(700);
  return o;
}
/* Where Next as shown: this subject's next steps only, Also in progress for the rest, equal boxes, the action in the selected box */
const whereNext = (p) => p.evaluate(() => {
  const C = window.IkoCloud, c = C.deserialize(localStorage.getItem("ikolearn.v1.cloud")), title = document.querySelector("#l-title").textContent;
  const lid = c.order.find((x) => c.nodes[x].label === title), subj = (x) => C.ancestry(c, x)[0];
  const groups = [...document.querySelectorAll("#l-next .wn-opts")], main = groups.find((g) => !g.classList.contains("wn-alt")), alt = groups.find((g) => g.classList.contains("wn-alt"));
  const ids = (g) => (g ? [...g.querySelectorAll(".wn-opt")].map((b) => b.getAttribute("data-id")) : []);
  const boxes = [...document.querySelectorAll("#l-next .wn-opt")].map((b) => b.getBoundingClientRect()).map((r) => [Math.round(r.width), Math.round(r.height)]);
  const on = [...document.querySelectorAll("#l-next .wn-opt.on")], act = on[0] && on[0].querySelector(".wn-act"), ar = act && act.getBoundingClientRect(), br = on[0] && on[0].getBoundingClientRect();
  const hiddenActs = [...document.querySelectorAll("#l-next .wn-opt:not(.on) .wn-act")].every((a) => getComputedStyle(a).visibility === "hidden" && a.tabIndex === -1);
  const heads = [...document.querySelectorAll("#l-next .l-head, #l-next .wn-sub")].map((h) => h.textContent);
  return { title, main: ids(main).map((x) => c.nodes[x] && c.nodes[x].label), alt: ids(alt).map((x) => c.nodes[x] && c.nodes[x].label), offPath: ids(main).filter((x) => subj(x) !== subj(lid)).map((x) => c.nodes[x].label),
    altOnPath: ids(alt).filter((x) => C.ancestry(c, x).indexOf(lid) >= 0).map((x) => c.nodes[x].label),
    sizes: boxes, same: boxes.every((s) => Math.abs(s[0] - boxes[0][0]) <= 1 && Math.abs(s[1] - boxes[0][1]) <= 1), one: on.length === 1,
    actIn: Boolean(act && getComputedStyle(act).visibility === "visible" && ar.left >= br.left && ar.right <= br.right && ar.top >= br.top && ar.bottom <= br.bottom), actText: act ? act.textContent : "", hiddenActs, heads };
});
const wnOk = (w) => w.main.length > 0 && !w.offPath.length && !w.altOnPath.length && w.same && w.one && w.actIn && /^(Continue|Open)$/.test(w.actText) && w.hiddenActs && w.heads[0] === "Where next" && (!w.alt.length || w.heads.includes("Also in progress"));

/* Also in progress as shown */
const aip = (p) => p.evaluate(() => {
  const C = window.IkoCloud, c = C.deserialize(localStorage.getItem("ikolearn.v1.cloud")), title = document.querySelector("#l-title").textContent;
  const lid = c.order.find((x) => c.nodes[x].label === title);
  const alt = document.querySelector("#l-next .wn-alt"), main = document.querySelector("#l-next .wn-opts:not(.wn-alt)"), link = document.querySelector("#l-next .wn-more");
  const ids = alt ? [...alt.querySelectorAll(".wn-opt")].map((b) => b.getAttribute("data-id")) : [];
  const all = [...document.querySelectorAll("#l-next .wn-opt")].map((b) => b.getBoundingClientRect()).map((r) => [Math.round(r.width), Math.round(r.height)]);
  const head = document.querySelector("#l-next .l-head"), hr = head && head.getBoundingClientRect();
  const on = alt && alt.querySelector(".wn-opt.on"), act = on && on.querySelector(".wn-act"), ar = act && act.getBoundingClientRect(), br = on && on.getBoundingClientRect();
  return { title, lid, labels: ids.map((x) => c.nodes[x].label), times: ids.map((x) => c.nodes[x].touched || 0),
    onLine: ids.filter((x) => C.ancestry(c, x).indexOf(lid) >= 0 || C.ancestry(c, lid).indexOf(x) >= 0 || (c.nodes[lid].parent && (c.nodes[c.nodes[lid].parent].path || { ids: [] }).ids.indexOf(x) >= 0)).length,
    main: main ? [...main.querySelectorAll(".wn-opt")].map((b) => c.nodes[b.getAttribute("data-id")].label) : [],
    link: link ? { text: link.textContent, exp: link.getAttribute("aria-expanded"), ctl: link.getAttribute("aria-controls"), tag: link.tagName } : null,
    all: alt ? alt.classList.contains("wn-all") : false, scroll: alt ? { sh: alt.scrollHeight, ch: alt.clientHeight, top: alt.scrollTop } : null,
    sizes: all.slice(0, 5), same: all.every((s) => Math.abs(s[0] - all[0][0]) <= 1 && Math.abs(s[1] - all[0][1]) <= 1),
    headInView: Boolean(hr && hr.top >= 0 && hr.bottom <= innerHeight), altOn: on ? c.nodes[on.getAttribute("data-id")].label : null,
    actIn: Boolean(act && getComputedStyle(act).visibility === "visible" && ar.left >= br.left && ar.right <= br.right && ar.top >= br.top && ar.bottom <= br.bottom), actText: act ? act.textContent : "" };
});
const sorted = (t) => t.every((x, i) => i === 0 || t[i - 1] >= x);
const toLesson = async (p) => { await p.evaluate(() => document.querySelector("#l-next").scrollIntoView({ block: "start" })); await p.waitForTimeout(200); };
/* the whole Also in progress check at one entry point */
async function check(p, tag, where, calls, o = {}) {
  let a = await aip(p);
  const c0 = calls.length, before = a.main.join("|");
  ok(a.labels.length === 3 && !a.all, `${tag} ${where}: Also in progress shows the 3 most recent by default`, JSON.stringify(a.labels));
  ok(sorted(a.times) && a.onLine === 0, `${tag} ${where}: most recent activity first, nothing from this lesson's own line`, JSON.stringify(a.labels));
  ok(a.link && a.link.tag === "BUTTON" && a.link.text === "more · " + (o.total - 3) && a.link.exp === "false" && a.link.ctl === "wn-alt", `${tag} ${where}: a quiet "more · ${o.total - 3}" button (aria-expanded false)`, JSON.stringify(a.link));
  if (o.shot) { await toLesson(p); await shot(p, tag, "collapsed"); }
  /* expand with the keyboard */
  await p.focus("#l-next .wn-more"); await p.keyboard.press("Enter"); await p.waitForTimeout(300);
  a = await aip(p);
  ok(a.all && a.labels.length === o.total && sorted(a.times) && a.onLine === 0, `${tag} ${where}: Enter on "more" shows all ${o.total} inline, in the same order`, `${a.labels.length}`);
  ok(a.link.text === "fewer" && a.link.exp === "true" && (await p.evaluate(() => document.activeElement && document.activeElement.classList.contains("wn-more"))), `${tag} ${where}: the link turns into "fewer" (aria-expanded true) and keeps the focus`, JSON.stringify(a.link));
  ok(a.scroll.sh > a.scroll.ch + 20 && a.scroll.ch <= 380, `${tag} ${where}: the long list scrolls in its own area (${a.scroll.ch}px of ${a.scroll.sh}px)`, JSON.stringify(a.scroll));
  ok(a.same && a.main.join("|") === before, `${tag} ${where}: equal boxes; Where Next unchanged`, JSON.stringify(a.main) + JSON.stringify(a.sizes));
  await toLesson(p);
  ok((await aip(p)).headInView, `${tag} ${where}: Where Next stays on screen with the list open`);
  if (o.shot) await shot(p, tag, "expanded");
  /* select one far down the list: the action moves into it, the list keeps its place */
  const far = a.labels[o.total - 4];
  await p.evaluate((l) => { const b = [...document.querySelectorAll("#l-next .wn-alt .wn-opt")].find((x) => x.querySelector(".wn-label").textContent === l); b.scrollIntoView({ block: "nearest" }); }, far);
  const top0 = (await aip(p)).scroll.top;
  await p.locator("#l-next .wn-alt .wn-opt", { hasText: far }).locator(".wn-pick").click(); await p.waitForTimeout(300);
  a = await aip(p);
  ok(a.altOn === far && a.actIn && a.actText === "Open" && a.all, `${tag} ${where}: selecting ${far} in the open list puts "Open" inside its box`, JSON.stringify({ on: a.altOn, act: a.actText }));
  ok(top0 > 0 && Math.abs(a.scroll.top - top0) <= 2, `${tag} ${where}: the list keeps its scroll place after a pick`, `${top0} -> ${a.scroll.top}`);
  ok(calls.length === c0, `${tag} ${where}: more, fewer and picking make no call`, calls.slice(c0).join());
  if (o.act) {
    await p.locator("#l-next .wn-alt .wn-opt.on .wn-act").click(); await p.waitForSelector("#l-done:not([hidden])"); await p.waitForTimeout(400);
    ok((await p.textContent("#l-title")) === far, `${tag} ${where}: its Open starts that lesson`);
    a = await aip(p);
    ok(!a.all && a.labels.length === 3, `${tag} ${where}: the next lesson starts folded again (3)`, String(a.labels.length));
  } else {
    await p.click("#l-next .wn-more"); await p.waitForTimeout(300);
    a = await aip(p);
    ok(!a.all && a.labels.length === 3 && a.link.text === "more · " + (o.total - 3) && a.link.exp === "false", `${tag} ${where}: "fewer" folds it back to 3`, JSON.stringify(a.link));
  }
}

for (const width of [390, 1280]) {
  const tag = String(width), guide = width === 1280;
  {
    const { ctx, p, errs, calls } = await boot(width, guide);
    try {
      /* after I've got it */
      await p.locator(".cloud-flow > .chip").first().click(); await p.waitForSelector("#l-done:not([hidden])");
      await passCheck(p); /* PR 103: the check passed first */
      await p.click("#l-got"); await p.waitForTimeout(400);
      /* --tag before (main): the old list as it was, for the before shots */
      if (TAG === "before") { await toLesson(p); await shot(p, tag, "collapsed"); if (SHOTS) await p.screenshot({ path: path.join(SHOTS, `aip-before-${tag}-full.png`), fullPage: true }); }
      const total = (await p.evaluate(() => { const C = window.IkoCloud, c = C.deserialize(localStorage.getItem("ikolearn.v1.cloud")), lid = c.order.find((x) => c.nodes[x].label === document.querySelector("#l-title").textContent); return window.IkoPlan.whereNext(c, lid, null).allOthers.length; }));
      ok(total >= 38, `${tag}: fixture: ${total} topics in progress elsewhere`);
      const w0 = await whereNext(p);
      ok(wnOk(w0), `${tag}: Where Next unchanged (this subject only, equal boxes, action in the selected box)`, JSON.stringify(w0));
      await check(p, tag, "after I've got it", calls, { total, shot: true });
      if (width >= 1100) {
        await p.click("#iko"); await p.waitForTimeout(300);
        const cover = await p.evaluate(() => { const s = document.querySelector("#iko-sheet").getBoundingClientRect(); return [...document.querySelectorAll("#l-next .wn-opt, #l-next .wn-more")].filter((e) => { const r = e.getBoundingClientRect(); return r.left < s.right && r.right > s.left && r.top < s.bottom && r.bottom > s.top; }).length; });
        ok(cover === 0, `${tag}: with Iko open, the sheet sits clear of Also in progress and its link`, String(cover));
        await p.click("#l-next .wn-more"); await p.waitForTimeout(300);
        ok((await aip(p)).all, `${tag}: "more" works with Iko's sheet open`);
        await shot(p, tag, "expanded-iko");
        await p.click("#l-next .wn-more"); await p.waitForTimeout(300);
        await p.keyboard.press("Escape"); await p.waitForTimeout(200);
      }
      /* after Continue */
      const t0 = await p.textContent("#l-title");
      await p.click("#l-next .wn-opts:not(.wn-alt) .wn-opt.on .wn-act"); await p.waitForSelector("#l-done:not([hidden])"); await p.waitForTimeout(400); await passCheck(p); /* PR 103: Where next opens once the check is passed */
      ok((await p.textContent("#l-title")) !== t0, `${tag}: Continue opened the next step`);
      const tot2 = (await p.evaluate(() => { const C = window.IkoCloud, c = C.deserialize(localStorage.getItem("ikolearn.v1.cloud")), lid = c.order.find((x) => c.nodes[x].label === document.querySelector("#l-title").textContent); return window.IkoPlan.whereNext(c, lid, null).allOthers.length; }));
      await check(p, tag, "after Continue", calls, { total: tot2, act: true });
      /* from a card on the cloud */
      await p.click("#l-back"); await p.waitForTimeout(900);
      ok(await tap(p, "Kayaking"), `${tag}: Kayaking's card on the cloud`);
      await p.click("#p-lesson"); await p.waitForSelector("#l-done:not([hidden])"); await p.waitForTimeout(400); await passCheck(p);
      const tot3 = (await p.evaluate(() => { const C = window.IkoCloud, c = C.deserialize(localStorage.getItem("ikolearn.v1.cloud")), lid = c.order.find((x) => c.nodes[x].label === document.querySelector("#l-title").textContent); return window.IkoPlan.whereNext(c, lid, null).allOthers.length; }));
      await check(p, tag, "from a card (Kayaking)", calls, { total: tot3 });
      ok(!errs.length, `${tag}: no console errors`, errs.join(" | "));
    } catch (e) { fails.push(`${tag}: threw -> ${String(e.message || e).split("\n")[0]}`); }
    await ctx.close();
  }
  /* few in progress: no link */
  {
    const { ctx, p, errs } = await boot(width, guide, false);
    try {
      await p.locator(".cloud-flow > .chip").first().click(); await p.waitForSelector("#l-done:not([hidden])");
      await passCheck(p); /* PR 103: the check passed first */
      await p.click("#l-got"); await p.waitForTimeout(400);
      const a = await aip(p);
      ok(a.labels.length >= 1 && a.labels.length <= 3 && !a.link, `${tag}: with 3 or fewer in progress there is no "more" link`, JSON.stringify(a));
      ok(!errs.length, `${tag}: no console errors (few)`, errs.join(" | "));
    } catch (e) { fails.push(`${tag}: few threw -> ${String(e.message || e).split("\n")[0]}`); }
    await ctx.close();
  }
  /* audit (#93 on a 40-subject cloud): the Iko pebble, its hello, its context, Still tricky; the light re-ask builds new roots */
  {
    const { ctx, p, errs, calls } = await boot(width, guide, true, { hello: true });
    try {
      await p.waitForTimeout(600);
      const k = await p.evaluate(() => { const b = document.querySelector("#iko"), r = b.getBoundingClientRect(), l = document.querySelector("#iko-line"); return { shown: !b.hidden && r.width >= 44, label: b.getAttribute("aria-label"), svg: Boolean(b.querySelector("svg.iko-pebble")), line: l.hidden ? "" : l.textContent }; });
      ok(k.shown && k.label === "Talk to Iko" && k.svg && /^Hi Maya, I'm Iko\./.test(k.line), `${tag} audit: on a 40-subject cloud, the Iko pebble (SVG) and its hello on an early visit`, JSON.stringify(k));
      ok(await tap(p, "Zoology"), `${tag} audit: Zoology's card (outer shell)`);
      await p.click("#p-chat"); await p.waitForTimeout(300);
      ok((await sheet(p)).about === "On your cloud · Zoology", `${tag} audit: Iko opens with the card's context`, (await sheet(p)).about);
      await p.keyboard.press("Escape"); await p.waitForTimeout(300);
      if (!(await p.isHidden("#panel"))) await p.click("#p-lesson"); else { await tap(p, "Zoology"); await p.click("#p-lesson"); }
      await p.waitForSelector("#l-done:not([hidden])"); await p.waitForTimeout(400);
      const lt = await p.textContent("#l-title"), c0 = calls.length;
      await p.click("#l-tricky"); await p.waitForTimeout(400);
      const tr = await p.evaluate(() => ({ sheet: !document.querySelector("#iko-sheet").hidden, inSheet: Boolean(document.querySelector("#iko-slot #l-clar")), about: document.querySelector("#iko-about").textContent, text: (document.querySelector("#iko-slot #l-clar") || {}).innerText || "" }));
      ok(tr.sheet && tr.inSheet && tr.about === "On " + lt + " · lesson" && /thick warm quilt/.test(tr.text) && calls.length === c0, `${tag} audit: Still tricky opens Iko with the prepared clarification and the lesson's context (0 calls)`, JSON.stringify({ ...tr, text: tr.text.slice(0, 40) }));
      ok(!errs.length, `${tag} audit: no console errors (Iko)`, errs.join(" | "));
    } catch (e) { fails.push(`${tag}: audit Iko threw -> ${String(e.message || e).split("\n")[0]}`); }
    await ctx.close();
  }
  {
    const { ctx, p, errs, calls, bodies } = await boot(width, guide, true, { stuck: true });
    try {
      await p.click("#iko"); await p.waitForTimeout(400); await p.click("#iko-all"); await p.waitForTimeout(600);
      const q = await p.evaluate(() => { const t = document.querySelector("#draw .ask-tile"); return t ? t.querySelector(".ask-q").textContent : ""; });
      ok(/What do you enjoy these days\?/.test(q), `${tag} audit: the light re-ask (one open question) still shows for a big cloud`, q);
      const n0 = (await p.evaluate(() => window.IkoCloud.subjects(window.IkoCloud.deserialize(localStorage.getItem("ikolearn.v1.cloud"))).length)), c0 = calls.length;
      await p.fill("#draw .ask-tile input, #draw .ask-tile textarea", "the sea and drawing"); await p.click("#draw .ask-tile .draw-btn");
      await p.waitForFunction((n) => window.IkoCloud.subjects(window.IkoCloud.deserialize(localStorage.getItem("ikolearn.v1.cloud"))).length > n, n0, { timeout: 8000 });
      await p.waitForTimeout(1500);
      const cr = bodies.filter((x) => x.at === "/create").pop().b;
      const cl = await p.evaluate(() => { const C = window.IkoCloud, c = C.deserialize(localStorage.getItem("ikolearn.v1.cloud")); return { subjects: C.subjects(c).map((x) => x.label), ocean: (() => { const o = c.order.map((x) => c.nodes[x]).find((n) => n.label === "Ocean Life"); return o ? C.ancestry(c, o.id).map((x) => c.nodes[x].label) : null; })() }; });
      ok(calls.slice(c0).join() === "/create" && cr.kind === "more" && Array.isArray(cr.parents) && cr.parents.length <= 12, `${tag} audit: answering it is one creation call with a bounded subject list (${cr.parents.length})`, calls.slice(c0).join());
      ok(cl.subjects.length >= n0 + 2 && cl.subjects.includes("Nature") && cl.ocean && cl.ocean[0] === "Nature", `${tag} audit: its new subjects are roots of their own (subjects ${n0} -> ${cl.subjects.length})`, JSON.stringify(cl.ocean));
      ok(!errs.length, `${tag} audit: no console errors (re-ask)`, errs.join(" | "));
    } catch (e) { fails.push(`${tag}: audit re-ask threw -> ${String(e.message || e).split("\n")[0]}`); }
    await ctx.close();
  }
}
await browser.close(); server.close();
console.log(`ikolearn aip e2e: ${pass} passed${fails.length ? `, ${fails.length} FAILED` : ""}`);
fails.forEach((f) => console.log("  x " + f));
process.exit(fails.length ? 1 : 0);
