// End-to-end checks for the big cloud in a real browser, every /api/ikolearn call mocked (no model calls):
// the idle spin (starts after the idle delay, eases in, stops at once on a drag / wheel / key and comes back after the
// same delay, waits out a focus glide, keeps turning beside the node panel about the focused node, pauses while the tab
// is hidden or something covers the cloud, off with reduced motion) on each cloud screen, and the node panel (on the
// left on wide screens, the focused node centred right of it and never under it; a bottom sheet on phones; no overflow).
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

for (const width of [390, 1280]) {
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
      /* a drag stops it at once */
      const spot = await emptySpot(p), cx = spot.x, cy = spot.y;
      await p.mouse.move(cx, cy); await p.mouse.down();
      const down = await turn(p, 400);
      ok(!down.on && Math.abs(down.d) < 1e-6, `${tag}: a drag stops the spin at once`, JSON.stringify({ d: down.d, on: down.on }));
      await p.mouse.move(cx + 50, cy - 10, { steps: 6 }); await p.mouse.up(); await p.mouse.move(1, 1);
      await settle(p).catch(() => {});
      const after = await turn(p, 2000);
      ok(!after.on && Math.abs(after.d) < 1e-6, `${tag}: ... and stays still for the idle delay after it`, JSON.stringify(after.d));
      await p.waitForTimeout(2600);
      const back = await turn(p, 1000);
      ok(back.on && back.d > 0, `${tag}: ... then comes back by itself`);
      /* the wheel and a key stop it too */
      const sp2 = await emptySpot(p);
      await p.mouse.move(sp2.x, sp2.y); await p.mouse.wheel(0, -40); await p.mouse.move(1, 1);
      const wh = await turn(p, 300);
      ok(!wh.on, `${tag}: the wheel stops it`);
      await p.waitForTimeout(4200);
      ok((await st(p)).spinning, `${tag}: ... back after the delay`);
      await p.keyboard.press("Shift");
      const key = await turn(p, 300);
      ok(!key.on && Math.abs(key.d) < 1e-6, `${tag}: a key stops it`);
      /* hidden tab */
      await p.waitForTimeout(4200);
      await p.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, get: () => true }); document.dispatchEvent(new Event("visibilitychange")); });
      const hid = await turn(p, 1500);
      ok(!hid.on && Math.abs(hid.d) < 1e-6, `${tag}: paused while the tab is hidden`, JSON.stringify(hid.d));
      await p.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, get: () => false }); document.dispatchEvent(new Event("visibilitychange")); });
      const vis = await turn(p, 1500);
      await p.waitForTimeout(2600);
      const vis2 = await turn(p, 800);
      ok(!vis.on && Math.abs(vis.d) < 1e-6 && vis2.on && vis2.d > 0, `${tag}: visible again: waits the idle delay, then spins`, JSON.stringify({ vis: vis.d, vis2: vis2.d }));

      /* 2. a focused parent: the glide is waited out, the node lands clear of the panel, the spin turns about it */
      ok(await p.evaluate(() => !document.querySelector("#cloud").hidden), `${tag}: still on the cloud after the drag, wheel and key`);
      await p.click("#zreset"); await p.mouse.move(1, 1); await settle(p);
      const pt = await at(p, "Volcanoes");
      await p.mouse.click(pt.x, pt.y); await p.mouse.move(1, 1);
      const glide = await st(p);
      ok(glide.moving && !glide.spinning, `${tag}: tapping a node glides to it (no spin during the glide)`);
      await settle(p);
      const geo = await p.evaluate(() => {
        const r = (q) => { const e = document.querySelector(q); if (!e || e.hidden) return null; const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width }; };
        return { panel: r("#panel"), close: r("#cloud-close"), zoom: r(".cloud-top .zoom"), hint: r(".cloud-hint"), cv: r("#cloud-canvas"), sw: document.documentElement.scrollWidth, iw: window.innerWidth, pScroll: document.querySelector("#panel").scrollWidth - document.querySelector("#panel").clientWidth };
      });
      const node = await at(p, "Volcanoes");
      const inside = (pt, b) => b && pt.x >= b.l && pt.x <= b.r && pt.y >= b.t && pt.y <= b.b;
      const hit = (a, b) => a && b && a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
      ok(geo.panel && !inside(node, geo.panel) && node.x > 0 && node.x < geo.iw && node.y > 50 && node.y < (width < 900 ? geo.panel.t : geo.cv.b), `${tag}: the focused node is not covered by the panel`, JSON.stringify({ node, panel: geo.panel }));
      if (width >= 900) {
        ok(geo.panel.l >= 0 && geo.panel.l <= 24 && geo.panel.r <= 420 && Math.abs(geo.panel.w - 380) < 4, `${tag}: the node panel opens on the left (same width)`, JSON.stringify(geo.panel));
        ok(Math.abs(node.x - (400 + (width - 400) / 2)) < 30 && Math.abs(node.y - geo.cv.b / 2) < 40, `${tag}: the focused node is centred in the free area right of the panel`, JSON.stringify(node));
        ok(!hit(geo.close, geo.panel) && !hit(geo.zoom, geo.panel) && !hit(geo.hint, geo.panel), `${tag}: nothing on the cloud's top row collides with the panel (back link, zoom, hint)`, JSON.stringify(geo));
      } else {
        ok(geo.panel.l === 0 && Math.round(geo.panel.r) === width && geo.panel.b <= 845 && geo.panel.t > 200, `${tag}: phones keep the bottom sheet`, JSON.stringify(geo.panel));
      }
      ok(geo.sw <= geo.iw && geo.pScroll <= 0, `${tag}: no sideways overflow with the panel open`, JSON.stringify({ sw: geo.sw, iw: geo.iw, p: geo.pScroll }));
      await shot(p, `panel-left-${TAG}-${width}-focused.png`);
      const n0 = await at(p, "Volcanoes");
      await p.waitForTimeout(3900);
      const foc = await turn(p, 1500);
      const n1 = await at(p, "Volcanoes");
      ok(foc.on && foc.d > 0, `${tag}: a focused parent (panel open) spins after the idle delay`, JSON.stringify({ d: foc.d, held: foc.b.held }));
      ok(Math.hypot(n1.x - n0.x, n1.y - n0.y) < 1.5, `${tag}: ... about the focused node, which stays put (still clear of the panel)`, JSON.stringify({ n0, n1 }));
      await shot(p, `spin-${TAG}-${width}-focused.png`);
      /* a sheet that covers most of the cloud holds it (phones) */
      if (width < 900) {
        await p.addStyleTag({ content: "#panel { max-height: none !important; height: 92vh !important; }" });
        await p.waitForTimeout(400);
        const cov = await turn(p, 1200);
        ok(!cov.on && Math.abs(cov.d) < 1e-6 && cov.b.held, `${tag}: paused while the panel covers most of the cloud`, JSON.stringify({ d: cov.d, held: cov.b.held }));
        await p.evaluate(() => document.querySelectorAll("style").forEach((s) => { if (/92vh/.test(s.textContent)) s.remove(); }));
        await p.waitForTimeout(400);
        ok(!(await st(p)).held, `${tag}: ... and lets go once it no longer does`);
      }
      /* 3. the whole-cloud panel (tap the name): the cloud moves clear of it */
      await p.click("#p-close"); await p.mouse.move(1, 1); await p.waitForTimeout(200);
      const rootPt = await p.evaluate(() => { const v = window.__views.filter((x) => x.id === "cloud-canvas").pop().view, s = v.state(), r = document.querySelector("#cloud-canvas").getBoundingClientRect(); return { x: r.left + r.width / 2 + s.panX, y: r.top + r.height / 2 + s.panY }; });
      await p.waitForTimeout(100);
      const root0 = await p.evaluate(() => window.__views.filter((x) => x.id === "cloud-canvas").pop().view.state());
      await p.evaluate(() => { const v = window.__views.filter((x) => x.id === "cloud-canvas").pop().view; v.recentre(); });
      await settle(p);
      const home = await p.evaluate(() => window.__views.filter((x) => x.id === "cloud-canvas").pop().view.state());
      const rp = await p.evaluate((h) => { const r = document.querySelector("#cloud-canvas").getBoundingClientRect(); return { x: r.left + r.width / 2 + h.panX, y: r.top + r.height / 2 + h.panY }; }, home);
      await p.mouse.click(rp.x, rp.y); await p.mouse.move(1, 1); await p.waitForTimeout(400);
      const rootGeo = await p.evaluate(() => { const v = window.__views.filter((x) => x.id === "cloud-canvas").pop().view.state(), b = document.querySelector("#panel").getBoundingClientRect(); return { panX: v.panX, panY: v.panY, open: !document.querySelector("#panel").hidden, title: document.querySelector("#p-title").textContent, pr: b.right, pt: b.top }; });
      ok(rootGeo.open && rootGeo.title === "Maya" && (width >= 900 ? rootGeo.panX - home.panX > 150 : home.panY - rootGeo.panY > 100), `${tag}: the whole-cloud panel moves the cloud clear of it (${width >= 900 ? "right" : "up"})`, JSON.stringify({ rootGeo, home: { x: home.panX, y: home.panY }, root0: root0.panX, rootPt }));
      await shot(p, `panel-left-${TAG}-${width}-root.png`);
      /* 4. covered: opening the card closes the cloud; the spin stops */
      await p.click("#p-close"); await p.waitForTimeout(200);
      const pm = await at(p, "Magma"); await p.mouse.click(pm.x, pm.y); await settle(p);
      await p.click("#p-card"); await p.waitForTimeout(300);
      const card = await turn(p, 1500);
      const hidden = await p.evaluate(() => document.querySelector("#cloud").hidden);
      ok(hidden && !card.on && Math.abs(card.d) < 1e-6, `${tag}: paused while the card (or a lesson) covers the cloud`, JSON.stringify({ hidden, d: card.d }));
      ok(calls.length === 0, `${tag}: 0 model calls`, calls.join());
      ok(errs.length === 0, `${tag}: no console errors`, errs.join(" | "));
    } catch (e) { fails.push(`${tag}: main threw -> ${String(e.message || e).split("\n")[0]}`); }
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
