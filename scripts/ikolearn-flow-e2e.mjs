// End-to-end checks for the lesson flow in a real browser, with every /api/ikolearn call mocked (no model calls):
// "I've got it" (0 calls, stays, no auto-advance), "Still tricky" (a clarification prepared in the lesson's own call,
// shown at once with 0 calls; otherwise 1 call; more options 1 call each, inline; a chat link), Where Next (only the
// current subject, equal boxes, the action inside the picked box, other subjects under "Also in progress"), no call on a
// node tap, cancel on navigation, lessons queue while busy, and "Try again" only on a real failure.
// Run: IKOLEARN_PW=<path to node_modules/playwright-core> node scripts/ikolearn-flow-e2e.mjs [--shots DIR] [--tag after] [--root public] [--soft]
// (--soft: screenshots only, for an older build without these features.) Skips when IKOLEARN_PW is not set.
import { passCheck } from "./fixtures/ikolearn-pass-check.mjs";
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
/* written in the Magma lesson's own call, kept ready for "Still tricky" (the other lessons leave it out: then it is 1 call) */
const TRICKY = "Picture the ground as a thick warm quilt over a stove. Deep down it gets so hot that rock turns soft and runny, and that runny rock is magma. Where does the heat come from?";
const FORK = [{ name: "Ash Clouds", why: "What rises into the sky", kind: "deeper" }, { name: "Lava Types", why: "Where the lava goes", kind: "wider" }, { name: "Constellations", why: "Something different", kind: "wider" }];
/* Shawn's case (Oct 22): the model's fork offers an unrelated top-10 topic (with a claim about the learner) and the path's own next step */
const DM_FORK = [{ name: "Python Basics", why: "Review your strong coding skills", kind: "side" }, { name: "Tables", why: "Learn how rows and columns store data", kind: "deeper" }];
const DM_LESSON = "INTRO: Data management is keeping information organised so you can find it again.\nEXPLAIN: Most data lives in tables.\nSTEP: Each row is one thing.\nSTEP: Each column is one detail about it.\nEXAMPLE: A class list with names and birthdays.";
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
      return done(200, ndjson([{ t: "start", model: "m" }, { t: "delta", text: LESSON }, { t: "path", steps: [], next: "", choices: body.focus === "Eruptions" ? FORK : [], questions: [], tricky: body.focus === "Magma" ? TRICKY : undefined }, { t: "done" }]));
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
    if (sel) await p.evaluate((q) => { const e = document.querySelector(q); if (e && !e.closest("#iko-sheet")) e.scrollIntoView({ block: "start" }); }, sel); /* in Iko's sheet only the sheet scrolls */
    await p.waitForTimeout(250);
    await p.screenshot({ path: path.join(SHOTS, `flow-${TAG}-${width}-${name}.png`) });
  };
  const count = (re) => calls.filter((c) => re.test(c)).length;
  const js = (sel) => p.evaluate((q) => { const e = document.querySelector(q); if (e) e.click(); return Boolean(e); }, sel);
  /* the app opens on the cloud (home); these steps begin with Iko, as a learner who taps "Talk to Iko" */
  const toIko = async () => { if (await p.evaluate(() => { const c = document.querySelector("#cloud"), l = document.querySelector("#lesson"); return Boolean(c && l && !c.hidden && l.hidden); })) { await p.click("#iko"); await p.click("#iko-all"); await p.waitForTimeout(120); } };
  const step = async (name, fn) => { try { await toIko(); await fn(); } catch (e) { fails.push(`${width}: ${name} threw -> ${String(e.message || e).split("\n")[0]}`); } };
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
    const wn0 = await p.evaluate(() => [...document.querySelectorAll("#l-next .wn-opt")].map((b) => b.classList.contains("on") && b.classList.contains("path")));
    if (!SOFT) ok(wn0[0] === true, `${width}: Where Next is in the lesson from the start, the next step pre-selected`);
    const n0 = calls.length, title0 = await p.textContent("#l-title");
    await p.click("#l-got");
    await p.waitForTimeout(400);
    const after = await p.evaluate(() => ({ title: document.querySelector("#l-title").textContent, status: document.querySelector("#l-status").innerText, lessonShown: !document.querySelector("#lesson").hidden, retry: /Try again/.test(document.querySelector("#lesson").innerText),
      wn: [...document.querySelectorAll("#l-next .wn-opt")].map((b) => ({ l: b.querySelector(".wn-label")?.textContent, on: b.classList.contains("on"), kind: b.getAttribute("data-kind"), why: b.querySelector(".why")?.textContent, id: b.getAttribute("data-id") })) }));
    ok(calls.length === n0, `${width}: "I've got it" makes 0 calls`, calls.slice(n0).join());
    ok(after.lessonShown && after.title === title0, `${width}: "I've got it" stays on the lesson (no auto-advance)`);
    ok(!after.retry, `${width}: no Try again after a confirmation`);
    await shot("got-where-next", "#l-status");
    await p.waitForTimeout(1500);
    ok((await p.textContent("#l-title")) === title0 && !(await p.locator("#lesson").isHidden()) && calls.length === n0, `${width}: still on the same lesson 2 s later (no auto-advance, still 0 calls)`);
    const prog = await p.evaluate(() => { const C = window.IkoCloud, c = C.deserialize(localStorage.getItem("ikolearn.v1.cloud")); const m = c.order.find((x) => c.nodes[x].label === "Magma"); return { opened: Boolean(c.nodes[m].opened), mastery: c.nodes[m].mastery }; });
    ok(prog.opened && prog.mastery > 0, `${width}: "I've got it" marks progress on the device`, JSON.stringify(prog));
    if (SOFT) return;
    ok(/^That's it\./.test(after.status), `${width}: a short "That's it." note`, after.status);
    const main = after.wn.filter((x) => x.kind !== "progress"), alt = after.wn.filter((x) => x.kind === "progress");
    eq(main.map((x) => x.kind), ["path", "branch"], `${width}: Where Next: continue, then a related step (no "different path" slot)`);
    const subj = await p.evaluate((ids) => { const C = window.IkoCloud, c = C.deserialize(localStorage.getItem("ikolearn.v1.cloud")); const up = (id) => { const out = []; let n = c.nodes[id]; while (n) { out.push(n.label); n = c.nodes[n.parent]; } return out; }; return ids.map((id) => up(id).includes("Volcanoes") ? "Volcanoes" : up(id).join(">")); }, main.map((x) => x.id));
    ok(subj.every((x) => x === "Volcanoes"), `${width}: Where Next holds only steps in the current subject (Volcanoes)`, JSON.stringify(subj));
    ok(main[0].on && after.wn.filter((x) => x.on).length === 1 && /^Next on this path/.test(main[0].why) && !after.wn.some((x) => /different path/i.test(x.why || "")), `${width}: Where Next: the path's next step pre-selected, with honest reasons`, JSON.stringify(after.wn));
    eq(main.map((x) => x.l), ["Eruptions", "Lava Types"], `${width}: Where Next order: the path's next step, then its sibling`);
    eq(alt.map((x) => x.l), ["Starter Basics", "Constellations", "Kneading"], `${width}: other subjects go under "Also in progress" (most recent first, up to 3)`);
    ok(/^Also in progress$/i.test((await text("#l-next .wn-sub")).trim()) && alt.every((x) => /In progress/.test(x.why)), `${width}: "Also in progress" is labelled as such`);
    /* equal boxes, no overflow, the action inside the picked box */
    const geo = () => p.evaluate(() => {
      const opts = [...document.querySelectorAll("#l-next .wn-opt")], r = (e) => e.getBoundingClientRect();
      const on = document.querySelector("#l-next .wn-opt.on"), act = on && on.querySelector(".wn-act");
      const ar = act && r(act), orr = on && r(on);
      return { w: opts.map((o) => Math.round(r(o).width)), h: opts.map((o) => Math.round(r(o).height)), weight: opts.map((o) => getComputedStyle(o.querySelector(".wn-label")).fontWeight),
        over: opts.filter((o) => o.scrollWidth > o.clientWidth + 1 || o.scrollHeight > o.clientHeight + 1).length, page: document.documentElement.scrollWidth - window.innerWidth,
        acts: opts.map((o) => getComputedStyle(o.querySelector(".wn-act")).visibility), actText: act && act.textContent, actLabel: act && act.getAttribute("aria-label"),
        rows: [...document.querySelectorAll("#l-next .wn-opts")].every((g) => { const t = [...g.children].map((o) => r(o).top); return t.every((x) => t.every((y) => Math.abs(x - y) < 1 || Math.abs(x - y) >= r(g.children[0]).height)); }), tops: opts.map((o) => Math.round(r(o).top)), styles: opts.map((o) => { const c = getComputedStyle(o); return c.marginTop + "/" + c.transform + "/" + c.alignSelf; }),
        inside: Boolean(ar && ar.left >= orr.left && ar.right <= orr.right + 0.5 && ar.top >= orr.top && ar.bottom <= orr.bottom + 0.5), outside: document.querySelectorAll("#l-next .wn-go").length };
    });
    const g = await geo();
    ok(new Set(g.h).size === 1 && new Set(g.w).size === 1 && new Set(g.weight).size === 1, `${width}: every Where Next box is the same size and weight`, JSON.stringify(g));
    ok(g.over === 0 && g.page <= 0, `${width}: no box overflows, no sideways scroll`, JSON.stringify(g));
    ok(g.rows, `${width}: boxes side by side line up on the same row`, JSON.stringify(g));
    ok(g.inside && g.outside === 0 && g.actText === "Continue" && g.actLabel === "Continue with Eruptions" && g.acts.filter((v) => v === "visible").length === 1, `${width}: the picked box holds its own "Continue" (nothing below the list)`, JSON.stringify(g));
    await p.locator("#l-next .wn-opt .wn-pick").nth(1).click();
    const picked = await p.evaluate(() => ({ on: [...document.querySelectorAll("#l-next .wn-pick")].map((b) => b.getAttribute("aria-checked")), focus: document.activeElement && document.activeElement.getAttribute("aria-label") }));
    const g2 = await geo();
    ok(picked.on.join() === "false,true,false,false,false" && g2.inside && g2.actText === "Open" && g2.actLabel === "Open Lava Types" && picked.focus === "Open Lava Types" && calls.length === n0, `${width}: tapping a box selects it (0 calls); its own "Open" shows inside it and takes focus`, JSON.stringify(picked) + JSON.stringify(g2));
    ok(JSON.stringify(g2.h) === JSON.stringify(g.h) && g2.rows, `${width}: selecting does not change any box size or row`, JSON.stringify(g2));
    await shot("where-next-picked", "#l-next");
    /* a very long title is clamped to two lines; the box keeps its size */
    const long = await p.evaluate(() => {
      const b = document.querySelector("#l-next .wn-opt:not(.on)"), lb = b.querySelector(".wn-label"), h0 = b.getBoundingClientRect().height;
      lb.textContent = "How the slow movement of very large plates deep under the ocean floor slowly builds whole chains of brand new volcanic islands";
      const r = { same: Math.round(b.getBoundingClientRect().height) === Math.round(h0), clamped: lb.scrollHeight > lb.clientHeight + 1, lines: Math.round(lb.clientHeight / parseFloat(getComputedStyle(lb).lineHeight)), over: b.scrollWidth > b.clientWidth + 1 };
      return r;
    });
    ok(long.same && long.clamped && long.lines <= 2 && !long.over, `${width}: a long title is clamped to two lines, the box keeps its size`, JSON.stringify(long));
    await p.locator("#l-next .wn-opt .wn-pick").nth(0).click();
  });

  await step("Still tricky", async () => {
    const n0 = calls.length;
    await p.click("#l-tricky");
    await p.waitForTimeout(300);
    ok(!(await p.locator("#lesson").isHidden()) && calls.length === n0, `${width}: "Still tricky" stays on the lesson; the prepared clarification is 0 calls`, calls.slice(n0).join());
    await shot("tricky-prepared", "#l-status");
    if (SOFT) return;
    const prep = await p.evaluate(() => ({ simpler: (document.querySelector('#l-clar .clar[data-style="simpler"] .clar-body') || {}).innerText || "", focus: Boolean(document.activeElement && document.activeElement.closest('#l-clar .clar[data-style="simpler"]')), chat: (document.querySelector("#l-clar .clar-chat") || {}).innerText || "", status: document.querySelector("#l-status").innerText }));
    ok(/thick warm quilt/.test(prep.simpler) && /Where does the heat come from\?/.test(prep.simpler), `${width}: the simpler explanation is shown at once (written with the lesson)`, JSON.stringify(prep));
    ok(prep.focus, `${width}: focus moves to the prepared clarification`);
    ok(/Talk it through with Iko/.test(prep.chat) && /another way to see it/.test(prep.status), `${width}: a short note, and a way to talk it through in chat`, JSON.stringify(prep));
    const opts = await p.evaluate(() => [...document.querySelectorAll("#l-clar .clar-opt")].map((b) => b.textContent));
    eq(opts, ["Explain it more simply", "Show me a worked example", "Ask me a question"], `${width}: three ways to clarify are still offered`);
    for (const [i, style] of ["simpler", "example", "question"].entries()) {
      const before = count(/:clarify:/);
      await p.locator("#l-clar .clar-opt").nth(i).click();
      await p.waitForFunction((st) => { const b = document.querySelector(`#l-clar .clar[data-style="${st}"] .clar-body`); return b && !b.classList.contains("streaming") && b.innerText.length > 20; }, style);
      await p.waitForTimeout(100);
      if (i === 0) ok(count(/:clarify:/) === before, `${width}: "simpler" is already written: 0 calls`);
      else ok(count(/:clarify:/) === before + 1 && count(new RegExp(":clarify:" + style + "$")) === 1, `${width}: "${style}" is exactly 1 call`);
      if (i === 1) await shot("clarified", "#l-clar");
    }
    const txt = await text("#l-clar");
    ok(/quilt/.test(txt) && /soup/.test(txt) && /Which part feels tricky/.test(txt) && !/Try again/.test(txt) && !(await p.locator("#lesson").isHidden()), `${width}: the clarifications are answered inline in the lesson`);
    const c3 = count(/:clarify:/);
    await p.locator("#l-clar .clar-opt").nth(2).click(); await p.waitForTimeout(200);
    ok(count(/:clarify:/) === c3, `${width}: asking for one already written is 0 calls`);
    // understood after all: the options and the chat link go, the answers already shown stay; still no auto-advance
    const t0 = await p.textContent("#l-title");
    // Iko's sheet covers the lesson's buttons on a phone, so it carries "I've got it": visible and tappable, at any scroll
    const gotAt = await p.evaluate(() => { const b = document.querySelector("#iko-got"), r = b.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { shown: Boolean(b.offsetParent), top: hit === b, inView: r.top >= 0 && r.bottom <= innerHeight }; });
    ok(gotAt.shown && gotAt.top && gotAt.inView, `${width}: with Iko's sheet open, "I've got it" is in the sheet, visible and on top`, JSON.stringify(gotAt));
    await p.click("#iko-got"); await p.waitForTimeout(300);
    ok(await p.isHidden("#iko-sheet"), `${width}: "I've got it" in the sheet closes it`);
    const cl = await p.evaluate(() => ({ opts: document.querySelectorAll("#l-clar .clar-opt").length, chat: document.querySelectorAll("#l-clar .clar-chat").length, answers: document.querySelectorAll("#l-clar .clar").length, title: document.querySelector("#l-title").textContent }));
    ok(cl.opts === 0 && cl.chat === 0 && cl.answers === 3 && cl.title === t0 && count(/:clarify:/) === c3, `${width}: "I've got it" hides the options and chat link; the answers stay (0 calls, no auto-advance)`, JSON.stringify(cl));
    await shot("got-after-clarify", "#l-status");
  });

  if (SOFT) { await ctx.close(); return { errs }; }

  await step("Open from Where Next + a real failure", async () => {
    const l0 = count(/^\/lesson$/);
    await p.click("#l-next .wn-opt.on .wn-act");
    await p.waitForSelector("#l-done:not([hidden])");
    ok((await p.textContent("#l-title")) === "Eruptions" && count(/^\/lesson$/) === l0 + 1, `${width}: the box's Continue goes to the picked step (one lesson call)`);
    // a lesson WITH fork choices: one Where Next, the choices first (top one pre-selected), then in progress, deduped
    await p.waitForTimeout(300);
    const wf = await p.evaluate(() => ({
      heads: [...document.querySelectorAll("#lesson .l-head")].filter((h) => /^Where next/i.test(h.textContent)).length,
      forkBlock: document.querySelectorAll("#l-fork .fork, #l-fork .fork-opt").length,
      sections: document.querySelectorAll("#lesson .where-next .wn-opts").length,
      items: [...document.querySelectorAll("#l-next .wn-opt")].map((b) => ({ l: b.querySelector(".wn-label").textContent, kind: b.getAttribute("data-kind"), on: (b.querySelector(".wn-pick") || b).getAttribute("aria-checked") === "true", why: b.querySelector(".why").textContent })),
    }));
    const labels = wf.items.map((x) => x.l);
    ok(wf.heads === 1 && wf.sections === 2 && wf.forkBlock === 0, `${width}: a lesson with a fork shows exactly one Where Next (its list + "Also in progress"; no separate fork block)`, JSON.stringify(wf));
    const fmain = wf.items.filter((x) => x.kind !== "progress"), rest = wf.items.filter((x) => x.kind === "progress");
    ok(fmain.length >= 2 && fmain.length <= 3 && fmain[0].kind === "path" && fmain.slice(1).every((x) => x.kind === "branch"), `${width}: a fork lesson: continue, then related steps only (no "different path")`, JSON.stringify(fmain));
    ok(wf.items[0].on && wf.items.filter((x) => x.on).length === 1 && labels[0] === "Ash Clouds" && labels[1] === "Lava Types" && !fmain.some((x) => x.l === "Constellations"), `${width}: the continuation (the new deeper step) is pre-selected; the nearby fork choice is related; the far one (Constellations) is not offered here`, JSON.stringify(labels));
    ok(rest.length <= 3 && rest.every((x) => /In progress/.test(x.why)) && new Set(labels).size === labels.length && rest.filter((x) => x.l === "Constellations").length === 1 && !labels.includes("Eruptions"), `${width}: Constellations (another subject) sits once under "Also in progress", never the lesson itself`, JSON.stringify(labels));
    await shot("fork-where-next", "#l-next");
    // opening a choice records it as the learner's pick; back on Eruptions it stays pre-selected
    const n1 = calls.length;
    await p.locator("#l-next .wn-opt .wn-pick").nth(1).click();
    const pickLabel = (await p.locator("#l-next .wn-opt").nth(1).locator(".wn-label").textContent());
    ok(calls.length === n1, `${width}: selecting a choice is 0 calls`);
    await p.click("#l-next .wn-opt.on .wn-act");
    await p.waitForSelector("#l-done:not([hidden])");
    ok((await p.textContent("#l-title")) === pickLabel, `${width}: Open goes to the chosen fork option`);
    const picked = await p.evaluate((lbl) => { const C = window.IkoCloud, c = C.deserialize(localStorage.getItem("ikolearn.v1.cloud")); const e = c.order.find((x) => c.nodes[x].label === "Eruptions"); const f = c.nodes[e].fork; return Boolean(f && f.picked && c.nodes[f.picked].label === lbl); }, pickLabel);
    ok(picked, `${width}: opening a choice records it as the learner's pick (pre-selected next time)`);

    /* this lesson came without a prepared clarification: "Still tricky" writes one (exactly 1 call); a real failure offers Try again */
    mock.failClarify = true;
    const cf = count(/:clarify:/);
    await p.click("#l-tricky");
    await p.waitForFunction(() => /Try again/.test(document.querySelector("#l-clar").innerText));
    ok(count(/:clarify:/) === cf + 1 && count(/:clarify:simpler$/) >= 1, `${width}: not prepared: "Still tricky" asks for the simpler one by itself (exactly 1 call)`, calls.slice(-3).join());
    ok(!/Try again/.test(await text("#l-status")) && /couldn't get an answer/.test(await text("#l-clar")), `${width}: a real failure shows Try again (in the clarification only)`);
    mock.failClarify = false;
    const c0 = count(/:clarify:/);
    await p.locator("#l-clar").getByRole("button", { name: "Try again" }).click();
    await p.waitForFunction(() => /thick blanket/.test(document.querySelector("#l-clar").innerText));
    ok(count(/:clarify:/) === c0 + 1, `${width}: Try again is one call and answers inline`);
    /* talking it through: the chat opens on this topic with the question ready (no call until it is sent) */
    const cc = calls.length;
    await p.locator("#l-clar .clar-chat").getByRole("button", { name: "Talk it through with Iko" }).click();
    await p.waitForTimeout(250);
    const chat = await p.evaluate(() => ({ lesson: !document.querySelector("#lesson").hidden, sheet: !document.querySelector("#iko-sheet").hidden, input: document.querySelector("#iko-in").value, focus: document.activeElement && document.activeElement.id }));
    ok(chat.lesson && chat.sheet && /still finding .+ tricky/.test(chat.input) && chat.input.includes(pickLabel) && chat.focus === "iko-in" && calls.length === cc, `${width}: "Talk it through with Iko" (in Iko's sheet, the lesson stays) has the question ready (0 calls)`, JSON.stringify(chat));
    await p.keyboard.press("Escape"); await p.waitForTimeout(100);
  });

  await step("node tap + cancel on navigation", async () => {
    const c0 = calls.length;
    await js("#l-card .gcard");
    await p.waitForSelector("#hub:not([hidden])", { timeout: 4000 });
    await p.waitForTimeout(300);
    await js("#hub-cloud");
    await p.waitForSelector("#panel:not([hidden])", { timeout: 4000 });
    await p.waitForTimeout(500);
    const panel = await p.evaluate(() => ({ shown: !document.querySelector("#panel").hidden, link: /What do you notice here\?/.test(document.querySelector("#p-note").innerText), desc: !document.querySelector("#p-desc").hidden }));
    /* this node has no description yet: its card asks once for it (with its siblings); this mock fails it, so the old line stays. No note call. */
    const made = calls.slice(c0);
    ok(panel.shown && panel.link && !panel.desc && made.length === 1 && /describe$/.test(made[0]), `${width}: a node's panel (what a tap opens) makes no note call (only the one description backfill, failed here: the note is offered as a link)`, JSON.stringify(panel) + " " + made.join());
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
    await toIko();
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

/* Shawn's case: a Data Management lesson (path Tables > Queries > Filtering), the quiz answered right, "I've got it". */
async function runShawn(width) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 860 }, timezoneId: "America/Toronto" });
  const p = await ctx.newPage();
  p.setDefaultTimeout(6000);
  const errs = [], calls = [];
  p.on("pageerror", (e) => errs.push("pageerror " + e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await p.route("**/api/ikolearn/**", async (route) => {
    const at = new URL(route.request().url()).pathname.replace("/api/ikolearn", "");
    let body = {}; try { body = JSON.parse(route.request().postData() || "{}"); } catch { body = {}; }
    calls.push(at);
    if (at === "/lesson" && body.focus === "Data Management") {
      await sleep(60);
      const questions = [{ q: "How does a table store data?", options: ["As one long sentence", "In a single number", "In rows and columns", "As a picture"], answer: 2 }];
      return route.fulfill({ status: 200, contentType: "application/x-ndjson", body: ndjson([{ t: "start", model: "m" }, { t: "delta", text: DM_LESSON }, { t: "path", steps: [], next: "", choices: DM_FORK, questions }, { t: "done" }]) });
    }
    return route.fulfill({ status: 503, contentType: "application/json", body: '{"ok":false,"reason":"off"}' });
  });
  const tag = `${width}: Shawn's case`;
  try {
    await p.goto(BASE + "/ikolearn", { waitUntil: "networkidle" });
    await p.evaluate(() => {
      const C = window.IkoCloud, T = Date.now() - 3 * 864e5, c = C.create("Shawn", T);
      const kids = (names, m) => names.map((n, i) => ({ name: n, order: i + 1, score: 0.6 - i * 0.05, why: "", role: "core", motif: m[i] }));
      C.applyCreate(c, { items: [
        { node: { name: "Data Management", chain: ["Computing"], motif: "grid" }, card: { title: "Data Management", blurb: "Keeping information in order.", goal: "" }, children: kids(["Tables", "Queries", "Filtering"], ["grid", "seed", "drop"]) },
        { node: { name: "Coding", chain: ["Computing"], motif: "spark" }, card: { title: "Coding", blurb: "Writing programs.", goal: "" }, children: kids(["Python Basics", "Loops"], ["spark", "clock"]) },
        { node: { name: "Birds", chain: ["Nature"], motif: "leaf" }, card: { title: "Birds", blurb: "Feathered friends.", goal: "" }, children: kids(["Songbirds", "Owls"], ["leaf", "star"]) },
      ] }, { t: T });
      const id = (l) => c.order.find((x) => c.nodes[x].label === l);
      /* Python Basics: much practised, high in the top 10, and COMPLETED (an achieved card, as in Shawn's cloud) */
      for (let i = 0; i < 6; i++) C.engage(c, id("Python Basics"), "open", T + 2000 + i);
      Object.assign(c.nodes[id("Python Basics")], { ghost: false, correct: 3, mastery: 1 });
      Object.assign(c.nodes[id("Owls")], { ghost: false, opened: true, engaged: 1, touched: T + 1000, mastery: 0.2 });
      C.joinDeck(c, T + 4000);
      c.active = id("Data Management");
      localStorage.setItem("ikolearn.v1.name", "Shawn"); localStorage.setItem("ikolearn.v1.cloud", C.serialize(c));
      localStorage.setItem("ikolearn.v1.seen", JSON.stringify({ c: {}, ev: 0, h: { cloud: 1, card: 1, chat: 1, draw: 1 } }));
      localStorage.setItem("ikolearn.v1.thread", JSON.stringify([{ id: "m1", at: T, role: "model", local: true, text: "Welcome back, Shawn." }]));
    });
    await p.reload({ waitUntil: "networkidle" }); await p.waitForTimeout(300);
    await p.click("#iko"); await p.click("#iko-all"); await p.waitForTimeout(120); /* from home (the cloud) to Iko, where this case begins */
    const top = await p.evaluate(() => { const C = window.IkoCloud, R = window.IkoRank, P = window.IkoPlan, c = C.deserialize(localStorage.getItem("ikolearn.v1.cloud")); const py = c.order.find((x) => c.nodes[x].label === "Python Basics"), tb = c.order.find((x) => c.nodes[x].label === "Tables"); const sc = R.scores(c); return { inTop: R.top(c).some((r) => r.id === py), beats: (sc[py] || 0) > (sc[tb] || 0), done: Boolean(P.finished && P.finished(c, py)) || C.isDone(c, py) }; });
    if (!SOFT) ok(top.inTop && top.beats && top.done, `${tag}: fixture: Python Basics is completed, in the top 10 and outscores Tables`, JSON.stringify(top));
    await p.getByRole("button", { name: /Continue Data Management/ }).first().click();
    await p.waitForSelector("#l-done:not([hidden])");
    await p.waitForTimeout(200);
    await passCheck(p); /* PR 103: Continue, then a passed check, before the card and Where next */
    const n0 = calls.length;
    await p.click("#l-got"); await p.waitForTimeout(400);
    const r = await p.evaluate(() => ({
      items: [...document.querySelectorAll("#l-next .wn-opt")].map((b) => ({ l: b.querySelector(".wn-label").textContent, kind: b.getAttribute("data-kind"), on: (b.querySelector(".wn-pick") || b).getAttribute("aria-checked") === "true", why: b.querySelector(".why").textContent })),
      open: (document.querySelector("#l-next .wn-opt.on .wn-act") || {}).getAttribute?.("aria-label"),
      pathNext: ((document.querySelector("#l-path li.next") || {}).textContent || "").replace(/ · .*$/, ""),
      finished: (() => { const C = window.IkoCloud, P = window.IkoPlan, c = C.deserialize(localStorage.getItem("ikolearn.v1.cloud")); return [...document.querySelectorAll("#l-next .wn-opt")].filter((b) => P.finished(c, b.getAttribute("data-id"))).map((b) => b.querySelector(".wn-label").textContent); })(),
      next: document.querySelector("#l-next").innerText,
      thatsIt: (document.querySelector("#lesson").innerText.match(/That's it\./g) || []).length,
    }));
    await p.evaluate(() => document.querySelector("#l-quiz").scrollIntoView({ block: "start" })); await p.waitForTimeout(200);
    if (SHOTS) await p.screenshot({ path: path.join(SHOTS, `flow-${TAG}-${width}-shawn-where-next.png`) });
    if (!SOFT) {
      ok(calls.length === n0, `${tag}: answering and "I've got it" make 0 calls`);
      ok(r.items[0] && r.items[0].l === "Tables" && r.items[0].on && r.items[0].kind === "path" && /^Next on this path/.test(r.items[0].why) && r.open === "Continue with Tables", `${tag}: Tables, the path's next step, is first and pre-selected ("Next on this path")`, JSON.stringify(r.items[0]) + " " + r.open);
      ok(r.pathNext === "Tables", `${tag}: it matches Your Path's "next"`, r.pathNext);
      ok(!r.items.some((x) => x.l.startsWith("Python Basics")) && !/Python Basics|top 10|strong coding skills/i.test(r.next), `${tag}: the completed Python Basics appears nowhere in Where Next (no claims about the learner either)`, JSON.stringify(r.items));
      ok(r.finished.length === 0, `${tag}: nothing finished is offered anywhere in Where Next`, JSON.stringify(r.finished));
      eq(r.items.filter((x) => x.kind !== "progress").map((x) => x.l), ["Tables", "Queries", "Filtering"], `${tag}: Where Next is only this path: continue (Tables), then Queries and Filtering`);
      eq(r.items.filter((x) => x.kind === "progress").map((x) => x.l), ["Owls"], `${tag}: Owls (another subject, started) sits under "Also in progress"; nothing unstarted from other subjects`);
      ok(new Set(r.items.map((x) => x.l)).size === r.items.length, `${tag}: no duplicates against the in-progress list`, JSON.stringify(r.items.map((x) => x.l)));
      ok(r.thatsIt === 1, `${tag}: "That's it." shows once`, String(r.thatsIt));
      ok(errs.length === 0, `${tag}: no console errors`, errs.join(" | "));
    } else console.log("BEFORE", width, JSON.stringify(r));
  } catch (e) { fails.push(`${tag} threw -> ${String(e.message || e).split("\n")[0]}`); }
  await ctx.close();
}
const eq = (a, b, n) => ok(JSON.stringify(a) === JSON.stringify(b), n, `${JSON.stringify(a)} != ${JSON.stringify(b)}`);
for (const w of [390, 1280]) { await run(w); await runShawn(w); }
await browser.close();
server.close();
if (SHOTS) console.log("screenshots:", fs.readdirSync(SHOTS).filter((f) => f.startsWith(`flow-${TAG}-`)).join(", "));
if (fails.length) { console.error(`ikolearn flow e2e: ${pass} passed, ${fails.length} FAILED`); for (const f of fails) console.error("  x " + f); process.exit(1); }
console.log(`ikolearn flow e2e: ${pass} passed`);
