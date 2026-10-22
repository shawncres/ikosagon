// End-to-end checks for the lesson flow in a real browser, with every /api/ikolearn call mocked (no model calls):
// "I've got it" (0 calls, stays), "Still tricky" (3 clarifications, 1 call each, inline), Where Next, no call on a
// node tap, cancel on navigation, lessons queue while busy, and "Try again" only on a real failure.
// Run: IKOLEARN_PW=<path to node_modules/playwright-core> node scripts/ikolearn-flow-e2e.mjs [--shots DIR] [--tag after] [--root public] [--soft]
// (--soft: screenshots only, for an older build without these features.) Skips when IKOLEARN_PW is not set.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const SHOTS = arg("--shots", ""), TAG = arg("--tag", "after"), ROOT = path.resolve(arg("--root", "public")), SOFT = process.argv.includes("--soft");
if (!process.env.IKOLEARN_PW) { console.log("ikolearn flow e2e: skipped (set IKOLEARN_PW to a playwright-core folder)"); process.exit(0); }
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

const LESSON = "INTRO: Magma is melted rock under the ground.\nEXPLAIN: Deep down it is hot enough for rock to melt.\nSTEP: Heat builds up.\nSTEP: Rock melts into magma.\nEXAMPLE: Like butter melting in a warm pan.";
const CLAR = {
  simpler: "Think of the ground like a thick blanket. Under it, it is so hot that rock goes soft and runny. That runny rock is magma.",
  example: "First, picture a pot of thick soup on the stove. Then, the bottom gets hottest and starts to bubble. Magma works the same way, deep under the ground.",
  question: "Which part feels tricky: where the heat comes from, or why the rock melts? Hint: think about how hot it gets far below us.",
};
const FORK = [{ name: "Ash Clouds", why: "What rises into the sky", kind: "deeper" }, { name: "Lava Types", why: "Where the lava goes", kind: "wider" }, { name: "Constellations", why: "Something different", kind: "wider" }];
const ndjson = (evs) => evs.map((e) => JSON.stringify(e)).join("\n") + "\n";

const browser = await chromium.launch({ executablePath: process.env.IKOLEARN_CHROME || "/usr/bin/google-chrome" });

async function run(width) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 860 }, timezoneId: "America/Toronto" });
  const p = await ctx.newPage();
  p.setDefaultTimeout(6000);
  const errs = [], calls = [], aborted = [];
  const mock = { lessonMs: 60, chatMs: 60, noticeMs: 60, clarifyMs: 60, failClarify: false };
  p.on("pageerror", (e) => errs.push("pageerror " + e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  p.on("requestfailed", (r) => { if (r.url().includes("/api/ikolearn/")) aborted.push(new URL(r.url()).pathname); });
  await p.route("**/api/ikolearn/**", async (route) => {
    const at = new URL(route.request().url()).pathname.replace("/api/ikolearn", "");
    let body = {};
    try { body = JSON.parse(route.request().postData() || "{}"); } catch { body = {}; }
    calls.push(at + (at === "/chat" ? ":" + body.mode + (body.clarify ? ":" + body.clarify : "") : ""));
    const done = (status, text, type = "application/x-ndjson") => route.fulfill({ status, contentType: type, body: text }).catch(() => {});
    if (at === "/lesson") {
      await sleep(mock.lessonMs);
      /* the Eruptions lesson offers a fork (one choice is already in progress elsewhere: it must not show twice) */
      const choices = body.focus === "Eruptions" ? FORK : [];
      return done(200, ndjson([{ t: "start", model: "m" }, { t: "delta", text: LESSON }, { t: "path", steps: [], next: "", choices, questions: [] }, { t: "done" }]));
    }
    if (at === "/chat" && body.mode === "clarify") {
      await sleep(mock.clarifyMs);
      if (mock.failClarify) return done(200, ndjson([{ t: "error", reason: "upstream" }]));
      const t = CLAR[body.clarify] || "";
      return done(200, ndjson([{ t: "start", model: "m" }, { t: "delta", text: t.slice(0, 40) }, { t: "delta", text: t.slice(40) }, { t: "done" }]));
    }
    if (at === "/chat" && body.mode === "notice") { await sleep(mock.noticeMs); return done(200, ndjson([{ t: "start", model: "m" }, { t: "delta", text: "You've been circling volcanoes lately." }, { t: "cloud", topics: [], ghosts: [] }, { t: "done" }])); }
    if (at === "/chat") { await sleep(mock.chatMs); return done(200, ndjson([{ t: "start", model: "m" }, { t: "delta", text: "Good question." }, { t: "cloud", topics: [], ghosts: [] }, { t: "done" }])); }
    return done(503, JSON.stringify({ ok: false, reason: "off" }), "application/json");
  });
  const shot = async (name, sel) => {
    if (!SHOTS) return;
    if (sel) await p.evaluate((q) => { const e = document.querySelector(q); if (e) e.scrollIntoView({ block: "start" }); }, sel);
    await p.waitForTimeout(250);
    await p.screenshot({ path: path.join(SHOTS, `flow-${TAG}-${width}-${name}.png`) });
  };
  const count = (re) => calls.filter((c) => re.test(c)).length;
  const js = (sel) => p.evaluate((q) => { const e = document.querySelector(q); if (e) e.click(); return Boolean(e); }, sel);
  const step = async (name, fn) => { try { await fn(); } catch (e) { fails.push(`${width}: ${name} threw -> ${String(e.message || e).split("\n")[0]}`); } };
  const text = (sel) => p.evaluate((q) => (document.querySelector(q) || {}).innerText || "", sel);

  await step("seed", async () => {
    await p.goto(BASE + "/ikolearn", { waitUntil: "networkidle" });
    await p.evaluate(() => {
      const C = window.IkoCloud, T = Date.now() - 3 * 864e5, c = C.create("Maya", T);
      const kids = (names, m) => names.map((n, i) => ({ name: n, order: i + 1, score: 0.9 - i * 0.1, why: "", role: "core", motif: m[i] }));
      C.applyCreate(c, { items: [
        { node: { name: "Volcanoes", chain: ["Earth Science"], motif: "mountain" }, card: { title: "Volcanoes", blurb: "Mountains that let out melted rock.", goal: "" }, children: kids(["Magma", "Eruptions", "Lava Types"], ["flame", "mountain", "drop"]) },
        { node: { name: "Sourdough Bread", chain: ["Baking"], motif: "bowl" }, card: { title: "Sourdough Bread", blurb: "Bread raised by a living starter.", goal: "" }, children: kids(["Starter Basics", "Kneading", "Proofing"], ["seed", "hand", "clock"]) },
        { node: { name: "Stargazing", chain: ["Astronomy"], motif: "star" }, card: { title: "Stargazing", blurb: "The night sky.", goal: "" }, children: kids(["Constellations", "Planets"], ["star", "planet"]) },
      ] }, { t: T });
      const id = (l) => c.order.find((x) => c.nodes[x].label === l);
      const touch = (l, at) => { const n = c.nodes[id(l)]; n.ghost = false; n.opened = true; n.engaged = 1; n.touched = at; n.mastery = Math.max(n.mastery, 0.2); };
      touch("Kneading", T + 1000); touch("Constellations", T + 2000); touch("Starter Basics", T + 3000); touch("Planets", T + 500);
      C.joinDeck(c, T + 4000);
      c.active = id("Magma");
      localStorage.setItem("ikolearn.v1.name", "Maya"); localStorage.setItem("ikolearn.v1.cloud", C.serialize(c));
      localStorage.setItem("ikolearn.v1.seen", JSON.stringify({ c: {}, ev: 0, h: { cloud: 1, card: 1, chat: 1, draw: 1 } }));
      localStorage.setItem("ikolearn.v1.thread", JSON.stringify([{ id: "m1", at: T, role: "model", local: true, text: "Welcome back, Maya." }]));
    });
    await p.reload({ waitUntil: "networkidle" });
    await p.waitForTimeout(400);
    ok(calls.length === 0, `${width}: loading a saved cloud makes no calls`, calls.join());
  });

  await step("lesson + I've got it", async () => {
    await p.getByRole("button", { name: /Continue Magma/ }).first().click();
    await p.waitForSelector("#l-done:not([hidden])");
    ok(count(/^\/lesson$/) === 1, `${width}: opening a new lesson is one call`);
    const wn0 = await p.evaluate(() => [...document.querySelectorAll("#l-next .wn-opt")].map((b) => b.classList.contains("on") && b.classList.contains("next")));
    if (!SOFT) ok(wn0[0] === true, `${width}: Where Next is in the lesson from the start, the next step pre-selected`);
    const n0 = calls.length, title0 = await p.textContent("#l-title");
    await p.click("#l-got");
    await p.waitForTimeout(400);
    const after = await p.evaluate(() => ({ title: document.querySelector("#l-title").textContent, status: document.querySelector("#l-status").innerText, lessonShown: !document.querySelector("#lesson").hidden, retry: /Try again/.test(document.querySelector("#lesson").innerText),
      wn: [...document.querySelectorAll("#l-next .wn-opt")].map((b) => ({ l: b.querySelector(".wn-label")?.textContent, on: b.classList.contains("on"), next: b.classList.contains("next"), why: b.querySelector(".why")?.textContent })), card: Boolean(document.querySelector("#l-next .wn-go .gcard")) }));
    ok(calls.length === n0, `${width}: "I've got it" makes 0 calls`, calls.slice(n0).join());
    ok(after.lessonShown && after.title === title0, `${width}: "I've got it" stays on the lesson (no auto-advance)`);
    ok(!after.retry, `${width}: no Try again after a confirmation`);
    await shot("got-where-next", "#l-status");
    if (SOFT) return;
    ok(/^That's it\./.test(after.status), `${width}: a short "That's it." note`, after.status);
    ok(after.wn.length === 4 && after.wn[0].next && after.wn[0].on && after.wn.slice(1).every((x) => !x.next && !x.on && /In progress/.test(x.why)), `${width}: Where Next: the next step pre-selected, then 3 in progress`, JSON.stringify(after.wn));
    eq(after.wn.map((x) => x.l), ["Eruptions", "Starter Basics", "Constellations", "Kneading"], `${width}: Where Next order: the path's next step, then the most recent in progress`);
    ok(after.card, `${width}: the picked topic's card is drawn on the device`);
    await p.locator("#l-next .wn-opt").nth(1).click();
    const picked = await p.evaluate(() => ({ on: [...document.querySelectorAll("#l-next .wn-opt")].map((b) => b.getAttribute("aria-checked")), open: document.querySelector("#l-next .wn-go .btn").textContent }));
    ok(picked.on.join() === "false,true,false,false" && picked.open === "Open Starter Basics" && calls.length === n0, `${width}: tapping an option selects it (0 calls); Open names it`, JSON.stringify(picked));
    await p.locator("#l-next .wn-opt").nth(0).click();
  });

  await step("Still tricky", async () => {
    const n0 = calls.length;
    await p.click("#l-tricky");
    await p.waitForTimeout(300);
    ok(!(await p.locator("#lesson").isHidden()) && calls.length === n0, `${width}: "Still tricky" stays on the lesson (0 calls until an option is picked)`);
    await shot("tricky-options", "#l-status");
    if (SOFT) return;
    const opts = await p.evaluate(() => [...document.querySelectorAll("#l-clar .clar-opt")].map((b) => b.textContent));
    eq(opts, ["Explain it more simply", "Show me a worked example", "Ask me a question"], `${width}: three prepared clarifications`);
    for (const [i, style] of ["simpler", "example", "question"].entries()) {
      const before = count(/:clarify:/);
      await p.locator("#l-clar .clar-opt").nth(i).click();
      await p.waitForFunction((st) => { const b = document.querySelector(`#l-clar .clar[data-style="${st}"] .clar-body`); return b && !b.classList.contains("streaming") && b.innerText.length > 20; }, style);
      ok(count(/:clarify:/) === before + 1 && count(new RegExp(":clarify:" + style + "$")) === 1, `${width}: "${style}" is exactly 1 call`);
      if (i === 0) await shot("clarified", "#l-clar");
    }
    const txt = await text("#l-clar");
    ok(/blanket/.test(txt) && /soup/.test(txt) && /Which part feels tricky/.test(txt) && !/Try again/.test(txt) && !(await p.locator("#lesson").isHidden()), `${width}: the clarifications are answered inline in the lesson`);
    const c3 = count(/:clarify:/);
    await p.locator("#l-clar .clar-opt").nth(0).click(); await p.waitForTimeout(200);
    ok(count(/:clarify:/) === c3, `${width}: asking for one already written is 0 calls`);
    // understood after all: the options go, the answers already shown stay
    await p.click("#l-got"); await p.waitForTimeout(300);
    const cl = await p.evaluate(() => ({ opts: document.querySelectorAll("#l-clar .clar-opt").length, answers: document.querySelectorAll("#l-clar .clar").length }));
    ok(cl.opts === 0 && cl.answers === 3 && count(/:clarify:/) === c3, `${width}: "I've got it" hides the clarify options; the answers stay (0 calls)`, JSON.stringify(cl));
    await shot("got-after-clarify", "#l-status");
  });

  if (SOFT) { await ctx.close(); return { errs }; }

  await step("Open from Where Next + a real failure", async () => {
    const l0 = count(/^\/lesson$/);
    await p.click("#l-next .wn-go .btn");
    await p.waitForSelector("#l-done:not([hidden])");
    ok((await p.textContent("#l-title")) === "Eruptions" && count(/^\/lesson$/) === l0 + 1, `${width}: Open goes to the picked step (one lesson call)`);
    // a lesson WITH fork choices: one Where Next, the choices first (top one pre-selected), then in progress, deduped
    await p.waitForTimeout(300);
    const wf = await p.evaluate(() => ({
      heads: [...document.querySelectorAll("#lesson .l-head")].filter((h) => /^Where next/i.test(h.textContent)).length,
      forkBlock: document.querySelectorAll("#l-fork .fork, #l-fork .fork-opt").length,
      sections: document.querySelectorAll("#lesson .where-next .wn-opts").length,
      items: [...document.querySelectorAll("#l-next .wn-opt")].map((b) => ({ l: b.querySelector(".wn-label").textContent, choice: b.classList.contains("choice"), on: b.getAttribute("aria-checked") === "true", next: b.classList.contains("next"), why: b.querySelector(".why").textContent })),
    }));
    const labels = wf.items.map((x) => x.l), choices = wf.items.filter((x) => x.choice);
    ok(wf.heads === 1 && wf.sections === 1 && wf.forkBlock === 0, `${width}: a lesson with a fork shows exactly one Where Next (no separate fork block)`, JSON.stringify(wf));
    ok(choices.length === 3 && wf.items.slice(0, 3).every((x) => x.choice) && choices.map((x) => x.l).sort().join() === "Ash Clouds,Constellations,Lava Types", `${width}: the fork's choices come first`, JSON.stringify(labels));
    ok(wf.items[0].on && wf.items[0].next && /Suggested next/.test(wf.items[0].why) && wf.items.filter((x) => x.on).length === 1, `${width}: the top choice is pre-selected and highlighted`, JSON.stringify(wf.items[0]));
    const rest = wf.items.slice(3);
    ok(rest.length >= 1 && rest.length <= 3 && rest.every((x) => !x.choice && /In progress/.test(x.why)) && new Set(labels).size === labels.length && !rest.some((x) => x.l === "Constellations" || x.l === "Eruptions"), `${width}: then up to 3 in progress, deduped (Constellations only once, never the lesson itself)`, JSON.stringify(labels));
    await shot("fork-where-next", "#l-next");
    // opening a choice records it as the learner's pick; back on Eruptions it stays pre-selected
    const n1 = calls.length;
    await p.locator("#l-next .wn-opt").nth(2).click();
    const pickLabel = (await p.locator("#l-next .wn-opt").nth(2).locator(".wn-label").textContent());
    ok(calls.length === n1, `${width}: selecting a choice is 0 calls`);
    await p.click("#l-next .wn-go .btn");
    await p.waitForSelector("#l-done:not([hidden])");
    ok((await p.textContent("#l-title")) === pickLabel, `${width}: Open goes to the chosen fork option`);
    const picked = await p.evaluate((lbl) => { const C = window.IkoCloud, c = C.deserialize(localStorage.getItem("ikolearn.v1.cloud")); const e = c.order.find((x) => c.nodes[x].label === "Eruptions"); const f = c.nodes[e].fork; return Boolean(f && f.picked && c.nodes[f.picked].label === lbl); }, pickLabel);
    ok(picked, `${width}: opening a choice records it as the learner's pick (pre-selected next time)`);

    await p.click("#l-tricky"); await p.waitForTimeout(200);
    mock.failClarify = true;
    await p.locator("#l-clar .clar-opt").nth(2).click();
    await p.waitForFunction(() => /Try again/.test(document.querySelector("#l-clar").innerText));
    ok(!/Try again/.test(await text("#l-status")) && /couldn't get an answer/.test(await text("#l-clar")), `${width}: a real failure shows Try again (in the clarification only)`);
    mock.failClarify = false;
    const c0 = count(/:clarify:/);
    await p.locator("#l-clar").getByRole("button", { name: "Try again" }).click();
    await p.waitForFunction(() => /Which part feels tricky/.test(document.querySelector("#l-clar").innerText));
    ok(count(/:clarify:/) === c0 + 1, `${width}: Try again is one call and answers inline`);
  });

  await step("node tap + cancel on navigation", async () => {
    const c0 = calls.length;
    await js("#l-card .gcard");
    await p.waitForSelector("#hub:not([hidden])", { timeout: 4000 });
    await p.waitForTimeout(300);
    await js("#hub-cloud");
    await p.waitForSelector("#panel:not([hidden])", { timeout: 4000 });
    await p.waitForTimeout(500);
    const panel = await p.evaluate(() => ({ shown: !document.querySelector("#panel").hidden, link: /What do you notice here\?/.test(document.querySelector("#p-note").innerText) }));
    ok(panel.shown && panel.link && calls.length === c0, `${width}: a node's panel (what a tap opens) makes no call; the note is offered as a link`, JSON.stringify(panel) + " " + calls.slice(c0).join());
    await shot("node-tap");
    mock.noticeMs = 2500;
    await p.getByRole("button", { name: "What do you notice here?" }).click();
    await p.waitForTimeout(200);
    ok(count(/:notice$/) === 1, `${width}: asking for the note is one call`);
    await js("#p-lesson");
    await p.waitForSelector("#l-done:not([hidden])");
    await p.waitForTimeout(300);
    ok(aborted.some((a) => a === "/api/ikolearn/chat"), `${width}: moving on cancels the note still being written`, aborted.join());
    ok(!/Try again|few seconds/.test(await text("#lesson")), `${width}: the lesson opens right away (no "try again in a few seconds")`);
    mock.noticeMs = 60;
  });

  await step("busy: a lesson waits its turn", async () => {
    /* forget the written lessons before the app starts (it saves its own copy as the page goes) */
    await p.addInitScript(() => { if (sessionStorage.getItem("wipe")) { localStorage.setItem("ikolearn.v1.lessons", "{}"); sessionStorage.removeItem("wipe"); } });
    await p.evaluate(() => sessionStorage.setItem("wipe", "1"));
    await p.reload({ waitUntil: "networkidle" }); await p.waitForTimeout(300);
    mock.chatMs = 1500;
    await p.fill("#input", "Why is lava hot?"); await p.click("#send");
    await p.waitForTimeout(150);
    const l1 = count(/^\/lesson$/);
    await p.getByRole("button", { name: /^Continue / }).first().click();
    await p.waitForTimeout(250);
    const waiting = await text("#l-body");
    ok(/starts as soon as the last answer is finished/.test(waiting) && !/Try again/.test(await text("#lesson")) && count(/^\/lesson$/) === l1, `${width}: busy: the lesson waits its turn (no Try again, no call yet)`, waiting);
    await p.waitForSelector("#l-done:not([hidden])", { timeout: 6000 });
    ok(count(/^\/lesson$/) === l1 + 1 && /melted/.test(await text("#l-body")), `${width}: ... and starts by itself once the answer is finished (one call)`);
    mock.chatMs = 60;
  });

  ok(errs.length === 0, `${width}: no console errors`, errs.join(" | "));
  await ctx.close();
  return { errs };
}

const eq = (a, b, n) => ok(JSON.stringify(a) === JSON.stringify(b), n, `${JSON.stringify(a)} != ${JSON.stringify(b)}`);
for (const w of [390, 1280]) await run(w);
await browser.close();
server.close();
if (SHOTS) console.log("screenshots:", fs.readdirSync(SHOTS).filter((f) => f.startsWith(`flow-${TAG}-`)).join(", "));
if (fails.length) { console.error(`ikolearn flow e2e: ${pass} passed, ${fails.length} FAILED`); for (const f of fails) console.error("  x " + f); process.exit(1); }
console.log(`ikolearn flow e2e: ${pass} passed`);
