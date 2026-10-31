// Regression e2e for lesson progress (no model calls; every /api/ikolearn call mocked): in a lesson with 3 questions,
// each answer and "I've got it" are kept the moment they happen. Leaving the lesson (its card, Iko, the deck, the
// cloud) and coming back, or reloading, shows every answer and the done state; "I've got it" never moves on by itself;
// the family view and Where Next show the progress without tapping Continue. Storage stays v9.
// Run: IKOLEARN_PW=<path to node_modules/playwright-core> node scripts/ikolearn-progress-e2e.mjs [--shots DIR] [--tag after] [--root public]
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const SHOTS = arg("--shots", ""), TAG = arg("--tag", "after"), ROOT = path.resolve(arg("--root", "public"));
if (!process.env.IKOLEARN_PW) { console.log("ikolearn progress e2e: skipped (set IKOLEARN_PW to a playwright-core folder)"); process.exit(0); }
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
const shot = async (p, w, name) => { if (SHOTS) { await p.waitForTimeout(300); await p.screenshot({ path: path.join(SHOTS, `progress-${TAG}-${w}-${name}.png`) }); } };

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


const look = (p) => p.evaluate(() => {
  const q = document.querySelector("#l-quiz"), C = window.IkoCloud, c = C.deserialize(localStorage.getItem("ikolearn.v1.cloud")), id = c.order.find((x) => c.nodes[x].label === "Magma"), L = JSON.parse(localStorage.getItem("ikolearn.v1.lessons") || "{}")[id] || {};
  return { lesson: !document.querySelector("#lesson").hidden, title: document.querySelector("#l-title").textContent, lede: (q.querySelector(".q-lede") || {}).textContent || "", answered: q.querySelectorAll(".q-fb").length, open: [...q.querySelectorAll("fieldset.q")].filter((f) => !f.querySelector(".q-fb")).length,
    checked: [...q.querySelectorAll("fieldset.q")].map((f) => { const i = [...f.querySelectorAll("input")].findIndex((x) => x.checked); return i; }), status: document.querySelector("#l-status").innerText, next: document.querySelector("#l-next").innerText.replace(/\s+/g, " ").trim(),
    stored: L.ans || [], got: Boolean(L.got), done: C.isDone(c, id), correct: c.nodes[id].correct || 0, v: JSON.parse(localStorage.getItem("ikolearn.v1.cloud")).v };
});
const answer = async (p, i) => { await p.locator("#l-quiz fieldset.q").nth(i).locator("label.opt").nth(QS[i].answer).click(); await p.waitForTimeout(150); };
const toCloud = async (p) => { if (await p.isVisible("#l-back")) { await p.click("#l-back"); await p.waitForTimeout(700); } };
/* the lesson, back from somewhere: the cloud's card for Magma (tap its node) -> "Lesson" */
const viaCloud = async (p) => {
  const pt = await p.evaluate(() => { const C = window.IkoCloud, c = C.deserialize(localStorage.getItem("ikolearn.v1.cloud")), id = c.order.find((x) => c.nodes[x].label === "Magma"); return id; });
  await p.waitForTimeout(900);
  const xy = await p.evaluate((id) => { const v = window.__views.filter((x) => x.id === "cloud-canvas").pop().view, q = v.project(id), r = document.querySelector("#cloud-canvas").getBoundingClientRect(); return { x: r.left + q.x, y: r.top + q.y }; }, pt);
  await p.mouse.click(xy.x, xy.y); await p.waitForTimeout(900);
  const t = await p.textContent("#p-title").catch(() => "");
  if (t !== "Magma") return false;
  await p.click("#p-lesson"); await p.waitForTimeout(700); return true;
};
/* the lesson, back from the deck: Magma's card in the album -> its card page -> "Review the lesson" */
const viaDeck = async (p) => {
  await p.waitForSelector("#d-album .gcard");
  await p.locator("#d-album .gcard", { hasText: "Magma" }).first().click(); await p.waitForTimeout(700);
  await p.click("#hub-lesson"); await p.waitForTimeout(700);
};
const full = (k) => k.lesson && k.title === "Magma" && k.answered === 3 && k.open === 0 && /^All done/.test(k.lede) && JSON.stringify(k.checked) === "[0,1,2]" && /marked this one as done/.test(k.status) && JSON.stringify(k.stored) === "[0,1,2]" && k.got && k.done && k.correct === 3 && k.v === 9;

for (const width of [390, 1280]) {
  const tag = String(width);
  const { ctx, p, errs, calls } = await open(width);
  try {
    await p.goto(BASE + "/ikolearn"); await p.evaluate(SEED); await p.goto(BASE + "/ikolearn", { waitUntil: "networkidle" }); await p.waitForTimeout(600);
    await p.locator(".cloud-flow > .chip").first().click(); await p.waitForSelector("#l-cont:not([hidden])"); await p.waitForSelector("#l-done:not([hidden])");
    /* PR 103: read first; Continue opens the check in its own pane */
    ok(await p.isHidden("#l-quiz") && await p.isHidden("#l-got"), `${tag}: the reading comes first (the check and the card wait for Continue)`);
    await p.click("#l-cont"); await p.waitForSelector("#l-quiz fieldset.q");
    const lessonCalls = calls.filter((c) => c === "/lesson").length;
    ok(lessonCalls === 1 && (await p.locator("#l-quiz fieldset.q").count()) === 3, `${tag}: a lesson with 3 questions (1 lesson call)`);
    /* each answer is kept as it happens: two answered, out to the card and back, both still there and the third open */
    await answer(p, 0); await answer(p, 1);
    const k0 = await look(p);
    ok(JSON.stringify(k0.stored) === "[0,1]" && k0.correct === 0, `${tag}: each answer is saved the moment it is given (credited only once the whole check is passed)`, JSON.stringify(k0));
    await p.locator("#l-card .gcard").first().click(); await p.waitForSelector("#hub:not([hidden])"); await p.waitForTimeout(400);
    await p.click("#hub-lesson"); await p.waitForTimeout(700);
    const k1 = await look(p);
    ok(k1.lesson && k1.answered === 2 && k1.open === 1 && JSON.stringify(k1.checked) === "[0,1,-1]", `${tag}: partway: out to the card and back, the two answers are there and the third is still open`, JSON.stringify(k1));
    await answer(p, 2);
    const kp = await look(p);
    ok(kp.correct === 3 && !(await p.isHidden("#l-got")), `${tag}: the round passed: the three right answers count, and the card can be earned`, JSON.stringify(kp));
    const nextBefore = kp.next;
    await p.click("#l-got"); await p.waitForTimeout(400);
    const k2 = await look(p);
    ok(k2.lesson && k2.title === "Magma" && JSON.stringify(k2.stored) === "[0,1,2]" && k2.got && k2.done && k2.v === 9, `${tag}: "I've got it": saved at once with all 3 answers; no auto-advance (still on Magma); storage v9`, JSON.stringify(k2));
    ok(k2.next && /Eruptions|Lava Types/.test(k2.next), `${tag}: Where Next shows the next step straight away (no Continue needed)`, k2.next + " | before: " + nextBefore);
    await shot(p, width, "1-got");
    const c0 = calls.length;
    /* 1) the lesson's card -> its card page -> back to the lesson */
    await p.locator("#l-card .gcard").first().click(); await p.waitForSelector("#hub:not([hidden])"); await p.waitForTimeout(400);
    const hubState = await p.textContent("#hub-state");
    ok(/Covered/.test(hubState) && !/In progress/.test(hubState), `${tag}: the card page says Covered (not In progress)`, hubState);
    await p.click("#hub-lesson"); await p.waitForTimeout(700);
    const a = await look(p);
    ok(full(a), `${tag}: card -> back to the lesson: all 3 answers and the done state are there`, JSON.stringify(a));
    ok(a.next === k2.next, `${tag}: card -> back: Where Next is the same`, a.next);
    await p.evaluate(() => document.querySelectorAll("#l-quiz fieldset.q")[2].scrollIntoView({ block: "center" })); await p.waitForTimeout(150); await shot(p, width, "2-card-return");
    /* 2) Iko -> the whole conversation -> the cloud -> Magma's card -> the lesson */
    await p.click("#iko"); await p.waitForTimeout(200); await p.click("#iko-all"); await p.waitForTimeout(500);
    ok(await p.isHidden("#lesson"), `${tag}: Iko's whole conversation leaves the lesson`);
    await p.click("#thumb"); await p.waitForTimeout(900);
    const viaC = await viaCloud(p);
    if (!viaC) { if (!(await p.isHidden("#panel"))) await p.click("#p-close"); await p.click("#cloud-deck"); await p.waitForTimeout(400); await viaDeck(p); }
    const b = await look(p);
    ok(full(b), `${tag}: Iko -> back to the lesson (${viaC ? "via the cloud" : "via the deck"}): all 3 answers and the done state`, JSON.stringify(b));
    /* 3) the deck -> Magma's card -> the lesson */
    await toCloud(p);
    if (!(await p.isHidden("#panel"))) { await p.click("#p-close"); await p.waitForTimeout(200); }
    await p.click("#cloud-deck"); await p.waitForTimeout(400); await viaDeck(p);
    const d = await look(p);
    ok(full(d), `${tag}: deck -> back to the lesson: all 3 answers and the done state`, JSON.stringify(d));
    /* 4) a reload: home, then back to the lesson from the cloud */
    await p.reload({ waitUntil: "networkidle" }); await p.waitForTimeout(800);
    const viaR = await viaCloud(p);
    if (!viaR) { if (!(await p.isHidden("#panel"))) await p.click("#p-close"); await p.click("#cloud-deck"); await p.waitForTimeout(400); await viaDeck(p); }
    const r = await look(p);
    ok(full(r), `${tag}: reload -> back to the lesson: all 3 answers and the done state`, JSON.stringify(r));
    ok(calls.length === c0, `${tag}: coming back is 0 calls (the lesson and its answers come from the device)`, calls.slice(c0).join());
    await p.evaluate(() => document.querySelectorAll("#l-quiz fieldset.q")[2].scrollIntoView({ block: "center" })); await p.waitForTimeout(150); await shot(p, width, "3-reload-return");
    /* 5) the family view: Magma counts as done, not in progress, without Continue */
    await p.goto(BASE + "/ikolearn/family", { waitUntil: "networkidle" }); await p.waitForTimeout(400);
    const fam = await p.evaluate(() => ({ progress: (document.querySelector("section[aria-labelledby=fam-progress]") || {}).innerText || "", recent: (document.querySelector("section[aria-labelledby=fam-recent]") || {}).innerText || "", all: document.body.innerText }));
    ok(!/Magma/.test(fam.progress) && /Magma\s+today · covered/.test(fam.recent), `${tag}: the family view shows Magma as done (in recent lessons, not in progress)`, JSON.stringify({ progress: fam.progress.slice(0, 200), recent: fam.recent.slice(0, 300) }));
    await shot(p, width, "4-family");
    ok(!errs.length, `${tag}: no console errors`, errs.join(" | "));
  } catch (e) { fails.push(`${tag}: threw -> ${String(e.message || e).split("\n")[0]}`); }
  await ctx.close();
}
await browser.close(); server.close();
console.log(`ikolearn progress e2e: ${pass} passed${fails.length ? `, ${fails.length} FAILED` : ""}`);
fails.forEach((f) => console.log("  x " + f));
process.exit(fails.length ? 1 : 0);
