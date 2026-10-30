// End-to-end checks for the cloud as home, in a real browser, every /api/ikolearn call mocked (no model calls):
// after the name (learning for yourself, or a guide's first learner) the app lands on the cloud with the name in the
// centre and a quiet start; Begin there answers the first question and the cloud grows in place (one start call);
// a returning visit opens on the cloud; lessons, a card's hub, the deck and Iko open from it and Back returns to it
// (on the topic, the camera kept); Escape never leaves home.
// Run: IKOLEARN_PW=<path to node_modules/playwright-core> node scripts/ikolearn-home-e2e.mjs [--shots DIR] [--tag after] [--root public]
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const SHOTS = arg("--shots", ""), TAG = arg("--tag", "after"), ROOT = path.resolve(arg("--root", "public"));
if (!process.env.IKOLEARN_PW) { console.log("ikolearn home e2e: skipped (set IKOLEARN_PW to a playwright-core folder)"); process.exit(0); }
const { chromium } = await import(pathToFileURL(path.join(process.env.IKOLEARN_PW, "index.mjs")).href);
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
const browser = await chromium.launch({ executablePath: process.env.IKOLEARN_CHROME || "/usr/bin/google-chrome" });
const HOOK = () => { let real; Object.defineProperty(window, "IkoCloudView", { configurable: true, get: () => real, set: (v) => { real = Object.assign({}, v, { create: (c, o) => { const view = v.create(c, o); (window.__views = window.__views || []).push({ id: c.id, view }); return view; } }); } }); };

/* the mocked API: a lesson (streamed), the start build (streamed items), everything else off */
const nd = (rows) => rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
const LESSON = nd([{ t: "start", model: "m" }, { t: "delta", text: "INTRO: Magma is hot melted rock deep underground.\nEXPLAIN: When it comes out of a volcano, we call it lava.\nSTEP: It gathers in chambers under the volcano.\nEXAMPLE: Like thick soup bubbling in a pot." }, { t: "path", steps: [], next: "", choices: [], questions: [] }, { t: "done" }]);
const kids = (n) => n.map((x, i) => ({ name: x, order: i + 1, score: 0.9 - i * 0.1, why: "A good first step", role: "core", blurb: x + " in plain words, one step at a time, for anyone." }));
const ITEMS = [
  { node: { name: "Ocean Life", chain: ["Nature"] }, card: { title: "Ocean Life", blurb: "Living things of the sea.", goal: "Name five sea creatures." }, children: kids(["Coral Reefs", "Whales", "Tides"]) },
  { node: { name: "Drawing", chain: ["Art"] }, card: { title: "Drawing", blurb: "Making pictures with lines.", goal: "Draw a simple scene." }, children: kids(["Shapes", "Shading", "Perspective"]) },
];
async function open(width) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 860 }, timezoneId: "America/Toronto" });
  const p = await ctx.newPage();
  p.setDefaultTimeout(6000);
  const errs = [], calls = [];
  p.on("pageerror", (e) => errs.push("pageerror " + e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await p.addInitScript(HOOK);
  await p.route("**/api/ikolearn/**", async (r) => {
    const at = new URL(r.request().url()).pathname;
    if (!/examples$/.test(at)) calls.push(at.replace("/api/ikolearn", ""));
    if (/lesson$/.test(at)) return r.fulfill({ status: 200, contentType: "application/x-ndjson", body: LESSON });
    if (/create$/.test(at)) { await new Promise((ok) => setTimeout(ok, 500)); return r.fulfill({ status: 200, contentType: "application/x-ndjson", body: nd([{ t: "item", item: ITEMS[0] }, { t: "item", item: ITEMS[1] }, { t: "done", items: ITEMS }]) }); }
    return r.fulfill({ status: 503, contentType: "application/json", body: '{"ok":false,"reason":"off"}' });
  });
  return { ctx, p, errs, calls };
}
const shot = async (p, w, name) => { if (SHOTS) { await p.waitForTimeout(300); await p.screenshot({ path: path.join(SHOTS, `home-${TAG}-${w}-${name}.png`) }); } };
const view = (p) => p.evaluate(() => { const v = (window.__views || []).filter((x) => x.id === "cloud-canvas").pop(); return v ? v.view.state() : null; });
const rootAt = (p) => p.evaluate(() => { const v = window.__views.filter((x) => x.id === "cloud-canvas").pop().view, q = v.project("root"), r = document.querySelector("#cloud-canvas").getBoundingClientRect(); return { x: r.left + q.x, y: r.top + q.y, w: r.width, h: r.height }; });
const screen = (p) => p.evaluate(() => ({
  cloud: !document.querySelector("#cloud").hidden, lesson: !document.querySelector("#lesson").hidden, deck: !document.querySelector("#deck").hidden, hub: !document.querySelector("#hub").hidden,
  card: !document.querySelector("#panel").hidden ? document.querySelector("#p-title").textContent : "", start: !document.querySelector("#cloud-start").hidden,
  flow: Boolean(document.querySelector(".cloud-flow") && !document.querySelector(".cloud-flow").hidden), active: document.activeElement ? document.activeElement.id || document.activeElement.tagName : "",
}));
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

for (const width of [390, 1280]) {
  const tag = String(width);
  /* 1. learning for yourself: the name, then home (the cloud, the name in the centre, a quiet start) */
  {
    const { ctx, p, errs, calls } = await open(width);
    try {
      await p.goto(BASE + "/ikolearn", { waitUntil: "networkidle" });
      await p.click('.who-opt[data-who="self"]'); await p.fill("#name-in", "Maya"); await p.press("#name-in", "Enter");
      await p.waitForSelector("#cloud:not([hidden])"); await p.waitForTimeout(400);
      const s = await screen(p), r = await rootAt(p);
      const lede = (await p.textContent("#cs-hi")) + " " + (await p.textContent("#cs-q"));
      ok(s.cloud && !s.lesson && !s.deck && !s.hub && s.start && !s.flow, `${tag}: yourself: after the name, the app lands on the cloud with a quiet start (no Pick up row on an empty cloud)`, JSON.stringify(s));
      ok(Math.abs(r.x - r.w / 2) < 30 && Math.abs(r.y - r.h / 2) < 60, `${tag}: yourself: the name sits in the centre`, JSON.stringify(r));
      ok(/^Hi Maya\. Let's begin your learning cloud together\. What are you curious about, or what do you enjoy\?$/.test(lede) && !/\b(age|kids?|child|student|grade)\b/i.test(lede), `${tag}: yourself: an inviting line in universal words (no topic list, no age)`, lede);
      ok(await p.isHidden(".cloud-hint") && s.active === "BODY", `${tag}: yourself: no input tips on an empty cloud; no focus jump (no keyboard on phones)`, JSON.stringify(s));
      const box = await p.evaluate(() => { const b = document.querySelector("#cloud-start").getBoundingClientRect(), n = document.querySelector("#cs-name").getBoundingClientRect(), q = document.querySelector("#cs-hi").getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, sw: document.documentElement.scrollWidth, iw: innerWidth, ih: innerHeight, name: document.querySelector("#cs-name").textContent, nc: n.left + n.width / 2, nb: n.bottom, nh: n.height, qt: q.top }; });
      ok(box.l >= 0 && box.r <= box.iw && box.t >= 0 && box.b <= box.ih && box.sw <= box.iw && box.name === "Maya" && box.nh > 0 && Math.abs(box.nc - box.iw / 2) < 4 && box.nb <= box.qt, `${tag}: yourself: the start sits under the name (its plate centred above the question), inside the view`, JSON.stringify(box));
      ok(calls.length === 0, `${tag}: yourself: landing makes no calls`, calls.join());
      await shot(p, width, "1-first-landing");
      /* Begin: the first question answered from the cloud; one start call; the cloud grows here */
      await p.fill("#cs-in", "the ocean and drawing");
      await p.click("#cs-form button[type=submit]");
      await p.waitForTimeout(150);
      ok(/Growing your cloud/.test(await p.textContent("#cs-status")) && await p.isHidden("#cs-form"), `${tag}: Begin: a quiet status while it is written`);
      await p.waitForFunction(() => { const C = window.IkoCloud, c = C.deserialize(localStorage.getItem("ikolearn.v1.cloud")); return c && C.subjects(c).length >= 2 && !document.querySelector(".cloud-caption:not([hidden])"); }, null, { timeout: 15000 });
      await p.waitForTimeout(600);
      const g = await screen(p);
      const thread = await p.evaluate(() => document.querySelector("#thread").innerText);
      ok(g.cloud && !g.start && calls.filter((c) => c === "/create").length === 1 && calls.length === 1, `${tag}: Begin: one start call; the cloud grows in place and the start steps aside`, JSON.stringify({ g, calls }));
      ok(/the ocean and drawing/.test(thread) && /Here's where your path begins: Ocean Life, Drawing/.test(thread), `${tag}: Begin: Iko's chat keeps the answer and the result, as if typed there`);
      await shot(p, width, "1b-grown");
      ok(errs.length === 0, `${tag}: yourself: no console errors`, errs.join(" | "));
    } catch (e) { fails.push(`${tag}: yourself threw -> ${String(e.message || e).split("\n")[0]}`); }
    await ctx.close();
  }
  /* 2. a guide: their first learner's name, then that learner's cloud */
  {
    const { ctx, p, errs, calls } = await open(width);
    try {
      await p.goto(BASE + "/ikolearn", { waitUntil: "networkidle" });
      await p.click('.who-opt[data-who="guide"]'); await p.fill("#name-in", "Robin"); await p.press("#name-in", "Enter");
      await p.waitForSelector("#cloud:not([hidden])"); await p.waitForTimeout(400);
      const s = await screen(p);
      const who = await p.evaluate(() => ({ t: document.querySelector("#cloud-who").textContent, h: document.querySelector("#cloud-who").hidden, lede: document.querySelector("#cs-hi").textContent }));
      ok(s.cloud && s.start && !who.h && who.t === "Robin · switch" && /^Hi Robin\./.test(who.lede), `${tag}: guide: lands on the active learner's cloud, with the switcher on it`, JSON.stringify({ s, who }));
      const top = await p.evaluate(() => { const els = [...document.querySelectorAll(".cloud-top button:not([hidden]), .cloud-top a:not([hidden])")].map((e) => e.getBoundingClientRect()); return { over: els.some((a, i) => els.some((b, j) => j > i && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom)), right: Math.max(...els.map((e) => e.right)), iw: innerWidth }; });
      ok(!top.over && top.right <= top.iw, `${tag}: guide: the quiet links and zoom fit the top without overlapping`, JSON.stringify(top));
      ok(calls.length === 0 && errs.length === 0, `${tag}: guide: 0 calls, no errors`, calls.join() + errs.join(" | "));
      await shot(p, width, "5-guide-landing");
    } catch (e) { fails.push(`${tag}: guide threw -> ${String(e.message || e).split("\n")[0]}`); }
    await ctx.close();
  }
  /* 3. a returning visit: home is the cloud; lessons, a card, the deck and Iko open from it and come back */
  {
    const { ctx, p, errs, calls } = await open(width);
    try {
      await p.goto(BASE + "/ikolearn", { waitUntil: "networkidle" });
      await p.evaluate(SEED);
      await p.reload({ waitUntil: "networkidle" }); await p.waitForSelector("#cloud:not([hidden])"); await p.waitForTimeout(500);
      const s = await screen(p);
      const nav = await p.evaluate(() => ({ iko: document.querySelector("#iko").getAttribute("aria-label"), deck: document.querySelector("#cloud-deck").hidden ? "" : document.querySelector("#cloud-deck").getAttribute("aria-label") + "|" + (document.querySelector("#cloud-deck .md-n") || {}).textContent, fan: Boolean(document.querySelector("#cloud-deck .md-fan")), op: getComputedStyle(document.querySelector("#cloud-deck")).opacity, foot: getComputedStyle(document.querySelector(".cloud-foot")).opacity }));
      ok(s.cloud && !s.start && s.flow && s.active === "BODY", `${tag}: returning: opens on the cloud (Pick up row, no start, no focus jump)`, JSON.stringify(s));
      ok(nav.iko === "Talk to Iko" && /^Your deck, (\d+) cards?\. Open the album\|\1$/.test(nav.deck) && nav.fan && parseFloat(nav.op) <= 0.92 && parseFloat(nav.foot) <= 0.6, `${tag}: returning: Iko, the deck (the same fanned icon and count as the header's) and quiet fine print`, JSON.stringify(nav));
      ok(calls.length === 0, `${tag}: returning: 0 calls`, calls.join());
      await shot(p, width, "2-returning");
      /* a lesson from the cloud, and back: home, on its topic */
      const v0 = await view(p);
      const chip = p.locator(".cloud-flow > .chip").first(), chipText = (await chip.textContent()).trim();
      await chip.click(); await p.waitForSelector("#l-done:not([hidden])");
      const l = await p.evaluate(() => ({ t: document.querySelector("#l-title").textContent, back: document.querySelector("#l-back").textContent, chat: document.querySelector("#l-chat").textContent }));
      ok(!(await screen(p)).cloud && l.back === "Back to your cloud" && l.chat === "Ask Iko about this", `${tag}: lesson: opens from the cloud; "Back to your cloud", "Ask Iko about this"`, JSON.stringify(l));
      await shot(p, width, "3-lesson");
      await p.click("#l-back"); await p.waitForTimeout(1600);
      const b = await screen(p);
      ok(b.cloud && !b.lesson && b.card === l.t && chipText.includes(l.t), `${tag}: lesson: Back returns to the cloud with its topic's card open`, JSON.stringify({ b, l }));
      await shot(p, width, "4-back-from-lesson");
      /* its card (hub) from the cloud card, and back */
      await p.click("#p-card"); await p.waitForTimeout(300);
      ok((await screen(p)).hub && (await p.textContent("#hub-back")) === "Back to your cloud", `${tag}: card: "Open its card" opens the hub; its Back says "Back to your cloud"`);
      await p.click("#hub-back"); await p.waitForTimeout(400);
      const hb = await screen(p);
      ok(hb.cloud && !hb.hub && hb.card === l.t, `${tag}: card: Back returns to the cloud, on that topic`, JSON.stringify(hb));
      /* Iko from the card, and back (Your cloud, and Escape) */
      await p.click("#p-chat"); await p.waitForTimeout(300);
      const sh = await p.evaluate(() => ({ sheet: !document.querySelector("#iko-sheet").hidden, cloud: !document.querySelector("#cloud").hidden, about: document.querySelector("#iko-about").textContent }));
      ok(sh.sheet && sh.cloud && sh.about === "On your cloud · " + l.t, `${tag}: Iko: "Talk to Iko" opens Iko over the cloud, on that topic`, JSON.stringify(sh));
      await p.click("#iko-all"); await p.waitForTimeout(300);
      const ch = await p.evaluate(() => ({ cloud: !document.querySelector("#cloud").hidden, name: document.querySelector(".chat-name").textContent, back: document.querySelector("#to-cloud").textContent, ph: document.querySelector("#input").placeholder, focus: (document.querySelector("#focus-text") || {}).textContent }));
      ok(!ch.cloud && ch.name === "Iko" && ch.back === "Your cloud" && ch.ph === "Ask Iko anything" && new RegExp(l.t).test(ch.focus), `${tag}: Iko: "See our whole conversation" opens the chat with Iko on that topic`, JSON.stringify(ch));
      await p.click("#to-cloud"); await p.waitForTimeout(400);
      ok((await screen(p)).cloud, `${tag}: Iko: "Your cloud" returns home`);
      await p.click("#iko"); await p.click("#iko-all"); await p.waitForTimeout(250);
      await p.keyboard.press("Escape"); await p.waitForTimeout(400);
      ok((await screen(p)).cloud, `${tag}: Iko: Escape returns home too`);
      /* the deck from the cloud, and back; the camera kept */
      if (!(await screen(p)).card) { /* ok */ } else { await p.click("#p-close"); await p.waitForTimeout(200); }
      const v1 = await view(p);
      await p.click("#cloud-deck"); await p.waitForTimeout(300);
      ok((await screen(p)).deck && (await p.textContent("#d-back")) === "Back to your cloud", `${tag}: deck: opens from the cloud; Back says "Back to your cloud"`);
      await p.click("#d-back"); await p.waitForTimeout(400);
      const v2 = await view(p);
      ok((await screen(p)).cloud && Math.abs(v2.zoom - v1.zoom) < 1e-6 && Math.abs(v2.panX - v1.panX) < 1 && Math.abs(v2.panY - v1.panY) < 1, `${tag}: deck: Back returns to the cloud, the camera where it was`, JSON.stringify({ v1: [v1.zoom, v1.panX, v1.panY], v2: [v2.zoom, v2.panX, v2.panY] }));
      /* Escape on the cloud never leaves home */
      await p.keyboard.press("Escape"); await p.waitForTimeout(200);
      ok((await screen(p)).cloud, `${tag}: Escape on the cloud stays home`);
      ok(calls.filter((c) => c !== "/lesson").length === 0 && calls.filter((c) => c === "/lesson").length <= 1, `${tag}: returning: only the one (mocked) lesson call`, calls.join());
      ok(errs.length === 0, `${tag}: returning: no console errors`, errs.join(" | "));
      if (v0 && v2) ok(Number.isFinite(v2.zoom), `${tag}: the cloud's view survived the round trips`);
    } catch (e) { fails.push(`${tag}: returning threw -> ${String(e.message || e).split("\n")[0]}`); }
    await ctx.close();
  }
}
await browser.close();
server.close();
if (fails.length) { console.error(`ikolearn home e2e: ${pass} passed, ${fails.length} FAILED`); for (const f of fails) console.error("  x " + f); process.exit(1); }
console.log(`ikolearn home e2e: ${pass} passed`);
