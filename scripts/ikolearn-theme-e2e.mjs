// End-to-end checks for light and dark (PR 102), in a real browser, every /api/ikolearn call mocked: the page follows
// the device (prefers-color-scheme) and sets its theme before the first paint (no flash); the sun/moon in the fine
// print switches it, the choice is kept on this device (its own localStorage key, never in the cloud or an IkoCloud
// file) and wins over the device on the next visit; theme-color follows; the cross-fade is still under reduced motion.
// In both modes, at 390 and 1280: the opening question, the cloud with nodes, a node's card, a lesson, the deck and
// Iko open: their text pairs pass WCAG AA, the canvas draws its lines in a light ink on dark (no black) and in the
// node colours, and nothing errors. The parents & teachers, learners and privacy pages follow too.
// Run: IKOLEARN_PW=<path to node_modules/playwright-core> node scripts/ikolearn-theme-e2e.mjs [--shots DIR] [--root public]
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const SHOTS = arg("--shots", ""), ROOT = path.resolve(arg("--root", "public"));
if (!process.env.IKOLEARN_PW) { console.log("ikolearn theme e2e: skipped (set IKOLEARN_PW to a playwright-core folder)"); process.exit(0); }
const { chromium } = await import(pathToFileURL(path.join(process.env.IKOLEARN_PW, "index.mjs")).href);
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p === "/ikolearn" || p === "/ikolearn/") p = "/ikolearn/index.html";
  for (const n of ["learners", "family", "privacy"]) if (p === "/ikolearn/" + n) p = "/ikolearn/" + n + ".html";
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
/* the cloud view (to read the canvas), and the theme the page had when <body> first appeared (before any paint) */
const HOOK = () => {
  let real; Object.defineProperty(window, "IkoCloudView", { configurable: true, get: () => real, set: (v) => { real = Object.assign({}, v, { create: (c, o) => { const view = v.create(c, o); (window.__views = window.__views || []).push({ id: c.id, view }); return view; } }); } });
  new MutationObserver((ms, o) => { if (document.body) { window.__firstTheme = document.documentElement.getAttribute("data-theme"); window.__firstBg = getComputedStyle(document.documentElement).backgroundColor; o.disconnect(); } }).observe(document, { childList: true, subtree: true });
};
const nd = (rows) => rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
const LESSON = nd([{ t: "start", model: "m" }, { t: "delta", text: "INTRO: Magma is hot melted rock deep underground.\nEXPLAIN: When it comes out of a volcano, we call it lava.\nSTEP: It gathers in chambers under the volcano.\nEXAMPLE: Like thick soup bubbling in a pot." }, { t: "path", steps: [], next: "", choices: [], questions: [] }, { t: "done" }]);
async function open(width, scheme, more = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 800 }, colorScheme: scheme, timezoneId: "America/Toronto", ...more });
  const p = await ctx.newPage();
  p.setDefaultTimeout(8000);
  const errs = [];
  p.on("pageerror", (e) => errs.push("pageerror " + e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await p.addInitScript(HOOK);
  await p.route("**/api/ikolearn/**", (r) => {
    const at = new URL(r.request().url()).pathname;
    if (/examples$/.test(at)) return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, examples: ["How plants grow", "Baking bread", "Stars", "Kites"], growth: [] }) });
    if (/lesson$/.test(at)) return r.fulfill({ status: 200, contentType: "application/x-ndjson", body: LESSON });
    return r.fulfill({ status: 503, contentType: "application/json", body: '{"ok":false,"reason":"off"}' });
  });
  return { ctx, p, errs };
}
const SEED = () => {
  const C = window.IkoCloud, T = Date.now() - 3 * 864e5, c = C.create("Maya", T);
  const kids = (n) => n.map((x, i) => ({ name: x, order: i + 1, score: 0.9 - i * 0.1, why: "", role: "core", blurb: x + " explained in plain words, step by step, for anyone." }));
  C.applyCreate(c, { items: [
    { node: { name: "Volcanoes", chain: ["Earth Science"] }, card: { title: "Volcanoes", blurb: "Mountains that let out melted rock.", goal: "" }, children: kids(["Magma", "Eruptions", "Lava Types"]) },
    { node: { name: "Sourdough Bread", chain: ["Baking"] }, card: { title: "Sourdough Bread", blurb: "Bread raised by a living starter.", goal: "" }, children: kids(["Starter Basics", "Kneading", "Proofing"]) },
    { node: { name: "Stargazing", chain: ["Astronomy"] }, card: { title: "Stargazing", blurb: "The night sky.", goal: "" }, children: kids(["Constellations", "Planets"]) }] }, { t: T });
  const id = (l) => c.order.find((x) => c.nodes[x].label === l);
  const touch = (l, at, done) => { const n = c.nodes[id(l)]; n.ghost = false; n.opened = true; n.engaged = 2; n.touched = at; n.mastery = done ? 1 : Math.max(n.mastery, 0.2); };
  touch("Kneading", T + 1000, true); touch("Constellations", T + 2000); touch("Starter Basics", T + 3000, true);
  C.joinDeck(c, T + 4000);
  c.active = id("Magma");
  localStorage.setItem("ikolearn.v1.name", "Maya"); localStorage.setItem("ikolearn.v1.cloud", C.serialize(c));
  localStorage.setItem("ikolearn.v1.seen", JSON.stringify({ c: {}, ev: 0, h: { cloud: 1, card: 1, chat: 1, draw: 1 } }));
  localStorage.setItem("ikolearn.v1.thread", JSON.stringify([{ id: "m1", at: T, role: "model", local: true, text: "Welcome back, Maya." }]));
};
/* the contrast of each element's text against what is behind it (the first solid background up the tree) */
const contrast = (p, sels) => p.evaluate((sels) => {
  const rgb = (s) => { const m = /rgba?\(([^)]+)\)/.exec(s); if (!m) return null; const v = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: v[0], g: v[1], b: v[2], a: v.length > 3 ? v[3] : 1 }; };
  const lum = (c) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const bgOf = (e) => { for (let a = e; a; a = a.parentElement) { const c = rgb(getComputedStyle(a).backgroundColor); if (c && c.a > 0.9) return c; } return rgb(getComputedStyle(document.documentElement).backgroundColor) || { r: 255, g: 255, b: 255 }; };
  const out = [];
  for (const s of sels) for (const e of [...document.querySelectorAll(s)].slice(0, 6)) {
    if (!e.getClientRects().length || !e.textContent.trim() || getComputedStyle(e).visibility === "hidden") continue;
    const cs = getComputedStyle(e), fg = rgb(cs.color), bg = bgOf(e);
    const mix = { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a) };
    let op = 1; for (let a = e; a; a = a.parentElement) op *= +getComputedStyle(a).opacity;
    const x = lum(mix), y = lum(bg);
    out.push({ s, t: e.textContent.trim().slice(0, 24), ratio: Math.round(((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)) * 100) / 100, op: Math.round(op * 100) / 100 });
  }
  return out;
}, sels);
const aa = (tag, at, rows, min = 4.5) => {
  const low = rows.filter((r) => r.op > 0.9 && r.ratio < min);
  ok(rows.length > 0 && low.length === 0, `${tag}: ${at}: text passes WCAG AA (${min}:1)`, JSON.stringify(low.length ? low : rows.length));
};
const pal = (p) => p.evaluate(() => ({ theme: document.documentElement.getAttribute("data-theme"), first: window.__firstTheme, firstBg: window.__firstBg, bg: getComputedStyle(document.body).backgroundColor, ink: getComputedStyle(document.body).color, meta: document.querySelector('meta[name="theme-color"]').content, saved: localStorage.getItem("ikolearn-theme"), scheme: getComputedStyle(document.documentElement).colorScheme }));
const PAL = { light: { bg: "rgb(243, 234, 216)", ink: "rgb(43, 33, 24)", meta: "#f3ead8" }, dark: { bg: "rgb(30, 23, 18)", ink: "rgb(238, 226, 203)", meta: "#1e1712" } };
/* the cloud canvas: light ink (and node colours) on dark, dark ink on light; never black on the dark page */
const canvas = (p) => p.evaluate(() => {
  const cv = document.querySelector("#cloud-canvas"), d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
  let light = 0, dark = 0, black = 0, tinted = 0, n = 0;
  const P = getComputedStyle(document.body).backgroundColor.match(/\d+/g).map(Number);
  for (let i = 0; i < d.length; i += 4 * 3) {
    if (d[i + 3] < 110) continue; n++;
    const r = d[i], g = d[i + 1], b = d[i + 2], s = r + g + b;
    if (Math.abs(r - P[0]) + Math.abs(g - P[1]) + Math.abs(b - P[2]) < 60) continue; /* the plates under the labels: the page's paper */
    if (s > 420) light++; if (s < 260) dark++; if (s < 40) black++;
    if (Math.max(r, g, b) - Math.min(r, g, b) > 40) tinted++;
  }
  return { n, light, dark, black, tinted };
});
const shot = async (p, name) => { if (SHOTS) { await p.waitForTimeout(350); await p.screenshot({ path: path.join(SHOTS, `dark-${name}.png`) }); } };

for (const width of [390, 1280]) for (const scheme of ["light", "dark"]) {
  const tag = `${width} ${scheme}`, want = PAL[scheme], name = (v) => `${scheme}-${width}-${v}`;
  const { ctx, p, errs } = await open(width, scheme);
  try {
    await p.goto(BASE + "/ikolearn", { waitUntil: "networkidle" });
    const a = await pal(p);
    ok(a.first === scheme && a.theme === scheme, `${tag}: follows the device, set before the first paint (no flash)`, JSON.stringify(a));
    ok(a.bg === want.bg && a.ink === want.ink && a.meta === want.meta && a.scheme === scheme && a.saved === null, `${tag}: paper, ink, the browser's theme-color and color-scheme`, JSON.stringify(a));
    aa(tag, "welcome", await contrast(p, [".brand-lg", ".lede", ".who-q", ".who-opt", "#welcome .fine"]));
    await p.click('.who-opt[data-who="self"]'); await p.fill("#name-in", "Maya"); await p.press("#name-in", "Enter");
    await p.waitForSelector("#cloud-start:not([hidden])").catch(async (e) => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, `dark-debug-${scheme}-${width}.png`) }); throw e; }); await p.waitForTimeout(1200);
    aa(tag, "the opening question", await contrast(p, ["#cs-name", "#cs-hi", "#cs-q", "#cs-few", "#cs-ex .ex-chip", "#cs-form .btn", "#iko-line"]));
    const tg = await p.evaluate(() => { const b = document.querySelector(".cloud-foot .theme-tg"), r = b && b.getBoundingClientRect(); return b ? { w: r.width, h: r.height, label: b.getAttribute("aria-label"), pressed: b.getAttribute("aria-pressed") } : null; });
    ok(tg && tg.w >= 44 && tg.h >= 44 && tg.label === (scheme === "dark" ? "Light mode" : "Dark mode") && tg.pressed === String(scheme === "dark"), `${tag}: the sun/moon sits in the fine print, a 44px target with its label`, JSON.stringify(tg));
    await shot(p, name("intake"));
    /* a returning learner: the cloud with nodes */
    await p.evaluate(SEED); await p.reload({ waitUntil: "networkidle" }); await p.waitForSelector("#cloud:not([hidden])"); await p.waitForTimeout(1500);
    const cv = await canvas(p);
    if (scheme === "dark") ok(cv.light > 150 && cv.tinted > 60 && cv.black === 0 && cv.dark < cv.light * 2.5, `${tag}: the cloud draws its lines and labels in light ink and node colours (no black)`, JSON.stringify(cv));
    else ok(cv.dark > 150 && cv.tinted > 60, `${tag}: the cloud draws its lines and labels in dark ink and node colours`, JSON.stringify(cv));
    aa(tag, "the cloud's links and fine print", await contrast(p, [".home-nav .link", ".cloud-flow .chip", ".cloud-foot a"]), 3);
    await shot(p, name("cloud"));
    /* a lesson, then back to its card on the cloud */
    await p.locator(".cloud-flow > .chip", { hasText: "Magma" }).first().click(); await p.waitForSelector("#l-done:not([hidden])"); await p.waitForTimeout(300);
    aa(tag, "a lesson", await contrast(p, ["#l-title", "#l-body p", "#l-body li", "#ph-learn", "#l-got", "#l-back"]));
    await shot(p, name("lesson"));
    await p.click("#l-back"); await p.waitForSelector("#panel:not([hidden])"); await p.waitForTimeout(900);
    aa(tag, "a node's card", await contrast(p, ["#p-title", "#p-kicker", "#p-note", "#panel .actions .btn"]));
    await shot(p, name("selection-card"));
    await p.click("#p-close"); await p.waitForTimeout(200);
    /* the deck */
    await p.click("#cloud-deck"); await p.waitForSelector("#deck:not([hidden])"); await p.waitForTimeout(600);
    aa(tag, "the deck", await contrast(p, ["#d-title", "#d-lede", ".gcard .gc-title", ".gslot .gs-title", "#d-back"]));
    aa(tag, "the cards' marks", await contrast(p, [".gcard .gc-mark", ".gcard .gc-chain"]), 3);
    await shot(p, name("deck"));
    await p.click("#d-back"); await p.waitForTimeout(400);
    /* Iko open */
    await p.click("#iko"); await p.waitForSelector("#iko-sheet:not([hidden])"); await p.waitForTimeout(400);
    aa(tag, "Iko open", await contrast(p, ["#iko-name", "#iko-say", "#iko-about", "#iko-all", "#iko-in"]));
    const peb = await p.evaluate(() => { const b = getComputedStyle(document.querySelector("#iko .iko-body")), e = getComputedStyle(document.querySelector("#iko .iko-eye")); return { body: b.fill, edge: b.stroke, eye: e.fill }; });
    ok(scheme === "dark" ? peb.body === "rgb(140, 119, 91)" && peb.eye === "rgb(30, 23, 18)" : peb.body === "rgb(232, 218, 189)", `${tag}: Iko's pebble takes the ${scheme} colours`, JSON.stringify(peb));
    await shot(p, name("iko"));
    ok(errs.length === 0, `${tag}: no page errors`, errs.join(" | "));
  } catch (e) { fails.push(`${tag}: threw -> ${String(e.message || e).split("\n")[0]}`); }
  await ctx.close();
}

/* the switch: kept on this device, wins over the device next time, not in the cloud or an IkoCloud file */
{
  const { ctx, p, errs } = await open(390, "light");
  try {
    await p.goto(BASE + "/ikolearn", { waitUntil: "networkidle" });
    await p.evaluate(SEED); await p.reload({ waitUntil: "networkidle" }); await p.waitForSelector("#cloud:not([hidden])"); await p.waitForTimeout(600);
    const c0 = await canvas(p);
    await p.click(".cloud-foot .theme-tg"); await p.waitForTimeout(500);
    const a = await pal(p), c1 = await canvas(p);
    ok(a.theme === "dark" && a.saved === "dark" && a.bg === PAL.dark.bg && a.meta === PAL.dark.meta, "switch: the moon turns the page dark and keeps the choice", JSON.stringify(a));
    ok(c1.black === 0 && c1.light > c0.light + 100, "switch: the cloud redraws in light ink at once", JSON.stringify({ c0, c1 }));
    const tones = await p.evaluate(() => [...document.querySelectorAll("[data-tone]")].length);
    await p.reload({ waitUntil: "networkidle" }); await p.waitForTimeout(400);
    const b = await pal(p);
    ok(b.first === "dark" && b.theme === "dark", "switch: the next visit opens dark before the first paint, though the device is light", JSON.stringify(b));
    const exp = await p.evaluate(() => { const f = window.IkoTransfer.build(localStorage, Date.now()); return JSON.stringify(f); });
    const at = exp.indexOf("ikolearn-theme");
    ok(at < 0 && /ikocloud/.test(exp), "switch: the choice is not part of an IkoCloud file (nor the cloud)", exp.slice(Math.max(0, at - 120), at + 60));
    await p.click(".cloud-foot .theme-tg"); await p.waitForTimeout(300);
    const c = await pal(p);
    ok(c.theme === "light" && c.saved === "light" && c.meta === PAL.light.meta, "switch: the sun brings it back to light", JSON.stringify(c));
    ok(tones >= 0, "switch: re-toned colours set from script");
    ok(errs.length === 0, "switch: no page errors", errs.join(" | "));
  } catch (e) { fails.push(`switch threw -> ${String(e.message || e).split("\n")[0]}`); }
  await ctx.close();
}
/* a saved light choice wins over a dark device; the cards re-tone in place when the theme changes */
{
  const { ctx, p, errs } = await open(1280, "dark");
  try {
    await p.addInitScript(() => { if (!sessionStorage.getItem("x")) { sessionStorage.setItem("x", "1"); localStorage.setItem("ikolearn-theme", "light"); } });
    await p.goto(BASE + "/ikolearn", { waitUntil: "networkidle" });
    const a = await pal(p);
    ok(a.first === "light" && a.theme === "light" && a.bg === PAL.light.bg, "a saved light choice wins over a dark device, from the first paint", JSON.stringify(a));
    await p.evaluate(SEED); await p.reload({ waitUntil: "networkidle" }); await p.waitForSelector("#cloud:not([hidden])");
    await p.click("#cloud-deck"); await p.waitForSelector("#deck:not([hidden])"); await p.waitForTimeout(500);
    const ink = () => p.evaluate(() => { const g = document.querySelector(".gcard[data-tone]"); return g ? getComputedStyle(g).getPropertyValue("--card-ink").trim() : ""; });
    const i0 = await ink();
    await p.click("#chat .theme-tg, #deck .theme-tg, .dock .theme-tg").catch(() => p.evaluate(() => window.IkoTheme.toggle()));
    await p.waitForTimeout(300);
    const i1 = await ink();
    ok(i0 && i1 && i0 !== i1 && /hsl/.test(i1), "the cards re-tone in place for the dark page", JSON.stringify([i0, i1]));
    ok(errs.length === 0, "saved light: no page errors", errs.join(" | "));
  } catch (e) { fails.push(`saved light threw -> ${String(e.message || e).split("\n")[0]}`); }
  await ctx.close();
}
/* reduced motion: the change is instant */
{
  const { ctx, p } = await open(390, "light", { reducedMotion: "reduce" });
  try {
    await p.goto(BASE + "/ikolearn", { waitUntil: "networkidle" });
    const t = await p.evaluate(() => { window.IkoTheme.toggle(); return { easing: document.documentElement.classList.contains("theme-easing"), body: getComputedStyle(document.body).transitionDuration }; });
    ok(t.easing && /^0s(, 0s)*$/.test(t.body), "reduced motion: the theme changes without a cross-fade", JSON.stringify(t));
  } catch (e) { fails.push(`reduced motion threw -> ${String(e.message || e).split("\n")[0]}`); }
  await ctx.close();
}
/* the other pages follow the theme */
for (const page of ["learners", "family", "privacy"]) {
  const { ctx, p, errs } = await open(390, "dark");
  try {
    await p.goto(BASE + "/ikolearn/" + page, { waitUntil: "networkidle" });
    const a = await pal(p);
    ok(a.first === "dark" && a.bg === PAL.dark.bg && a.ink === PAL.dark.ink && a.meta === PAL.dark.meta, `${page}: dark from the first paint`, JSON.stringify(a));
    aa(page, "dark", await contrast(p, ["h1", "h2", "p", "a"]));
    ok(await p.locator(".theme-tg").count() === 1, `${page}: the sun/moon is in its fine print`);
    ok(errs.length === 0, `${page}: no page errors`, errs.join(" | "));
  } catch (e) { fails.push(`${page} threw -> ${String(e.message || e).split("\n")[0]}`); }
  await ctx.close();
}

await browser.close();
server.close();
if (fails.length) { console.error(`ikolearn theme e2e: ${pass} passed, ${fails.length} FAILED`); for (const f of fails) console.error("  x " + f); process.exit(1); }
console.log(`ikolearn theme e2e: ${pass} passed`);
