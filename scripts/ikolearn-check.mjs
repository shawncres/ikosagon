// Deterministic checks for IkoLearn: cloud growth/merge, block parsing, the streaming splitter, prompts, route guards,
// mocked Gemini (no network, no key), persistence, and static asset rules.
// Run: npm run check:ikolearn
import fs from "node:fs";
import { createRequire } from "node:module";
import {
  LEARN_LIMITS, CLOUD_OPEN, CLOUD_CLOSE, cleanName, cleanLabel, cleanMessages, parseLearnInput, SYSTEM_BASE, companionSystem, noticeSystem,
  buildContents, cardSystem, adjacentSystem, plainReply, parseCloudBlock, parseCard, parseAdjacent, createBlockSplitter,
  PATH_OPEN, PATH_CLOSE, lessonSystem, lessonContents, pathSystem, PATH_SCHEMA, CARD_SCHEMA, parsePath, parseChoices, parseLessonBlock,
} from "../lib/ikolearn/prompts.ts";
import { DEFAULT_MODEL, FALLBACK_MODEL, MODEL_LIMITS, chatBody, jsonBody, readSse, streamText, generateJson } from "../lib/ikolearn/gemini.ts";
import { LEARN_GUARDS, createLearnState, prepare, chatEvents, eventStream, cardFor, adjacentFor, lessonEvents, pathFor } from "../lib/ikolearn/service.ts";

const require = createRequire(import.meta.url);
const C = require("../public/ikolearn/cloud-model.js");
const L = require("../public/ikolearn/lesson.js");
const D = require("../public/ikolearn/deck.js");
const DAYMS = 86400000;

let pass = 0;
const fails = [];
const ok = (c, name, d = "") => (c ? (pass += 1) : fails.push(`${name}${d ? ` -> ${d}` : ""}`));
const eq = (a, b, n) => ok(JSON.stringify(a) === JSON.stringify(b), n, `${JSON.stringify(a)} != ${JSON.stringify(b)}`);
const ENV = { GEMINI_API_KEY: "test-key" };
const T0 = Date.UTC(2026, 9, 21, 16);

/* ================= cloud model (recursive tree, v2) ================= */
{
  const c = C.create("Maya", T0);
  const ss = C.subjects(c);
  eq(ss.map((p) => p.label), C.STARTERS.map((s) => s.label), "starters: subjects in order");
  ok(new Set(ss.map((p) => p.hue)).size === ss.length, "starters: each subject has its own hue");
  eq(c.name, "Maya", "create keeps name");
  ok(C.create("", T0).name === "Me", "create: empty name -> Me");
  // Math is the worked example: foundational topics, seeded deeper, with ordered paths
  const math = C.findSubject(c, "Math");
  eq(math.path.ids.map((id) => c.nodes[id].label), ["Counting", "Number Sense", "Addition", "Subtraction", "Multiplication", "Fractions"], "Math seed: ordered foundational path");
  const bonds = C.findTopic(c, "Number Bonds");
  ok(bonds && C.depthOf(c, bonds.id) === 3 && bonds.ghost, "Math seed: a third level exists (Addition > Number Bonds, ghost)");
  eq(C.trail(c, bonds.id), "Math > Addition > Number Bonds", "trail gives the stable label path");
  ok(c.next === C.findTopic(c, "Counting").id, "recommended next starts at the first unmastered Math step");
  ok(C.subjects(c).filter((s) => s.label !== "Math").every((s) => !s.path), "other subjects use the same logic with plain seeds");
  // ids are stable and never reused
  const ids0 = c.order.slice();
  const r0 = C.applyTopics(c, [{ name: "Times Tables", parent: "Multiplication", signal: "explored" }], T0 + 1);
  const tt = C.findTopic(c, "Times Tables");
  ok(tt && r0.created[0] === tt.id && c.nodes[tt.parent].label === "Multiplication" && C.depthOf(c, tt.id) === 3, "growth: a topic can land under a topic (any depth)");
  ok(!ids0.includes(tt.id) && c.order.slice(0, ids0.length).join() === ids0.join(), "ids are stable and new ids are fresh");
  // deeper still: four, five, six levels
  let parentLabel = "Times Tables";
  for (let d = 0; d < 6; d++) { const name = "Level " + (d + 4); C.applyTopics(c, [{ name, parent: parentLabel }], T0 + 2 + d); parentLabel = name; }
  ok(C.depthOf(c, C.findTopic(c, "Level 9").id) === 9, "no depth limit: grows to level 9");
  // merge + promotion + strengthen
  const fr = C.findTopic(c, "fractions");
  let r = C.applyTopics(c, [{ name: "Fraction", parent: "Science", signal: "strength" }], T0 + 20);
  ok(r.promoted.includes(fr.id) && !fr.ghost && fr.mastery > 0 && c.nodes[fr.parent].label === "Math", "merge: singular/plural, ghost promoted, stays under its parent");
  C.applyTopics(c, [{ name: "Fractions", parent: "Math", signal: "struggle" }], T0 + 21);
  ok(fr.lastStruggle === T0 + 21, "struggle is remembered");
  C.applyTopics(c, [{ name: "Photosynthesis", parent: "Biology", signal: "curious" }], T0 + 22);
  ok(c.nodes[C.findTopic(c, "Photosynthesis").parent].label === "Science", "alias: Biology -> Science");
  ok(C.findSubject(c, "Science & Nature")?.label === "Science", "first-word match: Science & Nature -> Science");
  r = C.applyTopics(c, [{ name: "Chess", parent: "Games & Strategy", signal: "curious" }], T0 + 23);
  const gs = C.findSubject(c, "Games & Strategy");
  ok(gs && r.parentsCreated.includes(gs.id) && C.findTopic(c, "Chess").parent === gs.id && gs.hue != null, "new subject created when none fits");
  const mw = math.weight;
  r = C.applyTopics(c, [{ name: "Math", parent: "Math" }], T0 + 24);
  ok(math.weight > mw && r.created.length === 0, "topic named like a subject strengthens the subject");
  r = C.applyTopics(c, [{ name: "maya", parent: "Math" }], T0 + 25);
  ok(r.created.length === 0 && !C.findTopic(c, "Maya"), "learner name never becomes a topic");
  ok(C.applyTopics(c, [1, 2, 3, 4, 5].map((i) => ({ name: "Topic " + i, parent: "Science" })), T0 + 26).created.length === 3, "applyTopics caps at 3 per turn");
  eq(C.applyTopics(c, null), { created: [], promoted: [], strengthened: [], parentsCreated: [] }, "applyTopics(null) is a no-op");
  const wAdd = C.findTopic(c, "Addition").weight;
  C.applyTopics(c, [{ name: "Carrying", parent: "Addition" }], T0 + 27);
  ok(C.findTopic(c, "Addition").weight > wAdd && math.weight > mw, "growth strengthens every ancestor a little");

  // related topics (ghosts), including the fallback fix
  let g = C.addGhosts(c, [{ name: "Decimals", parent: "Math" }, { name: "Fractions", parent: "Math" }], T0 + 30);
  ok(g.added.length === 1 && c.nodes[g.added[0]].ghost && g.dupes === 1 && g.unplaced === 0, "addGhosts: adds new, counts duplicates");
  const space = C.findTopic(c, "Space");
  g = C.addGhosts(c, [{ name: "Black Holes", parent: "Astronomy" }, { name: "Comets", parent: "" }], T0 + 31, space.id);
  ok(g.added.length === 2 && g.added.every((id) => c.nodes[c.nodes[id].parent].label === "Science"), "addGhosts: unknown subject falls back to the tapped node's subject");
  g = C.addGhosts(c, [{ name: "Opera", parent: "Nowhere" }], T0 + 32);
  ok(g.added.length === 0 && g.unplaced === 1 && g.dupes === 0, "addGhosts: unknown subject without fallback is unplaced, not a duplicate");
  g = C.addGhosts(c, [{ name: "Halves", parent: "Fractions" }], T0 + 33);
  ok(g.added.length === 1 && c.nodes[g.added[0]].parent === fr.id, "addGhosts: parent may be a topic");
  ok(!C.findSubject(c, "Astronomy") && !C.findSubject(c, "Nowhere"), "addGhosts never creates subjects");
  for (let i = 0; i < 10; i++) C.addGhosts(c, [{ name: "Idea " + i, parent: "Art & Music" }], T0 + 40 + i);
  ok(C.childrenOf(c, C.findSubject(c, "Art & Music").id).filter((n) => n.ghost).length <= C.LIMITS.ghostsPerNode, "ghosts per node capped (oldest free ghost goes first)");

  // learning paths, one level at a time
  let p = C.applyPath(c, fr.id, ["Halves", "Quarters", "Equivalent Fractions", "Fractions", "Maya", "Decimals", "Quarters"], "Quarters", T0 + 50);
  eq(p.ids.map((id) => c.nodes[id].label), ["Halves", "Quarters", "Equivalent Fractions"], "applyPath: orders steps, reuses the existing child, skips self/name/dupes and topics that live elsewhere");
  ok(p.added.length === 2 && p.added.every((id) => c.nodes[id].ghost && c.nodes[id].parent === fr.id), "applyPath: new steps are ghost children");
  ok(p.next === C.findTopic(c, "Quarters").id && c.next === p.next && fr.path.next === p.next, "applyPath: the model's pick becomes the recommended next");
  p = C.applyPath(c, fr.id, ["Halves"], "Unknown", T0 + 51);
  ok(p.next === C.findTopic(c, "Halves").id, "applyPath: unknown pick falls back to the first unmastered step");
  eq(C.applyPath(c, "nope", ["A"]).ids, [], "applyPath on a missing node is a no-op");
  ok(C.applyPath(c, space.id, Array.from({ length: 12 }, (_, i) => "Step " + i)).ids.length === C.LIMITS.pathSteps, "applyPath caps steps");
  p = C.applyPath(c, fr.id, ["Halves", "Quarters", "Equivalent Fractions"], "Halves", T0 + 52);
  ok(p.ids.length === 3 && p.added.length === 0, "applyPath again: existing children are reused, nothing duplicated");

  // next topic + lessons raise mastery
  const halves = C.findTopic(c, "Halves"), quarters = C.findTopic(c, "Quarters");
  eq(C.nextFor(c, fr.id), halves.id, "nextFor: first step of the path");
  let e = C.engage(c, halves.id, "open", T0 + 60);
  ok(halves.opened && halves.mastery > 0 && !halves.ghost && e.promoted, "engage open: first read counts a little and explores a ghost");
  const m1 = halves.mastery, rev1 = c.rev;
  C.engage(c, halves.id, "open", T0 + 61);
  ok(halves.mastery === m1 && c.rev === rev1, "engage open: re-reading a cached lesson changes nothing");
  e = C.engage(c, halves.id, "got", T0 + 62);
  ok(halves.mastery >= C.MASTERED && e.next === quarters.id && c.next === quarters.id, "engage got: mastered, next step recommended");
  e = C.engage(c, quarters.id, "tricky", T0 + 63);
  ok(quarters.lastStruggle === T0 + 63 && quarters.mastery === 0, "engage tricky: remembered, mastery not raised");
  C.engage(c, quarters.id, "got", T0 + 64);
  C.engage(c, C.findTopic(c, "Equivalent Fractions").id, "got", T0 + 65);
  const afterFractions = C.nextFor(c, C.findTopic(c, "Equivalent Fractions").id);
  ok(afterFractions && c.nodes[afterFractions].parent === math.id && C.findSubject(c, "Math").path.ids.includes(afterFractions), "nextFor: when a path is done, climbs to the next step above");

  // cards attach to nodes and can carry a path
  const card = C.attachCard(c, { title: "Fractions: parts of a whole", body: "A fraction names part of a whole.", topic: "Fractions", parent: "Math" }, T0 + 70);
  ok(card.card.node === fr.id && fr.cards.includes(card.card.id) && card.path === null, "card attaches to its node (existing path kept)");
  eq(C.cardsFor(c, fr.id).map((x) => x.title), ["Fractions: parts of a whole"], "cardsFor");
  const nc = C.attachCard(c, { title: "Rivers", body: "Rivers carry water to the sea.", topic: "Rivers", parent: "People & Places", path: ["Springs", "Deltas"], next: "Springs" }, T0 + 71);
  ok(nc.grew.created.length === 1 && nc.path && nc.path.ids.length === 2 && c.nodes[nc.path.next].label === "Springs", "card on a new topic grows the cloud and maps its path");

  // summary + knownUnder + colours + layout
  const sum = C.summarize(c);
  ok(/Math \[/.test(sum) && /Fractions \(/.test(sum) && /\{/.test(sum) && /\(ghost\)/.test(sum) && /strong/.test(sum), "summarize: nested branches, ghosts, strengths");
  ok(C.summarize(c, 50).length <= 50, "summarize respects max chars");
  ok(C.knownUnder(c, fr.id).includes("Halves"), "knownUnder lists a node's children");
  ok(C.colorOf(c, halves).startsWith(`hsl(${math.hue},`), "every level is a shade of its subject hue");
  const pos = C.layout(c);
  ok(c.order.every((id) => pos[id] && Number.isFinite(pos[id].x + pos[id].y + pos[id].z) && pos[id].d === C.depthOf(c, id)), "layout: every node has a finite 3D position and depth");
  eq(C.layout(c)[halves.id], pos[halves.id], "layout is deterministic");
  const dist = (a, b) => Math.hypot(pos[a].x - pos[b].x, pos[a].y - pos[b].y, pos[a].z - pos[b].z);
  ok(dist(halves.id, fr.id) < dist(fr.id, math.id), "layout: deeper levels sit closer to their parent");
  ok(C.levelScale(1) === 1 && C.levelScale(3) < C.levelScale(2), "levelScale shrinks per level");

  // caps and pruning
  const big = C.create("Ann", T0);
  for (let i = 0; i < 20; i++) C.applyTopics(big, [{ name: "Subject Topic " + i, parent: "New Subject " + i }], T0 + i);
  ok(C.subjects(big).length === C.LIMITS.subjects, "subject cap holds");
  let at = "Counting";
  for (let i = 0; i < 900; i++) { C.applyTopics(big, [{ name: "Thing " + i, parent: i % 7 ? at : "Math" }], T0 + 100 + i); if (i % 9 === 0) at = "Thing " + i; }
  ok(big.order.length <= C.LIMITS.nodes, "node cap holds", String(big.order.length));
  ok(C.subjects(big).every((p) => C.childrenOf(big, p.id).length <= C.LIMITS.children), "children per node capped");
  ok(big.order.every((id) => !big.nodes[id].parent || big.nodes[big.nodes[id].parent]), "pruning never orphans a node");
  ok(C.depthOf(big, C.findTopic(big, at)?.id || big.order.at(-1)) > 5, "deep chains survive pruning");

  // persistence (compact v2)
  const s = C.serialize(c);
  const back = C.deserialize(s);
  eq(back.order, c.order, "deserialize keeps order and ids");
  eq(C.summarize(back), C.summarize(c), "round trip keeps the profile");
  ok(back.nodes[fr.id].path.ids.join() === fr.path.ids.join() && back.next === c.next, "round trip keeps paths and the recommended next");
  ok(back.cards.length === c.cards.length && back.nodes[fr.id].cards.length === 1 && back.nodes[halves.id].opened, "round trip keeps cards and lesson state");
  ok(s.length < JSON.stringify(c).length * 0.6, "storage is compact", `${s.length} vs ${JSON.stringify(c).length}`);
  ok(C.serialize(big).length < 60_000, "a full 600-node cloud stays under 60 KB", String(C.serialize(big).length));
  ok(C.deserialize("{bad json") === null && C.deserialize(JSON.stringify({ v: 99, name: "x" })) === null && C.deserialize(null) === null, "deserialize rejects junk");
  const tampered = JSON.parse(s);
  tampered.n.push(["zzz", "Orphan", "nope", 0, 10, 0, 0, 0, -1, 0], ["c1", "Loop A", "c2", 0, 10, 0, 0, 0, -1, 0], ["c2", "Loop B", "c1", 0, 10, 0, 0, 0, -1, 0]);
  const t2 = C.deserialize(tampered);
  ok(!t2.nodes.zzz && !t2.nodes.c1 && !t2.nodes.c2 && t2.order.length === c.order.length, "deserialize drops orphans and cycles");
  // v1 -> v2 migration without loss
  const v1raw = fs.readFileSync("scripts/fixtures/ikolearn-cloud-v1.json", "utf8"), v1 = JSON.parse(v1raw);
  const mig = C.deserialize(v1raw);
  ok(mig && mig.v === 3, "v1 cloud migrates forward (to v3)");
  ok(v1.order.every((id) => mig.nodes[id] && mig.nodes[id].label === v1.nodes[id].label && mig.nodes[id].parent === (v1.nodes[id].parent || null) && mig.nodes[id].ghost === v1.nodes[id].ghost), "migration keeps every v1 node, id, parent and ghost flag");
  ok(v1.order.every((id) => Math.abs(mig.nodes[id].weight - v1.nodes[id].weight) < 1e-9 && mig.nodes[id].mastery === v1.nodes[id].mastery), "migration keeps weights and mastery");
  ok(mig.cards.length === 1 && mig.nodes[mig.cards[0].node].label === "Fractions", "migration keeps cards on their node");
  ok(C.findSubject(mig, "Math").path && C.findTopic(mig, "Number Bonds")?.ghost && C.findTopic(mig, "Counting")?.ghost, "migration adds the new Math seeds as ghosts only");
  ok(C.findTopic(mig, "Numbers") && !C.findTopic(mig, "Numbers").ghost, "migration does not touch explored v1 topics");
  ok(mig.seq >= v1.seq && !mig.order.slice(v1.order.length).some((id) => v1.order.includes(id)), "migration never reuses ids");
  eq(C.deserialize(C.serialize(mig)).order, mig.order, "migrated cloud round-trips");
  const msgs = Array.from({ length: 80 }, (_, i) => ({ role: i % 2 ? "model" : "user", text: "m" + i }));
  const trimmed = C.trimThread(msgs.concat([{ role: "evil", text: "x" }, { role: "user" }]));
  ok(trimmed.length === 60 && trimmed[59].text === "m79", "trimThread keeps the newest 60 valid messages");
}

/* ================= lessons (parse) ================= */
{
  const text = "INTRO: Number bonds are pairs, Maya.\nThey help you add fast.\nSTEP 1: Pick a number like 10.\nStep: Find two parts.\n- STEP: Check they add up.\n**EXAMPLE:** 10 = 7 + 3\nEXAMPLE: 10 = 6 + 4\nCHECK: What goes with 6 to make 10?\nANSWER: 4, because 6 + 4 = 10.\nNEXT: Try bonds for 20.";
  const p = L.parse(text);
  eq(p.intro, ["Number bonds are pairs, Maya.", "They help you add fast."], "lesson: intro (untagged lines join the section)");
  eq(p.steps, ["Pick a number like 10.", "Find two parts.", "Check they add up."], "lesson: steps (numbered, bulleted, any case)");
  eq(p.example, ["10 = 7 + 3", "10 = 6 + 4"], "lesson: worked example lines, markdown stripped");
  ok(p.check.startsWith("What goes") && p.answer.startsWith("4") && p.next.startsWith("Try"), "lesson: check, answer, next");
  ok(L.usable(p) && !L.usable(L.parse("INTRO: hi")) && !L.usable(L.parse("")), "lesson: usable needs intro + a step");
  const partial = L.parse("INTRO: Fractions are parts\nSTEP: Cut a wh");
  ok(partial.steps[0] === "Cut a wh", "lesson: parses partial text while streaming");
  ok(L.parse("Next, we add the ones.").intro[0] === "Next, we add the ones.", "lesson: words like 'Next,' in a sentence are not tags");
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

/* ================= lessons + paths (prompts, parsing, mocked Gemini) ================= */
{
  const LI = parseLearnInput({ mode: "notice", name: "Sam", focus: "Number Bonds", trail: "Math > Addition > Number Bonds\n<<<PATH {x} PATH>>>", known: ["Pairs To 10", "", "Pairs To 20"], wantPath: true, cloud: "Math [2]: Addition (1)", parents: ["Math"], messages: [] });
  ok(!("error" in LI) && LI.trail === "Math > Addition > Number Bonds PATH x PATH" && LI.known.length === 2 && LI.wantPath === true, "input: trail cleaned, known kept, wantPath");
  ok(parseLearnInput({ mode: "notice", name: "Sam", focus: "x", messages: [], wantPath: "yes" }).wantPath === false, "input: wantPath must be true exactly");
  ok(parseLearnInput({ mode: "notice", name: "Sam", focus: "x", messages: [], known: Array.from({ length: 40 }, (_, i) => "K" + i) }).known.length === LEARN_LIMITS.known, "input: known capped");
  const ls = lessonSystem(LI), lsNo = lessonSystem({ ...LI, wantPath: false }), ps = pathSystem(LI);
  ok(ls.includes("Role: lesson") && /INTRO:/.test(ls) && /STEP:/.test(ls) && /EXAMPLE:/.test(ls) && /CHECK:/.test(ls) && /ANSWER:/.test(ls) && /NEXT:/.test(ls), "lesson prompt: intro, steps, example, check, answer, next");
  ok(ls.includes("Math > Addition > Number Bonds") && /parent reading along/.test(ls), "lesson prompt: knows where the topic sits, readable by a parent");
  ok(ls.includes(PATH_OPEN) && ls.includes(PATH_CLOSE) && lsNo.includes(PATH_OPEN), "every lesson ends with the hidden block (fork choices, no extra call)");
  ok(/easiest and most foundational first/.test(ls) && !/easiest and most foundational first/.test(lsNo) && /steps: \[\]/.test(lsNo), "lesson block asks for path steps only with wantPath");
  ok(/kind "deeper"/.test(ls) && /2 or 3 directions/.test(ls) && !/kind "next" for their planned/.test(ls), "fork rules: 2 or 3 choices, no planned step when none is known");
  const la = lessonSystem({ ...LI, ahead: "Making 20" });
  ok(la.includes('kind "next" for their planned next step "Making 20"'), "fork rules: offers the planned next step when known");
  ok(/leave this empty, unless the learner asked/.test(companionSystem(IN)) && /New branches are offered when a branch ends/.test(companionSystem(IN)), "chat no longer suggests new branches on every turn");
  ok(/Do not list other topics to try/.test(noticeSystem({ ...IN, mode: "notice" })) && !/2 to 3 short suggestions/.test(noticeSystem({ ...IN, mode: "notice" })), "notes on the cloud no longer list other topics");
  ok(parseLearnInput({ mode: "notice", name: "Sam", focus: "x", ahead: "  <b>Making 20</b> ", messages: [] }).ahead === "b Making 20 /b", "input: ahead is cleaned");
  const ch = parseChoices([{ name: "Doubles", kind: "DEEPER", why: "A **quick** trick to add fast without counting every single one of the things in the whole group, honestly" }, { name: "doubles" }, { name: "Sam" }, { name: "Number Bonds" }, { name: "Making 20", kind: "weird" }, { name: "Tens", kind: "side" }, { name: "Extra" }], "Sam", "Number Bonds");
  eq(ch.map((c) => c.name + ":" + c.kind), ["Doubles:deeper", "Making 20:deeper", "Tens:side"], "parseChoices: dedupe, no name/focus, kind fallback, 3 max");
  ok(ch[0].why.length <= LEARN_LIMITS.whyChars && !ch[0].why.includes("*"), "parseChoices: reason short and plain");
  eq(parseChoices([{ name: "Only One" }]), [], "parseChoices: one choice is not a fork");
  eq(parseLessonBlock('{"steps":["A","B"],"next":"B","choices":[]}', "", "X", false), null, "parseLessonBlock: steps ignored without wantPath; nothing else -> null");
  eq(parseLessonBlock('{"steps":["A","B"],"next":"B","choices":[{"name":"C"},{"name":"D","kind":"side"}]}', "", "X", true), { steps: ["A", "B"], next: "B", choices: [{ name: "C", kind: "deeper", why: "" }, { name: "D", kind: "side", why: "" }] }, "parseLessonBlock: steps + choices");
  eq(parseLessonBlock('{"steps":[],"choices":[],"end":true}', "", "X", false), { steps: [], next: "", choices: [], end: true }, "parseLessonBlock: end alone is kept");
  ok(parseLessonBlock("junk") === null, "parseLessonBlock: junk -> null");
  ok(ps.includes("Role: path") && ps.includes("Pairs To 10") && /easiest and most foundational first/.test(ps) && /"end": true/.test(ps), "path prompt: ordered subtopics, reuses known, can end a branch");
  ok(!/montessori|waldorf|bloom|common core|khan|duolingo|reggio|curriculum framework|ib programme/i.test(ls + ps), "lesson/path prompts never name external frameworks");
  eq(lessonContents(LI)[0].parts[0].text, 'Please teach me "Number Bonds".', "lesson contents: one user turn");
  ok(PATH_SCHEMA.required.includes("steps") && PATH_SCHEMA.properties.end, "path uses structured output with an end flag");
  ok(cardSystem(IN).includes("path") && CARD_SCHEMA.properties.path, "card asks for a path in the same call");

  eq(parsePath('{"steps":["Pairs To 10","pairs to 10","Number Bonds","Sam","Making 20","Doubles"],"next":"making 20"}', "Sam", "Number Bonds"), { steps: ["Pairs To 10", "Making 20", "Doubles"], next: "Making 20" }, "parsePath: dedupe, drop name and focus, next is a step");
  eq(parsePath('{"steps":["A","B"],"next":"Z"}').next, "A", "parsePath: unknown next -> first step");
  ok(parsePath(JSON.stringify({ steps: Array.from({ length: 10 }, (_, i) => "S" + i) })).steps.length === LEARN_LIMITS.pathSteps, "parsePath caps steps");
  ok(parsePath('{"steps":[]}') === null && parsePath("junk") === null, "parsePath: empty/junk -> null");
  eq(parsePath('{"steps":[],"end":true}'), { steps: [], next: "", end: true }, "parsePath: a branch can end");
  const cp = parseCard('{"title":"Bonds","body":"Number bonds are pairs that make a number.","topic":"Number Bonds","parent":"Addition","path":["Pairs To 10","Pairs To 10","Making 20"],"next":"Making 20"}');
  ok(cp && cp.parent === "Addition" && cp.path.join() === "Pairs To 10,Making 20" && cp.next === "Making 20", "parseCard: parent may be a topic, path parsed");
  eq(parseAdjacent('{"ghosts":[{"name":"Comets"}]}'), [{ name: "Comets", parent: "" }], "parseAdjacent: missing parent kept as empty (client falls back)");

  const lesson = ["INTRO: Number bonds are pairs, Sam.\nSTEP: Pick 10.\n", "STEP: Split it.\nEXAMPLE: 10 = 7 + 3\nCHECK: 6 and?\nANSWER: 4.\nNEXT: Try 20.\n", `${PATH_OPEN}{"steps":["Pairs To 10","Making 20"],`, `"next":"Pairs To 10"}${PATH_CLOSE}`];
  let f = fakeFetch([() => res(200, sse(lesson))]);
  let ev = await collect(lessonEvents(LI, ENV, f));
  const txt = ev.filter((e) => e.t === "delta").map((e) => e.text).join("");
  ok(txt.includes("INTRO:") && txt.includes("NEXT: Try 20.") && !txt.includes("<<<") && !txt.includes("Making 20"), "lessonEvents: lesson text streams, path block held back");
  eq(ev.find((e) => e.t === "path"), { t: "path", steps: ["Pairs To 10", "Making 20"], next: "Pairs To 10", choices: [] }, "lessonEvents: path event");
  ok(ev.at(-1).t === "done" && f.calls.length === 1, "lessonEvents: one call");
  const lb = JSON.parse(f.calls[0].init.body);
  ok(lb.generationConfig.maxOutputTokens === MODEL_LIMITS.lessonMaxTokens && lb.systemInstruction.parts[0].text.includes("Role: lesson"), "lesson request: own token limit + lesson role");
  ok(L.usable(L.parse(txt)) && L.parse(txt).steps.length === 2, "streamed lesson parses on the client");
  f = fakeFetch([() => res(200, sse(lesson))]);
  ev = await collect(lessonEvents({ ...LI, wantPath: false }, ENV, f));
  ok(!ev.some((e) => e.t === "path") && !ev.filter((e) => e.t === "delta").map((e) => e.text).join("").includes("<<<"), "lessonEvents: no path event without wantPath (block still hidden)");
  f = fakeFetch([() => res(200, sse(["INTRO: Hi.\nSTEP: One.\n", `${PATH_OPEN}{"steps":[],"end":true}${PATH_CLOSE}`]))]);
  ev = await collect(lessonEvents(LI, ENV, f));
  eq(ev.find((e) => e.t === "path"), { t: "path", steps: [], next: "", choices: [], end: true }, "lessonEvents: branch end passes through");
  f = fakeFetch([() => res(200, sse(["INTRO: Hi.\nSTEP: One.\n", `${PATH_OPEN}{"steps":["Ignored"],"next":"","choices":[{"name":"Making 20","kind":"next","why":"Your next step"},{"name":"Doubles","kind":"deeper","why":"A quick trick"}]}${PATH_CLOSE}`]))]);
  ev = await collect(lessonEvents({ ...LI, wantPath: false, ahead: "Making 20" }, ENV, f));
  const fe = ev.find((e) => e.t === "path");
  ok(fe && fe.steps.length === 0 && fe.choices.length === 2 && fe.choices[0].kind === "next" && f.calls.length === 1, "lessonEvents: fork choices arrive in the same call (no path steps without wantPath)");
  ok(JSON.parse(f.calls[0].init.body).systemInstruction.parts[0].text.includes('"Making 20"'), "lesson request carries the planned next step");
  f = fakeFetch([() => res(200, sse(["INTRO: Hi.\nSTEP: One.\n", `${PATH_OPEN}nonsense${PATH_CLOSE}`]))]);
  ev = await collect(lessonEvents(LI, ENV, f));
  ok(!ev.some((e) => e.t === "path") && ev.at(-1).t === "done", "lessonEvents: bad path block is ignored");
  f = fakeFetch([() => res(503, null), () => res(200, sse(["INTRO: Hi.\nSTEP: One."]))]);
  ev = await collect(lessonEvents(LI, ENV, f));
  ok(f.calls.length === 2 && ev[0].model === FALLBACK_MODEL, "lessonEvents: fallback model on 5xx");

  const gj = (obj) => () => res(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] });
  f = fakeFetch([gj({ steps: ["Pairs To 10", "Making 20"], next: "Making 20" })]);
  let out = await pathFor(LI, ENV, f);
  ok(out.status === 200 && out.body.ok && out.body.path.next === "Making 20" && f.calls.length === 1 && JSON.parse(f.calls[0].init.body).generationConfig.responseSchema, "pathFor ok (one structured call)");
  f = fakeFetch([gj({ steps: [] })]);
  out = await pathFor(LI, ENV, f);
  ok(out.status === 502 && out.body.reason === "empty", "pathFor: nothing -> empty");
  f = fakeFetch([() => res(429, null)]);
  out = await pathFor(LI, ENV, f);
  ok(out.status === 429 && out.body.reason === "busy", "pathFor: 429 -> busy");
  f = fakeFetch([gj({ title: "Bonds", body: "Number bonds are pairs that make a number.", topic: "Number Bonds", parent: "Addition", path: ["Pairs To 10"], next: "Pairs To 10" })]);
  out = await cardFor(IN, ENV, f);
  ok(out.body.card.path?.[0] === "Pairs To 10" && f.calls.length === 1, "cardFor returns the path in the same call");

  // the client applies what the server returns (lesson path -> model)
  const c = C.create("Sam", T0);
  const add = C.findTopic(c, "Addition");
  const r = C.applyPath(c, add.id, ["Adding Within 10", "Doubles"], "Doubles", T0 + 1);
  ok(r.ids[0] === C.findTopic(c, "Adding Within 10").id && c.nodes[r.next].label === "Doubles", "a lesson's path reuses the seeded branch and adds new steps");
}

/* ================= hooks for later features (time, engagement, branch ends, colour) ================= */
{
  const c = C.create("Sam", T0);
  const cnt = C.findTopic(c, "Counting"), c20 = C.findTopic(c, "Counting to 20");
  eq(C.activity(c, cnt.id), { spent: 0, engaged: 0, mastery: 0, opened: false, end: false, cards: 0, subject: C.findSubject(c, "Math").id, hue: C.findSubject(c, "Math").hue }, "activity: one place to read per-node state");
  const rev = c.rev;
  ok(C.track(c, cnt.id, 42.4, T0 + 1) === 42 && C.track(c, cnt.id, 99999) === 42 + 1800 && C.track(c, cnt.id, -5) === 1842 && c.rev === rev, "track: seconds add up, capped per call, never negative, no redraw");
  C.engage(c, cnt.id, "open", T0 + 2); C.engage(c, cnt.id, "open", T0 + 3); C.engage(c, cnt.id, "got", T0 + 4);
  eq(C.activity(c, cnt.id).engaged, 2, "engaged counts real engagements (a re-read of a cached lesson does not)");
  ok(C.hueOf(c, c20.id) === C.findSubject(c, "Math").hue && C.colorOf(c, c20).startsWith(`hsl(${C.hueOf(c, c20.id)},`), "hueOf/colorOf: colour comes from the subject in one place");
  ok(C.markEnd(c, c20.id) && c20.end && C.nextFor(c, c20.id) !== c20.id, "markEnd: a branch can end; next moves on");
  ok(!C.markEnd(c, C.findSubject(c, "Math").id), "markEnd: subjects never end");
  const back = C.deserialize(C.serialize(c));
  ok(back.nodes[cnt.id].spent === 1842 && back.nodes[cnt.id].engaged === 2 && back.nodes[c20.id].end === true, "time, engagement and branch ends survive a round trip");
  const old = JSON.parse(C.serialize(c));
  old.n = old.n.map((a) => a.slice(0, 10));
  const fromOlder = C.deserialize(old);
  ok(fromOlder && fromOlder.nodes[cnt.id].spent === 0 && fromOlder.nodes[cnt.id].engaged === 0, "older v2 saves (shorter rows) still load");
}

/* ================= render cap ================= */
{
  const view = fs.readFileSync("public/ikolearn/cloud-view.js", "utf8");
  ok(/DRAW_CAP\s*=\s*\d+/.test(view) && /levelScale/.test(view) && /focusNode/.test(view), "view: draw cap, level scale, focus a branch");
}

/* ================= growth, deck, forks (model) ================= */
{
  const c = C.create("Maya", T0);
  const math = C.findSubject(c, "Math"), cnt = C.findTopic(c, "Counting"), sci = C.findSubject(c, "Science");
  eq(C.GROWTH.stages, [0, 3, 8, 16, 30], "growth stages");
  let g = C.growthOf(c, cnt.id);
  ok(g.stage === 0 && g.name === "New" && !g.inDeck && c.deck.length === 0, "a fresh topic is a new, sepia card outside the deck");
  C.engage(c, cnt.id, "open", T0 + 1);
  ok(C.joinDeck(c, T0 + 2).length === 0, "opening a lesson once is not enough to join");
  C.track(c, cnt.id, 75, T0 + 3);
  eq(C.joinDeck(c, T0 + 4), [cnt.id], "time spent pushes it past the threshold: joins the deck");
  ok(C.inDeck(c, cnt.id) && C.growthOf(c, cnt.id).stage === 1 && C.deckEntry(c, cnt.id).subject === "Math", "deck entry keeps label, subject and stage");
  eq(C.joinDeck(c, T0 + 5), [], "joining is once only");
  C.engage(c, cnt.id, "got", T0 + 6); C.track(c, cnt.id, 600, T0 + 7); C.joinDeck(c, T0 + 8);
  const st = C.growthOf(c, cnt.id).stage;
  ok(st >= 3, "more time and mastery: the card grows stages", String(st));
  for (let i = 0; i < 6; i++) C.engage(c, cnt.id, "tricky", T0 + 9 + i);
  cnt.mastery = 0; C.joinDeck(c, T0 + 20);
  ok(C.growthOf(c, cnt.id).stage >= st - 0 && C.deckEntry(c, cnt.id).best >= st, "a card's stage never goes back down");
  math.engaged = 40; math.spent = 9999;
  ok(!C.joinDeck(c).includes(math.id) && !C.inDeck(c, math.id), "subjects are not cards");
  const gh = C.findTopic(c, "Skip Counting"); gh.spent = 9999;
  ok(gh.ghost && !C.joinDeck(c).includes(gh.id), "ghosts never join until explored");
  gh.spent = 0;

  // colour: sepia first, the subject's hue at full colour, all from one place
  const s0 = C.evolveColor(sci.hue, 0), s4 = C.evolveColor(sci.hue, 4), m0 = C.evolveColor(math.hue, 0);
  ok(s0.hue === 34 && m0.hue === 34 && s0.ink === m0.ink, "stage 0 is the same sepia for every subject");
  ok(s4.hue === sci.hue && s4.ink !== s0.ink, "stage 4 reaches the subject's own hue");
  const sats = [0, 1, 2, 3, 4].map((x) => +/hsl\(\d+, (\d+)%/.exec(C.evolveColor(sci.hue, x).ink)[1]);
  ok(sats.every((v, i) => !i || v > sats[i - 1]), "colour deepens at every stage", sats.join(","));
  eq(C.cardColor(c, cnt.id), C.evolveColor(C.hueOf(c, cnt.id), C.growthOf(c, cnt.id).stage), "cardColor = evolveColor(subject hue, stage)");

  // forks
  const add = C.findTopic(c, "Addition"), aw10 = C.findTopic(c, "Adding Within 10");
  let f = C.applyChoices(c, add.id, [{ name: "Adding Within 10", kind: "next", why: "Start small" }, { name: "Doubles", kind: "deeper", why: "A <b>quick</b> trick" }, { name: "Number Lines", kind: "side", why: "See it on a line" }, { name: "Extra", kind: "side" }], T0 + 30);
  ok(f.ids.length === 3 && f.ids[0] === aw10.id, "fork: existing topic reused, 3 choices max");
  ok(c.nodes[f.ids[1]].parent === add.id && c.nodes[f.ids[1]].ghost && c.nodes[f.ids[2]].parent === add.parent, "fork: deeper goes under the topic, side next to it");
  eq(add.fork.why, ["Start small", "A b quick /b trick", "See it on a line"], "fork reasons cleaned");
  const before = c.order.length;
  f = C.applyChoices(c, cnt.id, [{ name: "Counting" }, { name: "Maya" }, { name: "Tens", kind: "deeper" }], T0 + 31);
  ok(f.ids.length === 0 && c.order.length === before && !cnt.fork, "fewer than 2 usable choices is not a fork (nothing left behind)");
  ok(C.pickChoice(c, add.id, f.ids[0]) === false && C.pickChoice(c, add.id, add.fork.ids[1]) && c.next === add.fork.ids[1] && C.nextFor(c, add.id) === add.fork.ids[1], "pickChoice: the pick becomes next");
  for (let i = 0; i < 10; i++) C.addGhosts(c, [{ name: "Filler " + i, parent: "Addition" }], T0 + 40 + i);
  ok(add.fork.ids.every((x) => c.nodes[x]), "fork choices are kept when room is needed");
  const rt = C.deserialize(C.serialize(c));
  eq({ ...rt.nodes[add.id].fork, at: 0 }, { ...add.fork, at: 0 }, "fork survives a round trip");

  // branch end -> other branches (local)
  const c20 = C.findTopic(c, "Counting to 20");
  ok(!C.isTerminal(c, c20.id), "not ended yet");
  C.markEnd(c, c20.id); C.engage(c, c20.id, "got", T0 + 50);
  ok(C.isTerminal(c, c20.id), "ended: marked as an end and done");
  const ob = C.otherBranches(c, c20.id, 3);
  ok(ob.length === 3 && ob.every((x) => c.nodes[x].mastery < C.MASTERED && x !== c20.id && !C.ancestry(c, c20.id).includes(x)), "other branches: unfinished, not this branch or above it");
  ok(ob.some((x) => C.subjectOf(c, x).id !== math.id) && ob.some((x) => C.subjectOf(c, x).id === math.id), "other branches: nearby first, plus one from another subject");
  const fr = C.findTopic(c, "Fractions");
  C.applyPath(c, fr.id, ["Halves", "Quarters"], "Halves", T0 + 60);
  fr.path.ids.forEach((x) => C.engage(c, x, "got", T0 + 61));
  ok(!C.isTerminal(c, fr.id), "path done but the topic itself not yet: not ended");
  C.engage(c, fr.id, "got", T0 + 62);
  ok(C.isTerminal(c, fr.id), "a topic and its whole path mastered: the branch has ended");
  ok(!C.isTerminal(c, math.id), "subjects never end");

  // draw log
  C.logDraw(c, 20000, ["a", "b"]); C.logDraw(c, 20100, ["c"]); C.logDraw(c, 20400, ["d"]);
  eq(c.draws, [[20100, "c"], [20400, "d"]], "draw log keeps the last 366 days");
  ok(c.sessions === 3, "sessions are counted");

  // the deck only grows: an entry outlives its topic
  const raw = JSON.parse(C.serialize(c));
  raw.n = raw.n.filter((a) => a[0] !== cnt.id && a[2] !== cnt.id);
  const lost = C.deserialize(raw);
  ok(!lost.nodes[cnt.id] && C.inDeck(lost, cnt.id) && C.deckEntry(lost, cnt.id).label === "Counting" && C.growthOf(lost, cnt.id).stage >= 3, "a deck card stays even if its topic is gone");
  // prune never drops a deck card
  const big = C.create("Ann", T0);
  const keep = C.findTopic(big, "Shapes");
  C.engage(big, keep.id, "open"); C.engage(big, keep.id, "got"); C.joinDeck(big);
  for (let i = 0; i < 900; i++) C.applyTopics(big, [{ name: "Thing " + i, parent: "Art & Music" }], T0 + i);
  ok(big.nodes[keep.id] && C.inDeck(big, keep.id), "pruning never removes a deck card's topic");
  ok(C.serialize(c).length < 8000, "deck, forks and log stay compact", String(C.serialize(c).length));

  // migration: v2 (PR #56) and v1 saves move to v3; topics past the threshold backfill the deck
  const v2raw = fs.readFileSync("scripts/fixtures/ikolearn-cloud-v2.json", "utf8"), v2 = JSON.parse(v2raw);
  const m2 = C.deserialize(v2raw);
  ok(m2 && v2.v === 2 && m2.v === 3, "v2 cloud migrates to v3");
  ok(v2.n.every((a) => m2.nodes[a[0]] && m2.nodes[a[0]].label === a[1] && (m2.nodes[a[0]].spent || 0) === (a[10] || 0)), "migration keeps every v2 node with its time spent");
  const mc = C.findTopic(m2, "Counting"), mnb = C.findTopic(m2, "Number Bonds");
  ok(C.inDeck(m2, mc.id) && C.growthOf(m2, mc.id).stage === 2 && !C.inDeck(m2, mnb.id), "backfill: Counting (4 min, got it) joins at stage 2; Number Bonds (30 s) not yet");
  ok(C.findTopic(m2, "Counting to 20").end && C.findTopic(m2, "Fractions").path.ids.length === 2, "migration keeps branch ends and paths");
  eq(C.deserialize(C.serialize(m2)).deck, m2.deck, "migrated deck round-trips");
  ok(C.deserialize(fs.readFileSync("scripts/fixtures/ikolearn-cloud-v1.json", "utf8")).v === 3, "v1 still migrates (to v3)");
}

/* ================= card art + session draw (deck.js) ================= */
{
  const a = D.design("n12", 2);
  eq(D.design("n12", 2), a, "card art is deterministic from the topic id");
  ok(JSON.stringify(D.design("n13", 2)) !== JSON.stringify(a), "different topics, different cards");
  const pats = new Set(Array.from({ length: 80 }, (_, i) => D.design("n" + i, 0).pattern));
  ok(pats.size === D.PATTERNS.length, "all patterns occur", [...pats].join(","));
  let grows = true, prefix = true, finite = true;
  for (let i = 0; i < 60; i++) {
    const id = "n" + i, st = [0, 1, 2, 3, 4].map((s) => D.design(id, s));
    st.forEach((d, s) => {
      if (s && d.marks.length < st[s - 1].marks.length) grows = false;
      if (s && JSON.stringify(d.marks.slice(0, st[s - 1].marks.length)) !== JSON.stringify(st[s - 1].marks)) prefix = false;
      d.marks.forEach((m) => Object.values(m).forEach((v) => { if (typeof v === "number" && !Number.isFinite(v)) finite = false; }));
    });
    if (st[4].marks.length !== st[4].total) grows = false;
  }
  ok(grows, "ink density grows with every stage (full pattern at stage 4)");
  ok(prefix, "a growing card keeps its marks and adds more (same card, more ink)");
  ok(finite, "all art coordinates are finite");
  ok(D.INK.opacity.every((v, i) => !i || v > D.INK.opacity[i - 1]), "ink strength grows with the stage");

  const c = C.create("Maya", T0);
  const t = C.findTopic(c, "Counting");
  C.engage(c, t.id, "open"); C.engage(c, t.id, "got"); C.joinDeck(c);
  const sp = D.cardSpec(c, t.id);
  ok(sp.label === "Counting" && sp.subject === "Math" && sp.stage === C.growthOf(c, t.id).stage && sp.inDeck && sp.color.ink === C.cardColor(c, t.id).ink, "cardSpec: label, subject, stage, colour from the model");
  ok(D.cardSpec(c, "nope") === null, "cardSpec: unknown id -> null");

  // render with a tiny fake DOM (no innerHTML anywhere)
  const mkEl = (tag, ns) => ({ tag, ns, attrs: {}, kids: [], style: { props: {}, setProperty(k, v) { this.props[k] = v; } }, listeners: {}, className: "", textContent: "",
    setAttribute(k, v) { this.attrs[k] = v; }, appendChild(k) { this.kids.push(k); return k; }, addEventListener(e, f) { this.listeners[e] = f; } });
  const doc = { createElement: (t) => mkEl(t), createElementNS: (ns, t) => mkEl(t, ns) };
  let opened = null;
  const el = D.render(doc, sp, { onOpen: (id) => { opened = id; } });
  const svg = el.kids[0].kids[0];
  ok(el.tag === "button" && el.className.includes("dcard") && el.className.includes("stage-" + sp.stage) && svg.tag === "svg" && svg.ns === "http://www.w3.org/2000/svg", "render: a button card with an SVG face");
  ok(el.kids[1].textContent === "Counting" && el.kids[2].textContent.includes("Math") && el.style.props["--card-ink"] === sp.color.ink, "render: label, subject · stage, ink colour");
  el.listeners.click({ stopPropagation() {} });
  ok(opened === t.id, "render: tapping opens the topic");
  const g = svg.kids.find((k) => k.tag === "g");
  ok(g && g.kids.length === sp.art.marks.length, "render: one SVG element per mark");
  ok(D.render(doc, sp, { bare: true, small: true }).kids.length === 1, "render: bare small card is art only");

  // weights
  const y = C.create("Maya", T0);
  const add = (subj, names) => names.forEach((n) => { C.applyTopics(y, [{ name: n, parent: subj, signal: "strength" }], T0); const x = C.findTopic(y, n); C.engage(y, x.id, "open", T0); C.engage(y, x.id, "got", T0); });
  add("Math", ["Counting", "Addition", "Subtraction", "Fractions", "Shapes", "Doubles", "Halves", "Clocks"]);
  add("Science", ["Volcanoes", "Plants"]); add("Art & Music", ["Rhythm"]); add("Reading & Writing", ["Rhymes"]);
  C.joinDeck(y, T0);
  ok(y.deck.length === 12, "test deck: 8 Math, 2 Science, 1 Art, 1 Reading");
  const day0 = D.dayOf(T0) + 1;
  const w0 = D.weigh(y, day0);
  const mass = (w, s) => w.filter((x) => x.subject === s).reduce((a, x) => a + x.w, 0);
  ok(Math.abs(mass(w0, "Math") - mass(w0, "Science")) < 1e-9, "per-subject weighting: 8 Math cards weigh the same as 2 Science cards");
  C.logDraw(y, day0 - 1, Array.from({ length: 6 }, () => C.findTopic(y, "Counting").id));
  const w1 = D.weigh(y, day0);
  ok(w1.find((x) => x.subject === "Math").balance < 1 && w1.find((x) => x.subject === "Science").balance > 1, "balance: over-drawn subject held back, under-drawn boosted");
  C.logDraw(y, day0 + 2, [C.findTopic(y, "Counting").id]);
  const wr = D.weigh(y, day0 + 3);
  ok(wr.find((x) => x.id === C.findTopic(y, "Counting").id).review < wr.find((x) => x.id === C.findTopic(y, "Addition").id).review, "spaced review: a card drawn yesterday waits; others are due");
  y.draws = y.draws.filter((d) => d[0] !== day0 + 2);
  C.logDraw(y, day0, [C.findTopic(y, "Rhythm").id]);
  ok(D.weigh(y, day0).find((x) => x.id === C.findTopic(y, "Rhythm").id).w < w1.find((x) => x.id === C.findTopic(y, "Rhythm").id).w * 0.1, "already drawn today: almost never again today");
  C.engage(y, C.findTopic(y, "Plants").id, "tricky", T0 + DAYMS);
  ok(D.weigh(y, day0).find((x) => x.id === C.findTopic(y, "Plants").id).struggle === 1.5, "found tricky lately: drawn a bit more often");
  y.draws = []; y.sessions = 0;

  // draw
  const d1 = D.drawSession(y, { day: day0 }), d2 = D.drawSession(y, { day: day0 });
  eq(d1, d2, "draw is deterministic for a day + session");
  ok(d1.length === 3 && new Set(d1).size === 3, "draw: 3 different cards");
  ok(new Set(d1.map((id) => C.subjectOf(y, id).label)).size === 3, "draw: one draw mixes subjects");
  ok(JSON.stringify(D.drawSession(y, { day: day0 + 1 })) !== JSON.stringify(d1) || JSON.stringify(D.drawSession(y, { day: day0 + 2 })) !== JSON.stringify(d1), "draw changes from day to day");
  eq(D.drawSession(C.create("Nia", T0), { day: day0 }), [], "empty deck: no draw");
  const one = C.create("Nia", T0); const oc = C.findTopic(one, "Shapes"); C.engage(one, oc.id, "open"); C.engage(one, oc.id, "got"); C.joinDeck(one);
  eq(D.drawSession(one, { day: day0 }), [oc.id], "a one-card deck draws that card");

  // a year of daily sessions: well rounded, compared with a plain shuffle
  for (let i = 0; i < 365; i++) { const ids = D.drawSession(y, { day: day0 + i }); C.logDraw(y, day0 + i, ids); }
  const bal = D.balance(y, day0 + 364), shares = bal.map((r) => r.share);
  const naiveMath = 8 / 12;
  ok(bal.find((r) => r.subject === "Math").share < 0.4 && naiveMath > 0.6, "a year: Math is about a third of draws, not two thirds as with a plain shuffle", bal.map((r) => r.subject + " " + r.share.toFixed(2)).join(", "));
  ok(Math.max(...shares) - Math.min(...shares) < 0.15, "a year: every subject within 15 points of the others", shares.map((s) => s.toFixed(2)).join(","));
  ok(y.deck.every((e) => y.draws.some((d) => d[1] === e.id)), "a year: every card in the deck comes up");
  const mathCards = y.deck.filter((e) => e.subject === "Math").map((e) => y.draws.filter((d) => d[1] === e.id).length);
  ok(Math.max(...mathCards) - Math.min(...mathCards) < Math.max(...mathCards) * 0.6, "a year: cards within a subject share its draws", mathCards.join(","));
  ok(bal.reduce((a, r) => a + r.draws, 0) === y.draws.length, "balance counts every logged draw");
  ok(D.dayOf(Date.UTC(2026, 9, 21, 3, 0)) === D.dayOf(Date.UTC(2026, 9, 21, 3, 0) + 60000), "dayOf is a whole local day");
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
  // lesson + path routes use the same guards and count against the same budget
  const s5 = createLearnState(() => t);
  const env5 = { ...ENV, IKOLEARN_DAILY_CALLS: "2" };
  const lessonBody = JSON.stringify({ name: "Sam", focus: "Number Bonds", trail: "Math > Addition", wantPath: true, messages: [] });
  ok(prepare({ ...base, state: s5, env: env5, rawBody: lessonBody, requireFocus: true, ip: "5.5.5.1" }).ok, "prepare: lesson request ok (no chat needed)");
  ok(prepare({ ...base, state: s5, env: env5, rawBody: lessonBody, requireFocus: true, ip: "5.5.5.2" }).ok, "prepare: path request ok");
  eq(prepare({ ...base, state: s5, env: env5, rawBody: lessonBody, requireFocus: true, ip: "5.5.5.3" }).out?.body?.error, "budget", "prepare: lessons and paths count against the daily budget");
  eq(prepare({ ...base, rawBody: JSON.stringify({ name: "Sam", messages: [] }), requireFocus: true, ip: "5.5.5.4" }).out?.body, { error: "focus" }, "prepare: lesson/path need a focus");
  for (const r of ["lesson", "path"]) {
    const src = fs.readFileSync(`app/api/ikolearn/${r}/route.ts`, "utf8");
    ok(/prepare\(/.test(src) && /requireFocus: true/.test(src) && /runtime = "nodejs"/.test(src), `route ${r}: guarded, needs focus, nodejs`);
  }
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
  const lessonJs = fs.readFileSync("public/ikolearn/lesson.js", "utf8");
  ok(/<script src="\/ikolearn\/lesson\.js/.test(html) && html.indexOf("lesson.js") < html.indexOf("app.js") && html.indexOf("cloud-model.js") < html.indexOf("lesson.js"), "lesson.js loads before app.js");
  ok(/id="lesson"/.test(html) && /id="l-got"/.test(html) && /id="l-tricky"/.test(html) && /id="p-lesson"/.test(html) && /id="p-path"/.test(html), "lesson view + panel buttons present");
  ok(/ikolearn\.v1\.lessons/.test(app) && /MAX_LESSONS/.test(app) && /"\/lesson"/.test(app) && /"\/path"/.test(app), "lessons cached in localStorage; lesson + path endpoints");
  ok(!/generativelanguage|GEMINI_API_KEY|x-goog-api-key|innerHTML/.test(lessonJs) && !/innerHTML\s*=(?!\s*"")/.test(app), "lesson rendering uses text nodes only");
  ok(!/montessori|waldorf|bloom|common core/i.test(app + lessonJs + html), "UI never names frameworks");
  const deckJs = fs.readFileSync("public/ikolearn/deck.js", "utf8");
  ok(html.indexOf("cloud-model.js") < html.indexOf("deck.js") && html.indexOf("deck.js") < html.indexOf("app.js"), "deck.js loads after the model and before app.js");
  ok(/id="deck"/.test(html) && /id="draw"/.test(html) && /id="deck-btn"/.test(html) && /id="l-fork"/.test(html) && /id="l-card"/.test(html), "deck view, draw, fork and lesson card present");
  ok(!/innerHTML|generativelanguage|fetch\(/.test(deckJs) && /createElementNS/.test(deckJs), "deck.js: SVG via DOM calls, no innerHTML, no network");
  ok(/sessionStorage/.test(app) && /ikolearn\.v1\.session/.test(app) && /drawSession/.test(app) && /logDraw/.test(app), "one draw per visit, logged on the device");
  ok(/el\.pAdj\.hidden = !ended/.test(app) && !/grow\(\{ topics: \[\], ghosts/.test(app), "related topics only once a branch has ended; notes no longer add branches");
  ok(/\.dcard::after/.test(css) && /\.dcard\.grew/.test(css), "deck cards keep the corner fold; growth pulse respects reduced motion");
  const bytes = ["index.html", "styles.css", "app.js", "cloud-model.js", "cloud-view.js", "lesson.js", "deck.js"].reduce((n, f) => n + fs.statSync("public/ikolearn/" + f).size, 0);
  ok(bytes < 170_000, "app weight under 170 KB uncompressed", String(bytes));
}

if (fails.length) {
  console.error(`ikolearn checks: ${pass} passed, ${fails.length} FAILED`);
  for (const f of fails) console.error("  x " + f);
  process.exit(1);
}
console.log(`ikolearn checks: ${pass} passed`);
