// End-to-end checks for PR 105 (the QA batch), in a real browser, every /api/ikolearn call mocked (no model calls, no key):
// a new topic never lands under another branch just because it was open last (New branch / Under <focus>); Iko's hints
// stay until dismissed (×) or the learner moves past the step, with light nudges on return visits; Iko switches light or
// dark and deletes a branch only after a gentle word and a clear confirm (0 calls); the quiet support and follow links.
// Run: IKOLEARN_PW=<path to node_modules/playwright-core> node scripts/ikolearn-qa-e2e.mjs   (IKOLEARN_BROWSER=webkit|firefox)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

if (!process.env.IKOLEARN_PW) { console.log("ikolearn qa e2e: skipped (set IKOLEARN_PW to a playwright-core folder)"); process.exit(0); }
const PW = await import(pathToFileURL(path.join(process.env.IKOLEARN_PW, "index.mjs")).href), { chromium } = PW;
const ROOT = path.resolve("public");
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
const BASE = process.env.LIVE_BASE || `http://127.0.0.1:${server.address().port}`;

let pass = 0;
const fails = [];
const ok = (c, name, d = "") => (c ? (pass += 1) : fails.push(`${name}${d ? ` -> ${d}` : ""}`));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nd = (rows) => rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
const Q = (k) => [
  { q: k + ": what is a rule?", options: ["What players must follow", "A kind of cloud", "Cold ice"], answer: 0 },
  { q: k + ": what does a game need?", options: ["Sand", "A goal", "Steam"], answer: 1 },
];
const browser = await (process.env.IKOLEARN_BROWSER ? PW[process.env.IKOLEARN_BROWSER].launch() : chromium.launch({ executablePath: process.env.IKOLEARN_CHROME || "/usr/bin/google-chrome" }));

function seed(o) {
  localStorage.clear();
  const C = window.IkoCloud, T = Date.now() - 3 * 864e5, c = C.create("Johnny", T);
  C.applyTopics(c, [{ name: "Video Games", parent: "Games", signal: "explored", chain: ["Games"] }, { name: "Puzzle Games", parent: "Games", signal: "explored", chain: ["Games"] }, { name: "Airplanes", parent: "Aviation", signal: "explored", chain: ["Aviation"] }], T);
  C.applyTopics(c, [{ name: "Running", parent: "Physical Activity", signal: "explored", chain: ["Physical Activity"] }], T + 1000);
  const id = (l) => c.order.find((x) => c.nodes[x].label === l);
  c.nodes[id("Games")].blurb = "Playing and understanding games."; c.nodes[id("Aviation")].blurb = "How planes fly.";
  c.active = id(o.active || "Games");
  if (o.visits) C.profileOf(c).visits = o.visits;
  localStorage.setItem("ikolearn.v1.name", "Johnny"); localStorage.setItem("ikolearn.v1.cloud", C.serialize(c));
  localStorage.setItem("ikolearn.v1.seen", JSON.stringify({ c: {}, ev: 0, h: { aboutCloud: 1, aboutLesson: 1, aboutDeck: 1, cloud: 1, card: 1, chat: 1, draw: 1, iko: 1 } }));
  localStorage.setItem("ikolearn.v1.thread", JSON.stringify([]));
  const who = ((window.IkoProfiles && window.IkoProfiles.current(localStorage)) || {}).active || "me";
  if (o.mem) localStorage.setItem("ikolearn-iko", JSON.stringify({ [who]: o.mem })); else localStorage.removeItem("ikolearn-iko");
  sessionStorage.clear();
  if (o.visits) sessionStorage.setItem("ikolearn.v1.visit", "1");
}

async function run(width) {
  const tag = String(width);
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
    const last = (body.messages || []).filter((m) => m.role === "user").slice(-1)[0], text = last ? last.text : "";
    calls.push({ at, focusId: body.focusId, text });
    await sleep(40);
    if (at === "/lesson") return done(200, nd([{ t: "start", model: "m" }, { t: "delta", text: "INTRO: Games have rules and a goal.\nEXPLAIN: Players follow rules to reach the goal." }, { t: "path", steps: [], next: "", choices: [{ name: "Board Games", kind: "deeper", why: "" }, { name: "Game Design", kind: "side", why: "" }], questions: Q("First"), retry: Q("Fresh") }, { t: "done" }]));
    if (at === "/chat") {
      /* the model points the new topic at Aviation (the branch open last), though Games is in focus and nothing links it */
      const topics = /card combos/i.test(text) ? [{ name: "Card Combos", parent: "", signal: "curious", chain: [], placement: "child", target: body.aviation || "Aviation" }]
        : /jet engines/i.test(text) ? [{ name: "Jet Engines", parent: "Aviation", signal: "curious", chain: ["Aviation"], placement: "child", target: "Aviation" }] : [];
      return done(200, nd([{ t: "start", model: "m" }, { t: "delta", text: "Good one." }, { t: "cloud", topics, ghosts: [] }, { t: "done" }]));
    }
    return done(503, JSON.stringify({ ok: false, reason: "off" }), "application/json");
  });
  const cloud = () => p.evaluate(() => { const C = window.IkoCloud, c = C.deserialize(localStorage.getItem("ikolearn.v1.cloud")), o = {}; Object.values(c.nodes).forEach((n) => { o[n.label] = n.parent ? c.nodes[n.parent].label : null; }); return { nodes: o, deck: (c.deck || []).map((e) => c.nodes[e.id] ? c.nodes[e.id].label : e.id) }; });
  const line = () => p.evaluate(() => { const l = document.querySelector("#iko-line"); return { shown: !l.hidden && l.getClientRects().length > 0, text: l.textContent, tip: l.getAttribute("data-tip") || "", role: l.getAttribute("role"), label: l.getAttribute("aria-label") || "" }; });
  const fresh = async (o) => { await p.goto(BASE + "/ikolearn", { waitUntil: "networkidle" }); await p.evaluate(seed, o || {}); await p.reload({ waitUntil: "networkidle" }); await p.waitForTimeout(700); };
  const ask = async (text) => {
    if (await p.locator("#iko-sheet").isHidden()) { await p.click("#iko"); await p.waitForSelector("#iko-sheet:not([hidden])"); await p.waitForTimeout(250); }
    const n0 = calls.length;
    await p.fill("#iko-in", text); await p.press("#iko-in", "Enter"); await p.waitForTimeout(700);
    return calls.length - n0;
  };
  const lesson = async (label) => { await p.click("#iko"); await p.click("#iko-all"); await p.waitForTimeout(150); await p.getByRole("button", { name: new RegExp("Continue " + label) }).first().click(); await p.waitForSelector("#l-cont:not([hidden])"); };
  const step = async (name, fn) => { try { await fn(); } catch (e) { fails.push(`${tag}: ${name} threw -> ${String(e.message || e).split("\n")[0]}`); } };

  /* 1) hints stay until dismissed or moved past */
  await step("hints", async () => {
    await fresh({});
    await p.waitForFunction(() => { const l = document.querySelector("#iko-line"); return !l.hidden && l.hasAttribute("data-tip"); }, null, { timeout: 4000 });
    const a = await line();
    ok(a.shown && /^cloud/.test(a.tip) && a.role === "button" && a.label === "Dismiss hint: " + a.text && !(await p.locator("#iko-line .tip-x").count()), `${tag}: the cloud's hint shows: a button to dismiss it, no × of its own (PR 106)`, JSON.stringify(a));
    await p.waitForTimeout(10500);
    const b = await line();
    ok(b.shown && b.text === a.text, `${tag}: the hint is still there after 10 s (no quick timeout)`, JSON.stringify(b));
    await p.click("#iko-line"); await p.waitForTimeout(200);
    const c = await line();
    ok(!c.shown && (await p.locator("#iko-sheet").isHidden()), `${tag}: tapping the bubble dismisses it (and doesn't open the chat)`, JSON.stringify(c));
    /* a lesson: its reading hint goes once the learner moves on to the check */
    await lesson("Games");
    await p.waitForFunction(() => /^learn/.test(document.querySelector("#iko-line").getAttribute("data-tip") || ""), null, { timeout: 4000 });
    const d = await line();
    ok(d.shown && /^learn/.test(d.tip), `${tag}: the lesson's reading hint`, JSON.stringify(d));
    await p.click("#l-cont"); await p.waitForTimeout(400);
    const e = await line();
    ok(!/^learn/.test(e.tip) && e.text !== d.text, `${tag}: past the reading (Continue), its hint is gone`, JSON.stringify(e));
    ok(!errs.length, `${tag}: no console errors (hints)`, errs.join(" | "));
  });

  /* 2) a light nudge on a return visit, once the cloud's own hints have had their turn */
  await step("nudge", async () => {
    await fresh({ visits: 3, mem: { t: { cloud0: 5, cloud1: 5, cloud2: 5, cloud3: 5, cloud4: 5 }, r: {}, last: "" } });
    await p.waitForFunction(() => { const l = document.querySelector("#iko-line"); return !l.hidden && l.hasAttribute("data-tip"); }, null, { timeout: 4000 });
    const a = await line();
    ok(/^cloud(6|7)$/.test(a.tip) && (/^Maybe .+ next\? It's right beside .+\.$/.test(a.text) || a.text === "Anything new you'd like to explore?"), `${tag}: a light nudge from the cloud itself (an adjacent topic, or something new)`, JSON.stringify(a));
    const mem = await p.evaluate(() => Object.values(JSON.parse(localStorage.getItem("ikolearn-iko")))[0]);
    ok(mem.t[a.tip] === 1 && mem.last === a.tip, `${tag}: counted in the ikolearn-iko rotation (never twice in a row)`, JSON.stringify(mem));
    await p.reload({ waitUntil: "networkidle" }); await p.waitForTimeout(1200);
    const b = await line();
    ok(!b.shown, `${tag}: not again a moment later (a quick reload shows none)`, JSON.stringify(b));
    /* PR 106: back on the screen after a pause, a guidance line again (not the nudge: one nudge a visit), never the same line */
    await p.evaluate(() => { const d = JSON.parse(sessionStorage.getItem("ikolearn.v1.cues") || "{}"); d.cloud = Date.now() - 120000; sessionStorage.setItem("ikolearn.v1.cues", JSON.stringify(d)); });
    await p.reload({ waitUntil: "networkidle" });
    await p.waitForFunction(() => { const l = document.querySelector("#iko-line"); return !l.hidden && l.hasAttribute("data-tip"); }, null, { timeout: 4000 });
    const g = await line();
    ok(/^cloud[0-4]$/.test(g.tip) && g.tip !== a.tip, `${tag}: after a pause the screen guides again (a guidance line; nudges stay once a visit)`, JSON.stringify(g));
  });

  /* 3) placement: Games is in focus; the model points the new topic at another branch (Aviation) */
  await step("placement", async () => {
    await fresh({});
    await lesson("Games");
    const n = await ask("add card combos");
    const s = await p.evaluate(() => ({ opts: [...document.querySelectorAll("#iko-log .place-opt")].map((b) => b.textContent), log: document.querySelector("#iko-log").textContent }));
    const c0 = await cloud();
    ok(n === 1 && calls[calls.length - 1].focusId && s.opts.join("|") === "New branch|Under Games" && !("Card Combos" in c0.nodes), `${tag}: a target on another branch with nothing linking it: the quiet choice (New branch / Under Games), nothing created yet`, JSON.stringify({ n, s, nodes: Object.keys(c0.nodes) }));
    const n0 = calls.length;
    await p.locator("#iko-log").getByRole("button", { name: "Under Games" }).click(); await p.waitForTimeout(500);
    const c1 = await cloud();
    ok(c1.nodes["Card Combos"] === "Games" && calls.length === n0, `${tag}: "Under Games" puts it under the focus (0 calls)`, JSON.stringify(c1.nodes));
    await ask("tell me about jet engines");
    const c2 = await cloud();
    ok(c2.nodes["Jet Engines"] === "Aviation", `${tag}: a topic whose own chain names Aviation still goes there (local evidence)`, JSON.stringify(c2.nodes));
  });

  /* 4) Iko's controls: light and dark, and a careful delete (0 calls) */
  await step("controls", async () => {
    await fresh({});
    await p.evaluate(() => localStorage.removeItem("ikolearn-theme"));
    let n = await ask("switch to dark mode");
    const t1 = await p.evaluate(() => ({ theme: document.documentElement.getAttribute("data-theme"), saved: localStorage.getItem("ikolearn-theme"), log: document.querySelector("#iko-log").textContent }));
    ok(n === 0 && t1.theme === "dark" && t1.saved === "dark" && /Dark mode it is\./.test(t1.log), `${tag}: "switch to dark mode": dark, kept like the toggle, 0 calls`, JSON.stringify({ n, t1 }));
    n = await ask("light mode please");
    const t2 = await p.evaluate(() => document.documentElement.getAttribute("data-theme"));
    ok(n === 0 && t2 === "light", `${tag}: "light mode please": light again, 0 calls`, JSON.stringify({ n, t2 }));
    n = await ask("what is dark matter?");
    ok(n === 1, `${tag}: an ordinary question still goes to Iko's model`, String(n));
    n = await ask("delete aviation");
    const d1 = await p.evaluate(() => ({ q: (document.querySelector("#iko-log .del .place-q") || {}).textContent || "", opts: [...document.querySelectorAll("#iko-log .del .place-opt")].map((b) => b.textContent) }));
    let c = await cloud();
    ok(n === 0 && /We could leave Aviation be\. Branches you don't use fade slowly/.test(d1.q) && /removes the 1 topic under it/.test(d1.q) && d1.opts.join("|") === "Keep it|Delete Aviation" && "Aviation" in c.nodes, `${tag}: "delete aviation": a gentle word for leaving it, Keep it / Delete, nothing deleted yet`, JSON.stringify({ n, d1 }));
    await p.locator("#iko-log").getByRole("button", { name: "Keep it" }).click(); await p.waitForTimeout(300);
    c = await cloud();
    ok("Aviation" in c.nodes && /Kept Aviation\./.test(await p.locator("#iko-log").textContent()), `${tag}: "Keep it" keeps it`);
    await ask("remove the aviation branch");
    await p.locator("#iko-log").getByRole("button", { name: "Delete Aviation" }).click(); await p.waitForTimeout(400);
    c = await cloud();
    ok(!("Aviation" in c.nodes) && !("Airplanes" in c.nodes) && "Games" in c.nodes && /Aviation is gone from your cloud\./.test(await p.locator("#iko-log").textContent()), `${tag}: only a clear "Delete Aviation" removes it (and what's under it); the rest stays`, JSON.stringify(Object.keys(c.nodes)));
    n = await ask("delete johnny");
    ok(n === 0 && /couldn't find|That's you/.test(await p.locator("#iko-log").textContent()), `${tag}: the learner's own name is never deleted`);
    ok(!errs.length, `${tag}: no console errors (controls)`, errs.join(" | "));
  });

  /* 6) PR 106: no "< Your cloud"; Back from the whole conversation; the controls low on the right; the movement line learns */
  await step("pr106", async () => {
    await fresh({});
    ok(!(await p.locator("#to-cloud").count()) && /IkoLearn is a place where you can start learning about as many or as few things as you want\. Iko will help you/.test(await p.textContent("#welcome .lede")) && !/We at Ikosagon/.test(await p.content()), `${tag}: no "< Your cloud" link; softer welcome words`);
    const z = await p.evaluate(() => { const r = (s) => { const e = document.querySelector(s); if (!e || !e.getClientRects().length) return null; const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, r: b.right, b: b.bottom }; }; return { zoom: r(".zoom"), top: r(".cloud-top"), deck: r("#cloud-deck"), iko: r("#iko"), flow: [...document.querySelectorAll(".cloud-flow:not([hidden]) > *")].filter((e) => e.getClientRects().length).map((e) => { const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, r: b.right, b: b.bottom }; }), vw: innerWidth, vh: innerHeight, inTop: Boolean(document.querySelector(".cloud-top .zoom")) }; });
    ok(z.zoom && !z.inTop && z.zoom.y > z.top.b && z.zoom.r <= z.vw - 8 && z.zoom.r > z.vw - 60 && z.flow.every((f) => f.r <= z.zoom.x || f.x >= z.zoom.r || f.b <= z.zoom.y || f.y >= z.zoom.b) && z.zoom.b <= z.vh - 100 && z.iko.x < 24 && z.iko.y < 24, `${tag}: zoom and Recentre at the bottom right, out of the header (Iko and the deck stay put), clear of the Pick up row`, JSON.stringify(z));
    /* the movement line: hidden while Iko talks; tapping it hides it for good */
    await p.waitForFunction(() => !document.querySelector("#iko-line").hidden, null, { timeout: 4000 }).catch(() => {});
    const kb = await p.evaluate(() => { const l = document.querySelector("#iko-line"); return l.hidden ? "" : l.textContent; });
    await p.focus("#iko-line"); await p.keyboard.press("Enter"); await p.waitForTimeout(150);
    ok(kb && (await p.isHidden("#iko-line")) && (await p.isHidden("#iko-sheet")), `${tag}: the bubble goes with Enter too (keyboard)`, kb);
    const h1 = await p.evaluate(() => { const h = document.querySelector(".cloud-hint"); return { text: h.textContent, vis: getComputedStyle(h).visibility, role: h.getAttribute("role") }; });
    ok(/Drag to move/.test(h1.text) && h1.vis === "visible" && h1.role === "button", `${tag}: the movement line shows (a button to hide it)`, JSON.stringify(h1));
    await p.click(".cloud-hint"); await p.waitForTimeout(150);
    const h2 = await p.evaluate(() => ({ text: document.querySelector(".cloud-hint").textContent, saved: JSON.parse(localStorage.getItem("ikolearn-moves") || "{}") }));
    ok(!h2.text && h2.saved.x === 1, `${tag}: tapped, it's gone and remembered on this device`, JSON.stringify(h2));
    await p.reload({ waitUntil: "networkidle" }); await p.waitForTimeout(500);
    ok(!(await p.textContent(".cloud-hint")), `${tag}: still gone after a reload`);
    /* or once both gestures were tried: a drag, then a zoom */
    await p.evaluate(() => localStorage.removeItem("ikolearn-moves")); await p.reload({ waitUntil: "networkidle" }); await p.waitForTimeout(500);
    const cv = await p.evaluate(() => { const r = document.querySelector("#cloud-canvas").getBoundingClientRect(); return { x: r.left + r.width * 0.8, y: r.top + r.height * 0.3 }; });
    await p.mouse.move(cv.x, cv.y); await p.mouse.down(); await p.mouse.move(cv.x - 60, cv.y + 20, { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(200);
    const m1 = await p.evaluate(() => ({ text: document.querySelector(".cloud-hint").textContent, saved: JSON.parse(localStorage.getItem("ikolearn-moves") || "{}") }));
    ok(/Drag to move/.test(m1.text) && m1.saved.drag === 1 && !m1.saved.zoom, `${tag}: a drag alone: the line stays (zoom not tried yet)`, JSON.stringify(m1));
    await p.mouse.wheel(0, -120); await p.waitForTimeout(300);
    const m2 = await p.evaluate(() => ({ text: document.querySelector(".cloud-hint").textContent, saved: JSON.parse(localStorage.getItem("ikolearn-moves") || "{}") }));
    ok(!m2.text && m2.saved.drag === 1 && m2.saved.zoom === 1, `${tag}: a drag and a zoom: the line is gone for good`, JSON.stringify(m2));
    /* the whole conversation from a lesson: Back returns to it; Escape too */
    await lesson("Games");
    await p.click("#iko"); await p.click("#iko-all"); await p.waitForTimeout(300);
    const b1 = await p.evaluate(() => ({ lesson: !document.querySelector("#lesson").hidden, back: document.querySelector("#chat-back").hidden ? "" : document.querySelector("#chat-back").textContent }));
    ok(!b1.lesson && b1.back === "Back", `${tag}: the whole conversation shows Back`, JSON.stringify(b1));
    await p.click("#chat-back"); await p.waitForTimeout(400);
    ok(await p.evaluate(() => !document.querySelector("#lesson").hidden && /Games/.test(document.querySelector("#l-title").textContent) && document.querySelector("#chat-back").hidden), `${tag}: Back returns to the lesson it was opened from`);
    await p.click("#iko"); await p.click("#iko-all"); await p.waitForTimeout(300);
    await p.keyboard.press("Escape"); await p.waitForTimeout(400);
    ok(await p.evaluate(() => !document.querySelector("#lesson").hidden), `${tag}: Escape does the same`);
    /* the deck: a line for the deck; the bubble also goes with Enter */
    await p.click("#thumb"); await p.waitForSelector("#cloud:not([hidden])"); await p.waitForTimeout(300);
    ok(!errs.length, `${tag}: no console errors (PR 106)`, errs.join(" | "));
  });

  /* 5) the quiet support and follow links */
  await step("links", async () => {
    const l = await p.evaluate(() => [...document.querySelectorAll("[data-sup] a")].map((a) => ({ t: a.textContent, href: a.getAttribute("href"), tgt: a.target, rel: a.rel, where: a.closest(".iko-foot") ? "iko" : a.closest(".cloud-foot") ? "cloud" : a.closest("#page-foot") ? "page" : a.closest("#chat") ? "chat" : a.closest("#welcome") ? "welcome" : "?" })));
    const fb = l.filter((x) => x.t === "Support & feedback"), xl = l.filter((x) => x.t === "Follow on X");
    ok(fb.length === 4 && fb.every((x) => x.href === "https://ikosagon.com/contact?name=Johnny&subject=IkoLearn%20Feedback" && x.tgt === "_blank"), `${tag}: "Support & feedback" opens the contact form (PR 108: no email client), the learner's name and "IkoLearn Feedback" filled in (PR 110: the welcome, the conversation's fine print, the cloud's footer and the page foot)`, JSON.stringify(fb));
    ok(xl.length === 4 && xl.every((x) => x.href === "https://x.com/IkosagonAI" && x.tgt === "_blank" && /noopener/.test(x.rel)), `${tag}: "Follow on X" goes to @IkosagonAI in a new tab`, JSON.stringify(xl));
    ok(l.length === 8 && !l.some((x) => /fund|donat/i.test(x.t)), `${tag}: no donate link (no real donation page yet)`, JSON.stringify(l.map((x) => x.t)));
    ok(!l.some((x) => x.where === "iko") && ["cloud", "chat", "page", "welcome"].every((w) => l.filter((x) => x.where === w).length === 2), `${tag}: none in Iko's sheet (PR 106): in the footers (PR 110: the welcome and the page foot too)`, JSON.stringify(l.map((x) => x.where)));
    const wide = await p.evaluate(() => getComputedStyle(document.querySelector(".cloud-foot .sup")).display !== "none");
    ok(wide, `${tag}: on the cloud's footer at every width (PR 110: a phone too)`, String(wide));
    const sz = await p.evaluate(() => { const a = document.querySelector("#chat [data-sup] a"), b = document.querySelector("#family-link"); return [parseFloat(getComputedStyle(a).fontSize), parseFloat(getComputedStyle(b).fontSize)]; });
    ok(sz[0] <= sz[1] + 0.5, `${tag}: the links are no louder than the fine print beside them`, JSON.stringify(sz));
  });
  await ctx.close();
}

for (const w of [390, 1280]) await run(w);
await browser.close();
server.close();
console.log(`ikolearn qa e2e: ${pass} passed${fails.length ? `, ${fails.length} FAILED` : ""}`);
fails.forEach((f) => console.log("  x " + f));
process.exit(fails.length ? 1 : 0);
