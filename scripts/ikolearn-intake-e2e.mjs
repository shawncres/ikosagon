// End-to-end checks for the opening question on phones and in in-app browsers (PR 100), in a real browser, every
// /api/ikolearn call mocked: at 320x568, 360x640, 375x667, 390x844 and 412x915, and as Instagram/Facebook (iOS) and
// TikTok/LinkedIn (Android) in-app browsers with their shorter viewports and safe-area insets. Asserts that no box
// overlaps another (Iko, its hello line and cue, the name plate, the greeting, the question, the field, Begin, each idea,
// More and the fine print), that everything is on screen and every target is at least 44px, that the name sits centred
// above the question while the canvas leaves it out and the empty cloud holds still, that picking ideas and More keep the
// row tidy, and that with the keyboard up (a shrunk visualViewport) the field and Begin stay in view and the fine print
// steps aside.
// Run: IKOLEARN_PW=<path to node_modules/playwright-core> node scripts/ikolearn-intake-e2e.mjs [--root public]
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const ROOT = path.resolve(arg("--root", "public"));
if (!process.env.IKOLEARN_PW) { console.log("ikolearn intake e2e: skipped (set IKOLEARN_PW to a playwright-core folder)"); process.exit(0); }
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
/* the cloud view (to read the canvas) and a visualViewport the test can shrink, as an on-screen keyboard would */
const HOOK = () => {
  let real; Object.defineProperty(window, "IkoCloudView", { configurable: true, get: () => real, set: (v) => { real = Object.assign({}, v, { create: (c, o) => { const view = v.create(c, o); (window.__views = window.__views || []).push({ id: c.id, view }); return view; } }); } });
  const vv = new EventTarget(); let kb = 0;
  Object.defineProperties(vv, { height: { get: () => window.innerHeight - kb }, width: { get: () => window.innerWidth }, offsetTop: { get: () => 0 }, offsetLeft: { get: () => 0 }, scale: { get: () => 1 } });
  window.__keyboard = (h) => { kb = h; vv.dispatchEvent(new Event("resize")); };
  Object.defineProperty(window, "visualViewport", { configurable: true, get: () => vv });
};
const IOS = (app) => `Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 ${app}`;
const AND = (app) => `Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A.240205.004; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0.6367.179 Mobile Safari/537.36 ${app}`;
const SIZES = [
  { tag: "320x568", w: 320, h: 568 }, { tag: "360x640", w: 360, h: 640 }, { tag: "375x667", w: 375, h: 667 }, { tag: "390x844", w: 390, h: 844 }, { tag: "412x915", w: 412, h: 915 },
  { tag: "instagram-ios-390x664", w: 390, h: 664, ua: IOS("Instagram 330.0.0.25.86 (iPhone14,5; iOS 17_5; en_US; en; scale=3.00; 1170x2532)"), inset: { top: 47, bottom: 34 } },
  { tag: "facebook-ios-375x548", w: 375, h: 548, ua: IOS("[FBAN/FBIOS;FBAV/470.0.0.40.97;FBBV/619393640;FBDV/iPhone12,8;FBMD/iPhone;FBSN/iOS;FBSV/17.5;FBSS/2;FBCR/;FBID/phone;FBLC/en_US;FBOP/5]"), inset: { top: 20, bottom: 0 } },
  { tag: "tiktok-android-360x560", w: 360, h: 560, ua: AND("trill_340005 JsSdk/1.0 NetType/WIFI Channel/googleplay AppName/musical_ly app_version/34.0.5 ByteLocale/en"), inset: { top: 24, bottom: 0 } },
  { tag: "linkedin-android-412x775", w: 412, h: 775, ua: AND("LinkedInApp/4.1.950"), inset: { top: 24, bottom: 16 } },
];
const IDEAS = ["Stars", "Rain", "Games", "Kites", "Chess", "Gardens", "Volcanoes", "Bread"];
async function intake(s) {
  const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: s.ua, timezoneId: "America/Toronto" });
  const p = await ctx.newPage();
  p.setDefaultTimeout(8000);
  const errs = [];
  p.on("pageerror", (e) => errs.push("pageerror " + e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  if (s.inset) { const cdp = await ctx.newCDPSession(p); await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: s.inset }); }
  await p.addInitScript(HOOK);
  let more = 0;
  await p.route("**/api/ikolearn/**", (r) => {
    const at = new URL(r.request().url()).pathname.replace("/api/ikolearn", "");
    if (at === "/examples") { const k = (more++ * 3) % IDEAS.length; return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, examples: IDEAS.slice(k).concat(IDEAS.slice(0, k)), growth: ["Patience"] }) }); }
    return r.fulfill({ status: 503, contentType: "application/json", body: '{"ok":false,"reason":"off"}' });
  });
  await p.goto(BASE + "/ikolearn", { waitUntil: "networkidle" });
  await p.tap('.who-opt[data-who="self"]'); await p.fill("#name-in", "Maya"); await p.press("#name-in", "Enter");
  await p.waitForSelector("#cloud:not([hidden]) #cloud-start:not([hidden])"); await p.waitForTimeout(1200);
  return { ctx, p, errs };
}
/* every box on the opening screen that must stay apart */
const boxes = (p) => p.evaluate(() => {
  const out = [], vis = (e) => e && !e.hidden && e.getClientRects().length && getComputedStyle(e).visibility !== "hidden" && +getComputedStyle(e).opacity > 0.05;
  const add = (name, e, tap) => { if (!vis(e)) return; const r = e.getBoundingClientRect(); if (r.width && r.height) out.push({ name, tap: Boolean(tap), x: r.left, y: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }); };
  add("Iko", document.querySelector("#iko"), true);
  add("Iko's line", document.querySelector("#iko-line"));
  add("Iko's cue", document.querySelector("#iko-cue"));
  add("name", document.querySelector("#cs-name"));
  add("greeting", document.querySelector("#cs-hi"));
  add("question", document.querySelector("#cs-q"));
  add("hint", document.querySelector("#cs-few"));
  add("field", document.querySelector("#cs-in"), true);
  add("Begin", document.querySelector("#cs-form .btn"), true);
  document.querySelectorAll("#cs-ex .ex-chip").forEach((e) => add("idea " + e.textContent, e, true));
  add("More", document.querySelector("#cs-ex .ex-more"), true);
  document.querySelectorAll(".cloud-foot a").forEach((e) => add("fine print " + e.textContent, e, true));
  return { out, w: innerWidth, h: innerHeight, vh: window.visualViewport.height };
});
function layout(tag, at, L, o = {}) {
  const hits = [];
  for (let i = 0; i < L.out.length; i++) for (let j = i + 1; j < L.out.length; j++) {
    const a = L.out[i], b = L.out[j];
    if (a.x < b.r - 0.5 && b.x < a.r - 0.5 && a.y < b.b - 0.5 && b.y < a.b - 0.5) hits.push(a.name + " / " + b.name);
  }
  ok(hits.length === 0, `${tag}: ${at}: nothing overlaps (Iko, its line and cue, the name, the question, the field, Begin, the ideas, More, the fine print)`, hits.join(", "));
  const bottom = o.vh || L.h;
  const off = L.out.filter((r) => (o.skip || []).every((k) => !r.name.startsWith(k))).filter((r) => r.x < -0.5 || r.r > L.w + 0.5 || r.y < -0.5 || r.b > bottom + 0.5).map((r) => r.name + "@" + Math.round(r.y) + "-" + Math.round(r.b));
  ok(off.length === 0, `${tag}: ${at}: everything on screen`, off.join(", "));
  const small = L.out.filter((r) => r.tap && (r.h < 43.5 || r.w < 43.5)).map((r) => r.name + ":" + Math.round(r.w) + "x" + Math.round(r.h));
  ok(small.length === 0, `${tag}: ${at}: every target at least 44px`, small.join(", "));
}
const get = (L, n) => L.out.find((r) => r.name === n);

for (const s of SIZES) {
  const tag = s.tag;
  const { ctx, p, errs } = await intake(s);
  /* 1. as it opens (Iko's hello beside the pebble) */
  const L0 = await boxes(p);
  ok(Boolean(get(L0, "Iko's line")), `${tag}: Iko says hello on the opening question`);
  layout(tag, "with Iko's hello", L0);
  const nm = get(L0, "name"), hi = get(L0, "greeting"), q = get(L0, "question");
  ok(nm && hi && q && Math.abs((nm.x + nm.r) / 2 - L0.w / 2) <= 2 && nm.b <= hi.y && hi.b <= q.y + 1, `${tag}: the name sits centred above the greeting and the question`, JSON.stringify({ nm, hi, q }));
  const iko = get(L0, "Iko"), line = get(L0, "Iko's line");
  ok(iko && line && line.b < nm.y && iko.b < nm.y, `${tag}: Iko and its hello stay above the name and the question`, JSON.stringify({ iko, line, nm }));
  if (s.inset) ok(iko.y >= s.inset.top, `${tag}: Iko clears the safe area at the top`, JSON.stringify(iko));
  const canvas = await p.evaluate(async () => {
    const v = window.__views.filter((x) => x.id === "cloud-canvas").pop().view, cv = document.querySelector("#cloud-canvas"), k = cv.width / cv.clientWidth;
    const a = v.state().yaw, q = v.project("root"), g = cv.getContext("2d");
    let ink = 0; for (let dx = -40; dx <= 40; dx += 4) for (let dy = -16; dy <= 16; dy += 4) ink += g.getImageData(Math.round((q.x + dx) * k), Math.round((q.y + dy) * k), 1, 1).data[3];
    await new Promise((r) => setTimeout(r, 1200));
    return { ink, still: v.state().yaw === a, held: v.state().held, top: getComputedStyle(document.querySelector(".cloud-top")).display };
  });
  ok(canvas.ink === 0, `${tag}: the canvas leaves the name out (no second name drifting over the text)`, JSON.stringify(canvas));
  ok(canvas.still && canvas.held, `${tag}: the empty cloud holds still on the opening question (no spin)`, JSON.stringify(canvas));
  ok(canvas.top === "none", `${tag}: the zoom and turn controls step away (nothing to move yet)`);
  /* 2. ideas picked, More: the row wraps tidily */
  await p.tap('#cs-ex .ex-chip >> nth=0'); await p.tap('#cs-ex .ex-chip >> nth=1'); await p.tap("#cs-ex .ex-more"); await p.waitForTimeout(500);
  const L1 = await boxes(p);
  layout(tag, "after picking ideas and More", L1);
  const ch = L1.out.filter((r) => r.name.startsWith("idea ") || r.name === "More");
  const gaps = []; for (let i = 0; i < ch.length; i++) for (let j = i + 1; j < ch.length; j++) { const a = ch[i], b = ch[j]; if (Math.abs(a.y - b.y) < 4) { const g = Math.max(b.x - a.r, a.x - b.r); if (g < 6) gaps.push(a.name + "|" + b.name + ":" + Math.round(g)); } else if (Math.min(Math.abs(b.y - a.b), Math.abs(a.y - b.b)) < 6 && a.x < b.r && b.x < a.r) gaps.push(a.name + "|" + b.name + " rows"); }
  ok(ch.length >= 4 && gaps.length === 0, `${tag}: the ideas and More keep a clear gap, in rows and between rows`, gaps.join(", "));
  /* 3. Iko's hello folds away; its cue for the opening question shows beside the pebble, still clear of everything */
  const cue = await p.waitForFunction(() => { const c = document.querySelector("#iko-cue"); return !c.hidden && c.classList.contains("on") && +getComputedStyle(c).opacity > 0.5 ? c.textContent : null; }, null, { timeout: 13000 }).then((h) => h.jsonValue(), () => null);
  ok(cue === "Not sure? Ask me", `${tag}: once the hello has folded, the opening question's cue shows`, String(cue));
  const L2 = await boxes(p);
  layout(tag, "with Iko's cue", L2);
  const nm2 = get(L2, "name");
  ok(nm2 && Math.abs(nm2.y - nm.y) <= 1, `${tag}: the question doesn't jump when the hello folds`, JSON.stringify([nm.y, nm2 && nm2.y]));
  /* 4. the keyboard: the field and Begin stay in view above it, the fine print steps aside */
  await p.tap("#cs-in"); await p.waitForTimeout(100);
  const kb = Math.round(s.h * 0.42);
  await p.evaluate((h) => window.__keyboard(h), kb); await p.waitForTimeout(450);
  const L3 = await boxes(p), vh = s.h - kb;
  const fld = get(L3, "field"), beg = get(L3, "Begin");
  ok(fld && beg && fld.y >= 0 && beg.b <= vh && fld.b <= vh, `${tag}: with the keyboard up the field and Begin stay in view`, JSON.stringify({ fld, beg, vh }));
  ok(!L3.out.some((r) => r.name.startsWith("fine print")), `${tag}: with the keyboard up the fine print steps aside`);
  const kh = []; L3.out.forEach((a, i) => L3.out.slice(i + 1).forEach((b) => { const inA = (r) => r.b > 0 && r.y < vh; if (inA(a) && inA(b) && a.x < b.r - 0.5 && b.x < a.r - 0.5 && a.y < b.b - 0.5 && b.y < a.b - 0.5) kh.push(a.name + " / " + b.name); }));
  ok(kh.length === 0, `${tag}: with the keyboard up nothing visible overlaps`, kh.join(", "));
  await p.fill("#cs-in", "the ocean");
  ok(await p.evaluate(() => document.activeElement && document.activeElement.id === "cs-in"), `${tag}: typing keeps the field focused`);
  await p.evaluate(() => window.__keyboard(0)); await p.evaluate(() => document.activeElement.blur()); await p.waitForTimeout(450);
  const L4 = await boxes(p);
  layout(tag, "after the keyboard closes", L4);
  ok(L4.out.some((r) => r.name.startsWith("fine print")), `${tag}: the fine print is back after the keyboard closes`);
  ok(errs.length === 0, `${tag}: no page errors`, errs.join(" | "));
  await ctx.close();
}

await browser.close();
server.close();
if (fails.length) {
  console.error(`ikolearn intake e2e: ${pass} passed, ${fails.length} FAILED`);
  for (const f of fails) console.error("  x " + f);
  process.exit(1);
}
console.log(`ikolearn intake e2e: ${pass} passed`);
