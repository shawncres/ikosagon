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
  const kids = (n, m) => n.map((x, i) => ({ name: x, order: i + 1, score: 0.9 - i * 0.1, why: "", role: "core", motif: m[i] }));
  const items = [
    { node: { name: "Volcanoes", chain: ["Earth Science"], motif: "mountain" }, card: { title: "Volcanoes", blurb: "Mountains that let out melted rock.", goal: "" }, children: kids(["Magma", "Eruptions", "Lava Types"], ["flame", "mountain", "drop"]) },
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
  await p.route("**/api/ikolearn/**", (r) => { const at = new URL(r.request().url()).pathname; if (!/examples$/.test(at)) calls.push(at); return r.fulfill({ status: 503, contentType: "application/json", body: '{"ok":false,"reason":"off"}' }); });
  await p.goto(BASE + "/ikolearn", { waitUntil: "networkidle" });
  await p.evaluate(SEED, o);
  await p.reload({ waitUntil: "networkidle" });
  await p.waitForTimeout(250);
  await p.click("#thumb");
  await p.mouse.move(1, 1);
  return { ctx, p, errs, calls };
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
      await p.waitForTimeout(2600); /* ~4.1 s since opening */
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
      const view = await p.evaluate(() => ({ iw: innerWidth, ih: innerHeight, sw: document.documentElement.scrollWidth, side: document.querySelector("#panel").getAttribute("data-side"), radius: getComputedStyle(document.querySelector("#panel")).borderTopLeftRadius, title: document.querySelector("#p-title").textContent, note: document.querySelector("#p-note").innerText, acts: [...document.querySelectorAll("#panel .actions .btn:not([hidden])")].map((b) => b.textContent), path: document.querySelectorAll("#p-path li").length }));
      ok(card && !inside(node, card), `${tag}: the card does not cover the selected node`, JSON.stringify({ node, card }));
      ok(card && gap(node, card) <= 70, `${tag}: the card sits next to the node (${Math.round(card ? gap(node, card) : -1)} px away)`, JSON.stringify({ node, card }));
      ok(card && card.l >= 0 && card.r <= view.iw && card.t >= 0 && card.b <= view.ih && view.sw <= view.iw, `${tag}: the card is inside the viewport (no overflow)`, JSON.stringify({ card, view }));
      ok(view.side === (width >= 900 ? "right" : "below") && parseFloat(view.radius) >= 10, `${tag}: a rounded card ${width >= 900 ? "to the right of" : "under"} the node`, JSON.stringify(view));
      ok(view.title === "Volcanoes" && /What do you notice here\?/.test(view.note) && JSON.stringify(view.acts.slice(0, 3)) === JSON.stringify(["Start a lesson", "Open its card", "Talk in chat"]) && view.path >= 3, `${tag}: the card: title, "What do you notice here?", the three actions and the path`, JSON.stringify(view));
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
      /* Talk in chat: back to the chat on that topic (0 calls) */
      await p.click("#thumb"); await p.mouse.move(1, 1); await p.waitForTimeout(300);
      await p.click("#zreset"); await settle(p);
      const pk = await at(p, "Volcanoes"); await p.mouse.click(pk.x, pk.y); await settle(p);
      await p.click("#p-chat"); await p.waitForTimeout(300);
      const chat = await p.evaluate(() => ({ cloud: document.querySelector("#cloud").hidden, focus: (document.querySelector(".focus") || {}).innerText || "" }));
      ok(chat.cloud && calls.length === 0, `${tag}: "Talk in chat" goes back to the chat (0 calls)`, JSON.stringify(chat));
      /* Start a lesson: the lesson opens (its one call is answered by the mock) */
      await p.click("#thumb"); await p.mouse.move(1, 1); await p.waitForTimeout(300);
      await p.click("#zreset"); await settle(p);
      const pl = await at(p, "Magma"); await p.mouse.click(pl.x, pl.y); await settle(p);
      await p.click("#p-lesson"); await p.waitForTimeout(500);
      const les = await p.evaluate(() => ({ cloud: document.querySelector("#cloud").hidden, lesson: !document.querySelector("#lesson").hidden, title: document.querySelector("#l-title").textContent }));
      ok(les.cloud && les.lesson && les.title === "Magma" && calls.length === 1 && calls[0] === "/api/ikolearn/lesson", `${tag}: "Start a lesson" opens that lesson (one lesson request, mocked)`, JSON.stringify({ les, calls }));
      ok(errs.length === 0, `${tag}: no console errors`, errs.join(" | "));
    } catch (e) { fails.push(`${tag}: main threw -> ${String(e.message || e).split("\n").slice(0, 6).join(" / ")}`); }
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
