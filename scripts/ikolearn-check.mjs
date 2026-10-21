// Deterministic checks for IkoLearn: cloud growth/merge, block parsing, the streaming splitter, prompts, route guards,
// mocked Gemini (no network, no key), persistence, and static asset rules.
// Run: npm run check:ikolearn
import fs from "node:fs";
import { createRequire } from "node:module";
import {
  LEARN_LIMITS, CLOUD_OPEN, CLOUD_CLOSE, cleanName, cleanLabel, cleanMessages, parseLearnInput, SYSTEM_BASE, companionSystem, noticeSystem,
  buildContents, cardSystem, adjacentSystem, plainReply, parseCloudBlock, parseCard, parseAdjacent, createBlockSplitter,
} from "../lib/ikolearn/prompts.ts";
import { DEFAULT_MODEL, FALLBACK_MODEL, chatBody, jsonBody, readSse, streamText, generateJson } from "../lib/ikolearn/gemini.ts";
import { LEARN_GUARDS, createLearnState, prepare, chatEvents, eventStream, cardFor, adjacentFor } from "../lib/ikolearn/service.ts";

const require = createRequire(import.meta.url);
const C = require("../public/ikolearn/cloud-model.js");

let pass = 0;
const fails = [];
const ok = (c, name, d = "") => (c ? (pass += 1) : fails.push(`${name}${d ? ` -> ${d}` : ""}`));
const eq = (a, b, n) => ok(JSON.stringify(a) === JSON.stringify(b), n, `${JSON.stringify(a)} != ${JSON.stringify(b)}`);
const ENV = { GEMINI_API_KEY: "test-key" };
const T0 = Date.UTC(2026, 9, 21, 16);

/* ================= cloud model ================= */
{
  const c = C.create("Maya", T0);
  const ps = C.parents(c);
  eq(ps.map((p) => p.label), C.STARTERS.map((s) => s.label), "starters: parents in order");
  ok(ps.length >= 4 && ps.length <= 8, "starters: a few parents");
  ok(new Set(ps.map((p) => p.hue)).size === ps.length, "starters: each subject has its own hue");
  ok(c.order.some((id) => c.nodes[id].ghost) && c.order.some((id) => c.nodes[id].parent && !c.nodes[id].ghost), "starters: real children and ghosts");
  eq(c.name, "Maya", "create keeps name");
  ok(C.create("", T0).name === "Me", "create: empty name -> Me");

  // growth: new child under existing parent
  const rev0 = c.rev;
  let r = C.applyTopics(c, [{ name: "Fractions", parent: "Math", signal: "explored" }], T0 + 1);
  const fr = C.findChild(c, "fractions");
  ok(fr && c.nodes[fr.parent].label === "Math", "growth: Fractions lands under Math");
  eq(r.promoted, [fr.id], "growth: starter ghost Fractions is promoted, not duplicated");
  r = C.applyTopics(c, [{ name: "Times Tables", parent: "Math", signal: "explored" }], T0 + 1);
  const tt = C.findChild(c, "Times Tables");
  ok(tt && r.created[0] === tt.id && !tt.ghost && tt.weight === 1, "growth: new topic created under its subject");
  ok(c.rev === rev0 + 2, "growth: rev bumps once per growing turn");
  // strengthen + mastery
  const w1 = fr.weight;
  r = C.applyTopics(c, [{ name: "fraction", parent: "Math", signal: "strength" }], T0 + 2);
  ok(fr.weight > w1 && fr.mastery > 0 && r.strengthened.includes(fr.id) && r.created.length === 0, "merge: singular/plural merges and strengthens");
  C.applyTopics(c, [{ name: "Fractions", parent: "Science", signal: "struggle" }], T0 + 3);
  ok(c.nodes[fr.parent].label === "Math", "merge: existing topic stays under its parent even if the model names another");
  ok(fr.lastStruggle === T0 + 3, "struggle is remembered");
  // aliases + first-word parent match
  C.applyTopics(c, [{ name: "Photosynthesis", parent: "Biology", signal: "curious" }], T0 + 4);
  ok(c.nodes[C.findChild(c, "Photosynthesis").parent].label === "Science", "alias: Biology -> Science");
  C.applyTopics(c, [{ name: "Long Division", parent: "maths", signal: "explored" }], T0 + 5);
  ok(c.nodes[C.findChild(c, "Long Division").parent].label === "Math", "alias: maths -> Math");
  ok(C.findParent(c, "Science & Nature")?.label === "Science", "first-word match: Science & Nature -> Science");
  // ghost promotion
  const ghost = c.order.map((id) => c.nodes[id]).find((n) => n.ghost);
  r = C.applyTopics(c, [{ name: ghost.label, parent: "whatever", signal: "explored" }], T0 + 6);
  ok(!ghost.ghost && r.promoted.includes(ghost.id) && ghost.weight >= 1, "ghost: promoted when explored");
  // new parent when warranted
  r = C.applyTopics(c, [{ name: "Chess", parent: "Games & Strategy", signal: "curious" }], T0 + 7);
  const gs = C.findParent(c, "Games & Strategy");
  ok(gs && r.parentsCreated.includes(gs.id) && C.findChild(c, "Chess").parent === gs.id, "new parent created when none fits");
  ok(gs.hue != null, "new parent gets a hue");
  // topic equal to a parent strengthens the parent
  const mw = C.findParent(c, "Math").weight;
  r = C.applyTopics(c, [{ name: "Math", parent: "Math", signal: "explored" }], T0 + 8);
  ok(C.findParent(c, "Math").weight > mw && r.created.length === 0, "topic named like a subject strengthens the subject");
  // learner's name is never a node
  r = C.applyTopics(c, [{ name: "maya", parent: "Math" }], T0 + 9);
  ok(r.created.length === 0 && !C.findChild(c, "Maya"), "learner name never becomes a topic");
  // per-turn cap
  r = C.applyTopics(c, [1, 2, 3, 4, 5].map((i) => ({ name: "Topic " + i, parent: "Science" })), T0 + 10);
  ok(r.created.length === 3, "applyTopics caps at 3 per turn");
  // garbage in
  eq(C.applyTopics(c, null), { created: [], promoted: [], strengthened: [], parentsCreated: [] }, "applyTopics(null) is a no-op");
  C.applyTopics(c, [null, { name: "" }, { name: 42 }], T0);
  ok(true, "applyTopics tolerates junk");

  // ghosts
  const before = c.order.length;
  const added = C.addGhosts(c, [{ name: "Decimals", parent: "Math" }, { name: "Fractions", parent: "Math" }, { name: "Opera", parent: "Nowhere" }], T0 + 11);
  ok(added.length === 1 && c.nodes[added[0]].ghost && c.nodes[added[0]].label === "Decimals", "addGhosts: adds new, skips existing and unknown subjects");
  ok(c.order.length === before + 1, "addGhosts never creates subjects");
  for (let i = 0; i < 8; i++) C.addGhosts(c, [{ name: "Idea " + i, parent: "Math" }], T0 + 12 + i);
  ok(C.children(c, C.findParent(c, "Math").id).filter((n) => n.ghost).length <= C.LIMITS.ghostsPerParent, "ghosts per subject capped (oldest go first)");

  // cards attach to nodes
  const card = C.attachCard(c, { title: "Fractions: parts of a whole", body: "A fraction names part of a whole.", topic: "Fractions", parent: "Math" }, T0 + 30);
  ok(card.card.node === fr.id && fr.cards.includes(card.card.id), "card attaches to its node");
  eq(C.cardsFor(c, fr.id).map((x) => x.title), ["Fractions: parts of a whole"], "cardsFor returns the node's cards");
  const nc = C.attachCard(c, { title: "Rivers", body: "Rivers carry water to the sea and shape valleys.", topic: "Rivers", parent: "People & Places" }, T0 + 31);
  ok(nc.grew.created.length === 1 && nc.card.node, "card on a new topic grows the cloud");

  // summary + labels + colours + layout
  const sum = C.summarize(c);
  ok(/Math \[/.test(sum) && /Fractions \(/.test(sum) && /\(ghost\)/.test(sum), "summarize lists subjects, topics, ghosts");
  ok(/found hard/.test(sum), "summarize mentions struggles");
  ok(C.summarize(c, 50).length <= 50, "summarize respects max chars");
  ok(C.parentLabels(c).includes("Games & Strategy"), "parentLabels");
  const mathHue = C.findParent(c, "Math").hue;
  ok(C.colorOf(c, fr).startsWith(`hsl(${mathHue},`), "child colour is a shade of its parent hue");
  const pos = C.layout(c);
  ok(c.order.every((id) => pos[id] && Number.isFinite(pos[id].x + pos[id].y + pos[id].z)), "layout: every node has a finite 3D position");
  eq(C.layout(c)[fr.id], pos[fr.id], "layout is deterministic");

  // caps and pruning
  const big = C.create("Ann", T0);
  for (let i = 0; i < 20; i++) C.applyTopics(big, [{ name: "Subject Topic " + i, parent: "New Subject " + i }], T0 + i);
  ok(C.parents(big).length === C.LIMITS.parents, "parent cap holds");
  ok(C.findParent(big, "Curiosities") || C.parents(big).length === C.LIMITS.parents, "overflow goes to Curiosities or an existing subject");
  for (let i = 0; i < 400; i++) C.applyTopics(big, [{ name: "Thing " + i, parent: C.parents(big)[i % 6].label }], T0 + 100 + i);
  ok(big.order.length <= C.LIMITS.nodes, "node cap holds", String(big.order.length));
  ok(C.parents(big).every((p) => C.children(big, p.id).length <= C.LIMITS.childrenPerParent), "children per subject capped");

  // persistence
  const back = C.deserialize(C.serialize(c));
  eq(back.order, c.order, "deserialize keeps order");
  eq(C.summarize(back), C.summarize(c), "round trip keeps the profile");
  ok(back.cards.length === c.cards.length && back.nodes[fr.id].cards.length === 1, "round trip keeps cards");
  ok(C.deserialize("{bad json") === null && C.deserialize(JSON.stringify({ v: 99 })) === null && C.deserialize(null) === null, "deserialize rejects junk");
  const tampered = JSON.parse(C.serialize(c));
  tampered.nodes.zzz = { label: "Orphan", parent: "nope" }; tampered.order.push("zzz");
  ok(!C.deserialize(tampered).nodes.zzz, "deserialize drops orphans");
  const msgs = Array.from({ length: 80 }, (_, i) => ({ role: i % 2 ? "model" : "user", text: "m" + i }));
  const trimmed = C.trimThread(msgs.concat([{ role: "evil", text: "x" }, { role: "user" }]));
  ok(trimmed.length === 60 && trimmed[59].text === "m79", "trimThread keeps the newest 60 valid messages");
}

/* ================= input + prompts ================= */
eq(cleanName("  Ma<ya>  "), "Maya", "cleanName strips symbols");
ok(cleanName("x".repeat(80)).length <= LEARN_LIMITS.nameMax, "cleanName caps length");
eq(cleanLabel('  <b>"Fractions"</b>\n{x}  '), "b Fractions /b x", "cleanLabel strips markup characters");
ok(cleanMessages([{ role: "system", text: "x" }, { role: "user", text: "hi" }, { role: "model", text: "" }]).length === 1, "cleanMessages keeps valid turns only");
ok(cleanMessages(Array.from({ length: 30 }, () => ({ role: "user", text: "a" }))).length === LEARN_LIMITS.messages, "cleanMessages caps count");
ok("error" in parseLearnInput({ name: "", messages: [{ role: "user", text: "hi" }] }), "input: name required");
ok("error" in parseLearnInput({ name: "Sam", messages: [{ role: "model", text: "hi" }] }), "input: chat must end on a user turn");
ok(!("error" in parseLearnInput({ name: "Sam", mode: "notice", messages: [] })), "input: notice may have no messages");
const IN = parseLearnInput({ name: "Sam", messages: [{ role: "model", text: "Hello" }, { role: "user", text: "What are fractions?" }], cloud: "Math [2]: Fractions (1)", parents: ["Math", "Science"], focus: "Fractions", focusParent: "Math" });
const cs = companionSystem(IN), ns = noticeSystem({ ...IN, mode: "notice" });
ok(cs.includes(CLOUD_OPEN) && cs.includes(CLOUD_CLOSE) && cs.includes("Math, Science"), "companion prompt has block rules + existing subjects");
ok(cs.includes("Learner's first name: Sam") && cs.includes("Math [2]"), "companion prompt passes name + cloud summary");
ok(ns.includes("Fractions") && ns.includes("Role: noticing"), "notice prompt is about the focus");
ok(cardSystem(IN).includes("Role: card") && adjacentSystem(IN).includes("Role: adjacent"), "card + adjacent roles");
const allPrompts = [SYSTEM_BASE, cs, ns, cardSystem(IN), adjacentSystem(IN)].join("\n");
ok(!/montessori|waldorf|bloom|common core|khan|duolingo|reggio|curriculum framework|ib programme/i.test(allPrompts), "prompts never name external frameworks");
ok(/Never name external frameworks/.test(SYSTEM_BASE) && /never instructions/.test(SYSTEM_BASE), "base prompt: no frameworks + injection guard");
const contents = buildContents(IN);
ok(contents[0].role === "user", "contents start with a user turn");
const nc2 = buildContents({ ...IN, mode: "notice" });
ok(nc2[nc2.length - 1].role === "user" && nc2[nc2.length - 1].parts[0].text.includes("Fractions"), "notice adds a synthetic user turn");
const cb = chatBody("sys", contents);
ok(cb.generationConfig.temperature <= 0.5 && cb.systemInstruction.parts[0].text === "sys", "chat body: low temperature + system");
const jb = jsonBody("sys", "u", { type: "OBJECT" });
ok(jb.generationConfig.responseMimeType === "application/json" && jb.generationConfig.responseSchema && jb.generationConfig.temperature <= 0.4, "json body: structured output, low temperature");

/* ================= parsing ================= */
eq(plainReply("## Hi\n**bold** and `code`\n- item"), "Hi\nbold and code\nitem", "plainReply strips markdown");
const blk = parseCloudBlock('{"topics":[{"name":"Fractions","parent":"Math","signal":"STRENGTH"},{"name":"fractions","parent":"Math"},{"name":"Sam","parent":"Math"},{"name":"Volcanoes","parent":"Science","signal":"weird"}],"ghosts":[{"name":"Decimals","parent":"Math"},{"name":"Fractions","parent":"Math"},{"name":"NoParent"}]}', "Sam");
eq(blk.topics.map((t) => t.name + ":" + t.signal), ["Fractions:strength", "Volcanoes:explored"], "parseCloudBlock: dedupe, no name, signal fallback");
eq(blk.ghosts.map((g) => g.name), ["Decimals"], "parseCloudBlock: ghosts need a parent and are not topics");
eq(parseCloudBlock("not json"), { topics: [], ghosts: [] }, "parseCloudBlock: junk -> empty");
eq(parseCloudBlock('```json\n{"topics":[{"name":"Rocks","parent":"Science"}],"ghosts":[]}\n```').topics[0].name, "Rocks", "parseCloudBlock: tolerates fences");
ok(parseCloudBlock(JSON.stringify({ topics: Array.from({ length: 9 }, (_, i) => ({ name: "T" + i, parent: "Math" })) })).topics.length === 3, "parseCloudBlock caps topics");
const card = parseCard('{"title":"**Fractions**","body":"A fraction is a part of a whole. Fold a paper in four.","topic":"Fractions","parent":"Math"}');
ok(card && card.title === "Fractions" && card.topic === "Fractions", "parseCard ok + strips markdown");
ok(parseCard('{"title":"x","body":"short","topic":"a"}') === null && parseCard("nope") === null, "parseCard rejects thin/junk");
ok(parseCard(JSON.stringify({ title: "Long", body: "word ".repeat(400), topic: "T", parent: "P" })).body.length <= LEARN_LIMITS.cardBodyChars + 3, "parseCard caps body");
eq(parseAdjacent('{"ghosts":[{"name":"Decimals","parent":"Math"},{"name":"Sam","parent":"Math"}]}', "Sam").map((g) => g.name), ["Decimals"], "parseAdjacent");

// splitter across chunk boundaries
{
  const full = `Fractions are parts of a whole.\n${CLOUD_OPEN} {"topics":[{"name":"Fractions","parent":"Math"}],"ghosts":[]} ${CLOUD_CLOSE}`;
  for (const size of [1, 2, 3, 5, 7, 13, 1000]) {
    const sp = createBlockSplitter();
    let vis = "";
    for (let i = 0; i < full.length; i += size) vis += sp.push(full.slice(i, i + size));
    const end = sp.finish();
    vis += end.tail;
    ok(vis === "Fractions are parts of a whole.\n" && !vis.includes("<") && end.found && parseCloudBlock(end.block).topics.length === 1, `splitter chunk=${size}`);
  }
  const sp = createBlockSplitter();
  const v = sp.push("Nice work <<<CL");
  ok(v === "Nice work " , "splitter holds back a possible marker start");
  ok(sp.push("OUD {}") === "" && sp.finish().found, "splitter: marker completed in the next chunk");
  const sp2 = createBlockSplitter();
  const v2 = sp2.push("3 << 4 is fine");
  ok((v2 + sp2.finish().tail) === "3 << 4 is fine", "splitter releases non-marker text at the end");
}

/* ================= mocked Gemini ================= */
const sse = (pieces, { thought = false } = {}) => {
  const lines = pieces.map((t) => `data: ${JSON.stringify({ candidates: [{ content: { parts: thought ? [{ text: "thinking...", thought: true }, { text: t }] : [{ text: t }] } }] })}\n\n`);
  const enc = new TextEncoder();
  return new ReadableStream({ start(c) { for (const l of lines) { c.enqueue(enc.encode(l.slice(0, 9))); c.enqueue(enc.encode(l.slice(9))); } c.close(); } });
};
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, body, json: async () => body });
function fakeFetch(plan) {
  const calls = [];
  const f = async (url, init) => {
    calls.push({ url: String(url), init });
    const step = plan[Math.min(calls.length - 1, plan.length - 1)];
    if (step === "network") throw new Error("network");
    return step(url, init);
  };
  f.calls = calls;
  return f;
}
const collect = async (gen) => { const out = []; for await (const e of gen) out.push(e); return out; };

{
  const reply = ["Fractions are ", "parts of a whole, Sam.", `\n${CLOUD_OPEN}{"topics":[{"name":"Fractions","parent":"Math","signal":"curious"}],`, `"ghosts":[{"name":"Decimals","parent":"Math"}]}${CLOUD_CLOSE}`];
  let f = fakeFetch([() => res(200, sse(reply, { thought: true }))]);
  let ev = await collect(chatEvents(IN, ENV, f));
  const text = ev.filter((e) => e.t === "delta").map((e) => e.text).join("");
  eq(text.trim(), "Fractions are parts of a whole, Sam.", "chatEvents: visible text, block stripped, thoughts dropped");
  const cloudEv = ev.find((e) => e.t === "cloud");
  ok(cloudEv && cloudEv.topics[0].name === "Fractions" && cloudEv.ghosts[0].name === "Decimals", "chatEvents: cloud event");
  ok(ev[0].t === "start" && ev[0].model === DEFAULT_MODEL && ev[ev.length - 1].t === "done", "chatEvents: start .. done");
  ok(f.calls.length === 1 && f.calls[0].url.includes(":streamGenerateContent?alt=sse") && f.calls[0].init.headers["x-goog-api-key"] === "test-key", "one streaming call, key in header");
  ok(!f.calls[0].url.includes("test-key"), "key never in the URL");
  const sent = JSON.parse(f.calls[0].init.body);
  ok(sent.systemInstruction.parts[0].text.includes("Math [2]") && sent.contents.at(-1).parts[0].text === "What are fractions?", "request carries cloud summary + recent chat");

  f = fakeFetch([() => res(503, null), () => res(200, sse(["Hi there.", `${CLOUD_OPEN}{}${CLOUD_CLOSE}`]))]);
  ev = await collect(chatEvents(IN, ENV, f));
  ok(f.calls.length === 2 && f.calls[1].url.includes(FALLBACK_MODEL) && ev[0].model === FALLBACK_MODEL, "fallback model on 5xx");
  eq(ev.find((e) => e.t === "cloud"), { t: "cloud", topics: [], ghosts: [] }, "empty block -> empty growth");
  f = fakeFetch([() => res(404, null), () => res(200, sse(["Hi."]))]);
  ev = await collect(chatEvents(IN, ENV, f));
  ok(f.calls.length === 2 && ev.some((e) => e.t === "delta"), "fallback model on 404 (retired model)");
  f = fakeFetch([() => res(429, null)]);
  ev = await collect(chatEvents(IN, ENV, f));
  ok(f.calls.length === 1 && ev[0].t === "error" && ev[0].reason === "busy", "429 -> busy, no fallback");
  f = fakeFetch(["network", "network"]);
  ev = await collect(chatEvents(IN, ENV, f));
  ok(f.calls.length === 2 && ev[0].reason === "upstream", "network failure -> fallback, then error");
  f = fakeFetch([() => res(200, sse([`${CLOUD_OPEN}{"topics":[]}${CLOUD_CLOSE}`]))]);
  ev = await collect(chatEvents(IN, ENV, f));
  ok(ev.at(-1).t === "error" && ev.at(-1).reason === "empty", "block-only reply -> empty error");
  f = fakeFetch([() => res(200, sse(["No block at all."]))]);
  ev = await collect(chatEvents(IN, ENV, f));
  ok(ev.some((e) => e.t === "delta" && e.text.includes("No block")) && ev.find((e) => e.t === "cloud").topics.length === 0, "missing block: reply still shows");
  ev = await collect(chatEvents(IN, {}, f));
  ok(ev[0].t === "error" && ev[0].reason === "no_key", "no key -> error without a call");

  // NDJSON stream
  f = fakeFetch([() => res(200, sse(reply))]);
  const body = await new Response(eventStream(chatEvents(IN, ENV, f))).text();
  const lines = body.trim().split("\n").map((l) => JSON.parse(l));
  ok(lines[0].t === "start" && lines.at(-1).t === "done" && !body.includes(CLOUD_OPEN), "eventStream: NDJSON, block never in the stream");

  // readSse with split lines
  const pieces = await collect(readSse(sse(["a", "b"])));
  eq(pieces, ["a", "b"], "readSse joins split lines");

  // card / adjacent
  const gj = (obj) => () => res(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] });
  f = fakeFetch([gj({ title: "Fractions", body: "A fraction is a part of a whole. Fold a paper in four and shade three.", topic: "Fractions", parent: "Math" })]);
  let out = await cardFor(IN, ENV, f);
  ok(out.status === 200 && out.body.card.topic === "Fractions" && f.calls[0].url.includes(":generateContent"), "cardFor ok");
  ok(JSON.parse(f.calls[0].init.body).generationConfig.responseSchema.required.includes("title"), "card uses structured output");
  f = fakeFetch([gj({ title: "x" })]);
  out = await cardFor(IN, ENV, f);
  ok(out.status === 502 && out.body.reason === "empty", "cardFor: bad JSON -> empty");
  f = fakeFetch([() => res(429, null)]);
  out = await cardFor(IN, ENV, f);
  ok(out.status === 429 && out.body.reason === "busy", "cardFor: 429 -> busy");
  f = fakeFetch([() => res(200, { promptFeedback: { blockReason: "SAFETY" } })]);
  out = await cardFor(IN, ENV, f);
  ok(out.body.reason === "blocked", "cardFor: blocked prompt");
  f = fakeFetch([() => res(500, null), gj({ ghosts: [{ name: "Decimals", parent: "Math" }, { name: "Ratios", parent: "Math" }] })]);
  out = await adjacentFor(IN, ENV, f);
  ok(out.status === 200 && out.body.ghosts.length === 2 && f.calls[1].url.includes(FALLBACK_MODEL), "adjacentFor ok via fallback");
  f = fakeFetch([gj({ ghosts: [] })]);
  out = await adjacentFor(IN, ENV, f);
  ok(out.status === 502, "adjacentFor: none -> error");
  const st = await streamText("s", contents, { GEMINI_API_KEY: "k", IKOLEARN_GEMINI_MODEL: "models/custom-model" }, fakeFetch([() => res(200, sse(["x"]))]));
  ok(st.ok && st.model === "custom-model", "IKOLEARN_GEMINI_MODEL override");
  if (st.ok) await collect(st.pieces);
  const gjr = await generateJson("s", "u", {}, () => null, {}, fakeFetch([]));
  ok(!gjr.ok && gjr.code === "no_key", "generateJson without key");
}

/* ================= route guards ================= */
{
  let t = T0;
  const state = createLearnState(() => t);
  const body = JSON.stringify({ name: "Sam", messages: [{ role: "user", text: "hi" }], cloud: "", parents: [] });
  const base = { rawBody: body, origin: "https://ikosagon.com", host: "ikosagon.com", ip: "1.1.1.1", env: ENV, state };
  ok(prepare(base).ok, "prepare: ok");
  eq(prepare({ ...base, origin: "https://evil.example" }).out?.status, 403, "prepare: foreign origin 403");
  eq(prepare({ ...base, rawBody: "x".repeat(LEARN_LIMITS.bodyBytes + 1) }).out?.status, 413, "prepare: too large 413");
  eq(prepare({ ...base, rawBody: "{oops" }).out?.status, 400, "prepare: bad json 400");
  eq(prepare({ ...base, rawBody: JSON.stringify({ name: "" }) }).out?.status, 422, "prepare: bad input 422");
  eq(prepare({ ...base, env: {} }).out?.status, 503, "prepare: no key 503");
  eq(prepare({ ...base, requireFocus: true }).out?.body, { error: "focus" }, "prepare: card/adjacent need a focus");
  const cardBody = JSON.stringify({ name: "Sam", focus: "Fractions", messages: [{ role: "user", text: "hi" }, { role: "model", text: "hello" }] });
  ok(prepare({ ...base, ip: "9.9.9.9", rawBody: cardBody, requireFocus: true }).ok, "prepare: card may end on a model turn");
  // per-IP rate
  const s2 = createLearnState(() => t);
  let last;
  for (let i = 0; i <= LEARN_GUARDS.perIpPerMinute; i++) last = prepare({ ...base, state: s2, ip: "2.2.2.2" });
  ok(!last.ok && last.out.status === 429 && last.out.body.error === "ip_rate" && last.out.headers["Retry-After"], "prepare: per-IP rate 429");
  // daily budget
  const s3 = createLearnState(() => t);
  const env = { ...ENV, IKOLEARN_DAILY_CALLS: "3" };
  const results = [];
  for (let i = 0; i < 4; i++) { t += 61_000; results.push(prepare({ ...base, state: s3, env, ip: "3.3.3." + i })); }
  ok(results.slice(0, 3).every((r) => r.ok) && results[3].out.body.error === "budget", "prepare: daily budget 429");
  t += 24 * 3600_000;
  ok(prepare({ ...base, state: s3, env, ip: "4.4.4.4" }).ok, "prepare: budget resets next day");
  const s4 = createLearnState(() => t);
  ok(prepare({ ...base, state: s4, env: { ...ENV, IKOLEARN_DAILY_CALLS: "999999" } }).ok && true, "budget override is capped (no throw)");
}

/* ================= static assets ================= */
{
  const html = fs.readFileSync("public/ikolearn/index.html", "utf8");
  const app = fs.readFileSync("public/ikolearn/app.js", "utf8");
  const view = fs.readFileSync("public/ikolearn/cloud-view.js", "utf8");
  const model = fs.readFileSync("public/ikolearn/cloud-model.js", "utf8");
  const css = fs.readFileSync("public/ikolearn/styles.css", "utf8");
  const privacy = fs.readFileSync("public/ikolearn/privacy.html", "utf8");
  const cfg = fs.readFileSync("next.config.ts", "utf8");
  const mdx = fs.readFileSync("content/projects/ikolearn.mdx", "utf8");
  ok(/<meta name="robots" content="noindex/.test(html) && /noindex/.test(privacy), "pages are noindex");
  ok(/"\/ikolearn\/:path\*"[\s\S]{0,80}noindex/.test(cfg) && /source: "\/ikolearn"/.test(cfg), "next.config: rewrites + X-Robots-Tag");
  ok(!/<script[^>]+src="https?:/i.test(html) && !/<link[^>]+href="https?:/i.test(html) && !/@import|url\(https?:/i.test(css), "no external scripts, styles or fonts");
  ok(!/generativelanguage|GEMINI_API_KEY|x-goog-api-key/.test(app + view + model + html), "client never talks to Gemini or sees the key");
  ok(/localStorage/.test(app) && !/document\.cookie/.test(app), "state in localStorage, no cookies");
  ok(/ikolearn\.v1\.name/.test(app) && /ikolearn\.v1\.cloud/.test(app) && /ikolearn\.v1\.thread/.test(app), "storage keys");
  ok(/unlisted:\s*true/.test(mdx) && /featured:\s*false/.test(mdx) && /demo:\s*"\/ikolearn\/"/.test(mdx), "project page is unlisted and not featured");
  ok(/fold/i.test(css) && /prefers-reduced-motion/.test(css), "card fold + reduced motion");
  const bytes = ["index.html", "styles.css", "app.js", "cloud-model.js", "cloud-view.js"].reduce((n, f) => n + fs.statSync("public/ikolearn/" + f).size, 0);
  ok(bytes < 120_000, "app weight under 120 KB uncompressed", String(bytes));
}

if (fails.length) {
  console.error(`ikolearn checks: ${pass} passed, ${fails.length} FAILED`);
  for (const f of fails) console.error("  x " + f);
  process.exit(1);
}
console.log(`ikolearn checks: ${pass} passed`);
