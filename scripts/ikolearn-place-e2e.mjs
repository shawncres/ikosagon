// End-to-end checks for where a topic asked for in chat lands, in a real browser, with every /api/ikolearn call mocked
// (no model calls). Shawn's cloud: Johnny > Games, Aviation, Physical Activity, Social Skills, with Games in focus.
// "I want to learn math" -> Math is a new parent beside Games (not Games > Video Games > Math); "add puzzle strategies"
// -> under Games; an unclear one -> "Start X as a new branch" / "Add it under Games" (a tap makes 0 calls).
// Run: IKOLEARN_PW=<path to node_modules/playwright-core> node scripts/ikolearn-place-e2e.mjs [--shots DIR] [--tag after] [--root public] [--soft]
// (--soft: screenshots only, for an older build without placement.) Skips when IKOLEARN_PW is not set.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const SHOTS = arg("--shots", ""), TAG = arg("--tag", "after"), ROOT = path.resolve(arg("--root", "public")), SOFT = process.argv.includes("--soft");
if (!process.env.IKOLEARN_PW) { console.log("ikolearn place e2e: skipped (set IKOLEARN_PW to a playwright-core folder)"); process.exit(0); }
const { chromium } = await import(pathToFileURL(path.join(process.env.IKOLEARN_PW, "index.mjs")).href);

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json", ".png": "image/png" };
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ndjson = (evs) => evs.map((e) => JSON.stringify(e)).join("\n") + "\n";
const LESSON = "INTRO: Games are activities with rules and a goal.\nEXPLAIN: Every game has players, rules and a way to win.\nSTEP: Learn the rules.\nSTEP: Try a round.\nEXAMPLE: Tic-tac-toe on paper.";

/* The model's reply per request. Math also carries the old buggy chain (Games > Video Games): placement must win. */
function reply(text, focusId) {
  if (/math/i.test(text)) return { say: "Math is a great thing to learn.", topics: [{ name: "Math", parent: "Video Games", signal: "curious", chain: ["Games", "Video Games"], placement: "parent", target: "" }] };
  if (/puzzle strategies/i.test(text)) return { say: "Let's look at how puzzle players think.", topics: [{ name: "Puzzle Strategies", parent: "Games", signal: "curious", chain: ["Games"], placement: "child", target: focusId || "Games" }] };
  if (/chess/i.test(text)) return { say: "Chess is a good one.", topics: [{ name: "Chess", parent: "Games", signal: "curious", chain: ["Games"], placement: "ambiguous", target: focusId || "Games" }] };
  return { say: "Good question.", topics: [] };
}

const browser = await chromium.launch({ executablePath: process.env.IKOLEARN_CHROME || "/usr/bin/google-chrome" });

async function run(width) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 860 }, timezoneId: "America/Toronto" });
  const p = await ctx.newPage();
  p.setDefaultTimeout(6000);
  const errs = [], calls = [];
  p.on("pageerror", (e) => errs.push("pageerror " + e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await p.route("**/api/ikolearn/**", async (route) => {
    const at = new URL(route.request().url()).pathname.replace("/api/ikolearn", "");
    let body = {};
    try { body = JSON.parse(route.request().postData() || "{}"); } catch { body = {}; }
    const done = (status, text, type = "application/x-ndjson") => route.fulfill({ status, contentType: type, body: text }).catch(() => {});
    const last = (body.messages || []).filter((m) => m.role === "user").slice(-1)[0];
    calls.push({ at, mode: body.mode, focus: body.focus, focusId: body.focusId, text: last ? last.text : "" });
    await sleep(60);
    if (at === "/lesson") return done(200, ndjson([{ t: "start", model: "m" }, { t: "delta", text: LESSON }, { t: "path", steps: [], next: "", choices: [], questions: [] }, { t: "done" }]));
    if (at === "/chat" && body.mode === "chat") {
      const r = reply(last ? last.text : "", body.focusId);
      return done(200, ndjson([{ t: "start", model: "m" }, { t: "delta", text: r.say }, { t: "cloud", topics: r.topics, ghosts: [] }, { t: "done" }]));
    }
    if (at === "/chat") return done(200, ndjson([{ t: "start", model: "m" }, { t: "delta", text: "Okay." }, { t: "cloud", topics: [], ghosts: [] }, { t: "done" }]));
    return done(503, JSON.stringify({ ok: false, reason: "off" }), "application/json");
  });
  const shot = async (name) => {
    if (!SHOTS) return;
    await p.waitForTimeout(300);
    await p.screenshot({ path: path.join(SHOTS, `place-${TAG}-${width}-${name}.png`) });
  };
  const step = async (name, fn) => { try { await fn(); } catch (e) { fails.push(`${width}: ${name} threw -> ${String(e.message || e).split("\n")[0]}`); } };
  /* the saved cloud, read back the way the app saved it */
  const cloud = () => p.evaluate(() => {
    const C = window.IkoCloud, c = C.deserialize(localStorage.getItem("ikolearn.v1.cloud")), lay = C.layout(c);
    const by = (l) => Object.values(c.nodes).find((n) => n.label === l);
    const out = {};
    Object.values(c.nodes).forEach((n) => { out[n.label] = { id: n.id, parent: n.parent ? c.nodes[n.parent].label : null, d: C.depthOf(c, n.id), hue: n.hue, pos: lay[n.id] ? [lay[n.id].x, lay[n.id].y, lay[n.id].z] : null }; });
    return { nodes: out, subjects: C.subjects(c).map((s) => s.label), name: c.name, n: c.order.length, gamesId: (by("Games") || {}).id };
  });
  const sendChat = async (text) => {
    const n0 = calls.length;
    await p.fill("#input", text);
    await p.click("#send");
    await p.waitForFunction((k) => document.querySelectorAll("#thread .msg, #thread > *").length > k, 0);
    for (let i = 0; i < 40 && calls.length === n0; i++) await sleep(50);
    await p.waitForTimeout(600);
    return calls.slice(n0);
  };

  await step("seed", async () => {
    await p.goto(BASE + "/ikolearn", { waitUntil: "networkidle" });
    await p.evaluate(() => {
      const C = window.IkoCloud, T = Date.now() - 3 * 864e5, c = C.create("Johnny", T);
      C.applyTopics(c, [{ name: "Video Games", parent: "Games", signal: "explored", chain: ["Games"] }, { name: "Puzzle Games", parent: "Games", signal: "explored", chain: ["Games"] }, { name: "Airplanes", parent: "Aviation", signal: "explored", chain: ["Aviation"] }], T);
      C.applyTopics(c, [{ name: "Running", parent: "Physical Activity", signal: "explored", chain: ["Physical Activity"] }, { name: "Listening", parent: "Social Skills", signal: "explored", chain: ["Social Skills"] }], T + 1000);
      const id = (l) => c.order.find((x) => c.nodes[x].label === l);
      c.active = id("Games");
      localStorage.setItem("ikolearn.v1.name", "Johnny"); localStorage.setItem("ikolearn.v1.cloud", C.serialize(c));
      localStorage.setItem("ikolearn.v1.seen", JSON.stringify({ c: {}, ev: 0, h: { cloud: 1, card: 1, chat: 1, draw: 1 } }));
      localStorage.setItem("ikolearn.v1.thread", JSON.stringify([{ id: "m1", at: T, role: "model", local: true, text: "Welcome back, Johnny." }]));
    });
    await p.reload({ waitUntil: "networkidle" });
    await p.waitForTimeout(400);
    ok(calls.length === 0, `${width}: loading a saved cloud makes no calls`);
    const c0 = await cloud();
    ok(c0.subjects.join() === "Games,Aviation,Physical Activity,Social Skills", `${width}: seeded Johnny's four parents`, c0.subjects.join());
  });

  let before = null;
  await step("focus Games", async () => {
    before = await cloud();
    await p.getByRole("button", { name: /Continue Games/ }).first().click();
    await p.waitForSelector("#l-done:not([hidden])");
    await p.click("#l-chat");
    await p.waitForTimeout(300);
    const chip = await p.evaluate(() => ({ shown: !document.querySelector("#focus-chip").hidden, text: document.querySelector("#focus-text").textContent }));
    ok(chip.shown && /Games/.test(chip.text), `${width}: Games is in focus in chat`, JSON.stringify(chip));
    await p.fill("#input", "");
  });

  await step("I want to learn math", async () => {
    const sent = await sendChat("I want to learn math");
    const chat = sent.filter((c) => c.at === "/chat" && c.mode === "chat");
    ok(chat.length === 1 && sent.length === 1, `${width}: one chat call, nothing else (placement is in the same reply)`, JSON.stringify(sent));
    if (!SOFT) ok(chat[0] && chat[0].focusId === before.gamesId && chat[0].focus === "Games", `${width}: the chat call carries the focus id`, JSON.stringify(chat[0]));
    await shot("chat-math");
    const c1 = await cloud();
    const m = c1.nodes.Math;
    if (!SOFT) {
      ok(m && m.parent === null && m.d === c1.nodes.Games.d && c1.subjects.includes("Math"), `${width}: Math is a new parent beside Games (under Johnny), not under Games > Video Games`, JSON.stringify(m));
      ok(["Games", "Aviation", "Physical Activity", "Social Skills"].every((l) => JSON.stringify(c1.nodes[l].pos) === JSON.stringify(before.nodes[l].pos)), `${width}: the existing parents keep their place`);
      ok(m && Number.isFinite(m.hue) && ["Games", "Aviation", "Physical Activity", "Social Skills"].every((l) => c1.nodes[l].hue !== m.hue), `${width}: Math has its own hue`);
      const msg = await p.evaluate(() => document.querySelector("#thread").innerText);
      ok(/Math/.test(msg) && !/Try again/.test(msg), `${width}: the growth note names Math, no Try again`);
    }
    await p.click("#thumb");
    await p.waitForTimeout(1600);
    await shot("cloud-math");
    if (!SOFT) {
      const v = await p.evaluate(() => JSON.parse(localStorage.getItem("ikolearn.v1.view") || "null"));
      ok(v && m && v.f === m.id, `${width}: the camera glides to Math when the cloud opens`, JSON.stringify(v));
    }
    await p.click("#cloud-close");
    await p.waitForTimeout(300);
  });

  await step("add puzzle strategies", async () => {
    const sent = await sendChat("add puzzle strategies");
    ok(sent.length === 1, `${width}: one chat call`, JSON.stringify(sent));
    const c2 = await cloud();
    if (!SOFT) ok(c2.nodes["Puzzle Strategies"] && c2.nodes["Puzzle Strategies"].parent === "Games", `${width}: "add puzzle strategies" goes under Games`, JSON.stringify(c2.nodes["Puzzle Strategies"]));
  });

  await step("ambiguous: chess", async () => {
    const sent = await sendChat("what about chess?");
    ok(sent.length === 1, `${width}: one chat call`, JSON.stringify(sent));
    await shot("choice");
    if (SOFT) return;
    const opts = await p.evaluate(() => [...document.querySelectorAll("#thread .place-opts button")].map((b) => b.textContent));
    ok(opts.join("|") === "Start Chess as a new branch|Add it under Games", `${width}: an unclear request shows the two choices`, opts.join("|"));
    const c3 = await cloud();
    ok(!c3.nodes.Chess, `${width}: nothing is added before the learner chooses`);
    const n0 = calls.length;
    const asParent = width < 500;
    await p.getByRole("button", { name: asParent ? "Start Chess as a new branch" : "Add it under Games" }).click();
    await p.waitForTimeout(500);
    ok(calls.length === n0, `${width}: the choice applies with 0 calls`, JSON.stringify(calls.slice(n0)));
    const c4 = await cloud();
    if (asParent) ok(c4.nodes.Chess && c4.nodes.Chess.parent === null && c4.nodes.Chess.d === c4.nodes.Games.d, `${width}: "Start Chess as a new branch" makes it a parent beside Games`, JSON.stringify(c4.nodes.Chess));
    else ok(c4.nodes.Chess && c4.nodes.Chess.parent === "Games", `${width}: "Add it under Games" puts it under Games`, JSON.stringify(c4.nodes.Chess));
    const after = await p.evaluate(() => ({ btns: document.querySelectorAll("#thread .place-opts button").length, text: document.querySelector("#thread").innerText }));
    ok(after.btns === 0 && (asParent ? /Chess is a new branch on your cloud\./ : /Chess is now under Games\./).test(after.text) && !/Try again/.test(after.text), `${width}: the choice settles into a short note (no Try again)`);
    await shot("choice-done");
    // it survives a reload: the settled note, no buttons back
    await p.reload({ waitUntil: "networkidle" });
    await p.waitForTimeout(400);
    const re = await p.evaluate(() => ({ btns: document.querySelectorAll("#thread .place-opts button").length, text: document.querySelector("#thread").innerText }));
    ok(re.btns === 0 && /Chess/.test(re.text), `${width}: after a reload the choice stays settled`);
    await p.click("#thumb");
    await p.waitForTimeout(1600);
    await shot("cloud-done");
  });

  ok(errs.length === 0, `${width}: no console errors`, errs.join(" | "));
  ok(calls.every((c) => c.at === "/chat" || c.at === "/lesson"), `${width}: only mocked chat and lesson calls`, JSON.stringify(calls.map((c) => c.at)));
  await ctx.close();
}

for (const w of [390, 1280]) await run(w);
await browser.close();
server.close();
if (fails.length) { console.log(`ikolearn place e2e: ${pass} passed, ${fails.length} FAILED`); fails.forEach((f) => console.log("  x " + f)); process.exit(1); }
console.log(`ikolearn place e2e: ${pass} passed`);
