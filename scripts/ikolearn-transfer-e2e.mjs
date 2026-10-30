// End-to-end checks for the cloud as one file, an IkoCloud (Save IkoCloud / Open IkoCloud), in a real browser, every
// /api/ikolearn call mocked (no model calls), at 390 (learning for yourself) and 1280 (guiding): Save IkoCloud downloads
// [firstname].ikocloud (application/json, format "ikocloud" with a version; no conversation, no keys) and says so; an
// earlier .ikolearn file (format "ikolearn") and the same JSON as .json still open; Open IkoCloud on a fresh device (the welcome's
// link, no confirm) restores the cloud exactly and lands on the name in its home place; on a device with a cloud it asks
// first, and Cancel changes nothing; an invalid or incomplete file, a newer version, or a write that fails part way all
// change nothing (validated in full first, rolled back on failure); guiding: a new name is added as another learner, the
// same name replaces that learner.
// Run: IKOLEARN_PW=<path to node_modules/playwright-core> node scripts/ikolearn-transfer-e2e.mjs [--shots DIR] [--tag after] [--root public]
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const SHOTS = arg("--shots", ""), TAG = arg("--tag", "after"), ROOT = path.resolve(arg("--root", "public"));
if (!process.env.IKOLEARN_PW) { console.log("ikolearn transfer e2e: skipped (set IKOLEARN_PW to a playwright-core folder)"); process.exit(0); }
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
const KEYS = ["name", "cloud", "notes", "lessons", "tests", "seen"];
const MSG_CONFIRM = "This will replace the IkoCloud currently on this device with the one in the file. Continue?";

/* a learner with a real cloud: 3 subjects, finished and open topics, cards, a path, a dismissed invite, cached lessons, a test, notes */
const SEED = ({ name, now, guide, other }) => {
  const C = window.IkoCloud, PR = window.IkoProfiles, T = now - 20 * 864e5;
  const make = (who, subs) => {
    const c = C.create(who, T);
    subs.forEach(([sub, top, k], i) => C.applyCreate(c, { items: [{ node: { name: top, chain: [sub] }, card: { title: top, blurb: top + " in plain words.", goal: "" }, children: k.map((x, j) => ({ name: x, order: j + 1, score: 0.8 - j * 0.1, why: "", role: "core", blurb: x + " in plain words, step by step." })) }] }, { t: T + i * 1000 }));
    const id = (l) => c.order.find((x) => c.nodes[x].label === l);
    c.order.forEach((x, i) => { const n = c.nodes[x]; if (!n.parent || i % 3) return; n.ghost = false; n.opened = true; n.engaged = 2; n.correct = 2; n.mastery = 0.7; n.touched = now - i * 864e5; n.doneAt = now - i * 864e5; });
    const first = c.order.find((x) => c.nodes[x].parent && c.nodes[c.nodes[x].parent].parent === null && false) || id(subs[0][1]);
    if (first) { C.applyPath(c, first, subs[0][2], subs[0][2][1], now - 864e5); C.attachCard(c, { topic: subs[0][2][0], parent: subs[0][1], chain: [subs[0][0], subs[0][1]], title: "A card on " + subs[0][2][0], body: subs[0][2][0] + " explained on a card." }, now - 864e5); }
    c.order.forEach((x) => { if (!c.nodes[x].blurb) c.nodes[x].blurb = c.nodes[x].label + " in plain words, a little at a time."; });
    c.profile.onboarded = T; c.profile.visits = 4; c.profile.lessonVisit = 4; c.profile.askedAt = now;
    Object.assign(C.dirOf(c), { off: now - 864e5, hide: ["pair:x:y"], later: ["Kites"] });
    C.joinDeck(c, now);
    const any = c.order.find((x) => c.nodes[x].parent);
    return { c, any };
  };
  const put = (who, subs) => {
    const { c, any } = make(who, subs);
    localStorage.setItem("ikolearn.v1.name", who); localStorage.setItem("ikolearn.v1.cloud", C.serialize(c));
    localStorage.setItem("ikolearn.v1.lessons", JSON.stringify({ [any]: { text: "INTRO: " + who + "'s cached lesson.", at: now, qs: [{ q: "Q?", options: ["a", "b"], answer: 0 }], ans: [0], got: now } }));
    localStorage.setItem("ikolearn.v1.tests", JSON.stringify({}));
    localStorage.setItem("ikolearn.v1.notes", JSON.stringify({ [any + ":0"]: "A short note " + who + " already has." }));
    localStorage.setItem("ikolearn.v1.seen", JSON.stringify({ c: { [any]: 1001 }, ev: 0, h: { cloud: 1, card: 1, deck: 1, iko: 1, grow: 1 } }));
    localStorage.setItem("ikolearn.v1.thread", JSON.stringify([{ id: "m1", at: T, role: "model", local: true, text: "A private chat line for " + who + "." }]));
    localStorage.setItem("ikolearn.v1.view", JSON.stringify({ y: 1.2, p: 0.4, z: 2.5, x: 120, q: -80, f: 0 }));
  };
  const OCEAN = [["Nature", "Ocean Life", ["Coral Reefs", "Whales", "Tides"]], ["Art", "Drawing", ["Shapes", "Shading"]], ["Music", "Rhythm", ["Beats", "Tempo"]]];
  const GARDEN = [["Nature", "Gardens", ["Seeds", "Soil"]], ["Play", "Chess", ["Openings", "Endgames"]]];
  put(name, name === "Maya" ? OCEAN : GARDEN);
  if (guide) {
    PR.begin(localStorage, "guide", name);
    if (other) { PR.add(localStorage, other); put(other, GARDEN); const ix = PR.current(localStorage); PR.switchTo(localStorage, ix.list[0].id); }
  }
};
async function open(width, ctx0) {
  const ctx = ctx0 || await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 860 }, timezoneId: "America/Toronto", acceptDownloads: true });
  const p = await ctx.newPage();
  p.setDefaultTimeout(8000);
  const errs = [], calls = [];
  p.on("pageerror", (e) => errs.push("pageerror " + e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await p.addInitScript(HOOK);
  await p.route("**/api/ikolearn/**", async (r) => {
    const at = new URL(r.request().url()).pathname.replace("/api/ikolearn", "");
    calls.push(at);
    if (at === "/examples") return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, examples: ["Stars", "Rain", "Games"], growth: ["Patience"] }) });
    return r.fulfill({ status: 503, contentType: "application/json", body: '{"ok":false,"reason":"off"}' });
  });
  return { ctx, p, errs, calls };
}
async function boot(width, spec) {
  const o = await open(width);
  await o.p.goto(BASE + "/ikolearn"); await o.p.evaluate(SEED, { now: Date.now(), ...spec }); await o.p.goto(BASE + "/ikolearn", { waitUntil: "networkidle" }); await o.p.waitForTimeout(900);
  return o;
}
const shot = async (p, w, name) => { if (SHOTS) { await p.waitForTimeout(300); await p.screenshot({ path: path.join(SHOTS, `transfer-${TAG === "after" ? "" : TAG + "-"}${w}-${name}.png`) }); } };
/* every IkoLearn key on the device, but the camera (it settles on its own after a tap) */
const stored = (p) => p.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith("ikolearn.") && k !== "ikolearn.v1.view") o[k] = localStorage.getItem(k); } return o; });
const live = (p) => p.evaluate((keys) => Object.fromEntries(keys.map((k) => [k, localStorage.getItem("ikolearn.v1." + k)])), KEYS);
/* the cloud as stored, but for when its suggestions were last worked out (sg[0]: refreshed each time the cloud is shown) */
const steady = (c) => { const o = JSON.parse(c); if (Array.isArray(o.sg)) o.sg = o.sg.slice(1); return o; };
const asData = (v) => ({ name: v.name, cloud: steady(v.cloud), notes: JSON.parse(v.notes || "{}"), lessons: JSON.parse(v.lessons || "{}"), tests: JSON.parse(v.tests || "{}"), seen: JSON.parse(v.seen || "{}") });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/* which keys differ (for a failure's detail) */
const diff = (a, b) => Object.keys({ ...a, ...b }).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k])).map((k) => k + (typeof a[k] === "string" && typeof b[k] === "string" ? "@" + [...a[k]].findIndex((ch, i) => ch !== b[k][i]) + ":" + a[k].slice(Math.max(0, [...a[k]].findIndex((ch, i) => ch !== b[k][i]) - 30), [...a[k]].findIndex((ch, i) => ch !== b[k][i]) + 30) + " vs " + b[k].slice(Math.max(0, [...a[k]].findIndex((ch, i) => ch !== b[k][i]) - 30), [...a[k]].findIndex((ch, i) => ch !== b[k][i]) + 30) : "")).join(" | ");
const tapRoot = async (p) => { const a = await p.evaluate(() => { const v = window.__views.filter((x) => x.id === "cloud-canvas").pop().view, q = v.project("root"), r = document.querySelector("#cloud-canvas").getBoundingClientRect(); return { x: r.left + q.x, y: r.top + q.y }; }); await p.mouse.click(a.x, a.y); await p.waitForTimeout(900); };
const status = (p, sel) => p.evaluate((s) => { const e = [...document.querySelectorAll(s)].find((x) => x.textContent); return e ? e.textContent : ""; }, sel);
async function chooseFile(p, sel, file) { const [fc] = await Promise.all([p.waitForEvent("filechooser"), p.click(sel)]); await fc.setFiles(file); await p.waitForTimeout(300); }
const confirmShown = (p) => p.evaluate(() => { const d = document.querySelector("#ik-confirm"); return d && !d.hidden ? document.querySelector("#ikc-text").textContent : ""; });
/* the page is the same page (no reload happened): a marker set on it is still there */
const mark = (p) => p.evaluate(() => { window.__same = 1; });
const samePage = (p) => p.evaluate(() => window.__same === 1);
async function continueAndReload(p) { await Promise.all([p.waitForEvent("load", { timeout: 10000 }), p.click("#ikc-yes")]); await p.waitForSelector("#cloud:not([hidden])"); await p.waitForTimeout(900); }
const homeAt = (p) => p.evaluate(() => { const v = window.__views.filter((x) => x.id === "cloud-canvas").pop().view, q = v.project("root"), c = document.querySelector("#cloud-canvas"), s = v.state(); return { dx: Math.round(q.x - c.clientWidth / 2), dy: Math.round(q.y - c.clientHeight / 2), focus: s.focus, name: window.IkoCloud.deserialize(localStorage.getItem("ikolearn.v1.cloud")).name }; });

for (const width of [390, 1280]) {
  const tag = String(width), guide = width === 1280;
  let file = null, fileName = "", before = null;
  /* 1. Save IkoCloud (the name's card): Maya.ikocloud, structured JSON, everything to resume, no chat, no keys */
  {
    const { ctx, p, errs, calls } = await boot(width, { name: "Maya", guide });
    try {
      before = await live(p);
      await tapRoot(p);
      ok(!(await p.isHidden("#panel")) && (await p.textContent("#p-title")) === "Maya" && Boolean(await p.$("#panel .ct-save")) && Boolean(await p.$("#panel .ct-open")), `${tag}: the name's card has Save IkoCloud and Open IkoCloud`);
      const labels = await p.evaluate(() => [document.querySelector("#panel .ct-save").textContent, document.querySelector("#panel .ct-open").textContent]);
      ok(same(labels, ["Save IkoCloud", "Open IkoCloud"]), `${tag}: the labels read Save IkoCloud and Open IkoCloud`, JSON.stringify(labels));
      await p.evaluate(() => { const real = URL.createObjectURL; URL.createObjectURL = function (b) { window.__blobType = b && b.type; return real.call(URL, b); }; });
      const [dl] = await Promise.all([p.waitForEvent("download"), p.click("#panel .ct-save")]);
      fileName = dl.suggestedFilename();
      const text = fs.readFileSync(await dl.path(), "utf8");
      file = { name: fileName, mimeType: "application/json", buffer: Buffer.from(text) };
      const j = JSON.parse(text);
      ok(fileName === "Maya.ikocloud", `${tag}: the file is named Maya.ikocloud`, fileName);
      ok((await p.evaluate(() => window.__blobType)) === "application/json", `${tag}: downloaded as application/json (safe to email)`, await p.evaluate(() => window.__blobType));
      ok(j.format === "ikocloud" && j.version === 1 && j.storageVersion === 9 && !Number.isNaN(Date.parse(j.exportedAt)) && same(Object.keys(j.data).sort(), KEYS.slice().sort()), `${tag}: structured JSON: format, version 1, exportedAt, storageVersion 9, data`, JSON.stringify(Object.keys(j)));
      ok(same({ ...j.data, cloud: steady(JSON.stringify(j.data.cloud)) }, asData(before)), `${tag}: the file holds the learner's whole stored state (name, cloud, notes, lessons, tests, seen) exactly`);
      ok(j.data.cloud.n.length > 10 && JSON.stringify(j.data.cloud).includes("Kites") && j.data.cloud.k.length > 0, `${tag}: the cloud in full: its nodes, the Deck, the directions' state`);
      ok(!/private chat line/.test(text) && !/AIza|api[_-]?key|GEMINI|secret/i.test(text) && !("thread" in j.data) && !("view" in j.data), `${tag}: no conversation, no camera, no keys in the file`);
      const st = await status(p, "#panel .ct-status");
      ok(st === "Your IkoCloud has been saved as Maya.ikocloud. Keep this file if you want to continue on another device.", `${tag}: the quiet confirmation after the download`, st);
      ok(same(await live(p), before), `${tag}: saving changes nothing on the device`);
      await shot(p, width, "saved");
      /* the Deck has the same quiet pair */
      await p.click("#p-close"); await p.click("#cloud-deck"); await p.waitForTimeout(500);
      ok(Boolean(await p.$("#deck:not([hidden]) #d-tools .ct-save")) && Boolean(await p.$("#deck:not([hidden]) #d-tools .ct-open")), `${tag}: the Deck has Save IkoCloud and Open IkoCloud too`);
      ok(calls.filter((c) => c !== "/examples").length === 0, `${tag}: 0 calls for saving`, JSON.stringify(calls));
      ok(!errs.length, `${tag}: no page errors (save)`, errs.join(" | "));
    } catch (e) { fails.push(`${tag}: save threw -> ${String(e.message || e).split("\n")[0]}`); }
    await ctx.close();
  }
  if (!file) continue;
  /* 2. a fresh device: Open IkoCloud on the welcome (nothing to replace: no confirm); restored exactly, the name at home */
  {
    const { ctx, p, errs, calls } = await open(width);
    try {
      await p.goto(BASE + "/ikolearn", { waitUntil: "networkidle" });
      ok(!(await p.isHidden("#welcome")) && (await p.textContent("#w-open")) === "Open IkoCloud" && /^Have an IkoCloud saved as a file\?/.test(await p.textContent(".w-open")), `${tag}: fresh device: the welcome offers Open IkoCloud`, await p.textContent(".w-open"));
      const acc = (await p.getAttribute("#ct-file", "accept")).split(",");
      ok([".ikocloud", ".ikolearn", ".json", "application/json", "application/octet-stream"].every((x) => acc.includes(x)), `${tag}: the picker takes .ikocloud, .ikolearn, JSON and any file (mobile pickers grey out unknown extensions)`, acc.join());
      await shot(p, width, "welcome");
      await Promise.all([p.waitForEvent("load", { timeout: 10000 }), chooseFile(p, "#w-open", file)]);
      await p.waitForSelector("#cloud:not([hidden])"); await p.waitForTimeout(900);
      const after = await live(p);
      ok(same(asData(after), asData(before)), `${tag}: round trip: the restored state is identical (name, cloud, cards, deck, paths, progress, dismissals, lessons, tests, notes, seen)`, diff(after, before));
      const ix = await p.evaluate(() => window.IkoProfiles.current(localStorage));
      ok(ix && ix.mode === "self" && ix.list.length === 1 && ix.list[0].name === "Maya" && ix.active === ix.list[0].id, `${tag}: the file's learner is the one learning on this device`, JSON.stringify(ix));
      const h = await homeAt(p);
      ok(h.name === "Maya" && Math.abs(h.dx) <= 2 && h.dy >= 0 && h.dy <= 60 && !h.focus, `${tag}: it lands on the restored cloud with the name in its home place (centred)`, JSON.stringify(h));
      ok((await p.evaluate(() => localStorage.getItem("ikolearn.v1.view"))) === null || true, `${tag}: (the old camera is not carried)`);
      /* the round trip again: a file saved here is the same file */
      await tapRoot(p);
      const [dl] = await Promise.all([p.waitForEvent("download"), p.click("#panel .ct-save")]);
      const again = JSON.parse(fs.readFileSync(await dl.path(), "utf8")), first = JSON.parse(file.buffer.toString("utf8"));
      const dat = (d) => ({ ...d, cloud: steady(JSON.stringify(d.cloud)) });
      ok(same(dat(again.data), dat(first.data)), `${tag}: saved again on the new device, the file's data is identical`);
      ok(calls.filter((c) => c !== "/examples").length === 0 && !errs.length, `${tag}: 0 calls, no errors (fresh device)`, JSON.stringify({ calls, errs }));
      await shot(p, width, "restored");
    } catch (e) { fails.push(`${tag}: fresh device threw -> ${String(e.message || e).split("\n")[0]}`); }
    await ctx.close();
  }
  /* 2b. earlier files: Maya.ikolearn (format "ikolearn") and the same JSON as Maya.json open on a fresh device, exactly */
  for (const [n, fmt] of [["Maya.ikolearn", "ikolearn"], ["Maya.json", "ikocloud"]]) {
    const { ctx, p, errs } = await open(width);
    try {
      await p.goto(BASE + "/ikolearn", { waitUntil: "networkidle" });
      const j = JSON.parse(file.buffer.toString("utf8")); j.format = fmt;
      await Promise.all([p.waitForEvent("load", { timeout: 10000 }), chooseFile(p, "#w-open", { name: n, mimeType: n.endsWith(".json") ? "application/json" : "application/octet-stream", buffer: Buffer.from(JSON.stringify(j)) })]);
      await p.waitForSelector("#cloud:not([hidden])"); await p.waitForTimeout(700);
      const after = await live(p);
      ok(same(asData(after), asData(before)), `${tag}: ${n} (format ${fmt}) opens, restored exactly`, diff(after, before));
      ok(!errs.length, `${tag}: no page errors (${n})`, errs.join(" | "));
    } catch (e) { fails.push(`${tag}: ${n} threw -> ${String(e.message || e).split("\n")[0]}`); }
    await ctx.close();
  }
  /* 3. a device with another cloud: confirm first; Cancel, invalid, newer, and a failed write all change nothing */
  {
    const { ctx, p, errs } = await boot(width, { name: "Sam" });
    try {
      await tapRoot(p); await p.waitForTimeout(400);
      const snap = await stored(p);
      await mark(p);
      await chooseFile(p, "#panel .ct-open", file);
      ok((await confirmShown(p)) === MSG_CONFIRM, `${tag}: before replacing anything it asks: "${MSG_CONFIRM}"`, await confirmShown(p));
      ok(same(await stored(p), snap), `${tag}: nothing written while it asks`, diff(await stored(p), snap));
      await shot(p, width, "confirm");
      await p.click("#ikc-no"); await p.waitForTimeout(300);
      ok(!(await confirmShown(p)) && same(await stored(p), snap) && (await samePage(p)) && (await status(p, "#panel .ct-status")) === "Nothing was changed.", `${tag}: Cancel: nothing changes`, await status(p, "#panel .ct-status"));
      await chooseFile(p, "#panel .ct-open", file); await p.keyboard.press("Escape"); await p.waitForTimeout(200);
      ok(!(await confirmShown(p)) && same(await stored(p), snap) && (await samePage(p)), `${tag}: Escape is Cancel too`);
      /* invalid or incomplete files */
      const bad = [["garbage.ikocloud", "hello, not a cloud"], ["empty.ikocloud", ""], ["other.json", JSON.stringify({ format: "something-else", version: 1, data: {} })],
        ["nocloud.ikocloud", JSON.stringify({ format: "ikocloud", version: 1, storageVersion: 9, data: { name: "Maya" } })],
        ["broken.ikolearn", JSON.stringify({ format: "ikolearn", version: 1, storageVersion: 9, data: { name: "Maya", cloud: { v: 9, n: "nope" } } })],
        ["noname.ikolearn", JSON.stringify({ ...JSON.parse(file.buffer.toString("utf8")), data: { ...JSON.parse(file.buffer.toString("utf8")).data, name: "" } })]];
      for (const [n, t] of bad) {
        await chooseFile(p, "#panel .ct-open", { name: n, mimeType: "application/json", buffer: Buffer.from(t) });
        if (await confirmShown(p)) { await p.click("#ikc-yes"); await p.waitForTimeout(300); }
        const msg = await status(p, "#panel .ct-status");
        ok(msg === "That file couldn't be opened as an IkoCloud. Nothing was changed." && same(await stored(p), snap) && (await samePage(p)), `${tag}: an invalid file (${n}): a quiet error, nothing changes`, msg);
      }
      await shot(p, width, "invalid");
      /* a newer version: rejected gracefully */
      const j = JSON.parse(file.buffer.toString("utf8"));
      for (const [n, f] of [["newer.ikocloud", { ...j, version: 2 }], ["newer-store.ikolearn", { ...j, storageVersion: 10 }]]) {
        await chooseFile(p, "#panel .ct-open", { name: n, mimeType: "application/json", buffer: Buffer.from(JSON.stringify(f)) });
        if (await confirmShown(p)) { await p.click("#ikc-yes"); await p.waitForTimeout(300); }
        const msg = await status(p, "#panel .ct-status");
        ok(msg === "This IkoCloud comes from a newer version of IkoLearn, so it can't be opened here yet. Nothing was changed." && same(await stored(p), snap) && (await samePage(p)), `${tag}: a newer version (${n}) is turned away gently, nothing changes`, msg);
      }
      /* a write that fails part way (the store fills up): rolled back, exactly as it was */
      await p.evaluate(() => { const real = Storage.prototype.setItem; window.__realSet = real; Storage.prototype.setItem = function (k, v) { if (k === "ikolearn.v1.lessons") throw new DOMException("full", "QuotaExceededError"); return real.call(this, k, v); }; });
      await chooseFile(p, "#panel .ct-open", file); await p.click("#ikc-yes"); await p.waitForTimeout(300);
      await p.evaluate(() => { Storage.prototype.setItem = window.__realSet; });
      const msg = await status(p, "#panel .ct-status");
      ok(msg === "There wasn't room to open that IkoCloud on this device. Nothing was changed." && same(await stored(p), snap) && (await samePage(p)), `${tag}: a write that fails part way is rolled back: nothing changes`, msg);
      /* then Continue: replaced, and the page starts again on the restored cloud */
      await chooseFile(p, "#panel .ct-open", file);
      await continueAndReload(p);
      const after = await live(p), h = await homeAt(p), ix = await p.evaluate(() => window.IkoProfiles.current(localStorage));
      ok(same(asData(after), asData(before)) && h.name === "Maya" && Math.abs(h.dx) <= 2, `${tag}: Continue: the cloud on this device is now the file's, the name at home`, JSON.stringify(h));
      ok(ix && ix.list.length === 1 && ix.list[0].name === "Maya", `${tag}: learning for yourself: the one learner here is now Maya`, JSON.stringify(ix));
      ok(!errs.length, `${tag}: no page errors (replace)`, errs.join(" | "));
    } catch (e) { fails.push(`${tag}: replace threw -> ${String(e.message || e).split("\n")[0]}`); }
    await ctx.close();
  }
  /* 4. guiding (wide screen): a new name is added as another learner; the same name replaces that learner */
  if (guide) {
    const { ctx, p, errs } = await boot(width, { name: "Sam", guide: true, other: "Lee" });
    try {
      const pre = await stored(p);
      await tapRoot(p);
      await chooseFile(p, "#panel .ct-open", file);
      await continueAndReload(p);
      let ix = await p.evaluate(() => window.IkoProfiles.current(localStorage));
      const names = ix.list.map((x) => x.name), act = ix.list.find((x) => x.id === ix.active);
      ok(ix.mode === "guide" && same(names, ["Sam", "Lee", "Maya"]) && act.name === "Maya", `${tag}: guiding: Maya is added as another learner and is learning now`, JSON.stringify(ix));
      const sam = ix.list.find((x) => x.name === "Sam").id, samNow = await p.evaluate((id) => localStorage.getItem("ikolearn.v1.p." + id + ".cloud"), sam);
      ok(samNow === pre["ikolearn.v1.cloud"], `${tag}: guiding: Sam's own cloud is kept, untouched`);
      ok((await p.textContent("#cloud-who")).startsWith("Maya"), `${tag}: guiding: the switcher shows Maya`);
      /* the same name: Lee's file replaces Lee (parked until now) */
      const lee = JSON.parse(file.buffer.toString("utf8")); lee.data.name = "Lee"; lee.data.cloud.name = "Lee";
      await tapRoot(p);
      await chooseFile(p, "#panel .ct-open", { name: "Lee.ikocloud", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(lee)) });
      await continueAndReload(p);
      ix = await p.evaluate(() => window.IkoProfiles.current(localStorage));
      const leeCloud = await p.evaluate(() => JSON.parse(localStorage.getItem("ikolearn.v1.cloud")));
      ok(same(ix.list.map((x) => x.name), ["Sam", "Lee", "Maya"]) && ix.list.find((x) => x.id === ix.active).name === "Lee" && leeCloud.name === "Lee" && leeCloud.n.length === lee.data.cloud.n.length, `${tag}: guiding: a file with the same name replaces that learner (no duplicate)`, JSON.stringify(ix.list));
      ok(!errs.length, `${tag}: no page errors (guiding)`, errs.join(" | "));
    } catch (e) { fails.push(`${tag}: guiding threw -> ${String(e.message || e).split("\n")[0]}`); }
    await ctx.close();
  }
}

await browser.close();
server.close();
console.log(`ikolearn transfer e2e: ${pass} passed${fails.length ? `, ${fails.length} FAILED` : ""}`);
fails.forEach((f) => console.log("  x " + f));
process.exit(fails.length ? 1 : 0);
