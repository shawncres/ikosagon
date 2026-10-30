// End-to-end checks for new topics from Iko and for Where Next, in a real browser, every /api/ikolearn call mocked (no
// model calls). The chat mock answers like the model does with the placement it is given (it trusts the focus it is
// sent). New topics: a broad subject while another branch is in focus becomes a new parent under the learner's name;
// a clear subtopic goes under the focused parent; an unclear one asks first in Iko's sheet (A new subject / Part of X)
// and both answers work; an existing subject is shown, not duplicated; a node from an earlier screen is never the focus;
// one chat call per request and nothing else. Where Next (after I've got it, after Continue, from a card on the cloud,
// in guide mode, with Iko open at 1280): only this subject's next steps, Also in progress for the rest, equal boxes,
// the action inside the selected box.
// Run: IKOLEARN_PW=<path to node_modules/playwright-core> node scripts/ikolearn-topics-e2e.mjs [--shots DIR] [--tag after] [--root public]
import { passCheck } from "./fixtures/ikolearn-pass-check.mjs";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const SHOTS = arg("--shots", ""), TAG = arg("--tag", "after"), ROOT = path.resolve(arg("--root", "public"));
if (!process.env.IKOLEARN_PW) { console.log("ikolearn topics e2e: skipped (set IKOLEARN_PW to a playwright-core folder)"); process.exit(0); }
const { chromium } = await import(pathToFileURL(path.join(process.env.IKOLEARN_PW, "index.mjs")).href);
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
const browser = await chromium.launch({ executablePath: process.env.IKOLEARN_CHROME || "/usr/bin/google-chrome" });
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
/* The model's reply per request. Like the model, it uses the focus it is sent: with a focus id, "rivers" goes under it. */
const BL = (x) => x + " explained in plain words, one small step at a time, for anyone.";
const REPLY = (text, b) => {
  const f = b.focusId || "";
  if (/guitar/i.test(text)) return { say: "The guitar is a lovely thing to learn.", topics: [{ name: "Guitar", parent: "", signal: "curious", chain: [], placement: "parent", target: "", why: "a whole subject of its own", blurb: BL("Guitar") }] };
  if (/geysers/i.test(text)) return { say: "Geysers are hot springs that erupt.", topics: [{ name: "Geysers", parent: "Volcanoes", signal: "curious", chain: ["Earth Science", "Volcanoes"], placement: "child", target: f || "Volcanoes", why: "a part of Volcanoes", blurb: BL("Geysers") }] };
  if (/cake decorating/i.test(text)) return { say: "Cake decorating is fun.", topics: [{ name: "Cake Decorating", parent: "Baking", signal: "curious", chain: ["Baking"], placement: "ambiguous", target: f, why: "could be part of Baking or its own subject", blurb: BL("Cake Decorating") }] };
  if (/pastry/i.test(text)) return { say: "Pastry is a big world.", topics: [{ name: "Pastry", parent: "Baking", signal: "curious", chain: ["Baking"], placement: "ambiguous", target: f, why: "could be either", blurb: BL("Pastry") }] };
  if (/astronomy/i.test(text)) return { say: "You already have Astronomy.", topics: [{ name: "Astronomy", parent: "", signal: "curious", chain: [], placement: "parent", target: "", why: "a subject", blurb: BL("Astronomy") }] };
  if (/rivers/i.test(text)) return { say: "Rivers carve the land.", topics: [{ name: "Rivers", parent: "Earth Science", signal: "curious", chain: ["Earth Science"], placement: "child", target: f || "Earth Science", why: "part of the focus", blurb: BL("Rivers") }] };
  return { say: "Happy to help with that.", topics: [] };
};
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
    if (at === "/chat") { const t = ((b.messages || []).filter((m) => m.role === "user").pop() || {}).text || ""; const rp = REPLY(t, b); return r.fulfill({ status: 200, contentType: "application/x-ndjson", body: nd([{ t: "start", model: "m" }, { t: "delta", text: rp.say }, { t: "cloud", topics: rp.topics, ghosts: [] }, { t: "done" }]) }); }
    if (at === "/create") { await new Promise((ok) => setTimeout(ok, 400)); const items = /grow in myself/.test(b.about || "") ? GROW_ITEMS : ITEMS; return r.fulfill({ status: 200, contentType: "application/x-ndjson", body: nd([...items.map((item) => ({ t: "item", item })), { t: "done", items }]) }); }
    return r.fulfill({ status: 503, contentType: "application/json", body: '{"ok":false,"reason":"off"}' });
  });
  return { ctx, p, errs, calls, bodies };
}
const shot = async (p, w, name) => { if (SHOTS) { await p.waitForTimeout(300); await p.screenshot({ path: path.join(SHOTS, `topics-${TAG}-${w}-${name}.png`) }); } };

const SEED = (guide) => {
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
  c.order.forEach((x) => { if (!c.nodes[x].blurb) c.nodes[x].blurb = c.nodes[x].label + " in plain words, a little at a time, for anyone."; }); /* every card has its line: tapping one makes no call */
  localStorage.setItem("ikolearn.v1.name", "Maya"); localStorage.setItem("ikolearn.v1.cloud", C.serialize(c));
  if (guide) window.IkoProfiles.begin(localStorage, "guide", "Maya"); /* guide mode: Maya is one of the learners */
  localStorage.setItem("ikolearn.v1.seen", JSON.stringify({ c: {}, ev: 0, h: { cloud: 1, card: 1, chat: 1, draw: 1 } }));
  localStorage.setItem("ikolearn.v1.thread", JSON.stringify([{ id: "m1", at: T, role: "model", local: true, text: "Welcome back, Maya." }]));
};



const cloudOf = (p) => p.evaluate(() => { const C = window.IkoCloud, c = C.deserialize(localStorage.getItem("ikolearn.v1.cloud")), o = {}; c.order.forEach((x) => { const n = c.nodes[x], par = n.parent ? c.nodes[n.parent] : null; (o[n.label] = o[n.label] || []).push({ id: x, parent: par ? par.label : null, hue: n.hue, ghost: Boolean(n.ghost), blurb: Boolean(n.blurb) }); }); return { nodes: o, subjects: C.subjects(c).map((s) => s.label) }; });
const one = (cl, l) => (cl.nodes[l] || [])[0] || null;
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
async function ask(p, text) {
  await p.fill("#iko-in", text); await p.press("#iko-in", "Enter");
  await p.waitForFunction(() => !document.querySelector("#iko-log .streaming") && document.querySelectorAll("#iko-log .iko-msg.model").length > 0, null, { timeout: 6000 });
  await p.waitForTimeout(700);
}
const sheet = (p) => p.evaluate(() => ({ open: !document.querySelector("#iko-sheet").hidden, about: document.querySelector("#iko-about").textContent, log: document.querySelector("#iko-log").innerText, opts: [...document.querySelectorAll("#iko-log .place-opts button")].map((b) => b.textContent), panel: document.querySelector("#panel").hidden ? "" : document.querySelector("#p-title").textContent }));
const focusOf = (p) => p.evaluate(() => { const v = window.__views.filter((x) => x.id === "cloud-canvas").pop().view.state(); return v.focus || null; });
async function boot(width, guide) {
  const o = await open(width);
  await o.p.goto(BASE + "/ikolearn"); await o.p.evaluate(SEED, guide); await o.p.goto(BASE + "/ikolearn", { waitUntil: "networkidle" }); await o.p.waitForTimeout(700);
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

for (const width of [390, 1280]) {
  const tag = String(width), guide = width === 1280; /* 1280 runs in guide mode (Maya is one of the learners) */
  /* 1) new topics from Iko's sheet on the cloud */
  {
    const { ctx, p, errs, calls, bodies } = await boot(width, guide);
    try {
      const chats = () => bodies.filter((x) => x.at === "/chat").map((x) => x.b);
      /* a broad subject while an unrelated branch (Constellations) is in focus -> a new parent under Maya */
      ok(await tap(p, "Constellations"), `${tag}: Constellations' card on the cloud`);
      await p.click("#p-chat"); await p.waitForTimeout(250);
      let s = await sheet(p);
      ok(s.open && s.about === "On your cloud · Constellations", `${tag}: Iko opens on Constellations`, JSON.stringify(s));
      const c0 = calls.length, before = await cloudOf(p);
      await ask(p, "I want to learn the guitar");
      const b1 = chats().pop();
      ok(b1.focus === "Constellations" && b1.screen && b1.screen.topic === "Constellations", `${tag}: the request carries the focus on screen (Constellations)`, JSON.stringify({ f: b1.focus, s: b1.screen }));
      let cl = await cloudOf(p), g = one(cl, "Guitar");
      ok(g && g.parent === null && cl.subjects.includes("Guitar") && before.subjects.every((x) => cl.subjects.includes(x)), `${tag}: a broad subject becomes a new parent under Maya (not under Constellations or Astronomy)`, JSON.stringify(g));
      ok(g && Number.isFinite(g.hue) && before.subjects.every((x) => one(cl, x).hue !== g.hue) && g.blurb, `${tag}: Guitar has its own colour and its description came with the reply`, JSON.stringify(g));
      ok(calls.slice(c0).join() === "/chat:chat", `${tag}: one chat call, nothing else`, calls.slice(c0).join());
      s = await sheet(p);
      ok(/Your cloud grew: new subject Guitar/.test(s.log), `${tag}: Iko's sheet says what grew`, s.log.slice(-200));
      ok((await focusOf(p)) === g.id, `${tag}: the camera glides to Guitar`);
      if (width >= 700) ok(s.open && s.panel === "Guitar" && s.about === "On your cloud · Guitar", `${tag}: Guitar's card opens beside the sheet; Iko stays, now on Guitar`, JSON.stringify(s));
      else {
        ok(s.open && s.panel !== "Guitar", `${tag}: on a phone the card waits while the sheet is open`, JSON.stringify(s));
        await p.keyboard.press("Escape"); await p.waitForTimeout(600);
        ok((await sheet(p)).panel === "Guitar", `${tag}: closing the sheet shows Guitar's card`);
      }
      ok(calls.length === c0 + 1, `${tag}: showing the new node made no call`, calls.slice(c0).join());
      await shot(p, width, "new-parent");
      if (!(await p.isHidden("#iko-sheet"))) { await p.keyboard.press("Escape"); await p.waitForTimeout(250); }
      /* a clear subtopic of the focused parent -> under it */
      ok(await tap(p, "Volcanoes"), `${tag}: Volcanoes' card`);
      await p.click("#p-chat"); await p.waitForTimeout(250);
      const c1 = calls.length;
      await ask(p, "add geysers please");
      cl = await cloudOf(p);
      ok(one(cl, "Geysers") && one(cl, "Geysers").parent === "Volcanoes" && calls.slice(c1).join() === "/chat:chat", `${tag}: a clear subtopic goes under the focused parent (Volcanoes); one call`, JSON.stringify(one(cl, "Geysers")));
      if (width < 700) { await p.keyboard.press("Escape"); await p.waitForTimeout(600); }
      ok((await sheet(p)).panel === "Geysers", `${tag}: Geysers' card opens`);
      await shot(p, width, "subtopic");
      if (!(await p.isHidden("#iko-sheet"))) { await p.keyboard.press("Escape"); await p.waitForTimeout(250); }
      /* unclear -> Iko asks first, in the sheet; both answers work, 0 calls */
      ok(await tap(p, "Baking"), `${tag}: Baking's card (a subject)`);
      await p.click("#p-chat"); await p.waitForTimeout(250);
      const c2 = calls.length;
      await ask(p, "what about cake decorating?");
      s = await sheet(p); cl = await cloudOf(p);
      ok(s.opts.join("|") === "A new subject|Part of Baking" && /Where should Cake Decorating go\?/.test(s.log) && !one(cl, "Cake Decorating"), `${tag}: unclear: the choice is in Iko's sheet, nothing is added yet`, JSON.stringify(s.opts) + s.log.slice(-160));
      await shot(p, width, "ambiguous");
      await p.locator("#iko-log").getByRole("button", { name: "Part of Baking" }).click(); await p.waitForTimeout(700);
      cl = await cloudOf(p); s = await sheet(p);
      ok(one(cl, "Cake Decorating") && one(cl, "Cake Decorating").parent === "Baking" && one(cl, "Cake Decorating").blurb && /Cake Decorating is now under Baking\./.test(s.log) && !s.opts.length, `${tag}: "Part of Baking" puts it under Baking (with its description)`, JSON.stringify(one(cl, "Cake Decorating")));
      await ask(p, "and pastry?");
      await p.locator("#iko-log").getByRole("button", { name: "A new subject" }).click(); await p.waitForTimeout(700);
      cl = await cloudOf(p);
      ok(one(cl, "Pastry") && one(cl, "Pastry").parent === null, `${tag}: "A new subject" makes it a new parent`, JSON.stringify(one(cl, "Pastry")));
      ok(calls.slice(c2).join() === "/chat:chat,/chat:chat", `${tag}: the choices made no calls`, calls.slice(c2).join());
      if (!(await p.isHidden("#iko-sheet"))) { await p.keyboard.press("Escape"); await p.waitForTimeout(250); }
      /* an existing subject is shown, not duplicated */
      if (!(await p.isHidden("#panel"))) { await p.click("#p-close"); await p.waitForTimeout(250); }
      await p.click("#iko"); await p.waitForTimeout(250);
      const c3 = calls.length;
      await ask(p, "I want to learn astronomy");
      cl = await cloudOf(p);
      ok((cl.nodes.Astronomy || []).length === 1 && one(cl, "Astronomy").parent === null && calls.slice(c3).join() === "/chat:chat", `${tag}: an existing subject is not duplicated; one call`, JSON.stringify(cl.nodes.Astronomy));
      if (width < 700) { await p.keyboard.press("Escape"); await p.waitForTimeout(600); }
      ok((await focusOf(p)) === one(cl, "Astronomy").id && (await sheet(p)).panel === "Astronomy", `${tag}: it is focused with its card instead`);
      ok(calls.filter((c) => c !== "/examples").every((c) => c === "/chat:chat"), `${tag}: only chat calls in all of this (one per request)`, calls.join());
      if (guide) {
        /* guide mode: what Maya added is hers; a new learner starts without it */
        const per = await p.evaluate(() => { const PR = window.IkoProfiles, maya = PR.current(localStorage).active; PR.add(localStorage, "Leo"); const C = window.IkoCloud, mine = C.deserialize(localStorage.getItem("ikolearn.v1.p." + maya + ".cloud")), live = localStorage.getItem("ikolearn.v1.cloud"); return { maya: mine.order.some((x) => mine.nodes[x].label === "Guitar"), leo: Boolean(live && /Guitar/.test(live)), v: mine.v }; });
        ok(per.maya && !per.leo && per.v === 9, `${tag}: guide mode: the new subjects are Maya's (a new learner starts without them); storage v9`, JSON.stringify(per));
      }
      ok(!errs.length, `${tag}: no console errors (new topics)`, errs.join(" | "));
    } catch (e) { fails.push(`${tag}: new topics threw -> ${String(e.message || e).split("\n")[0]}`); }
    await ctx.close();
  }
  /* 2) the root cause: a node from an earlier screen (a lesson Iko was opened on) never stays the focus */
  {
    const { ctx, p, errs, calls, bodies } = await boot(width, guide);
    try {
      await p.locator(".cloud-flow > .chip").first().click(); await p.waitForSelector("#l-done:not([hidden])");
      await p.click("#iko"); await p.waitForTimeout(250);
      ok((await sheet(p)).about === "On Magma · lesson", `${tag}: Iko on the Magma lesson`);
      await p.keyboard.press("Escape"); await p.waitForTimeout(200);
      await p.click("#l-back"); await p.waitForTimeout(900);
      if (!(await p.isHidden("#panel"))) { await p.click("#p-close"); await p.waitForTimeout(250); }
      await p.click("#iko"); await p.waitForTimeout(250);
      ok((await sheet(p)).about === "On your cloud", `${tag}: Iko on the cloud with nothing selected`);
      const c0 = calls.length;
      await ask(p, "tell me about rivers");
      const b = bodies.filter((x) => x.at === "/chat").pop().b, cl = await cloudOf(p), r = one(cl, "Rivers");
      ok(b.focus === "" && b.focusId === "", `${tag}: the request has no focus (not Magma from the lesson before)`, JSON.stringify({ focus: b.focus, focusId: b.focusId }));
      ok(r && r.parent !== "Magma" && r.parent === "Earth Science", `${tag}: Rivers is not forced under the last branch (Magma); it goes under Earth Science`, JSON.stringify(r));
      ok(calls.slice(c0).join() === "/chat:chat", `${tag}: one chat call`, calls.slice(c0).join());
      ok(!errs.length, `${tag}: no console errors (focus)`, errs.join(" | "));
    } catch (e) { fails.push(`${tag}: focus threw -> ${String(e.message || e).split("\n")[0]}`); }
    await ctx.close();
  }
  /* 3) Where Next at its entry points */
  {
    const { ctx, p, errs } = await boot(width, guide);
    try {
      await p.locator(".cloud-flow > .chip").first().click(); await p.waitForSelector("#l-done:not([hidden])");
      await passCheck(p); /* PR 103: the check passed first */
      await p.click("#l-got"); await p.waitForTimeout(400);
      let w = await whereNext(p);
      ok(wnOk(w), `${tag}: Where Next after I've got it: this subject only, equal boxes, the action in the selected box`, JSON.stringify(w));
      await p.evaluate(() => document.querySelector("#l-next").scrollIntoView({ block: "center" })); await p.waitForTimeout(200);
      await shot(p, width, "wherenext-got");
      if (width >= 1100) {
        await p.click("#iko"); await p.waitForTimeout(300);
        const cover = await p.evaluate(() => { const s = document.querySelector("#iko-sheet").getBoundingClientRect(); return [...document.querySelectorAll("#l-next .wn-opt")].filter((e) => { const r = e.getBoundingClientRect(); return r.left < s.right && r.right > s.left && r.top < s.bottom && r.bottom > s.top; }).length; });
        ok(cover === 0, `${tag}: with Iko open, the sheet sits clear of Where Next and Also in progress`, String(cover));
        await shot(p, width, "wherenext-iko");
        await p.keyboard.press("Escape"); await p.waitForTimeout(200);
      }
      const t0 = w.title;
      await p.click("#l-next .wn-opt.on .wn-act"); await p.waitForSelector("#l-done:not([hidden])"); await p.waitForTimeout(400);
      w = await whereNext(p);
      ok(w.title !== t0 && wnOk(w), `${tag}: Where Next after Continue (${w.title}): this subject only, equal boxes, the action in the selected box`, JSON.stringify(w));
      await p.click("#l-back"); await p.waitForTimeout(900);
      ok(await tap(p, "Kneading"), `${tag}: Kneading's card on the cloud`);
      await p.click("#p-lesson"); await p.waitForSelector("#l-done:not([hidden])"); await p.waitForTimeout(400);
      w = await whereNext(p);
      ok(w.title === "Kneading" && wnOk(w) && w.alt.length > 0, `${tag}: Where Next from a card on the cloud (Kneading): Baking only; the other subjects are in Also in progress`, JSON.stringify(w));
      await p.evaluate(() => document.querySelector("#l-next").scrollIntoView({ block: "center" })); await p.waitForTimeout(200);
      await shot(p, width, "wherenext-card");
      ok(!errs.length, `${tag}: no console errors (Where Next)`, errs.join(" | "));
    } catch (e) { fails.push(`${tag}: Where Next threw -> ${String(e.message || e).split("\n")[0]}`); }
    await ctx.close();
  }
}
await browser.close(); server.close();
console.log(`ikolearn topics e2e: ${pass} passed${fails.length ? `, ${fails.length} FAILED` : ""}`);
fails.forEach((f) => console.log("  x " + f));
process.exit(fails.length ? 1 : 0);
