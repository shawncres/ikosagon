// End-to-end checks for the opening question on phones and in in-app browsers (PR 100), in a real browser, every
// /api/ikolearn call mocked: at 320x568, 360x640, 375x667, 390x844 and 412x915, and as Instagram/Facebook (iOS) and
// TikTok/LinkedIn (Android) and WhatsApp (iOS) in-app browsers with their shorter viewports and safe-area insets. Asserts that no box
// overlaps another (Iko, its hello line and cue, the name plate, the greeting, the question, the field, Begin, each idea,
// More and the fine print), that everything is on screen and every target is at least 44px, that the name sits centred
// above the question while the canvas leaves it out and the empty cloud holds still, that picking ideas and More keep the
// row tidy, and that with the keyboard up (a shrunk visualViewport) the field and Begin stay in view and the fine print
// steps aside. PR 101 (Shawn's QA of #100 in WhatsApp): the ideas are never clipped (no ancestor clips them, no scroll
// box), the name sits near the middle and can be dragged, and with the keyboard up (iOS overlaying the page, or a web view
// shrinking it) the field sits just above the keyboard with the question in view, its focus ring whole, and the column
// returns to its place when the keyboard has gone (even after iOS panned the page).
// Run: IKOLEARN_PW=<path to node_modules/playwright-core> node scripts/ikolearn-intake-e2e.mjs [--root public]
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const ROOT = path.resolve(arg("--root", "public"));
if (!process.env.IKOLEARN_PW) { console.log("ikolearn intake e2e: skipped (set IKOLEARN_PW to a playwright-core folder)"); process.exit(0); }
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
/* PR 108: Iko's first step at the opening asks the optional age range; most checks skip it (the adapt suite covers it) */
const skipAge = async (p) => { try { await p.waitForSelector("#cs-age-skip", { timeout: 4000 }); await p.click("#cs-age-skip"); await p.waitForTimeout(150); } catch { /* no age step here */ } };
const browser = await (process.env.IKOLEARN_BROWSER ? PW[process.env.IKOLEARN_BROWSER].launch() : chromium.launch({ executablePath: process.env.IKOLEARN_CHROME || "/usr/bin/google-chrome" }));
/* the cloud view (to read the canvas) and a visualViewport the test can shrink, as an on-screen keyboard would */
const HOOK = () => {
  let real; Object.defineProperty(window, "IkoCloudView", { configurable: true, get: () => real, set: (v) => { real = Object.assign({}, v, { create: (c, o) => { const view = v.create(c, o); (window.__views = window.__views || []).push({ id: c.id, view }); return view; } }); } });
  const vv = new EventTarget(); let kb = 0, pan = 0;
  Object.defineProperties(vv, { height: { get: () => window.innerHeight - kb }, width: { get: () => window.innerWidth }, offsetTop: { get: () => pan }, offsetLeft: { get: () => 0 }, scale: { get: () => 1 } });
  /* h: the keyboard's height over the page; pn: how far iOS has panned the visual viewport down the page */
  window.__keyboard = (h, pn) => { kb = h; pan = pn || 0; vv.dispatchEvent(new Event("resize")); vv.dispatchEvent(new Event("scroll")); };
  Object.defineProperty(window, "visualViewport", { configurable: true, get: () => vv });
};
const IOS = (app) => `Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 ${app}`;
const AND = (app) => `Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A.240205.004; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0.6367.179 Mobile Safari/537.36 ${app}`;
const SIZES = [
  { tag: "320x568", w: 320, h: 568 }, { tag: "360x640", w: 360, h: 640 }, { tag: "375x667", w: 375, h: 667 }, { tag: "390x844", w: 390, h: 844 }, { tag: "412x915", w: 412, h: 915 },
  { tag: "instagram-ios-390x664", w: 390, h: 664, ua: IOS("Instagram 330.0.0.25.86 (iPhone14,5; iOS 17_5; en_US; en; scale=3.00; 1170x2532)"), inset: { top: 47, bottom: 34 } },
  { tag: "facebook-ios-375x548", w: 375, h: 548, ua: IOS("[FBAN/FBIOS;FBAV/470.0.0.40.97;FBBV/619393640;FBDV/iPhone12,8;FBMD/iPhone;FBSN/iOS;FBSV/17.5;FBSS/2;FBCR/;FBID/phone;FBLC/en_US;FBOP/5]"), inset: { top: 20, bottom: 0 } },
  { tag: "tiktok-android-360x560", w: 360, h: 560, ua: AND("trill_340005 JsSdk/1.0 NetType/WIFI Channel/googleplay AppName/musical_ly app_version/34.0.5 ByteLocale/en"), inset: { top: 24, bottom: 0 } },
  /* WhatsApp's in-app browser on an iPhone (Shawn's #99 screenshots): ~390 wide under the URL pill, a bottom toolbar, the
     iOS keyboard with its accessory bar taking ~340px */
  { tag: "whatsapp-ios-390x664", w: 390, h: 664, ua: IOS("WhatsApp/24.20.79"), inset: { top: 47, bottom: 34 }, kb: 340 },
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
  if (s.inset && !process.env.IKOLEARN_BROWSER) { const cdp = await ctx.newCDPSession(p); await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: s.inset }); }
  await p.addInitScript(HOOK);
  let more = 0;
  await p.route("**/api/ikolearn/**", (r) => {
    const at = new URL(r.request().url()).pathname.replace("/api/ikolearn", "");
    if (at === "/examples") { const k = (more++ * 3) % IDEAS.length; return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, examples: IDEAS.slice(k).concat(IDEAS.slice(0, k)), growth: ["Patience"] }) }); }
    return r.fulfill({ status: 503, contentType: "application/json", body: '{"ok":false,"reason":"off"}' });
  });
  await p.goto(BASE + "/ikolearn", { waitUntil: "networkidle" });
  await p.tap('.who-opt[data-who="self"]'); await p.fill("#name-in", "Maya"); await p.press("#name-in", "Enter"); await skipAge(p);
  await p.waitForSelector("#cloud:not([hidden]) #cloud-start:not([hidden])"); await p.waitForTimeout(1200);
  return { ctx, p, errs };
}
/* every box on the opening screen that must stay apart */
const boxes = (p) => p.evaluate(() => {
  const out = [], vis = (e) => e && !e.hidden && e.getClientRects().length && getComputedStyle(e).visibility !== "hidden" && +getComputedStyle(e).opacity > 0.05;
  const add = (name, e, tap) => { if (!vis(e)) return; const r = e.getBoundingClientRect(); if (r.width && r.height) out.push({ name, tap: Boolean(tap), x: r.left, y: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }); };
  add("Iko", document.querySelector("#iko"), true);
  add("Iko's line", document.querySelector("#iko-line"));
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
/* what of the opening column any ancestor clips (overflow other than visible), and whether the column is a scroll box */
const clipped = (p) => p.evaluate(() => {
  const out = [], kids = [...document.querySelectorAll("#cs-ex .ex-chip, #cs-ex .ex-more, #cs-q, #cs-in, #cs-form .btn")].filter((e) => e.getClientRects().length);
  for (const k of kids) {
    const r = k.getBoundingClientRect();
    for (let a = k.parentElement; a && a !== document.body; a = a.parentElement) {
      const cs = getComputedStyle(a); if (cs.overflowX === "visible" && cs.overflowY === "visible") continue;
      const b = a.getBoundingClientRect(); if (r.top < b.top - 0.5 || r.bottom > b.bottom + 0.5 || r.left < b.left - 0.5 || r.right > b.right + 0.5) out.push((k.id || k.textContent) + " in " + (a.id || a.className));
    }
  }
  const cs = document.querySelector("#cloud-start");
  return { out, scrolls: cs.scrollHeight > cs.clientHeight + 1 && getComputedStyle(cs).overflowY !== "visible" };
});
/* the field's focus ring (outline outside the box), and the column's left edge, against the safe padding */
const ring = (p) => p.evaluate(() => { const f = document.querySelector("#cs-in"), cs = getComputedStyle(f), r = f.getBoundingClientRect(), o = (parseFloat(cs.outlineWidth) || 0) + Math.max(0, parseFloat(cs.outlineOffset) || 0); return { left: r.left - o, right: r.right + o, w: innerWidth, sw: document.documentElement.scrollWidth, ox: scrollX }; });
const keyboardUp = async (tag, p, vt, vh, at) => {
  const L = await boxes(p), fld = get(L, "field"), beg = get(L, "Begin"), q = get(L, "question"), R = await ring(p), C = await clipped(p);
  ok(fld && beg && fld.b <= vt + vh + 0.5 && vt + vh - Math.max(fld.b, beg.b) <= 24, `${tag}: ${at}: the field sits just above the keyboard (no gap)`, JSON.stringify({ fld: fld && fld.b, beg: beg && beg.b, vt, vh }));
  ok(q && q.y >= vt - 0.5 && q.b <= fld.y, `${tag}: ${at}: the question stays in view above the field`, JSON.stringify({ q, vt }));
  ok(q && fld.y - q.b <= 60, `${tag}: ${at}: no big gap between the question and the field`, JSON.stringify({ q: q && q.b, f: fld.y }));
  ok(R.left >= 12 - 0.5 && R.right <= R.w - 0.5 && R.sw <= R.w && R.ox === 0, `${tag}: ${at}: the field's left edge and focus ring are whole (no sideways overflow)`, JSON.stringify(R));
  ok(C.out.length === 0 && !C.scrolls, `${tag}: ${at}: nothing in the column is clipped (no scroll box)`, JSON.stringify(C));
};

for (const s of SIZES) {
  const tag = s.tag;
  const { ctx, p, errs } = await intake(s);
  /* 1. as it opens: Iko asks it himself (#104), the greeting and the question his speech beside him; no second bubble */
  const L0 = await boxes(p);
  ok(!get(L0, "Iko's line") && await p.evaluate(() => Boolean(document.querySelector("#cloud-start .cs-ask #iko") && document.querySelector(".cs-ask .say #cs-q"))), `${tag}: Iko asks the opening question (it is his speech; no extra bubble)`);
  layout(tag, "with Iko asking", L0);
  const nm = get(L0, "name"), hi = get(L0, "greeting"), q = get(L0, "question");
  ok(nm && hi && q && Math.abs((nm.x + nm.r) / 2 - L0.w / 2) <= 2 && nm.b <= hi.y && hi.b <= q.y + 1, `${tag}: the name sits centred above the greeting and the question`, JSON.stringify({ nm, hi, q }));
  const iko = get(L0, "Iko"), line = get(L0, "Iko's line");
  /* #104: Iko beside his question, in the column (below the name, left of the speech), on screen and a 44px target */
  ok(iko && !line && iko.r <= q.x && iko.y >= nm.b && iko.y < q.b && iko.b <= L0.h && iko.x >= 0, `${tag}: Iko sits beside his question, in the column`, JSON.stringify({ iko, q, nm }));
  /* PR 101: the ideas whole (Shawn: "the chips are getting cut off on bottom"); the name near the middle */
  const C0 = await clipped(p), foot0 = L0.out.filter((r) => r.name.startsWith("fine print")), lastIdea = L0.out.filter((r) => r.name.startsWith("idea ") || r.name === "More").sort((a, b) => b.b - a.b)[0];
  ok(C0.out.length === 0 && !C0.scrolls, `${tag}: no idea, nor the field or Begin, is clipped by the column or anything around it`, JSON.stringify(C0));
  ok(lastIdea && lastIdea.b <= L0.h && foot0.every((f) => lastIdea.b <= f.y), `${tag}: the ideas end on screen, above the fine print`, JSON.stringify({ lastIdea, foot: foot0[0] }));
  const mid = (nm.y + nm.b) / 2, footTop = foot0.length ? Math.min(...foot0.map((f) => f.y)) : L0.h;
  ok(Math.abs(mid - L0.h / 2) <= 24 || (mid > L0.h / 2 - 24 - L0.h * 0.2 && footTop - lastIdea.b <= 40), `${tag}: the name sits at the middle of the screen (or as near as the column fits above the fine print)`, JSON.stringify({ mid, h: L0.h, gap: footTop - lastIdea.b }));
  if (tag === "390x844" || tag.startsWith("whatsapp")) ok(mid >= L0.h * 0.38 && mid <= L0.h * 0.56, `${tag}: the name is near the vertical centre`, JSON.stringify({ mid, h: L0.h }));
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
  /* PR 103: ideas add to the field and cycle (they never pile up): still 3 and More, none already in the field */
  const pk = await p.evaluate(() => ({ v: document.querySelector("#cs-in").value, chips: [...document.querySelectorAll("#cs-ex .ex-chip")].map((c) => c.textContent) }));
  ok(pk.chips.length <= 3 && pk.v.split(",").length === 2 && pk.chips.every((c) => !pk.v.toLowerCase().includes(c.toLowerCase())), `${tag}: tapped ideas go into the field and their chips cycle on (no pile-up)`, JSON.stringify(pk));
  /* 3. a while later: still no extra bubble over the question (he is already speaking), still clear of everything */
  await p.waitForTimeout(1500);
  ok(await p.evaluate(() => document.querySelector("#iko-line").hidden), `${tag}: no second bubble while Iko asks`);
  const L2 = await boxes(p);
  layout(tag, "a while later", L2);
  const nm2 = get(L2, "name"), nm1 = get(L1, "name");
  ok(nm2 && Math.abs(nm2.y - nm1.y) <= 1, `${tag}: the question stays still`, JSON.stringify([nm1.y, nm2 && nm2.y]));
  /* More adds a row or two: the column keeps a row's room for it, and rises (never drops) only as far as the rest needs */
  const ft1 = Math.min(...L1.out.filter((r) => r.name.startsWith("fine print")).map((r) => r.y)), mb1 = Math.max(...L1.out.filter((r) => r.name.startsWith("idea ") || r.name === "More").map((r) => r.b));
  ok(nm1.y <= nm.y + 0.5 && (nm.y - nm1.y <= 1 || ft1 - mb1 <= 12), `${tag}: More moves the question no more than the extra ideas need (only up to the fine print, never clipped)`, JSON.stringify({ was: nm.y, now: nm1.y, gap: ft1 - mb1 }));
  /* 4. the keyboard: the field and Begin stay in view above it, the fine print steps aside */
  await p.tap("#cs-in"); await p.waitForTimeout(100);
  const kb = s.kb || Math.round(s.h * 0.42);
  await p.evaluate((h) => window.__keyboard(h), kb); await p.waitForTimeout(450);
  const L3 = await boxes(p), vh = s.h - kb;
  const fld = get(L3, "field"), beg = get(L3, "Begin");
  ok(fld && beg && fld.y >= 0 && beg.b <= vh && fld.b <= vh, `${tag}: with the keyboard up the field and Begin stay in view`, JSON.stringify({ fld, beg, vh }));
  ok(!L3.out.some((r) => r.name.startsWith("fine print")), `${tag}: with the keyboard up the fine print steps aside`);
  await keyboardUp(tag, p, 0, vh, "keyboard over the page");
  const kh = []; L3.out.forEach((a, i) => L3.out.slice(i + 1).forEach((b) => { const inA = (r) => r.b > 0 && r.y < vh; if (inA(a) && inA(b) && a.x < b.r - 0.5 && b.x < a.r - 0.5 && a.y < b.b - 0.5 && b.y < a.b - 0.5) kh.push(a.name + " / " + b.name); }));
  ok(kh.length === 0, `${tag}: with the keyboard up nothing visible overlaps`, kh.join(", "));
  await p.fill("#cs-in", "the ocean");
  ok(await p.evaluate(() => document.activeElement && document.activeElement.id === "cs-in"), `${tag}: typing keeps the field focused`);
  await p.evaluate(() => window.__keyboard(0)); await p.evaluate(() => document.activeElement.blur()); await p.waitForTimeout(450);
  const L4 = await boxes(p);
  layout(tag, "after the keyboard closes", L4);
  ok(L4.out.some((r) => r.name.startsWith("fine print")), `${tag}: the fine print is back after the keyboard closes`);
  const nm4 = get(L4, "name");
  ok(nm4 && Math.abs(nm4.y - nm2.y) <= 2, `${tag}: after the keyboard the column is back where it was`, JSON.stringify([nm2.y, nm4 && nm4.y]));
  /* 5. iOS panning the page to the field (Shawn's WhatsApp): just above the keyboard, the question in view; then back */
  await p.tap("#cs-in"); await p.waitForTimeout(100);
  const pan = Math.max(0, Math.round(nm2.y + 160 - (s.h - kb)));
  await p.evaluate(([h, pn]) => window.__keyboard(h, pn), [kb, pan]); await p.waitForTimeout(450);
  await keyboardUp(tag, p, pan, vh, `keyboard with the page panned ${pan}px`);
  await p.evaluate(([pn]) => window.__keyboard(0, pn), [Math.max(pan, 300)]); await p.waitForTimeout(150); /* the keyboard gone, the pan not yet */
  await p.evaluate(() => { document.activeElement.blur(); window.__keyboard(0, 0); }); await p.waitForTimeout(450);
  const L5 = await boxes(p), nm5 = get(L5, "name");
  ok(nm5 && Math.abs(nm5.y - nm2.y) <= 2, `${tag}: after a panned keyboard the column returns to its place (not left low)`, JSON.stringify([nm2.y, nm5 && nm5.y, await p.evaluate(() => [document.documentElement.style.getPropertyValue("--iko-lane"), document.querySelector("#iko-line").hidden, document.querySelector("#iko-line").textContent, document.body.className, document.querySelector("#iko-wrap").hidden])]));
  layout(tag, "after a panned keyboard", L5);
  /* 6. a web view that shrinks the page for the keyboard (innerHeight drops too) */
  await p.tap("#cs-in"); await p.setViewportSize({ width: s.w, height: s.h - kb }); await p.evaluate(() => window.__keyboard(0, 0)); await p.waitForTimeout(450);
  await keyboardUp(tag, p, 0, s.h - kb, "the page shrunk for the keyboard");
  ok(await p.evaluate(() => document.body.classList.contains("kbd")), `${tag}: a page shrunk for the keyboard counts as the keyboard up`);
  await p.evaluate(() => document.activeElement.blur()); await p.setViewportSize({ width: s.w, height: s.h }); await p.waitForTimeout(450);
  const L6 = await boxes(p), nm6 = get(L6, "name");
  ok(nm6 && Math.abs(nm6.y - nm2.y) <= 2, `${tag}: after the page grows back the column is back in its place`, JSON.stringify([nm2.y, nm6 && nm6.y]));
  layout(tag, "after the page grows back", L6);
  /* 7. the name can be dragged (Shawn: "still movable"), and never over the text or Iko */
  const drag = async (dx, dy) => { const r = await p.locator("#cs-name").boundingBox(); const x = r.x + r.width / 2, y = r.y + r.height / 2; await p.mouse.move(x, y); await p.mouse.down(); for (let i = 1; i <= 6; i++) await p.mouse.move(x + (dx * i) / 6, y + (dy * i) / 6); await p.mouse.up(); await p.waitForTimeout(150); return p.locator("#cs-name").boundingBox(); };
  const r0 = await p.locator("#cs-name").boundingBox(), r1 = await drag(-60, -40);
  ok(r1 && r1.x < r0.x - 30 && r1.y < r0.y - 10, `${tag}: the name can be dragged`, JSON.stringify({ r0, r1 }));
  const r2 = await drag(400, 600), L7 = await boxes(p);
  layout(tag, "after dragging the name about", L7);
  ok(r2 && r2.x + r2.width <= s.w - 7, `${tag}: a dragged name stays on screen`, JSON.stringify(r2));
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
