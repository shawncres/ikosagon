// End-to-end checks for the big cloud in a real browser, every /api/ikolearn call mocked (no model calls):
// the idle spin (starts after the idle delay, eases in, waits out a focus glide, turns about the selected node, pauses while the tab
// is hidden or the cloud is closed, off with reduced motion) on each cloud screen. The spin goes on through drags, pans
// and the wheel; only a click (a node or a control) pauses it. A selected node gets a rounded card next to it (inside the
// view, never over the node, following it as the cloud moves), dismissed by its close control, a tap outside or Escape.
// Run: IKOLEARN_PW=<path to node_modules/playwright-core> node scripts/ikolearn-cloud-e2e.mjs [--shots DIR] [--tag after] [--root public]
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const SHOTS = arg("--shots", ""), TAG = arg("--tag", "after"), ROOT = path.resolve(arg("--root", "public"));
if (!process.env.IKOLEARN_PW) { console.log("ikolearn cloud e2e: skipped (set IKOLEARN_PW to a playwright-core folder)"); process.exit(0); }
const { chromium } = await import(pathToFileURL(path.join(process.env.IKOLEARN_PW, "index.mjs")).href);
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
const browser = await chromium.launch({ executablePath: process.env.IKOLEARN_CHROME || "/usr/bin/google-chrome" });

/* keeps a handle on each cloud view the page creates (read-only: its state() and project()) */
const HOOK = () => { let real; Object.defineProperty(window, "IkoCloudView", { configurable: true, get: () => real, set: (v) => { real = Object.assign({}, v, { create: (c, o) => { const view = v.create(c, o); (window.__views = window.__views || []).push({ id: c.id, view }); return view; } }); } }); };
const SEED = (o) => {
  const C = window.IkoCloud, T = Date.now() - 3 * 864e5, c = C.create("Maya", T);
  const kids = (n, m, b) => n.map((x, i) => ({ name: x, order: i + 1, score: 0.9 - i * 0.1, why: "", role: "core", motif: m[i], ...(b ? { blurb: b[i] } : {}) }));
  const items = [
    { node: { name: "Volcanoes", chain: ["Earth Science"], motif: "mountain" }, card: { title: "Volcanoes", blurb: "Mountains that let out melted rock.", goal: "" }, children: kids(["Magma", "Eruptions", "Lava Types"], ["flame", "mountain", "drop"], ["Hot melted rock deep underground that rises up and feeds a volcano.", "The moments when a volcano pushes out lava, ash and gas, gently or with a bang.", "The different kinds of lava, from runny rivers of fire to thick slow lumps."]) }, /* descriptions from the same create answer (piggybacked) */
    { node: { name: "Sourdough Bread", chain: ["Baking"], motif: "bowl" }, card: { title: "Sourdough Bread", blurb: "Bread raised by a living starter.", goal: "" }, children: kids(["Starter Basics", "Kneading", "Proofing"], ["seed", "hand", "clock"]) },
    { node: { name: "Stargazing", chain: ["Astronomy"], motif: "star" }, card: { title: "Stargazing", blurb: "The night sky.", goal: "" }, children: kids(["Constellations", "Planets"], ["star", "planet"]) },
  ];
  C.applyCreate(c, { items: o.fresh ? items.slice(0, 1) : items }, { t: T });
  localStorage.setItem("ikolearn.v1.name", "Maya"); localStorage.setItem("ikolearn.v1.cloud", C.serialize(c));
  localStorage.setItem("ikolearn.v1.seen", JSON.stringify({ c: {}, ev: 0, h: { cloud: o.hint ? 0 : 1, card: 1, chat: 1, draw: 1 } }));
  localStorage.setItem("ikolearn.v1.thread", JSON.stringify([{ id: "m1", at: T, role: "model", local: true, text: "Welcome back, Maya." }]));
  if (o.guide) localStorage.setItem("ikolearn.v1.profiles", JSON.stringify({ v: 1, mode: "guide", active: "p1", seq: 2, list: [{ id: "p1", name: "Maya", at: T }, { id: "p2", name: "Robin", at: T }] }));
};

async function open(width, o = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 860 }, reducedMotion: o.reduce ? "reduce" : "no-preference", timezoneId: "America/Toronto" });
  const p = await ctx.newPage();
  p.setDefaultTimeout(6000);
  const errs = [], calls = [];
  p.on("pageerror", (e) => errs.push("pageerror " + e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await p.addInitScript(HOOK);
  const bodies = [];
  await p.route("**/api/ikolearn/**", async (r) => {
    const at = new URL(r.request().url()).pathname; if (!/examples$/.test(at)) calls.push(at);
    /* the description backfill: o.describe "ok" answers each asked topic (after a short wait, so the placeholder shows) */
    if (/describe$/.test(at)) {
      const b = JSON.parse(r.request().postData() || "{}"); bodies.push(b);
      if (o.describe === "ok") { await new Promise((ok) => setTimeout(ok, 900)); return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, items: (b.material || []).map((m) => ({ name: m.label, blurb: `${m.label}: a short plain line about what this topic is and why it matters.` })) }) }); }
    }
    return r.fulfill({ status: 503, contentType: "application/json", body: '{"ok":false,"reason":"off"}' });
  });
  await p.goto(BASE + "/ikolearn", { waitUntil: "networkidle" });
  await p.evaluate(SEED, o);
  await p.reload({ waitUntil: "networkidle" });
  await p.waitForSelector("#cloud:not([hidden])"); /* home: the app opens on the cloud */
  await p.waitForTimeout(250);
  await p.mouse.move(1, 1);
  return { ctx, p, errs, calls, bodies };
}
const st = (p) => p.evaluate(() => { const v = window.__views.filter((x) => x.id === "cloud-canvas").pop().view; return v.state(); });
const at = (p, label) => p.evaluate((l) => { const v = window.__views.filter((x) => x.id === "cloud-canvas").pop().view, C = window.IkoCloud, c = C.deserialize(localStorage.getItem("ikolearn.v1.cloud")); const id = c.order.find((x) => c.nodes[x].label === l); const q = v.project(id), r = document.querySelector("#cloud-canvas").getBoundingClientRect(); return { x: r.left + q.x, y: r.top + q.y }; }, label);
/* an empty spot of the canvas: the canvas is on top there and no node is near (a drag there moves the cloud, picks nothing) */
const emptySpot = (p) => p.evaluate(() => {
  const v = window.__views.filter((x) => x.id === "cloud-canvas").pop().view, C = window.IkoCloud, c = C.deserialize(localStorage.getItem("ikolearn.v1.cloud"));
  const cv = document.querySelector("#cloud-canvas"), r = cv.getBoundingClientRect();
  const pts = Object.keys(c.nodes).map((id) => v.project(id)).filter(Boolean).map((q) => ({ x: r.left + q.x, y: r.top + q.y }));
  for (let y = r.top + r.height * 0.3; y < r.bottom - 60; y += 23) for (let x = r.left + 30; x < r.right - 30; x += 29) {
    if (document.elementFromPoint(x, y) !== cv || document.elementFromPoint(x + 50, y - 10) !== cv) continue;
    if (pts.every((q) => Math.hypot(q.x - x, q.y - y) > 40 && Math.hypot(q.x - x - 50, q.y - y + 10) > 40)) return { x, y };
  }
  return null;
});
const settle = (p) => p.waitForFunction(() => !window.__views.filter((x) => x.id === "cloud-canvas").pop().view.state().moving, null, { timeout: 4000 });
/* yaw now, and again after ms: the turn and whether it is spinning */
async function turn(p, ms) { const a = await st(p); await p.waitForTimeout(ms); const b = await st(p); return { d: b.yaw - a.yaw, on: b.spinning, a, b }; }
const shot = async (p, name) => { if (SHOTS) { await p.waitForTimeout(150); await p.screenshot({ path: path.join(SHOTS, name) }); } };

for (const width of (process.env.WIDTHS || "390,1280").split(",").map(Number)) {
  const tag = `${width}`;
  /* 1. the main cloud: still at first, then a gentle turn; a drag, the wheel and a key stop it at once; it comes back */
  {
    const { ctx, p, errs, calls } = await open(width);
    try {
      const early = await turn(p, 1500);
      ok(Math.abs(early.d) < 1e-6 && !early.on, `${tag}: main cloud: still for the first seconds (idle delay)`, JSON.stringify(early.d));
      await p.waitForFunction(() => window.__views.filter((x) => x.id === "cloud-canvas").pop().view.state().spinning, null, { timeout: 6000 }); /* the spin has just begun (the cloud now opens at boot) */
      const ease = await turn(p, 300);
      await p.waitForTimeout(1500);
      const full = await turn(p, 2000);
      ok(full.on && full.d > 0, `${tag}: main cloud: spins after the idle delay`, JSON.stringify({ d: full.d }));
      const secPerTurn = (2 * Math.PI) / (full.d / 2);
      ok(secPerTurn >= 60 && secPerTurn <= 95, `${tag}: main cloud: slow but noticeable (about ${Math.round(secPerTurn)} s per turn)`, String(secPerTurn));
      ok(ease.d / 0.3 < (full.d / 2) * 0.95, `${tag}: main cloud: eases in (slower at the start than at full speed)`, JSON.stringify({ start: ease.d / 0.3, full: full.d / 2 }));
      await shot(p, `spin-${TAG}-${width}-main.png`);
      /* a drag, a pan and the wheel do NOT stop it: the spin goes on through movement */
      const spot = await emptySpot(p), cx = spot.x, cy = spot.y;
      await p.mouse.move(cx, cy); await p.mouse.down();
      const down = await turn(p, 400);
      await p.mouse.move(cx + 50, cy - 10, { steps: 8 });
      const mid = await turn(p, 400);
      await p.mouse.up(); await p.mouse.move(1, 1);
      const after = await turn(p, 1200);
      ok(down.on && down.d > 0 && mid.on && mid.d > 0 && after.on && after.d > 0, `${tag}: the spin keeps going through a drag (pressed, moving, released)`, JSON.stringify({ down: down.d, mid: mid.d, after: after.d }));
      const sp2 = await emptySpot(p);
      await p.mouse.move(sp2.x, sp2.y); await p.mouse.wheel(0, -40); await p.mouse.move(1, 1);
      const wh = await turn(p, 500);
      ok(wh.on && wh.d > 0, `${tag}: ... and through the wheel`);
      await p.keyboard.press("Shift");
      const key = await turn(p, 400);
      ok(key.on && key.d > 0, `${tag}: ... and a key press that is not a click`);
      /* a click on a control (zoom) pauses it; it comes back after the delay */
      await p.click("#zin"); await p.mouse.move(1, 1);
      const zc = await turn(p, 600);
      ok(!zc.on, `${tag}: a click on a control (zoom) pauses the spin`, JSON.stringify(zc.d));
      await p.waitForTimeout(3600);
      const zb = await turn(p, 800);
      ok(zb.on && zb.d > 0, `${tag}: ... and it comes back after the short delay`);
      /* hidden tab */
      await p.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, get: () => true }); document.dispatchEvent(new Event("visibilitychange")); });
      const hid = await turn(p, 1500);
      ok(!hid.on && Math.abs(hid.d) < 1e-6, `${tag}: paused while the tab is hidden`, JSON.stringify(hid.d));
      await p.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, get: () => false }); document.dispatchEvent(new Event("visibilitychange")); });
      const vis = await turn(p, 1500);
      await p.waitForTimeout(2600);
      const vis2 = await turn(p, 800);
      ok(!vis.on && Math.abs(vis.d) < 1e-6 && vis2.on && vis2.d > 0, `${tag}: visible again: waits the idle delay, then spins`, JSON.stringify({ vis: vis.d, vis2: vis2.d }));

      /* 2. a node click: the spin pauses, the camera glides, a rounded card opens next to the node */
      ok(await p.evaluate(() => !document.querySelector("#cloud").hidden), `${tag}: still on the cloud after the drag, wheel, key and zoom`);
      await p.click("#zreset"); await p.mouse.move(1, 1); await settle(p);
      await p.waitForTimeout(3700);
      ok((await st(p)).spinning, `${tag}: spinning before the node click`);
      const pt = await at(p, "Volcanoes");
      await p.mouse.click(pt.x, pt.y); await p.mouse.move(1, 1);
      const glide = await st(p);
      ok(glide.moving && !glide.spinning, `${tag}: clicking a node pauses the spin and glides to it`);
      await settle(p);
      const rect = (q) => p.evaluate((q) => { const e = document.querySelector(q); if (!e || e.hidden) return null; const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height }; }, q);
      const inside = (pt, b) => b && pt.x >= b.l - 4 && pt.x <= b.r + 4 && pt.y >= b.t - 4 && pt.y <= b.b + 4;
      const gap = (pt, b) => Math.max(b.l - pt.x, pt.x - b.r, b.t - pt.y, pt.y - b.b, 0);
      const card = await rect("#panel"), node = await at(p, "Volcanoes");
      const view = await p.evaluate(() => ({ iw: innerWidth, ih: innerHeight, sw: document.documentElement.scrollWidth, side: document.querySelector("#panel").getAttribute("data-side"), radius: getComputedStyle(document.querySelector("#panel")).borderTopLeftRadius, title: document.querySelector("#p-title").textContent, note: document.querySelector("#p-note").innerText, acts: [...document.querySelectorAll("#panel .actions .btn:not([hidden])")].map((b) => b.textContent), desc: document.querySelector("#p-desc").hidden ? null : document.querySelector("#p-desc").textContent, path: document.querySelectorAll("#p-path li").length }));
      ok(card && !inside(node, card), `${tag}: the card does not cover the selected node`, JSON.stringify({ node, card }));
      ok(card && gap(node, card) <= 70, `${tag}: the card sits next to the node (${Math.round(card ? gap(node, card) : -1)} px away)`, JSON.stringify({ node, card }));
      ok(card && card.l >= 0 && card.r <= view.iw && card.t >= 0 && card.b <= view.ih && view.sw <= view.iw, `${tag}: the card is inside the viewport (no overflow)`, JSON.stringify({ card, view }));
      ok(view.side === (width >= 900 ? "right" : "below") && parseFloat(view.radius) >= 10, `${tag}: a rounded card ${width >= 900 ? "to the right of" : "under"} the node`, JSON.stringify(view));
      ok(view.title === "Volcanoes" && view.desc === "Mountains that let out melted rock." && !/What do you notice here\?/.test(view.note) && JSON.stringify(view.acts.slice(0, 3)) === JSON.stringify(["Start a lesson", "Open its card", "Talk to Iko"]) && view.path >= 3, `${tag}: the card: title, its description (instead of "What do you notice here?"), the three actions and the path`, JSON.stringify(view));
      ok(calls.length === 0, `${tag}: a described node's card: the description shows at once, 0 calls`, calls.join());
      await shot(p, `nodes-card-${TAG}-${width}-card.png`);
      /* while the card is open the spin comes back after the short delay; it turns about the selected node, so the node and its card stay put */
      const c0 = await rect("#panel"), n0 = await at(p, "Volcanoes");
      await p.waitForTimeout(3700);
      const foc = await turn(p, 1500);
      const c1 = await rect("#panel"), n1 = await at(p, "Volcanoes");
      ok(foc.on && foc.d > 0, `${tag}: with the card open, the spin resumes after the delay`, JSON.stringify({ d: foc.d }));
      ok(Math.hypot(n1.x - n0.x, n1.y - n0.y) < 1.5 && Math.abs(c1.l - c0.l) < 1.5 && Math.abs(c1.t - c0.t) < 1.5, `${tag}: ... about the selected node: node and card stay put`, JSON.stringify({ n0, n1, c0: [c0.l, c0.t], c1: [c1.l, c1.t] }));
      /* the card follows its node when the cloud moves (a pan drag; the spin keeps going) */
      const sp3 = await emptySpot(p);
      await p.mouse.move(sp3.x, sp3.y); await p.mouse.down(); await p.mouse.move(sp3.x - 24, sp3.y + 30, { steps: 6 }); await p.mouse.up(); await p.mouse.move(1, 1);
      await p.waitForTimeout(500);
      const c2 = await rect("#panel"), n2 = await at(p, "Volcanoes");
      ok(!(await p.locator("#panel").isHidden()) && Math.abs((c2.t - c1.t) - (n2.y - n1.y)) < 3 && Math.abs(n2.y - n1.y) > 10 && !inside(n2, c2), `${tag}: the card follows its node as the cloud moves (still clear of it)`, JSON.stringify({ dn: [n2.x - n1.x, n2.y - n1.y], dc: [c2.l - c1.l, c2.t - c1.t] }));
      ok((await st(p)).spinning, `${tag}: ... and the spin went on through that drag`);
      /* dismiss: a tap on empty sky */
      const sky = await emptySpot(p);
      await p.mouse.click(sky.x, sky.y); await p.mouse.move(1, 1); await p.waitForTimeout(250);
      ok(await p.locator("#panel").isHidden() && !(await p.locator("#cloud").isHidden()) && !(await st(p)).focus, `${tag}: a tap outside dismisses the card (the cloud stays)`);
      /* dismiss: the close control, and Escape (the card first, the cloud stays) */
      const pv = await at(p, "Volcanoes"); await p.mouse.click(pv.x, pv.y); await p.mouse.move(1, 1); await settle(p);
      await p.click("#p-close"); await p.waitForTimeout(200);
      ok(await p.locator("#panel").isHidden() && !(await p.locator("#cloud").isHidden()), `${tag}: the close control dismisses the card`);
      const pe = await at(p, "Eruptions"); await p.mouse.click(pe.x, pe.y); await p.mouse.move(1, 1); await settle(p);
      const eTitle = await p.textContent("#p-title"), eNode = await at(p, "Eruptions"), eCard = await rect("#panel");
      ok(eTitle === "Eruptions" && !inside(eNode, eCard), `${tag}: another node: its own card, clear of it`, JSON.stringify({ eTitle, eNode, eCard }));
      const eDesc = await p.evaluate(() => ({ d: document.querySelector("#p-desc").textContent, h: document.querySelector("#p-desc").hidden, l: document.querySelector("#p-desc").getBoundingClientRect().height, lh: parseFloat(getComputedStyle(document.querySelector("#p-desc")).lineHeight) }));
      ok(!eDesc.h && /^The moments when a volcano/.test(eDesc.d) && eDesc.l <= eDesc.lh * 3 + 1 && calls.length === 0, `${tag}: a child made with a description (piggybacked): shown at once, at most 3 lines, 0 calls`, JSON.stringify(eDesc));
      await shot(p, `nodes-desc-${TAG}-${width}-piggyback.png`);
      await p.keyboard.press("Escape"); await p.waitForTimeout(200);
      ok(await p.locator("#panel").isHidden() && !(await p.locator("#cloud").isHidden()), `${tag}: Escape closes the card first (the cloud stays)`);
      /* 3. the whole-cloud card (tap the name) sits next to the name */
      await p.click("#zreset"); await p.mouse.move(1, 1); await settle(p);
      const home = await p.evaluate(() => window.__views.filter((x) => x.id === "cloud-canvas").pop().view.state());
      const rp = await p.evaluate((h) => { const r = document.querySelector("#cloud-canvas").getBoundingClientRect(); return { x: r.left + r.width / 2 + h.panX, y: r.top + r.height / 2 + h.panY }; }, home);
      const rpp = await p.evaluate(() => { const v = window.__views.filter((x) => x.id === "cloud-canvas").pop().view, q = v.project("root"), r = document.querySelector("#cloud-canvas").getBoundingClientRect(); return { x: r.left + q.x, y: r.top + q.y }; });
      await p.mouse.click(rpp.x, rpp.y); await p.mouse.move(1, 1); await p.waitForTimeout(400);
      const rCard = await rect("#panel"), rNode = await p.evaluate(() => { const v = window.__views.filter((x) => x.id === "cloud-canvas").pop().view, q = v.project("root"), r = document.querySelector("#cloud-canvas").getBoundingClientRect(); return { x: r.left + q.x, y: r.top + q.y }; });
      ok(rCard && (await p.textContent("#p-title")) === "Maya" && !inside(rNode, rCard) && gap(rNode, rCard) <= 70 && rCard.r <= width && rCard.l >= 0, `${tag}: the whole-cloud card sits next to the name, inside the view`, JSON.stringify({ rNode, rCard, rp }));
      await shot(p, `nodes-card-${TAG}-${width}-root.png`);
      await p.click("#p-close"); await p.waitForTimeout(200);
      /* 4. the card's actions: Open its card (the hub; the cloud closes and the spin stops) */
      const pm = await at(p, "Magma"); await p.mouse.click(pm.x, pm.y); await settle(p);
      await p.click("#p-card"); await p.waitForTimeout(300);
      const hubCard = await turn(p, 1500);
      const hub = await p.evaluate(() => ({ cloud: document.querySelector("#cloud").hidden, hub: !document.querySelector("#hub").hidden, title: (document.querySelector("#hub-title") || {}).textContent }));
      ok(hub.cloud && hub.hub && /Magma/.test(hub.title || "") && !hubCard.on && Math.abs(hubCard.d) < 1e-6, `${tag}: "Open its card" opens the card view; the cloud closes and the spin stops`, JSON.stringify(hub));
      ok(calls.length === 0, `${tag}: 0 model calls`, calls.join());
      /* Talk to Iko: Iko's sheet on that topic (0 calls) */
      await p.click("#thumb"); await p.mouse.move(1, 1); await p.waitForTimeout(300);
      await p.click("#zreset"); await settle(p);
      const pk = await at(p, "Volcanoes"); await p.mouse.click(pk.x, pk.y); await settle(p);
      await p.click("#p-chat"); await p.waitForTimeout(300);
      const chat = await p.evaluate(() => ({ cloud: !document.querySelector("#cloud").hidden, sheet: !document.querySelector("#iko-sheet").hidden, about: document.querySelector("#iko-about").textContent }));
      ok(chat.cloud && chat.sheet && chat.about === "On your cloud · Volcanoes" && calls.length === 0, `${tag}: "Talk to Iko" opens Iko on that topic, over the cloud (0 calls)`, JSON.stringify(chat));
      await p.keyboard.press("Escape"); await p.waitForTimeout(150);
      if (!(await p.locator("#panel").isHidden())) { await p.click("#p-close"); await p.waitForTimeout(200); } /* the card stays open under Iko now: close it before picking another point */
      /* Start a lesson: the lesson opens (its one call is answered by the mock) */
      if (await p.locator("#cloud").isHidden()) await p.click("#thumb"); await p.mouse.move(1, 1); await p.waitForTimeout(300);
      await p.click("#zreset"); await settle(p);
      const pl = await at(p, "Magma"); await p.mouse.click(pl.x, pl.y); await settle(p);
      await p.click("#p-lesson"); await p.waitForTimeout(500);
      const les = await p.evaluate(() => ({ cloud: document.querySelector("#cloud").hidden, lesson: !document.querySelector("#lesson").hidden, title: document.querySelector("#l-title").textContent }));
      ok(les.cloud && les.lesson && les.title === "Magma" && calls.length === 1 && calls[0] === "/api/ikolearn/lesson", `${tag}: "Start a lesson" opens that lesson (one lesson request, mocked)`, JSON.stringify({ les, calls }));
      ok(errs.length === 0, `${tag}: no console errors`, errs.join(" | "));
    } catch (e) { fails.push(`${tag}: main threw -> ${String(e.message || e).split("\n").slice(0, 6).join(" / ")}`); }
    await ctx.close();
  }
  /* 6. the description backfill: an older save's node (Baking's children have none): one call for its batch, then never again */
  /* a node that is on screen, below the top controls and clear of the name and every other node (a tap hits it, not a neighbour) */
  const onScreen = async (p, labels) => {
    const all = await p.evaluate(() => { const v = window.__views.filter((x) => x.id === "cloud-canvas").pop().view, C = window.IkoCloud, c = C.deserialize(localStorage.getItem("ikolearn.v1.cloud")), r = document.querySelector("#cloud-canvas").getBoundingClientRect(); return ["root"].concat(c.order).map((id) => { const q = v.project(id); return { l: id === "root" ? "" : c.nodes[id].label, x: q ? r.left + q.x : -1e4, y: q ? r.top + q.y : -1e4 }; }); });
    const top = await p.evaluate(() => document.querySelector(".cloud-top").getBoundingClientRect().bottom + 16), H = width < 500 ? 844 : 860;
    for (const l of labels) {
      const q = all.find((n) => n.l === l);
      if (!q || q.x < 24 || q.x > width - 24 || q.y < top || q.y > H - 24) continue;
      if (all.every((n) => n === q || Math.hypot(n.x - q.x, n.y - q.y) >= (n.l ? 16 : 36))) return { l, q };
    }
    return null;
  };
  /* opens one of these nodes' cards by tapping it: zoom in over its branch and turn the cloud a little until one is clear */
  const openNode = async (p, labels) => {
    await p.click("#zreset"); await p.mouse.move(1, 1); await settle(p);
    let hit = await onScreen(p, labels);
    for (let i = 0; !hit && i < 14; i++) {
      const fam = (await p.evaluate((ls) => { const v = window.__views.filter((x) => x.id === "cloud-canvas").pop().view, C = window.IkoCloud, c = C.deserialize(localStorage.getItem("ikolearn.v1.cloud")), r = document.querySelector("#cloud-canvas").getBoundingClientRect(); const id = c.order.find((x) => c.nodes[x].label === ls[0]); const q = v.project(id); return q ? { x: r.left + q.x, y: r.top + q.y } : null; }, labels));
      if (i < 4 && fam) { await p.mouse.move(fam.x, fam.y); await p.mouse.wheel(0, -160); }
      else { const sp = await emptySpot(p); await p.mouse.move(sp.x, sp.y); await p.mouse.down(); await p.mouse.move(sp.x + 40, sp.y, { steps: 5 }); await p.mouse.up(); }
      await p.mouse.move(1, 1); await p.waitForTimeout(700);
      hit = await onScreen(p, labels);
    }
    if (!hit) throw new Error("none of " + labels.join(", ") + " clear on screen");
    await p.mouse.click(hit.q.x, hit.q.y); await p.mouse.move(1, 1);
    return hit.l;
  };
  const desc = (p) => p.evaluate(() => { const d = document.querySelector("#p-desc"), n = document.querySelector("#p-note"); return { hidden: d.hidden, loading: d.classList.contains("loading"), text: d.textContent, note: n.innerText, title: document.querySelector("#p-title").textContent, panel: !document.querySelector("#panel").hidden }; });
  const BAKE = ["Kneading", "Proofing", "Starter Basics"];
  {
    const { ctx, p, errs, calls, bodies } = await open(width, { describe: "ok" });
    try {
      const l1 = await openNode(p, BAKE);
      await p.waitForTimeout(250);
      const ld = await desc(p);
      ok(ld.panel && ld.title === l1 && !ld.hidden && ld.loading && ld.text === "" && !/What do you notice here\?/.test(ld.note), `${tag}: backfill: a node without a description shows a faint placeholder while it is written`, JSON.stringify(ld));
      await shot(p, `nodes-desc-${TAG}-${width}-loading.png`);
      await p.waitForTimeout(1100);
      const d1 = await desc(p);
      const asked = (bodies[0] && bodies[0].material || []).map((m) => m.label);
      ok(!d1.loading && d1.text.startsWith(l1 + ": a short plain line"), `${tag}: backfill: its description arrives in the card`, JSON.stringify(d1));
      ok(calls.length === 1 && calls[0] === "/api/ikolearn/describe" && asked[0] === l1 && BAKE.every((x) => asked.includes(x)) && asked.length <= 8, `${tag}: backfill: exactly one call, for the node with its siblings (a batch of ${asked.length})`, JSON.stringify({ calls, asked }));
      await shot(p, `nodes-desc-${TAG}-${width}-backfilled.png`);
      /* a sibling from that batch, and the same node again: instant, 0 calls */
      await p.keyboard.press("Escape"); await p.waitForTimeout(150);
      const l2 = await openNode(p, BAKE.filter((x) => x !== l1).concat(l1));
      await p.waitForTimeout(250);
      const d2 = await desc(p);
      ok(d2.title === l2 && !d2.loading && d2.text.startsWith(l2 + ": a short plain line") && calls.length === 1, `${tag}: backfill: a sibling from the batch shows its description at once (0 more calls)`, JSON.stringify({ d2, calls }));
      await p.keyboard.press("Escape"); await p.waitForTimeout(150);
      await openNode(p, [l1]); await p.waitForTimeout(250);
      ok(!(await desc(p)).loading && calls.length === 1, `${tag}: backfill: reopening the same card: 0 calls`, calls.join());
      /* reload: the descriptions were saved with the cloud */
      await p.reload({ waitUntil: "networkidle" }); await p.waitForTimeout(250);
      if (await p.locator("#cloud").isHidden()) await p.click("#thumb"); await p.mouse.move(1, 1); /* a reload lands on the cloud */
      await openNode(p, [l1]); await p.waitForTimeout(250);
      const d3 = await desc(p);
      ok(!d3.loading && d3.text.startsWith(l1 + ": a short plain line") && calls.length === 1, `${tag}: backfill: after a reload: shown at once, 0 calls (cached in the saved cloud)`, JSON.stringify({ d3, calls }));
      ok(errs.length === 0, `${tag}: backfill: no console errors`, errs.join(" | "));
    } catch (e) { fails.push(`${tag}: backfill threw -> ${String(e.message || e).split("\n").slice(0, 4).join(" / ")}`); }
    await ctx.close();
  }
  {
    /* a failure: quiet, the old line comes back, no Try again, and it is not asked again this session */
    const { ctx, p, errs, calls } = await open(width, { describe: "fail" });
    try {
      const l1 = await openNode(p, BAKE);
      await p.waitForTimeout(500);
      const f1 = await desc(p);
      const again = await p.evaluate(() => [...document.querySelectorAll("#panel button")].some((b) => /try again/i.test(b.textContent)));
      ok(f1.hidden && /What do you notice here\?/.test(f1.note) && !again && calls.filter((c) => /describe$/.test(c)).length === 1, `${tag}: backfill failure: the description hides, "What do you notice here?" comes back, no Try again (one call)`, JSON.stringify({ f1, calls }));
      await p.keyboard.press("Escape"); await p.waitForTimeout(150);
      await openNode(p, [l1]); await p.waitForTimeout(400);
      ok(calls.filter((c) => /describe$/.test(c)).length === 1, `${tag}: backfill failure: not asked again this session`, calls.join());
      ok(errs.length === 0, `${tag}: backfill failure: no console errors`, errs.join(" | "));
    } catch (e) { fails.push(`${tag}: backfill failure threw -> ${String(e.message || e).split("\n").slice(0, 4).join(" / ")}`); }
    await ctx.close();
  }
  /* 5. other cloud screens: a guide's learner, a new learner's first cloud; reduced motion keeps it off */
  for (const [name, o] of [["guide mode learner's cloud", { guide: true }], ["a new learner's first cloud", { fresh: true, hint: true }]]) {
    const { ctx, p, errs, calls } = await open(width, o);
    try {
      const a = await turn(p, 1200);
      await p.waitForTimeout(2900);
      const b = await turn(p, 1200);
      ok(!a.on && Math.abs(a.d) < 1e-6 && b.on && b.d > 0, `${tag}: ${name}: spins after the idle delay`, JSON.stringify({ a: a.d, b: b.d }));
      if (o.guide) ok(/Maya/.test(await p.evaluate(() => (document.querySelector("#who-now") || {}).textContent || "")), `${tag}: ${name}: fixture is a guide's learner`);
      ok(calls.length === 0 && errs.length === 0, `${tag}: ${name}: 0 calls, no errors`, calls.join() + errs.join(" | "));
      if (o.fresh) await shot(p, `spin-${TAG}-${width}-new-learner.png`);
    } catch (e) { fails.push(`${tag}: ${name} threw -> ${String(e.message || e).split("\n")[0]}`); }
    await ctx.close();
  }
  {
    const { ctx, p } = await open(width, { reduce: true });
    try {
      await p.waitForTimeout(4200);
      const r = await turn(p, 1500);
      ok(!r.on && Math.abs(r.d) < 1e-6, `${tag}: reduced motion: no spin`);
    } catch (e) { fails.push(`${tag}: reduced threw -> ${String(e.message || e).split("\n")[0]}`); }
    await ctx.close();
  }
}
await browser.close();
server.close();
if (fails.length) { console.error(`ikolearn cloud e2e: ${pass} passed, ${fails.length} FAILED`); for (const f of fails) console.error("  x " + f); process.exit(1); }
console.log(`ikolearn cloud e2e: ${pass} passed`);
