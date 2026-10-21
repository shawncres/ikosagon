// Deterministic checks for IkoLearn: cloud growth/merge, block parsing, the streaming splitter, prompts, route guards,
// mocked Gemini (no network, no key), persistence, and static asset rules.
// Run: npm run check:ikolearn
import fs from "node:fs";
import zlib from "node:zlib";
import { createRequire } from "node:module";
import {
  LEARN_LIMITS, CLOUD_OPEN, CLOUD_CLOSE, cleanName, cleanLabel, cleanMessages, parseLearnInput, SYSTEM_BASE, companionSystem, noticeSystem,
  buildContents, cardSystem, adjacentSystem, plainReply, parseCloudBlock, parseCard, parseAdjacent, createBlockSplitter,
  PATH_OPEN, PATH_CLOSE, lessonSystem, lessonContents, pathSystem, PATH_SCHEMA, CARD_SCHEMA, parsePath, parseChoices, parseLessonBlock, parseQuestions, parseBlurb, parseChain,
  parseTest, testSystem, TEST_SCHEMA, createSystem, parseCreate, CREATE_SCHEMA, AGE_BANDS, cleanRegion,
} from "../lib/ikolearn/prompts.ts";
import { DEFAULT_MODEL, FALLBACK_MODEL, GEMINI_BASE, chatBody, jsonBody, readSse } from "../lib/ikolearn/gemini.ts";
import { MODEL_LIMITS, streamText, generateJson, llmConfig, llmReady } from "../lib/ikolearn/llm.ts";
import { toMessages } from "../lib/ikolearn/openai-compatible.ts";
import { LEARN_GUARDS, createLearnState, prepare, chatEvents, eventStream, cardFor, adjacentFor, lessonEvents, pathFor, testFor, createFor } from "../lib/ikolearn/service.ts";

const require = createRequire(import.meta.url);
const C = require("../public/ikolearn/cloud-model.js");
const L = require("../public/ikolearn/lesson.js");
const D = require("../public/ikolearn/deck.js");
const RK = require("../public/ikolearn/rank.js");
const P = require("../public/ikolearn/orchestrator.js");
const CAM = require("../public/ikolearn/camera.js");
const DAYMS = 86400000;

let pass = 0;
const fails = [];
const ok = (c, name, d = "") => (c ? (pass += 1) : fails.push(`${name}${d ? ` -> ${d}` : ""}`));
const eq = (a, b, n) => ok(JSON.stringify(a) === JSON.stringify(b), n, `${JSON.stringify(a)} != ${JSON.stringify(b)}`);
const ENV = { GEMINI_API_KEY: "test-key" };
const T0 = Date.UTC(2026, 9, 21, 16);
/*
 * New learners start empty (v6). Most model tests need a rich cloud, so they build one explicitly from the old starter
 * map, kept as a test fixture only (scripts/fixtures/ikolearn-starters.json), through the same public IkoCloud.plant.
 */
const STARTERS = JSON.parse(fs.readFileSync("scripts/fixtures/ikolearn-starters.json", "utf8")).starters;
const seeded = (name, t) => {
  const c = C.create(name, t);
  STARTERS.forEach((s) => C.plant(c, s, null, 0, false));
  const m = C.findSubject(c, "Math");
  c.next = m ? C.nextFor(c, m.id) : null;
  return c;
};

/* ================= cloud model (recursive tree, v2) ================= */
{
  const c = seeded("Maya", T0);
  const ss = C.subjects(c);
  eq(ss.map((p) => p.label), STARTERS.map((s) => s.label), "fixture: subjects in order");
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
  ok(C.subjects(c).filter((s) => s.label !== "Math" && s.label !== "Computer Science").every((s) => !s.path), "other subjects use the same logic with plain seeds");
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
  const big = seeded("Ann", T0);
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
  ok(mig && mig.v === C.VERSION && C.VERSION === 8, "v1 cloud migrates forward (to v8)");
  const migCs = C.subjects(mig).find((x) => x.label === "Computer Science"), csKeys = C.CS_TOPICS.map(C.norm), seedKeys = C.OLD_SEEDS.map(C.norm);
  const keptV1 = v1.order.filter((id) => mig.nodes[id]), goneV1 = v1.order.filter((id) => !mig.nodes[id]);
  ok(keptV1.every((id) => mig.nodes[id].label === v1.nodes[id].label && mig.nodes[id].ghost === v1.nodes[id].ghost &&
    mig.nodes[id].parent === (v1.nodes[id].parent && csKeys.includes(C.norm(v1.nodes[id].label)) ? migCs.id : v1.nodes[id].parent || null)), "migration keeps v1 nodes with their id, parent (CS topics move to Computer Science) and ghost flag");
  ok(goneV1.every((id) => seedKeys.includes(C.norm(v1.nodes[id].label)) && !(v1.nodes[id].mastery > 0)) && goneV1.length > 0, "only untouched old seeds are pruned from a v1 save", goneV1.map((id) => v1.nodes[id].label).join());
  ok(keptV1.every((id) => Math.abs(mig.nodes[id].weight - v1.nodes[id].weight) < 1e-9 && mig.nodes[id].mastery === v1.nodes[id].mastery), "migration keeps weights and mastery");
  ok(mig.cards.length === 1 && mig.nodes[mig.cards[0].node].label === "Fractions", "migration keeps cards on their node");
  ok(mig.order.filter((id) => !v1.order.includes(id)).every((id) => mig.nodes[id].label === "Computer Science" && !mig.nodes[id].parent), "migration adds no seeds (only the Computer Science subject, to hold moved topics)");
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
  ok(ls.includes("Role: lesson") && /INTRO:/.test(ls) && /STEP:/.test(ls) && /EXAMPLE:/.test(ls) && /NEXT:/.test(ls) && !/\nCHECK:/.test(ls) && !/\nANSWER:/.test(ls), "lesson prompt: intro, steps, example, next (questions moved to the hidden block)");
  ok(/questions: 2 or 3 multiple-choice questions that check understanding of what this lesson explained/.test(ls) && /answer = the position of the right option/.test(ls) && /"questions":\[\{"q"/.test(ls) && /questions/.test(lsNo), "every lesson block asks for 2-3 multiple-choice questions on what it taught, with the answer index");
  ok(/blurb: one line under 12 words/.test(ls) && /without the learner's name/.test(ls), "lesson block asks for the card's one-line description");
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
  eq(parseLessonBlock('{"steps":["A","B"],"next":"B","choices":[{"name":"C"},{"name":"D","kind":"side"}]}', "", "X", true), { steps: ["A", "B"], next: "B", choices: [{ name: "C", kind: "deeper", why: "" }, { name: "D", kind: "side", why: "" }], questions: [] }, "parseLessonBlock: steps + choices");
  eq(parseLessonBlock('{"steps":[],"choices":[],"end":true}', "", "X", false), { steps: [], next: "", choices: [], questions: [], end: true }, "parseLessonBlock: end alone is kept");
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
  eq(ev.find((e) => e.t === "path"), { t: "path", steps: ["Pairs To 10", "Making 20"], next: "Pairs To 10", choices: [], questions: [] }, "lessonEvents: path event");
  ok(ev.at(-1).t === "done" && f.calls.length === 1, "lessonEvents: one call");
  const lb = JSON.parse(f.calls[0].init.body);
  ok(lb.generationConfig.maxOutputTokens === MODEL_LIMITS.lessonMaxTokens && lb.systemInstruction.parts[0].text.includes("Role: lesson"), "lesson request: own token limit + lesson role");
  ok(L.usable(L.parse(txt)) && L.parse(txt).steps.length === 2, "streamed lesson parses on the client");
  f = fakeFetch([() => res(200, sse(lesson))]);
  ev = await collect(lessonEvents({ ...LI, wantPath: false }, ENV, f));
  ok(!ev.some((e) => e.t === "path") && !ev.filter((e) => e.t === "delta").map((e) => e.text).join("").includes("<<<"), "lessonEvents: no path event without wantPath (block still hidden)");
  f = fakeFetch([() => res(200, sse(["INTRO: Hi.\nSTEP: One.\n", `${PATH_OPEN}{"steps":[],"end":true}${PATH_CLOSE}`]))]);
  ev = await collect(lessonEvents(LI, ENV, f));
  eq(ev.find((e) => e.t === "path"), { t: "path", steps: [], next: "", choices: [], questions: [], end: true }, "lessonEvents: branch end passes through");
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
  const c = seeded("Sam", T0);
  const add = C.findTopic(c, "Addition");
  const r = C.applyPath(c, add.id, ["Adding Within 10", "Doubles"], "Doubles", T0 + 1);
  ok(r.ids[0] === C.findTopic(c, "Adding Within 10").id && c.nodes[r.next].label === "Doubles", "a lesson's path reuses the seeded branch and adds new steps");
}

/* ================= hooks for later features (time, engagement, branch ends, colour) ================= */
{
  const c = seeded("Sam", T0);
  const cnt = C.findTopic(c, "Counting"), c20 = C.findTopic(c, "Counting to 20");
  eq(C.activity(c, cnt.id), { spent: 0, engaged: 0, correct: 0, mastery: 0, opened: false, end: false, achieved: false, cards: 0, subject: C.findSubject(c, "Math").id, hue: C.findSubject(c, "Math").hue }, "activity: one place to read per-node state");
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
  const c = seeded("Maya", T0);
  const math = C.findSubject(c, "Math"), cnt = C.findTopic(c, "Counting"), sci = C.findSubject(c, "Science");
  eq(C.GROWTH.stages, [0, 3, 8, 16, 30], "growth (detail) stages");
  eq(C.GROWTH.confirm, [0, 1, 3, 5], "colour stages by confirmed learning");
  let g = C.growthOf(c, cnt.id);
  ok(g.stage === 0 && g.name === "New" && !g.inDeck && !g.achieved && c.deck.length === 0, "a fresh topic is a new, sepia card outside the deck");
  C.engage(c, cnt.id, "open", T0 + 1);
  ok(C.joinDeck(c, T0 + 2).length === 0, "opening a lesson once is not enough to join");
  C.track(c, cnt.id, 75, T0 + 3);
  eq(C.joinDeck(c, T0 + 4), [cnt.id], "time spent pushes it past the threshold: joins the deck");
  ok(C.inDeck(c, cnt.id) && C.deckEntry(c, cnt.id).subject === "Math" && C.deckEntry(c, cnt.id).chain.join(">") === "Math>Counting", "deck entry keeps label, subject and chain");
  eq(C.joinDeck(c, T0 + 5), [], "joining is once only");
  C.track(c, cnt.id, 1800, T0 + 6); C.joinDeck(c, T0 + 7);
  g = C.growthOf(c, cnt.id);
  ok(g.stage === 0 && g.detail >= 3, "time alone adds detail (ink), not colour: still sepia", JSON.stringify(g));
  ok(C.confirm(c, cnt.id, false, T0 + 8) && C.growthOf(c, cnt.id).stage === 0 && cnt.correct === 0, "a wrong answer counts as use, not as colour");
  C.confirm(c, cnt.id, true, T0 + 9);
  ok(C.growthOf(c, cnt.id).stage === 1 && cnt.correct === 1, "a right answer: the first touch of colour");
  C.engage(c, cnt.id, "got", T0 + 10);
  ok(C.growthOf(c, cnt.id).stage === 2 && C.growthOf(c, cnt.id).confirmed === 3, "\"I've got it\" confirms learning too (counts 2)");
  C.confirm(c, cnt.id, true, T0 + 11); C.confirm(c, cnt.id, true, T0 + 12); C.joinDeck(c, T0 + 13);
  const st = C.growthOf(c, cnt.id).stage;
  ok(st === 4 && C.growthOf(c, cnt.id).achieved && !C.growthOf(c, cnt.id).ended && C.growthOf(c, cnt.id).tierKey === "achieved" && C.growthOf(c, cnt.id).toNext === 0, "completed and confirmed (3 right answers): the Achieved tier, in full colour, though its branch has not ended", String(st));
  for (let i = 0; i < 6; i++) C.engage(c, cnt.id, "tricky", T0 + 14 + i);
  cnt.mastery = 0; cnt.correct = 0; C.joinDeck(c, T0 + 20);
  ok(C.growthOf(c, cnt.id).stage === st && C.deckEntry(c, cnt.id).best === st, "a card's colour never goes back down");
  math.engaged = 40; math.spent = 9999;
  ok(!C.joinDeck(c).includes(math.id) && !C.inDeck(c, math.id), "subjects are not cards");
  const gh = C.findTopic(c, "Skip Counting"); gh.spent = 9999;
  ok(gh.ghost && !C.joinDeck(c).includes(gh.id), "ghosts never join until explored");
  gh.spent = 0;

  // colour: sepia first, the chain's hue at full colour, all from one place
  const s0 = C.evolveColor(sci.hue, 0), s4 = C.evolveColor(sci.hue, 4), m0 = C.evolveColor(math.hue, 0);
  ok(s0.hue === 34 && m0.hue === 34 && s0.ink === m0.ink, "stage 0 is the same sepia for every subject");
  ok(s4.hue === sci.hue && s4.ink !== s0.ink && s4.base === sci.hue, "stage 4 reaches the chain's own hue");
  const rgb = (c) => { const [h, sa, l] = [c.hue, c.sat / 100, c.light / 100]; const k = (n) => (n + h / 30) % 12, a = sa * Math.min(l, 1 - l); return [0, 8, 4].map((n) => 255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)))); };
  const dist = (x, y) => Math.hypot(...x.map((v, i) => v - y[i]));
  let closer = true;
  for (const hue of [4, 96, 188, 214, 286]) {
    const ds = [0, 1, 2, 3, 4].map((x) => dist(rgb(C.evolveColor(hue, x)), rgb(C.evolveColor(hue, 4))));
    if (!ds.every((v, i) => !i || v < ds[i - 1])) closer = false;
  }
  ok(closer, "every stage moves the ink closer to the chain's hue (mixed, never through other hues)");
  const washes = [0, 1, 2, 3, 4].map((x) => +/, ([\d.]+)\)$/.exec(C.evolveColor(sci.hue, x).wash)[1]);
  ok(washes.every((v, i) => !i || v > washes[i - 1]), "the colour wash bleeds in a little more at every stage", washes.join(","));
  eq(C.cardColor(c, cnt.id), C.evolveColor(C.hueOf(c, cnt.id), C.growthOf(c, cnt.id).stage), "cardColor = evolveColor(chain hue, stage)");

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
  ok(C.growthOf(c, c20.id).achieved && C.growthOf(c, c20.id).stage === 4 && C.growthOf(c, c20.id).name === "Achieved", "an ended branch is achieved: full colour");
  C.joinDeck(c, T0 + 51);
  ok(c20.achievedAt === T0 + 51 && C.inDeck(c, c20.id) && C.deckEntry(c, c20.id).ach === T0 + 51 && C.deckEntry(c, c20.id).best === 4, "achieved cards join the deck for good, with the date");
  C.applyPath(c, c20.id, ["Counting Back"], "Counting Back", T0 + 52); c20.end = false; C.joinDeck(c, T0 + 53);
  ok(!C.isTerminal(c, c20.id) && C.growthOf(c, c20.id).achieved && C.growthOf(c, c20.id).stage === 4, "an achieved card stays achieved even if its branch grows later");
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
  ok(!lost.nodes[cnt.id] && C.inDeck(lost, cnt.id) && C.deckEntry(lost, cnt.id).label === "Counting" && C.growthOf(lost, cnt.id).stage >= 3 && C.chainOf(lost, cnt.id).join(">") === "Math>Counting", "a deck card stays (colour and chain) even if its topic is gone");
  // prune never drops a deck card
  const big = seeded("Ann", T0);
  const keep = C.findTopic(big, "Shapes");
  C.engage(big, keep.id, "open"); C.engage(big, keep.id, "got"); C.joinDeck(big);
  for (let i = 0; i < 900; i++) C.applyTopics(big, [{ name: "Thing " + i, parent: "Art & Music" }], T0 + i);
  ok(big.nodes[keep.id] && C.inDeck(big, keep.id), "pruning never removes a deck card's topic");
  ok(C.serialize(c).length < 8000, "deck, forks and log stay compact", String(C.serialize(c).length));

  // migration: v2 (PR #56) and v1 saves move to v3; topics past the threshold backfill the deck
  const v2raw = fs.readFileSync("scripts/fixtures/ikolearn-cloud-v2.json", "utf8"), v2 = JSON.parse(v2raw);
  const m2 = C.deserialize(v2raw);
  ok(m2 && v2.v === 2 && m2.v === 8, "v2 cloud migrates to v8");
  ok(v2.n.every((a) => m2.nodes[a[0]] ? m2.nodes[a[0]].label === a[1] && (m2.nodes[a[0]].spent || 0) === (a[10] || 0) : C.OLD_SEEDS.map(C.norm).includes(C.norm(a[1])) && !(a[10] > 0)), "migration keeps every v2 node with its time spent (only untouched old seeds are pruned)");
  const mc = C.findTopic(m2, "Counting"), mnb = C.findTopic(m2, "Number Bonds");
  ok(C.inDeck(m2, mc.id) && C.growthOf(m2, mc.id).stage === 2 && C.growthOf(m2, mc.id).tierKey === "tinted" && !C.inDeck(m2, mnb.id), "backfill: Counting (4 min, got it) joins as a Tinted card (completed); Number Bonds (30 s) not yet");
  ok(C.findTopic(m2, "Counting to 20").end && C.findTopic(m2, "Fractions").path.ids.length === 2, "migration keeps branch ends and paths");
  eq(C.deserialize(C.serialize(m2)).deck, m2.deck, "migrated deck round-trips");
  ok(C.deserialize(fs.readFileSync("scripts/fixtures/ikolearn-cloud-v1.json", "utf8")).v === 8, "v1 still migrates (to v8)");
  // v3 (PR #57) -> v4 without loss: every node, the deck with its best stages, forks, draws and sessions
  const v3raw = fs.readFileSync("scripts/fixtures/ikolearn-cloud-v3.json", "utf8"), v3 = JSON.parse(v3raw), m3 = C.deserialize(v3raw);
  ok(m3 && v3.v === 3 && m3.v === 8, "v3 cloud migrates to v8");
  ok(v3.n.every((a) => m3.nodes[a[0]] ? m3.nodes[a[0]].label === a[1] && m3.nodes[a[0]].spent === a[10] && m3.nodes[a[0]].engaged === a[11] : C.OLD_SEEDS.map(C.norm).includes(C.norm(a[1])) && !(a[10] > 0) && !(a[11] > 0)), "migration keeps every v3 node with its time and engagement (only untouched old seeds are pruned)");
  ok(v3.k.every((e) => C.deckEntry(m3, e[0]) && C.deckEntry(m3, e[0]).best >= e[5]), "migration keeps the deck and each card's best stage");
  eq(m3.draws, v3.g, "migration keeps the draw log"); ok(m3.sessions === v3.ss, "and the session count");
  const fr3 = C.findTopic(m3, "Fractions");
  ok(fr3.fork && fr3.fork.picked === C.findTopic(m3, "Fraction Strips").id && fr3.path.ids.length === 2, "migration keeps forks (with the pick) and paths");
  const c203 = C.findTopic(m3, "Counting to 20");
  ok(C.growthOf(m3, c203.id).achieved && C.deckEntry(m3, c203.id).best === 4, "a branch already ended in v3 is achieved after migration");
  ok(C.growthOf(m3, C.findTopic(m3, "Counting").id).stage === 3, "a v3 card shown at full colour keeps its colour (bright) but is not called achieved without a finished branch");
  eq(C.deserialize(C.serialize(m3)).deck, m3.deck, "migrated v4 deck round-trips");
}

/* ================= card art + session draw (deck.js) ================= */
{
  const a = D.landscape("n12", 2);
  eq(D.landscape("n12", 2), a, "landscape is deterministic from the topic id");
  ok(JSON.stringify(D.landscape("n13", 2)) !== JSON.stringify(a), "different topics, different landscapes");
  let grows = true, prefix = true, finite = true, layers = true, water = 0, trees = 0, birds = 0;
  for (let i = 0; i < 60; i++) {
    const id = "n" + i, st = [0, 1, 2, 3, 4].map((s) => D.landscape(id, s));
    if (st[0].layers.length < 3 || JSON.stringify(st.map((x) => x.layers)) !== JSON.stringify(st.map(() => st[0].layers))) layers = false;
    if (st[0].water) water += 1; if (st[4].totals.trees) trees += 1; if (st[4].totals.birds) birds += 1;
    for (const k of ["hatch", "trees", "birds", "ripples"]) {
      st.forEach((d, s) => {
        if (s && d[k].length < st[s - 1][k].length) grows = false;
        if (s && JSON.stringify(d[k].slice(0, st[s - 1][k].length)) !== JSON.stringify(st[s - 1][k])) prefix = false;
      });
      if (st[4][k].length !== st[4].totals[k]) grows = false;
    }
    JSON.stringify(st[4]).replace(/-?\d+(\.\d+)?/g, (m) => { if (!Number.isFinite(+m)) finite = false; return m; });
    if (/NaN|Infinity/.test(JSON.stringify(st[4]))) finite = false;
  }
  ok(layers, "same ridges at every detail level (3-4 layers)");
  ok(grows, "detail grows with every level: hatching, trees, birds, ripples (all of it at level 4)");
  ok(prefix, "a growing card keeps its marks and adds more (same scene, more ink)");
  ok(finite, "all landscape coordinates are finite");
  ok(water > 15 && water < 50 && trees > 30 && birds > 20, "scenes vary: some water, mostly trees, some birds", `${water}/${trees}/${birds}`);

  const c = seeded("Maya", T0);
  const t = C.findTopic(c, "Counting");
  C.engage(c, t.id, "open"); C.engage(c, t.id, "got"); C.joinDeck(c);
  C.setBlurb(c, t.id, "Saying numbers in order, one for each thing. And more words after the first sentence.");
  const sp = D.cardSpec(c, t.id);
  ok(sp.label === "Counting" && sp.subject === "Math" && sp.stage === C.growthOf(c, t.id).stage && sp.inDeck && sp.color.ink === C.cardColor(c, t.id).ink, "cardSpec: label, subject, stage, colour from the model");
  ok(sp.chain.join(">") === "Math>Counting" && sp.blurb === "Saying numbers in order, one for each thing." && sp.art.detail === C.growthOf(c, t.id).detail, "cardSpec: chain, one-line description, landscape detail");
  ok(D.cardSpec(c, "nope") === null, "cardSpec: unknown id -> null");
  eq(D.chainText(["Math", "Counting", "Counting to 20"], true), "Math → Counting → Counting to 20", "chain text: thin arrows, the full chain in the holder");
  eq(D.chainText(["Making & Coding", "Programming", "Python", "Sets"], false), "Making & Coding → … → Python", "chain text: tiles show subject → … → parent");
  eq(D.chainText(["A", "B", "C", "D", "E", "F"], true), "A → … → E → F", "chain text: long chains are shortened");

  // render with a tiny fake DOM (no innerHTML anywhere)
  const mkEl = (tag, ns) => ({ tag, ns, attrs: {}, kids: [], dataset: {}, style: { props: {}, setProperty(k, v) { this.props[k] = v; } }, listeners: {}, className: "", textContent: "",
    setAttribute(k, v) { this.attrs[k] = v; }, appendChild(k) { this.kids.push(k); return k; }, addEventListener(e, f) { this.listeners[e] = f; } });
  const doc = { createElement: (t) => mkEl(t), createElementNS: (ns, t) => mkEl(t, ns) };
  let opened = null, src = null;
  const el = D.render(doc, sp, { onOpen: (id, e) => { opened = id; src = e; } });
  const svg = el.kids[0].kids[0];
  const flat = (e) => [e].concat((e.kids || []).flatMap(flat));
  const txt = (e) => (e.textContent || "") + (e.kids || []).map(txt).join("");
  const texts = flat(el).map((k) => k.className + "=" + txt(k));
  ok(el.tag === "button" && el.className.includes("gcard") && el.className.includes("size-tile") && el.className.includes("stage-" + sp.stage) && svg.tag === "svg" && svg.ns === "http://www.w3.org/2000/svg", "render: a button card with an SVG landscape");
  ok(el.kids[0].className === "gc-art" && texts.includes("gc-chain=Math") && texts.includes("gc-title=Counting") && texts.includes("gc-mark=" + sp.tierName) && el.className.includes("tier-" + sp.tierKey) && el.style.props["--card-ink"] === sp.color.ink && el.style.props["--card-wash"] === sp.color.wash, "render: landscape first, then title, chain, a quiet text mark; colours from the model");
  el.listeners.click({ stopPropagation() {} });
  ok(opened === t.id && src === el, "render: tapping opens the topic (and hands over the card for the slide into the holder)");
  const full = D.render(doc, sp, { size: "full" });
  ok(full.kids.some((k) => k.className === "gc-desc" && k.textContent === sp.blurb) && full.kids.some((k) => k.className === "gc-chain" && txt(k) === "Math" && /last/.test(k.kids[k.kids.length - 1].className)) && full.kids.some((k) => k.className === "gc-rule"), "render: the full card has the chain above it, a rule and the description");
  {
    const order = (e) => e.kids.map((k) => k.className).filter((n) => /^gc-(art|title|chain|foot)$/.test(n));
    eq(order(full), order(el), "uniform cards: the full card and the tile share one layout");
    eq(order(el), ["gc-art", "gc-title", "gc-chain", "gc-foot"], "uniform cards: plate on top, then title, chain, and the tier/pips foot");
  }
  ok(D.render(doc, sp, { size: "mini" }).kids[0].className === "gc-art" && !flat(D.render(doc, sp, { size: "mini" })).some((k) => /gc-title|gc-chain|gc-mark/.test(k.className)), "render: mini card is the landscape only (plus its colour layer)");
  const count = (e, tag) => (e.tag === tag ? 1 : 0) + (e.kids || []).reduce((n, k) => n + count(k, tag), 0);
  ok(count(svg, "path") >= sp.art.layers.length * 2 + sp.art.trees.length + sp.art.birds.length && count(svg, "line") >= sp.art.hatch.length, "render: ridges (fill + line), trees, birds and hatching are drawn");
  const all = JSON.stringify(full, (k, v) => (k === "ns" ? undefined : v));
  ok(!/"tag":"(img|image|use|i|picture)"|href|https?:/.test(all) && !/\p{Extended_Pictographic}/u.test(all), "no images, icons or emoji: text and line drawing only");
  const ach = Object.assign({}, sp, { achieved: true, stage: 4, stageName: "Achieved", tier: 3, tierKey: "achieved", tierName: "Achieved", pips: 3 });
  ok(D.render(doc, ach, {}).className.includes("achieved") && flat(D.render(doc, ach, {})).some((k) => k.className === "gc-mark" && k.textContent === "Achieved"), "render: achieved cards carry a small text-only Achieved mark");

  // weights
  const y = seeded("Maya", T0);
  const add = (subj, names) => names.forEach((n) => { C.applyTopics(y, [{ name: n, parent: subj, signal: "strength" }], T0); const x = C.findTopic(y, n); C.engage(y, x.id, "open", T0); C.engage(y, x.id, "got", T0); });
  add("Math", ["Counting", "Addition", "Subtraction", "Fractions", "Shapes", "Doubles", "Halves", "Clocks"]);
  add("Science", ["Volcanoes", "Plants"]); add("Art & Music", ["Rhythm"]); add("Reading & Writing", ["Rhymes"]);
  C.joinDeck(y, T0);
  ok(y.deck.length === 12, "test deck: 8 Math, 2 Science, 1 Art, 1 Reading");
  const day0 = D.dayOf(T0) + 1;
  const rk = D.DRAW.rank;
  ok(D.weigh(y, day0).every((x) => x.rank >= 1 && x.rank <= 1 + rk), "the top-10 nudge is modest: at most +" + rk * 100 + "% on a card");
  D.DRAW.rank = 0;
  const w0 = D.weigh(y, day0);
  const mass = (w, s) => w.filter((x) => x.subject === s).reduce((a, x) => a + x.w, 0);
  ok(Math.abs(mass(w0, "Math") - mass(w0, "Science")) < 1e-9, "per-subject weighting: 8 Math cards weigh the same as 2 Science cards (top-10 nudge aside)");
  D.DRAW.rank = rk;
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
  eq(D.drawSession(seeded("Nia", T0), { day: day0 }), [], "empty deck: no draw");
  const one = seeded("Nia", T0); const oc = C.findTopic(one, "Shapes"); C.engage(one, oc.id, "open"); C.engage(one, oc.id, "got"); C.joinDeck(one);
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

/* ================= card game: chains, questions, blurbs, heat, top 10 ================= */
{
  // prompts: chains on chat topics and cards
  ok(/"chain":\["\.\.\."\]/.test(companionSystem(IN)) && /chain: always, for every topic: the full logical chain/.test(companionSystem(IN)) && /for "Sets" in Python: \["Computer Science","Programming","Python"\]/.test(companionSystem(IN)) && /belong under Computer Science/.test(companionSystem(IN)), "chat block always asks for the full chain (Sets: Computer Science > Programming > Python)");
  ok(/chain: the broader topics from the subject down to parent/.test(cardSystem(IN)) && CARD_SCHEMA.properties.chain, "card asks for its chain in the same call");
  eq(parseChain(["Computer Science", "computer science", "Sam", "Programming", "Python", "Sets", "", 7]), ["Programming", "Python", "Sets", "7"], "parseChain: dedupe, drop blanks, keeps the deepest links up to the cap");
  eq(parseChain(["Math", "Sam", "Sets", "Python"], "Sam", "Sets"), ["Math", "Python"], "parseChain: never the name or the topic itself");
  const cb = parseCloudBlock('{"topics":[{"name":"Sets","parent":"Python","signal":"curious","chain":["Computer Science","Programming","Python","Sets"]},{"name":"Rocks","parent":"Science"}]}', "Sam");
  ok(cb.topics[0].chain.join(">") === "Computer Science>Programming>Python" && !("chain" in cb.topics[1]), "parseCloudBlock: chain kept when given, left out otherwise");
  ok(parseCard('{"title":"Sets","body":"A set keeps one of each thing.","topic":"Sets","parent":"Python","chain":["Computer Science","Programming","Python"]}').chain.length === 3, "parseCard: chain parsed");

  // questions: validated, right answer kept, order mixed, at most 2
  const qs = parseQuestions([
    { q: "Which of these could be a set?", options: ["cat, cat, dog", "dog, dog", "cat, dog, fish"], answer: 2 },
    { q: "Too short?", options: ["a", "b"], answer: 5 },
    { q: "What is **in** the set now?", options: ["red, blue", "Red, Blue", "blue", "green", "one", "two"], answer: 0 },
    { q: "A third question that is fine", options: ["x", "y"], answer: 1 },
    { q: "Ok?", options: ["x", "y"], answer: 0 },
    "junk",
  ]);
  ok(qs.length === 3, "parseQuestions: bad answer index dropped, at most 3 kept", String(qs.length));
  ok(qs[0].options[qs[0].answer] === "cat, dog, fish" && qs[0].options.length === 3, "parseQuestions: the right option survives reordering");
  ok(qs[1].options[qs[1].answer] === "red, blue" && qs[1].options.length <= LEARN_LIMITS.options && !qs[1].q.includes("*") && !qs[1].options.includes("Red, Blue"), "parseQuestions: plain text, options deduped and capped, answer still right");
  eq(parseQuestions([{ q: "Which of these could be a set?", options: ["cat, cat, dog", "dog, dog", "cat, dog, fish"], answer: 2 }]), [qs[0]], "parseQuestions is deterministic");
  let rot = 0;
  for (let i = 0; i < 12; i++) { const r = parseQuestions([{ q: "Question number " + i + " here", options: ["right", "w1", "w2"], answer: 0 }])[0]; if (r.answer !== 0) rot += 1; }
  ok(rot >= 4, "parseQuestions: the right answer isn't always first", String(rot));
  eq(parseQuestions("nope"), [], "parseQuestions: junk -> none");
  ok(parseBlurb("A set keeps one of each thing.") === "A set keeps one of each thing." && parseBlurb("Sam, a set keeps one of each.", "Sam") === "" && parseBlurb("ok") === "", "parseBlurb: short, plain, never the learner's name");
  const blk2 = parseLessonBlock('{"steps":[],"choices":[],"questions":[{"q":"Which of these could be a set?","options":["a, a","a, b"],"answer":1}],"blurb":"A set keeps one of each thing."}', "Sam", "Sets", false);
  ok(blk2 && blk2.questions.length === 1 && blk2.blurb === "A set keeps one of each thing.", "parseLessonBlock: questions and blurb alone are enough");

  // lessonEvents: the questions ride in the same call, hidden from the streamed text
  const LI = parseLearnInput({ mode: "notice", name: "Sam", focus: "Sets", trail: "Making & Coding > Programming > Python > Sets", wantPath: false, messages: [] });
  const f = fakeFetch([() => res(200, sse(["INTRO: A set keeps one of each, Sam.\nSTEP: Make one.\n", `${PATH_OPEN}{"steps":[],"choices":[],"questions":[{"q":"Which of these could be a set?","options":["cat, cat","cat, dog"],"answer":1}],`, `"blurb":"A set keeps one of each thing."}${PATH_CLOSE}`]))]);
  const ev = await collect(lessonEvents(LI, ENV, f));
  const pe = ev.find((e) => e.t === "path"), shown = ev.filter((e) => e.t === "delta").map((e) => e.text).join("");
  ok(pe && pe.questions.length === 1 && pe.questions[0].options[pe.questions[0].answer] === "cat, dog" && pe.blurb === "A set keeps one of each thing." && f.calls.length === 1, "lessonEvents: questions and the card line arrive in the one lesson call");
  ok(!shown.includes("cat, dog") && !shown.includes("<<<"), "lessonEvents: questions are not in the streamed text");

  // model: chains build explicit parent -> child links, reusing what exists
  const c = seeded("Maya", T0);
  const r1 = C.applyTopics(c, [{ name: "Sets", parent: "Python", signal: "curious", chain: ["Computer Science", "Programming", "Python"] }], T0 + 1);
  const sets = C.findTopic(c, "Sets");
  eq(C.chainOf(c, sets.id), ["Computer Science", "Programming", "Python", "Sets"], "a chat chain builds the links: Sets sits under Python under Programming, in Computer Science");
  ok(r1.created.length === 2 && r1.created.includes(sets.id) && r1.promoted.includes(C.findTopic(c, "Programming").id), "the missing links are created, the seeded Programming is explored (all highlighted)");
  C.applyTopics(c, [{ name: "Dictionaries", parent: "Python", signal: "curious", chain: ["Computer Science", "Programming", "Python"] }], T0 + 2);
  const py = C.findTopic(c, "Python");
  ok(C.findTopic(c, "Dictionaries").parent === py.id && c.order.filter((id) => c.nodes[id].key === py.key).length === 1, "a second chain reuses the existing Python link");
  C.attachCard(c, { title: "Loops", body: "Loops repeat steps for you. More text.", topic: "Loops", parent: "Python", chain: ["Computer Science", "Programming", "Python"] }, T0 + 3);
  const loops = C.findTopic(c, "Loops");
  ok(loops.parent === py.id && loops.blurb === "Loops repeat steps for you.", "a card's chain places it too; its first sentence becomes the card line");
  ok(C.setBlurb(c, loops.id, "A loop does the same steps again.") && loops.blurb === "A loop does the same steps again." && !C.setBlurb(c, loops.id, "x"), "setBlurb: the lesson's line replaces it; junk ignored");
  const n0 = c.order.length;
  C.applyTopics(c, [{ name: "Rocks", parent: "Science", signal: "explored", chain: ["Science"] }], T0 + 4);
  ok(C.findTopic(c, "Rocks").parent === C.findAny(c, "Science").id && c.order.length === n0 + 1, "a one-link chain is just the parent (nothing extra created)");

  // heat: uses warm a topic, and it cools by half every two weeks
  const h0 = C.heatNow(sets, T0 + 5);
  C.engage(c, sets.id, "open", T0 + 5); C.confirm(c, sets.id, true, T0 + 5);
  const h1 = C.heatNow(sets, T0 + 5);
  ok(Math.abs(h1 - h0 - C.HEAT.open - C.HEAT.correct) < 1e-9, "heat: an open and a right answer add their points");
  ok(Math.abs(C.heatNow(sets, T0 + 5 + 14 * DAYMS) - h1 / 2) < 1e-9, "heat halves in 14 days");
  C.track(c, loops.id, 600, T0 + 5);
  ok(C.heatNow(loops, T0 + 5) >= 10 * C.HEAT.minute, "heat: minutes spent count");

  // round trip of everything new in v4
  C.joinDeck(c, T0 + 6);
  const back = C.deserialize(C.serialize(c));
  ok(back.nodes[sets.id].correct === 1 && Math.abs(C.heatNow(back.nodes[sets.id], T0 + 5) - h1) < 0.02 && back.nodes[loops.id].blurb === loops.blurb, "v4 round trip: right answers, heat and card lines");
  ok(C.chainOf(back, sets.id).join(">") === C.chainOf(c, sets.id).join(">"), "v4 round trip: chains");
  const e1 = C.findTopic(c, "Counting"); e1.end = true; C.engage(c, e1.id, "got", T0 + 7); C.track(c, e1.id, 300, T0 + 7); C.joinDeck(c, T0 + 8);
  const back2 = C.deserialize(C.serialize(c));
  ok(C.isAchieved(back2, e1.id) && back2.nodes[e1.id].achievedAt === Math.floor((T0 + 8) / 1000) * 1000 && C.deckEntry(back2, e1.id).ach, "v4 round trip: achieved date on the node and the card");

  // the top 10: local, decaying, pluggable
  const t1 = T0 + 9;
  let top = RK.top(c, { now: t1 });
  ok(top.length > 0 && top.length <= RK.TOP && top[0].rank === 1 && top.every((r, i) => !i || r.score <= top[i - 1].score), "top 10: ranked, highest first, at most 10");
  ok(top.every((r) => c.nodes[r.id] && !c.nodes[r.id].ghost && c.nodes[r.id].parent) && Array.isArray(top[0].chain), "top 10: only real topics (no subjects or ghosts), each with its chain");
  const later = RK.top(c, { now: t1 + 60 * DAYMS });
  for (let i = 0; i < 8; i++) C.engage(c, C.findTopic(c, "Rocks").id, "open", t1 + 60 * DAYMS);
  ok(RK.top(c, { now: t1 + 60 * DAYMS })[0].label === "Rocks" && later.length > 0, "top 10 follows what's used lately (older use cools off)");
  ok(RK.sources().join() === "local,chain,model" && RK.register({ name: "server", weight: 3, scores: () => ({ [C.findTopic(c, "Dictionaries").key]: 5, unknown: 9 }) }) && RK.sources().join() === "local,chain,model,server", "a future server source plugs in");
  ok(RK.top(c, { now: t1 + 60 * DAYMS })[0].label === "Dictionaries", "a plugged-in source shifts the ranking (unknown topics skipped)");
  RK.register({ name: "broken", scores: () => { throw new Error("x"); } });
  ok(RK.top(c, { now: t1 }).length > 0, "a broken source can't break the ranking");
  ok(RK.unregister("server") && RK.unregister("broken") && !RK.unregister("local") && !RK.unregister("chain") && RK.sources().join() === "local,chain,model", "sources can be removed; the device sources stay");
  const bo = RK.boost(c, t1 + 60 * DAYMS), ids = Object.keys(bo);
  ok(ids.length <= RK.TOP && Math.max(...ids.map((k) => bo[k])) === 1 && ids.every((k) => bo[k] > 0 && bo[k] <= 1), "boost: 1 for the top topic, less down the list");

  // a year of draws with a lopsided top 10 stays balanced
  const y = seeded("Maya", T0);
  const add = (subj, names) => names.forEach((n) => { C.applyTopics(y, [{ name: n, parent: subj, signal: "strength" }], T0); const x = C.findTopic(y, n); C.engage(y, x.id, "open", T0); C.engage(y, x.id, "got", T0); });
  add("Math", ["Counting", "Addition", "Subtraction", "Fractions", "Shapes", "Doubles", "Halves", "Clocks"]);
  add("Science", ["Volcanoes", "Plants"]); add("Art & Music", ["Rhythm"]); add("Reading & Writing", ["Rhymes"]);
  C.joinDeck(y, T0);
  const day0 = D.dayOf(T0) + 1;
  for (let i = 0; i < 365; i++) {
    for (const n of ["Counting", "Addition", "Fractions"]) C.engage(y, C.findTopic(y, n).id, "open", (day0 + i) * DAYMS);
    C.logDraw(y, day0 + i, D.drawSession(y, { day: day0 + i }));
  }
  const bal = D.balance(y, day0 + 364), mshare = bal.find((r) => r.subject === "Math").share;
  ok(mshare < 0.4, "a year with Math always in the top 10: still about a third Math", bal.map((r) => r.subject + " " + r.share.toFixed(2)).join(", "));
  const cnt = (n) => y.draws.filter((d) => d[1] === C.findTopic(y, n).id).length;
  const favs = cnt("Counting") + cnt("Addition") + cnt("Fractions"), quiet = cnt("Shapes") + cnt("Halves") + cnt("Clocks");
  ok(favs > quiet * 1.1 && favs < quiet * 1.8, "the top 10 nudges modestly: favourites come up more, but not overwhelmingly", favs + " vs " + quiet);
  const re = C.heatNow(C.findTopic(y, "Counting"), (day0 + 364) * DAYMS);
  ok(re > 1, "re-opening a lesson keeps warming its topic", re.toFixed(2));
  const fav = C.findTopic(y, "Counting").id;
  ok(C.otherBranches(y, C.findTopic(y, "Subtraction").id, 3, [fav])[0] === fav || !C.otherBranches(y, C.findTopic(y, "Subtraction").id, 3).includes(fav), "suggestions put a nearby top-10 topic first");
}

/* ================= model providers (llm.ts: selection, Gemini + OpenAI-compatible adapters) ================= */
{
  // selection by env only
  let cfg = llmConfig({ GEMINI_API_KEY: "gk" });
  eq(cfg, { provider: "gemini", key: "gk", model: DEFAULT_MODEL, base: GEMINI_BASE, fallback: FALLBACK_MODEL }, "unset: Gemini with GEMINI_API_KEY and today's models");
  ok(llmConfig({ GEMINI_API_KEY: "gk", IKOLEARN_GEMINI_MODEL: "models/g-old" }).model === "g-old", "IKOLEARN_GEMINI_MODEL still works");
  cfg = llmConfig({ GEMINI_API_KEY: "gk", IKOLEARN_LLM_API_KEY: "lk", IKOLEARN_LLM_MODEL: "g-new", IKOLEARN_GEMINI_MODEL: "g-old" });
  ok(cfg.key === "lk" && cfg.model === "g-new", "gemini: IKOLEARN_LLM_API_KEY and IKOLEARN_LLM_MODEL win when set");
  eq(llmConfig({}), { error: "no_key" }, "no key at all -> not ready");
  const OA = { IKOLEARN_LLM_PROVIDER: "OpenAI-Compatible", IKOLEARN_LLM_API_KEY: "ok-key", IKOLEARN_LLM_BASE_URL: "https://api.example.test/openai/v1/", IKOLEARN_LLM_MODEL: "some-model" };
  eq(llmConfig(OA), { provider: "openai-compatible", key: "ok-key", model: "some-model", base: "https://api.example.test/openai/v1" }, "openai-compatible: key, base (trailing slash dropped) and model from env");
  eq(llmConfig({ ...OA, IKOLEARN_LLM_API_KEY: "", GEMINI_API_KEY: "gk" }), { error: "no_key" }, "openai-compatible never borrows the Gemini key");
  eq(llmConfig({ ...OA, IKOLEARN_LLM_BASE_URL: "" }), { error: "no_base" }, "openai-compatible needs a base URL");
  eq(llmConfig({ ...OA, IKOLEARN_LLM_BASE_URL: "http://api.example.test/v1" }), { error: "no_base" }, "base URL must be https (http only for localhost)");
  ok(llmConfig({ ...OA, IKOLEARN_LLM_BASE_URL: "http://localhost:8080/v1" }).base === "http://localhost:8080/v1", "a local OpenAI-compatible server is allowed");
  eq(llmConfig({ ...OA, IKOLEARN_LLM_MODEL: "" }), { error: "no_model" }, "openai-compatible needs a model");
  eq(llmConfig({ ...OA, IKOLEARN_LLM_PROVIDER: "carrier-pigeon" }), { error: "unknown_provider" }, "unknown provider -> not ready");
  ok(llmReady(OA) && !llmReady({ ...OA, IKOLEARN_LLM_MODEL: "" }) && llmReady({ GEMINI_API_KEY: "gk" }), "llmReady");
  const pbody = JSON.stringify({ name: "Sam", messages: [{ role: "user", text: "hi" }], cloud: "", parents: [] });
  const pbase = { rawBody: pbody, origin: "https://ikosagon.com", host: "ikosagon.com", ip: "7.7.7.7", state: createLearnState(() => T0) };
  ok(prepare({ ...pbase, env: OA }).ok && prepare({ ...pbase, env: { ...OA, IKOLEARN_LLM_BASE_URL: "" }, ip: "7.7.7.8" }).out.status === 503, "routes: ready with an OpenAI-compatible provider, 503 when it is half set up");

  // Gemini adapter: schemas from the prompts (plain JSON Schema) are upper-cased for Gemini
  ok(CARD_SCHEMA.type === "object" && CARD_SCHEMA.properties.title.type === "string", "prompts keep provider-neutral (lowercase) schemas");
  const gjb = jsonBody("s", "u", CARD_SCHEMA).generationConfig.responseSchema;
  ok(gjb.type === "OBJECT" && gjb.properties.path.type === "ARRAY" && gjb.properties.path.items.type === "STRING" && gjb.required.includes("title"), "Gemini gets its own schema casing");

  // OpenAI-compatible adapter: streaming
  const enc = new TextEncoder();
  const oaiSse = (pieces) => new ReadableStream({ start(c) {
    c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { role: "assistant" } }] })}\n\n`));
    c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { reasoning: "thinking..." } }] })}\n\n`));
    for (const t of pieces) { const l = `data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`; c.enqueue(enc.encode(l.slice(0, 7))); c.enqueue(enc.encode(l.slice(7))); }
    c.enqueue(enc.encode("data: [DONE]\n\n")); c.close();
  } });
  const reply = ["Fractions are ", "parts of a whole, Sam.", `\n${CLOUD_OPEN}{"topics":[{"name":"Fractions","parent":"Math","signal":"curious"}],`, `"ghosts":[{"name":"Decimals","parent":"Math"}]}${CLOUD_CLOSE}`];
  let f = fakeFetch([() => res(200, oaiSse(reply))]);
  const evO = await collect(chatEvents(IN, OA, f));
  const evG = await collect(chatEvents(IN, ENV, fakeFetch([() => res(200, sse(reply))])));
  const call = f.calls[0], rb = JSON.parse(call.init.body);
  ok(call.url === "https://api.example.test/openai/v1/chat/completions" && call.init.headers.Authorization === "Bearer ok-key" && rb.stream === true && rb.model === "some-model", "openai-compatible: POST {base}/chat/completions, Bearer key, streamed, the configured model");
  ok(rb.messages[0].role === "system" && rb.messages[0].content.includes("Role:") && rb.messages.slice(1).map((m) => m.role).join() === buildContents(IN).map((m) => (m.role === "model" ? "assistant" : "user")).join() && rb.max_tokens === MODEL_LIMITS.chatMaxTokens, "openai-compatible: system first, model turns become assistant, token limit kept");
  eq(toMessages("sys", [{ role: "user", parts: [{ text: "a" }] }, { role: "model", parts: [{ text: "b" }, { text: "c" }] }]), [{ role: "system", content: "sys" }, { role: "user", content: "a" }, { role: "assistant", content: "bc" }], "toMessages: model -> assistant, parts joined");
  eq(evO.filter((e) => e.t !== "start"), evG.filter((e) => e.t !== "start"), "the same reply gives the same events from either provider (text, hidden cloud block, done)");
  ok(evO[0].t === "start" && evO[0].model === "some-model" && !JSON.stringify(evO).includes("ok-key") && !JSON.stringify(evO).includes("thinking"), "openai-compatible: names its model, never the key, reasoning text skipped");
  const lessonText = ["INTRO: Sets keep one of each, Sam.\nSTEP: Make one.\n", `${PATH_OPEN}{"steps":["Lists"],"next":"Lists","choices":[],"questions":[{"q":"Which of these could be a set?","options":["a, a","a, b"],"answer":1}],"blurb":"A set keeps one of each thing."}${PATH_CLOSE}`];
  const LI = parseLearnInput({ mode: "notice", name: "Sam", focus: "Sets", trail: "Making & Coding > Python > Sets", wantPath: true, messages: [] });
  const lO = await collect(lessonEvents(LI, OA, fakeFetch([() => res(200, oaiSse(lessonText))])));
  const lG = await collect(lessonEvents(LI, ENV, fakeFetch([() => res(200, sse(lessonText))])));
  eq(lO.filter((e) => e.t !== "start"), lG.filter((e) => e.t !== "start"), "lessons: hidden block (path, questions, card line) parsed the same from either provider");
  f = fakeFetch([() => res(500, null), () => res(200, oaiSse(["x"]))]);
  const e5 = await collect(chatEvents(IN, OA, f));
  ok(f.calls.length === 1 && e5[0].t === "error" && e5[0].reason === "upstream", "openai-compatible: a 5xx is an error (no hidden second call)");
  f = fakeFetch([() => res(401, null)]);
  ok((await collect(chatEvents(IN, OA, f)))[0].reason === "refused", "openai-compatible: a bad key (401) is refused");
  f = fakeFetch([() => res(429, null)]);
  ok((await collect(chatEvents(IN, OA, f)))[0].reason === "busy", "openai-compatible: 429 -> busy");

  // OpenAI-compatible adapter: one-shot JSON
  const oj = (obj, extra = {}) => () => res(200, { choices: [{ message: { content: typeof obj === "string" ? obj : JSON.stringify(obj) }, finish_reason: "stop", ...extra }] });
  const card = { title: "Fractions", body: "A fraction is a part of a whole. Fold a paper in four and shade three.", topic: "Fractions", parent: "Math" };
  f = fakeFetch([oj(card)]);
  const cO = await cardFor(IN, OA, f);
  const cG = await cardFor(IN, ENV, fakeFetch([() => res(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(card) }] } }] })]));
  const jr = JSON.parse(f.calls[0].init.body);
  ok(jr.response_format.type === "json_object" && !jr.stream && /JSON Schema: \{"type":"object"/.test(jr.messages[0].content) && jr.max_tokens === MODEL_LIMITS.jsonMaxTokens, "openai-compatible JSON: json_object mode, the schema in the system message");
  eq(cO.body, cG.body, "a card comes out the same from either provider");
  f = fakeFetch([oj("```json\n" + JSON.stringify({ steps: ["Pairs To 10", "Making 20"], next: "Making 20" }) + "\n```")]);
  ok((await pathFor(LI, OA, f)).body.path?.next === "Making 20", "openai-compatible JSON: fenced JSON still parses");
  f = fakeFetch([oj("{}", { finish_reason: "content_filter" })]);
  ok((await cardFor(IN, OA, f)).body.reason === "blocked", "openai-compatible JSON: content filter -> blocked");

  // a plain request timeout, so nobody waits 30 s (no extra fallback logic)
  const hang = (url, init) => new Promise((_, rej) => init.signal.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" }))));
  const keep = { ...MODEL_LIMITS };
  ok(MODEL_LIMITS.requestTimeoutMs <= 20_000 && MODEL_LIMITS.requestTimeoutMs + MODEL_LIMITS.streamTimeoutMs < 60_000 && 2 * MODEL_LIMITS.jsonTimeoutMs < 60_000, "timeouts: a plain request timeout; a timeout plus one fallback still ends inside the routes' 60 s");
  MODEL_LIMITS.requestTimeoutMs = 30; MODEL_LIMITS.jsonTimeoutMs = 30;
  for (const [name, env, n] of [["gemini", ENV, 2], ["openai-compatible", OA, 1]]) {
    f = fakeFetch([hang, hang]);
    const t0 = Date.now(), ev = await collect(chatEvents(IN, env, f));
    ok(ev[0].reason === "timeout" && f.calls.length === n && Date.now() - t0 < 1000, `${name}: a request that never answers times out quickly (${n} call${n > 1 ? "s" : ""})`);
    f = fakeFetch([hang, hang]);
    ok((await cardFor(IN, env, f)).body.reason === "timeout" && f.calls.length === n, `${name}: JSON calls time out too`);
  }
  f = fakeFetch([hang, () => res(200, sse(["Fractions are parts."]))]);
  const ft = await collect(chatEvents(IN, ENV, f));
  ok(ft[0].model === FALLBACK_MODEL && f.calls[1].url.includes(FALLBACK_MODEL) && ft.some((e) => e.t === "delta"), "gemini: a primary that times out hands over to the fallback model once");
  Object.assign(MODEL_LIMITS, keep);

  // prompts and service never touch a provider directly
  const svc = fs.readFileSync("lib/ikolearn/service.ts", "utf8"), pr = fs.readFileSync("lib/ikolearn/prompts.ts", "utf8");
  ok(/from "\.\/llm"/.test(svc) && !/from "\.\/(gemini|openai-compatible)"/.test(svc + pr) && !/generativelanguage|GEMINI_API_KEY|chat\/completions/.test(svc + pr), "prompts.ts and service.ts only use the model interface");
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
  ok(/ikolearn\.v1\.lessons/.test(app) && /MAX_LESSONS/.test(app) && /"\/lesson"/.test(app) && /"\/create"/.test(app) && !/"\/path"/.test(app), "lessons cached in localStorage; lesson and create endpoints (paths now come from the creation call)");
  ok(!/generativelanguage|GEMINI_API_KEY|x-goog-api-key|innerHTML/.test(lessonJs) && !/innerHTML\s*=(?!\s*"")/.test(app), "lesson rendering uses text nodes only");
  ok(!/montessori|waldorf|bloom|common core/i.test(app + lessonJs + html), "UI never names frameworks");
  const deckJs = fs.readFileSync("public/ikolearn/deck.js", "utf8");
  ok(html.indexOf("cloud-model.js") < html.indexOf("deck.js") && html.indexOf("deck.js") < html.indexOf("app.js"), "deck.js loads after the model and before app.js");
  ok(/id="deck"/.test(html) && /id="draw"/.test(html) && /id="deck-btn"/.test(html) && /id="l-fork"/.test(html) && /id="l-card"/.test(html), "deck view, draw, fork and lesson card present");
  ok(!/innerHTML|generativelanguage|fetch\(/.test(deckJs) && /createElementNS/.test(deckJs), "deck.js: SVG via DOM calls, no innerHTML, no network");
  ok(/P\.suggest\(/.test(app) && /P\.draw\(/.test(app) && /"Draw a card"/.test(app) && /"Continue "/.test(app) && /ikolearn\.v1\.session/.test(app), "suggestions, Draw and Continue come from the orchestrator (the old visit key is still cleared on reset)");
  ok(/el\.pAdj\.hidden = !ended/.test(app) && !/grow\(\{ topics: \[\], ghosts/.test(app), "related topics only once a branch has ended; notes no longer add branches");
  ok(/\.gcard::before/.test(css) && /\.gcard::after/.test(css) && /inset 0 0 0 3px/.test(css) && /\.gcard\.grew/.test(css), "cards: thin double border and corner fold; growth pulse");
  ok(/prefers-reduced-motion[\s\S]{0,400}\.gcard\.grew/.test(css) && /reduceMotion/.test(app) && /matchMedia\("\(prefers-reduced-motion: reduce\)"\)/.test(app), "the slide into the holder and the pulse respect reduced motion");
  ok(/id="holder"/.test(html) && /class="tray"/.test(html) && /id="l-quiz"/.test(html) && /id="top"/.test(html) && /id="t-list"/.test(html), "holder, tray, question area and top 10 present");
  ok(html.indexOf("cloud-model.js") < html.indexOf("rank.js") && html.indexOf("rank.js") < html.indexOf("deck.js"), "rank.js loads after the model and before deck.js");
  ok(/type = "radio"/.test(app) && /mk\("fieldset"/.test(app) && /C\.confirm\(/.test(app), "questions are real radio groups; answers confirm learning in the model");
  const rankJs = fs.readFileSync("public/ikolearn/rank.js", "utf8");
  ok(!/innerHTML|fetch\(|localStorage/.test(rankJs), "rank.js: pure, no network or storage of its own");
  /* v8 adds tiers, merging, the camera and the corpus (about +30 KB raw, +8 KB gzip); the budget was 330 KB raw / 100 KB gzip.
     The album, the card hub, the orbit pivot and the motion add about +34 KB raw / +8.8 KB gzip (all unminified source,
     about a third of it comments): over that budget, so it is 350 KB / 105 KB here until a minify step or a trim. */
  const files = ["index.html", "styles.css", "app.js", "cloud-model.js", "cloud-view.js", "lesson.js", "deck.js", "rank.js", "orchestrator.js", "camera.js", "icon.svg"];
  const bytes = files.reduce((n, f) => n + fs.statSync("public/ikolearn/" + f).size, 0);
  const gz = files.reduce((n, f) => n + zlib.gzipSync(fs.readFileSync("public/ikolearn/" + f), { level: 9 }).length, 0);
  ok(bytes < 350_000, "app weight under 350 KB uncompressed", String(bytes));
  ok(gz < 105_000, "app weight under 105 KB gzipped", String(gz));
}

/* ================= the flow pass: chains, Computer Science, orchestrator, children, tests ================= */
{
  // A) chains (v6): no tables. The model's chain is used as given; a short one is deepened from the learner's own map.
  const blk = parseCloudBlock('{"topics":[{"name":"Sets","parent":"Python","signal":"curious","chain":["Computer Science","Programming","Python"]},{"name":"Halves","parent":"Fractions","signal":"explored"}],"ghosts":[]}', "Sam");
  eq(blk.topics[0].chain, ["Computer Science", "Programming", "Python"], "parseCloudBlock: the model's full chain passes through");
  ok(!("chain" in blk.topics[1]), "parseCloudBlock: no chain is invented on the server (no hardcoded tables)");
  ok(!fs.existsSync("lib/ikolearn/chains.ts") && !/KNOWN_CHAINS|chainHint/.test(fs.readFileSync("public/ikolearn/cloud-model.js", "utf8")), "the hardcoded chain tables are gone (server and device)");
  // a full chain from the model builds every missing link on an empty cloud, and a palette subject keeps its colour
  const f0 = C.create("Maya", T0);
  C.applyTopics(f0, [{ name: "Sets", parent: "Python", signal: "curious", chain: ["Computer Science", "Programming", "Python"] }], T0 + 1);
  const sets = C.findTopic(f0, "Sets");
  eq(C.chainOf(f0, sets.id), ["Computer Science", "Programming", "Python", "Sets"], "a full chain on an empty cloud: Computer Science > Programming > Python > Sets");
  ok(C.findSubject(f0, "Computer Science").hue === 252, "Computer Science takes its palette hue (252) even as the first subject");
  // the live case: the model put Sets right under Computer Science; Python is on the map and the learner named it
  const said = "How do sets work in Python?";
  const f1 = C.create("Maya", T0);
  C.applyTopics(f1, [{ name: "Python", parent: "Programming", signal: "explored", chain: ["Computer Science", "Programming"] }], T0 + 1);
  C.applyTopics(f1, [{ name: "Sets", parent: "Computer Science", signal: "curious", chain: ["Computer Science"] }], T0 + 2, said);
  eq(C.chainOf(f1, C.findTopic(f1, "Sets").id), ["Computer Science", "Programming", "Python", "Sets"], "device: a short chain is deepened from a topic on the learner's map that they named");
  const f2 = C.create("Maya", T0);
  C.applyTopics(f2, [{ name: "Python", parent: "Programming", signal: "explored", chain: ["Computer Science", "Programming"] }], T0 + 1);
  C.applyTopics(f2, [{ name: "Sets", parent: "Computer Science", signal: "curious", chain: ["Computer Science"] }], T0 + 2, "how do sets work in pythonic code");
  eq(C.chainOf(f2, C.findTopic(f2, "Sets").id), ["Computer Science", "Sets"], "device: whole words only (no deepening from 'pythonic')");
  C.applyTopics(f2, [{ name: "Venn Sets", parent: "Math", signal: "curious", chain: ["Math"] }], T0 + 3, said);
  eq(C.chainOf(f2, C.findTopic(f2, "Venn Sets").id), ["Math", "Venn Sets"], "device: never moves a topic into another subject");
  eq(C.deepenChain(f1, [], "Sets", said), null, "deepenChain needs a link to start from");
  // coding words still lead to Computer Science when both subjects exist
  const f3 = seeded("Maya", T0);
  C.applyTopics(f3, [{ name: "Variables", parent: "Coding", signal: "curious" }], T0 + 3);
  ok(C.subjectOf(f3, C.findTopic(f3, "Variables").id).label === "Computer Science", "coding words lead to Computer Science");
  C.applyTopics(f3, [{ name: "Bridges", parent: "Engineering", signal: "curious" }], T0 + 4);
  ok(C.subjectOf(f3, C.findTopic(f3, "Bridges").id).label === "Making & Coding", "making and engineering stay with Making & Coding");
  // colours: the palette is data only; a learner's own subject takes a free hue no palette subject owns
  ok(C.PALETTE.every((x) => typeof x.label === "string" && Number.isFinite(x.hue) && Object.keys(x).length === 2), "PALETTE is data only: names and hues, no children or paths");
  const g8 = C.create("Lee", T0); C.applyTopics(g8, [{ name: "Chess", parent: "Games", signal: "explored" }], T0 + 1);
  C.applyTopics(g8, [{ name: "Fractions", parent: "Maths", signal: "explored" }], T0 + 2);
  ok(C.findSubject(g8, "Games").hue === 214 && C.findSubject(g8, "Math")?.hue === 28, "a new subject takes a free non-palette hue (214); Math keeps 28 whenever it appears", JSON.stringify(C.subjects(g8).map((x) => x.label + ":" + x.hue)));

  // v4 -> v6 migration: nothing the learner used is lost; untouched old seeds are pruned; CS topics move across
  const v4raw = fs.readFileSync("scripts/fixtures/ikolearn-cloud-v4.json", "utf8"), v4 = JSON.parse(v4raw);
  const m5 = C.deserialize(v4raw), seedKeys = C.OLD_SEEDS.map(C.norm);
  ok(v4.v === 4 && m5 && m5.v === 8, "v4 cloud migrates to v8");
  const gone = v4.n.filter((row) => !m5.nodes[row[0]]);
  ok(gone.length > 10 && gone.every((row) => seedKeys.includes(C.norm(row[1])) && !(row[3] & 2) && !(row[10] > 0) && !(row[11] > 0) && !(row[5] > 0)), "v4 -> v6: only untouched seed nodes are pruned (never opened, no time, no engagement, no mastery)", gone.map((r) => r[1]).join());
  ok(["Number Bonds", "Poetry", "Robots"].every((l) => !C.findTopic(m5, l)), "v4 -> v6: untouched Math (and other) seed ghosts are gone");
  const br = seeded("Lu", T0), cn = C.findTopic(br, "Counting");
  C.engage(br, cn.id, "open", T0 + 1); C.engage(br, cn.id, "got", T0 + 2);
  const c20 = C.findTopic(br, "Counting to 20"); C.engage(br, c20.id, "got", T0 + 3); C.confirm(br, c20.id, true, T0 + 4); C.confirm(br, c20.id, true, T0 + 5);
  C.pruneSeeds(br);
  ok(C.findTopic(br, "Skip Counting") && !C.isAchieved(br, cn.id), "pruning keeps the rest of a branch the learner worked on (Skip Counting under Counting), so no card is promoted by it");
  ok(v4.n.filter((row) => !seedKeys.includes(C.norm(row[1]))).every((row) => m5.nodes[row[0]] && m5.nodes[row[0]].label === row[1]), "v4 -> v6: every node the learner made is kept, with its id");
  ok(m5.deck.every((e) => m5.nodes[e.id]) && m5.deck.length === v4.k.length, "v4 -> v6: every deck card's topic is kept");
  const py5 = C.findTopic(m5, "Python"), cod5 = C.findTopic(m5, "Coding"), cs5 = C.subjects(m5).find((x) => x.label === "Computer Science");
  eq(C.chainOf(m5, C.findTopic(m5, "Sets").id), ["Computer Science", "Coding", "Python", "Sets"], "v4 -> v6: Coding (with Python and Sets) moves under Computer Science");
  ok(cod5.parent === cs5.id && C.childrenOf(m5, C.findSubject(m5, "Making & Coding").id).every((x) => !C.CS_TOPICS.map(C.norm).includes(x.key)), "v4 -> v6: nothing clearly CS is left in Making & Coding");
  ok(!C.findTopic(m5, "Programming") && !C.findTopic(m5, "Algorithms"), "v4 -> v6: no CS seeds are planted");
  const row = v4.n.find((x) => x[1] === "Python");
  ok(py5.correct === row[12] && Math.round(py5.heat * 100) === row[13] && py5.blurb === row[15] && py5.spent === row[10], "v4 -> v6: answers, heat, time and card line kept");
  const dk = m5.deck.find((e) => e.id === py5.id);
  ok(dk.subject === "Computer Science" && dk.hue === 252 && dk.chain.join(">") === "Computer Science>Coding>Python", "v4 -> v6: deck cards kept, with their new subject, hue and chain");
  ok(py5.fork && py5.fork.ids.length === 2 && m5.draws.length === v4.g.length && m5.cards.length === v4.cards.length, "v4 -> v6: forks, draw log and cards kept");
  const again = C.deserialize(C.serialize(m5));
  ok(C.serialize(again) === C.serialize(m5), "v6 round trip is stable (migration runs once)");
  // pruning rules on their own
  const pr = seeded("Ivy", T0), cnt = C.findTopic(pr, "Counting"), bonds0 = C.findTopic(pr, "Number Bonds");
  C.engage(pr, bonds0.id, "open", T0 + 1);
  const shapes0 = C.findTopic(pr, "Shapes"); C.track(pr, shapes0.id, 30, T0 + 2);
  const myOwn = C.applyTopics(pr, [{ name: "Robots", parent: "Making & Coding", signal: "curious" }], T0 + 3);
  const removed = C.pruneSeeds(pr);
  ok(C.findTopic(pr, "Number Bonds") && C.findTopic(pr, "Addition") && C.findSubject(pr, "Math"), "pruning: an opened seed is kept, with its parents");
  ok(C.findTopic(pr, "Shapes"), "pruning: a seed with time spent is kept");
  ok(C.findTopic(pr, "Robots") && myOwn.promoted.length === 1, "pruning: a seed the learner talked about is kept");
  ok(!C.findTopic(pr, "Skip Counting") && !C.findTopic(pr, "Poetry") && removed.includes("Skip Counting") && !C.findTopic(pr, "Counting to 20"), "pruning: untouched seeds go, deepest first");
  ok(!cnt || !C.findTopic(pr, "Counting"), "pruning: an untouched seed parent goes once its children are gone");
  ok(!C.findSubject(pr, "People & Places") && !C.findSubject(pr, "Art & Music"), "pruning: an untouched seeded subject goes when nothing is left under it");
  const learned = C.create("Ola", T0);
  C.applyTopics(learned, [{ name: "Counting", parent: "Math", signal: "explored" }], T0 + 1);
  ok(C.pruneSeeds(learned).length === 0, "pruning: a topic the learner made (even with an old seed's name) is never pruned");

  // the orchestrator: engagement, children waiting on it, tests from completed material only
  const o = seeded("Maya", T0), O = (l) => C.findTopic(o, l);
  const add = O("Subtraction");
  C.engage(o, add.id, "open", T0 + 1);
  ok(!P.engaged(o, add.id) && P.wantChildren(o, add.id), "orchestrator: a first read isn't engagement yet; a topic without a path wants child topics");
  ok(C.setPending(o, add.id, ["Taking Away", "Counting Back", "Within 20", "Taking Away"], "Counting Back") && !P.wantChildren(o, add.id) && !P.childrenReady(o, add.id), "child topics from the lesson wait (and aren't asked for twice)");
  const b5 = C.deserialize(C.serialize(o));
  ok(b5.nodes[add.id].pending && b5.nodes[add.id].pending.steps.join() === "Taking Away,Counting Back,Within 20", "waiting child topics survive a reload (v5)");
  C.confirm(o, add.id, true, T0 + 2);
  ok(P.engaged(o, add.id) && P.childrenReady(o, add.id), "a right answer is engagement: the children may grow");
  const grown = C.applyPending(o, add.id, T0 + 3);
  ok(grown && add.path && add.path.ids.map((x) => o.nodes[x].label).join() === "Taking Away,Counting Back,Within 20" && grown.added.every((x) => o.nodes[x].ghost && o.nodes[x].parent === add.id) && !add.pending, "children grow as dotted ghosts under the parent, in learning order");
  ok(grown.added.length === 3 && add.path.next === O("Counting Back").id, "duplicates dropped; the suggested first child is kept");
  eq(P.orderedChildren(o, add.id).slice(0, 3).map((x) => o.nodes[x].label), ["Taking Away", "Counting Back", "Within 20"], "without use, a parent's children keep their logical order (foundational first)");
  for (let i = 0; i < 5; i++) C.engage(o, O("Within 20").id, "open", T0 + 3);
  eq(P.orderedChildren(o, add.id).slice(0, 3).map((x) => o.nodes[x].label), ["Within 20", "Taking Away", "Counting Back"], "a much-used child moves up; the others keep their logical order");
  ok(P.lessonContext(o, add.id).wantPath === false && typeof P.lessonContext(o, O("Counting").id).ahead === "string", "lessonContext: no child topics asked for once they exist");

  // tests
  ok(!P.testState(o, add.id).ready && P.testState(o, add.id).need > 0, "no test before enough is completed");
  const kids = add.path.ids.map((x) => o.nodes[x]);
  C.confirm(o, kids[0].id, true, T0 + 4); C.confirm(o, kids[0].id, true, T0 + 5);
  C.engage(o, kids[1].id, "got", T0 + 6);
  ok(!P.testState(o, add.id).ready, "two of three done: not yet");
  const req0 = P.testRequest(o, add.id);
  ok(req0.material.every((m) => m.label !== kids[2].label), "test material never includes an unlearned topic");
  C.engage(o, kids[2].id, "got", T0 + 7); C.joinDeck(o, T0 + 8);
  const st = P.testState(o, add.id);
  ok(st.ready && st.done.length === 3, "a test appears once 3 children are completed (or the whole path)");
  const req = P.testRequest(o, add.id);
  eq(req.material.map((m) => m.label), ["Subtraction", "Taking Away", "Counting Back", "Within 20"], "test material: the parent (opened) and its completed children only");
  const sg = P.suggest(o, { now: T0 + 9 });
  ok(sg[0].kind === "test" && sg[0].id === add.id && sg[0].why === "Ready for a test" && C.testOf(o, add.id).offeredAt, "the orchestrator offers the test first, and records the offer");
  const before = C.growthOf(o, kids[0].id).stage, pBefore = { c: add.correct, m: add.mastery };
  const tr = C.recordTest(o, add.id, [{ id: kids[0].id, right: true }, { id: kids[1].id, right: true }, { id: kids[2].id, right: false }, { id: O("Shapes").id, right: true }], T0 + 10);
  ok(tr.n === 3 && tr.right === 2 && tr.passed && !tr.touched.includes(O("Shapes").id), "recordTest: only topics under the parent count (2 of 3 is a pass)");
  ok(C.growthOf(o, kids[0].id).stage > before && add.correct === pBefore.c + 2 && add.mastery > pBefore.m, "a test colours its topics' cards and strengthens the parent");
  ok(!P.testState(o, add.id).ready && P.testState(o, add.id).taken, "after an attempt the test rests until more is completed");
  const t5 = C.deserialize(C.serialize(o)).tests[add.id];
  ok(t5 && t5.attempts === 1 && Math.abs(t5.best - 2 / 3) < 0.01 && t5.n === 3, "test results survive a reload (v5)");
  const half = seeded("Ana", T0), hm = C.findSubject(half, "Computer Science");
  half.nodes[hm.path.ids[0]].ghost = false; half.nodes[hm.path.ids[1]].ghost = false;
  C.engage(half, hm.path.ids[0], "got", T0); C.engage(half, hm.path.ids[1], "got", T0);
  ok(P.testState(half, hm.id).ready, "a test also appears when a parent's whole path (2+ steps) is completed");

  // suggestions, ranking and Draw: on the device, no calls
  const q = C.deserialize(v4raw), now = Date.UTC(2026, 9, 12, 15);
  const s1 = P.suggest(q, { now });
  ok(s1.length === 3 && s1.every((x) => q.nodes[x.id] && ["deck", "next", "new", "test", "grow"].includes(x.kind) && x.why), "suggest: three cards, each with a plain reason");
  ok(s1.some((x) => x.kind === "new"), "suggest: something new always keeps a place (free exploration)");
  ok(q.suggest && q.suggest.items.length === 3 && C.deserialize(C.serialize(q)).suggest.items.length === 3, "suggestions are kept on the cloud (v5)");
  const topIds = RK.top(q, { now }).map((x) => x.id);
  const ranked = s1.filter((x) => x.kind !== "test" && x.kind !== "new" && x.kind !== "grow");
  ok(ranked.length && topIds.includes(ranked[0].id) && ranked[0].why.startsWith("In your top 10"), "ranking shows: the top 10 is offered first and says so");
  const chainTop = RK.chains(q, { now })[0];
  ok(chainTop && ["Coding", "Python", "Computer Science"].includes(chainTop.label), "ranking: the busiest chain is the one in use (" + (chainTop && chainTop.label) + ")");
  const sc = RK.scores(q, now);
  const m = C.findSubject(q, "Math");
  // ranking with the model's importance scores (made for the learner's age band and rough region)
  const mq = C.create("Rae", T0);
  C.setProfile(mq, { age: "7-9", region: "Canada / Ontario-ish", onboarded: true }, T0);
  C.applyCreate(mq, { items: [{ node: { name: "Dinosaurs", chain: ["Science"] }, card: { title: "Dinosaurs", blurb: "Giant reptiles from long ago.", goal: "Name three kinds." },
    children: [{ name: "Fossils", order: 1, score: 0.4 }, { name: "Dino Types", order: 2, score: 0.95 }, { name: "Extinction", order: 3, score: 0.2 }] }] }, { t: T0 + 1 });
  const ML = (l) => C.findTopic(mq, l), din = ML("Dinosaurs"), msc = RK.scores(mq, T0 + 2);
  ok(RK.sources().join() === "local,chain,model" && !RK.POPULAR, "ranking sources: local use, chain, and the model's importance (no built-in popularity list)");
  ok(msc[ML("Dino Types").id] > msc[ML("Fossils").id] && msc[ML("Fossils").id] > msc[ML("Extinction").id], "model importance ranks a parent's children");
  eq(P.orderedChildren(mq, din.id).map((x) => mq.nodes[x].label), ["Dino Types", "Fossils", "Extinction"], "a much more important child is offered before the first logical step");
  ok(P.orderedChildren(mq, din.id).includes(ML("Extinction").id), "a low score never hides a child (exploration stays free)");
  ok(!RK.top(mq, { now: T0 + 2 }).length, "model scores alone never put a topic in the top 10");
  const close = C.create("Rae", T0);
  C.applyCreate(close, { items: [{ node: { name: "Bridges", chain: ["Making & Coding"] }, card: {}, children: [{ name: "Beams", order: 1, score: 0.7 }, { name: "Arches", order: 2, score: 0.75 }] }] }, { t: T0 + 1 });
  eq(P.orderedChildren(close, C.findTopic(close, "Bridges").id).map((x) => close.nodes[x].label), ["Beams", "Arches"], "with similar scores the logical order leads");
  // the age / region bias: scores made before the learner changed their age or region count half until refreshed
  C.setProfile(mq, { age: "10-12" }, T0 + 5);
  C.applyCreate(mq, { items: [{ node: { name: "Volcanoes", chain: ["Science"] }, card: {}, children: [{ name: "Lava", order: 1, score: 0.6 }, { name: "Eruptions", order: 2, score: 0.5 }] }] }, { t: T0 + 6 });
  const msc2 = RK.scores(mq, T0 + 7);
  ok(mq.profile.changedAt === T0 + 5 && msc2[ML("Lava").id] > msc2[ML("Dino Types").id], "after an age change, fresh scores outrank older ones (0.6 now > 0.95 made for the old age band)");
  const fork = { ids: [ML("Extinction").id, ML("Dino Types").id], why: ["Later", "Start here"] };
  ok(P.orderChoices(mq, fork)[0].id === ML("Dino Types").id && P.orderChoices(mq, fork)[0].why === "Start here", "fork choices are ordered by rank, keeping their reasons");
  const today = (cl) => cl.draws.filter((x) => x[0] === D.dayOf(now)).length, drawsBefore = today(q), d1 = P.draw(q, { now, skip: py5.id });
  ok(d1 && q.nodes[d1] && d1 !== py5.id && today(q) === drawsBefore + 1 && q.draws.at(-1)[1] === d1, "Draw: one card, never the one already open, logged for the yearly balance");
  const empty = seeded("Kim", T0), d2 = P.draw(empty, { now: T0 });
  ok(d2 && empty.nodes[d2] && !(empty.deck || []).length, "Draw with an empty deck takes the best suggestion");
  ok(m && P.explore(q, now, sc, () => false), "explore: a lightly balanced pick from the quietest subject");
  const orch = fs.readFileSync("public/ikolearn/orchestrator.js", "utf8");
  ok(!/fetch\(|XMLHttpRequest|localStorage|innerHTML/.test(orch), "orchestrator.js: pure, no network or storage of its own (0 calls)");

  // B3 lessons teach first, then check
  const ls = lessonSystem(parseLearnInput({ mode: "notice", name: "Sam", focus: "Sets", messages: [], wantPath: true }));
  ok(/Teach first: really explain the idea/.test(ls) && /EXPLAIN: a short paragraph/.test(ls) && /EXAMPLE: optional/.test(ls) && /only ask about what you explained/.test(ls) && /child topics of "Sets"/.test(ls), "lesson prompt: explain first (EXPLAIN), optional worked example, questions only on what was taught");
  const lp = L.parse("INTRO: A set is a group, Sam.\nEXPLAIN: Think of a sticker book.\nEach sticker once.\nEXPLAIN: Adding a repeat changes nothing.\nSTEP: Write {1, 2}.\nNEXT: Try one.");
  ok(lp.explain.length === 3 && lp.explain[0] === "Think of a sticker book." && lp.steps.length === 1 && L.usable(lp), "lesson.js: EXPLAIN paragraphs parse; usable with them");
  ok(L.usable(L.parse("INTRO: Hi.\nEXPLAIN: Only an explanation.")) && !L.usable(L.parse("INTRO: Hi.")), "lesson.js: an explanation alone is enough teaching to keep");

  // B6 the test call: one call, from the given material only
  const TI = parseLearnInput({ mode: "notice", name: "Sam", focus: "Python", messages: [], material: [{ label: "Sets", line: "A set keeps one of each thing." }, { label: "Loops", line: "<b>Repeat</b> steps." }, { label: "sets", line: "dupe" }, { label: "", line: "x" }] });
  ok(TI.material.length === 2 && !TI.material[1].line.includes("<"), "test input: material cleaned, deduped and capped");
  const tsys = testSystem(TI);
  ok(/- Sets: A set keeps one of each thing\./.test(tsys) && /Never ask about anything not on that list/.test(tsys) && /topic = exactly one name from the list/.test(tsys), "test prompt: only the completed topics, each question names its topic");
  const tq = (topic, q2) => ({ q: q2, options: ["one of each", "two of each", "none"], answer: 0, topic });
  const pt = parseTest({ questions: [tq("Sets", "What does a set keep?"), tq("Dragons", "What do dragons eat?"), tq("loops", "What does a loop do again?"), tq("Sets", "What does a set keep?")] }, ["Sets", "Loops"]);
  ok(pt.length === 2 && pt.every((x) => ["Sets", "Loops"].includes(x.topic)) && pt[1].topic === "Loops", "parseTest: questions on unlearned topics are dropped; duplicates too");
  ok(parseTest({ questions: [tq("Sets", "What does a set keep?")] }, ["Sets", "Loops"]) === null && parseTest("junk", ["Sets"]) === null, "parseTest: fewer than 2 good questions is not a test");
  ok(TEST_SCHEMA.properties.questions.items.required.includes("topic"), "test schema asks for the topic");
  const tf = fakeFetch([() => res(200, { candidates: [{ content: { parts: [{ text: JSON.stringify({ questions: [tq("Sets", "What does a set keep?"), tq("Loops", "What does a loop repeat?"), tq("Maps", "Where is north?")] }) }] } }] })]);
  const to = await testFor(TI, ENV, tf);
  ok(to.status === 200 && to.body.questions.length === 2 && tf.calls.length === 1 && tf.calls[0].url.includes(":generateContent"), "testFor: one call, only questions on the finished topics");
  const tf2 = fakeFetch([() => res(200, {})]);
  const to2 = await testFor(parseLearnInput({ mode: "notice", name: "Sam", focus: "Python", messages: [], material: [{ label: "Sets" }] }), ENV, tf2);
  ok(to2.status === 422 && tf2.calls.length === 0, "testFor: not enough material -> no call");
  const route = fs.readFileSync("app/api/ikolearn/test/route.ts", "utf8");
  ok(/prepare\(/.test(route) && /testFor\(/.test(route) && /requireFocus: true/.test(route) && /maxDuration = 60/.test(route), "test route: same guards (origin, rate limits, budget) as the others");

  // UI wiring
  const html = fs.readFileSync("public/ikolearn/index.html", "utf8"), app = fs.readFileSync("public/ikolearn/app.js", "utf8"), view = fs.readFileSync("public/ikolearn/cloud-view.js", "utf8");
  ok(html.indexOf("deck.js") < html.indexOf("orchestrator.js") && html.indexOf("orchestrator.js") < html.indexOf("app.js"), "orchestrator.js loads after the deck and before app.js");
  ok(/id="l-phase"/.test(html) && /Check yourself/.test(html) && /id="p-test"/.test(html) && /id="d-suggest"/.test(html) && /id="h-kids"/.test(html), "two-phase lesson, test button, deck suggestions and the card's branches are in the page");
  ok(/P\.childrenReady|growChildren/.test(app) && /C\.setPending\(/.test(app) && /C\.applyPending\(/.test(app) && /P\.lessonContext\(/.test(app), "children piggyback on the lesson call and grow on engagement");
  ok(/"\/test"/.test(app) && /C\.recordTest\(/.test(app) && /setTests/.test(app) && /setTests/.test(view) && /hit\.test/.test(app), "tests: one call, recorded in the model, drawn on the cloud and tappable");
  ok(/P\.orderChoices\(/.test(app) && /P\.orderedChildren\(/.test(app) && /R\.chains/.test(app), "ranking orders forks and branches; chains show in the top 10");
  const deploy = fs.readFileSync("scripts/deploy-ikosagon-prod.sh", "utf8");
  ok(/\.env\.local/.test(deploy) && /VERCEL_ORG_ID/.test(deploy) && /VERCEL_PROJECT_ID/.test(deploy) && /deploy --prod/.test(deploy) && !/^[^#]*vercel[^\n]*\b(link|env pull|dev)\b/m.test(deploy), "deploy script: ids from env, never links, pulls env or runs dev, and refuses an .env.local");
  // procedural start: no seeded map; a few questions, then one creation call builds the first parents
  const fresh = C.create("Mia", T0);
  ok(Object.keys(fresh.nodes).length === 0 && fresh.v === 8 && !C.STARTERS && !C.KNOWN_CHAINS && !RK.POPULAR, "a new learner starts with an empty cloud (no seeded subjects, chains or popularity list)");
  ok(Array.isArray(C.PALETTE) && C.PALETTE.every((p) => typeof p.hue === "number" && typeof p.label === "string") && C.PALETTE.length <= 8 && C.paletteHue("Math") === 28, "only a small data-only palette of broad subjects and hues remains");
  ok(P.needsOnboarding(fresh) && !P.needsOnboarding(seeded("Old", T0)), "onboarding runs for an empty cloud, not for an existing one");
  const ob = P.onboarding(fresh, true), ob2 = P.onboarding(fresh, false);
  ok(ob.length === 2 && ob2.length === 3 && ob2[0].id === "name" && ob.map((x) => x.id).join() === "age,interests", "onboarding: at most 3 questions; the name only when missing");
  ok(/skip/i.test(ob[0].q) && ob[0].chips.length === AGE_BANDS.length && ob[1].multi && ob[1].input && ob[1].chips.length >= 6, "onboarding: an optional age band, interests as chips or typed; static, built on the device");
  C.setProfile(fresh, { age: "7-9", interests: ["Dinosaurs", "Building things"], onboarded: true }, T0);
  ok(!P.needsOnboarding(fresh) && C.profileOf(fresh).interests.length === 2 && !P.interestChips(fresh).includes("Dinosaurs"), "answers are kept on the profile; chosen interests leave the chips");
  const rq = P.createRequest(fresh, "start");
  ok(rq.kind === "start" && rq.age === "7-9" && rq.interests.join() === "Dinosaurs,Building things" && Array.isArray(rq.favorites), "createRequest(start): age band, interests and favorites only");
  const CI = parseLearnInput({ mode: "notice", name: "Mia", messages: [], kind: "start", age: "7-9", region: "Canada / Ontario-ish M5V 2T6", interests: ["Dinosaurs", "<b>Building</b> things", "", "a", "b", "c", "d"] });
  ok(CI.age === "7-9" && CI.region.startsWith("Canada / Ontario-ish") && !/\d/.test(CI.region) && CI.interests.length === 5 && !CI.interests[1].includes("<"), "create input: a known age band, a region with no digits, interests cleaned and capped");
  ok(parseLearnInput({ mode: "notice", name: "Mia", messages: [], age: "12", kind: "weird" }).age === "" && parseLearnInput({ mode: "notice", name: "Mia", messages: [], kind: "weird" }).kind === "start" && !/\d/.test(cleanRegion("51.5, -0.12")), "an unknown age band or kind is dropped; coordinates lose their digits");
  const cs = createSystem(CI);
  ok(/Role: create, start/.test(cs) && /3 to 5 parent topics/.test(cs) && /Dinosaurs/.test(cs) && /Age band: 7-9/.test(cs) && /Rough region: Canada \/ Ontario-ish/.test(cs), "create prompt (start): interests, age band and rough region");
  ok(/typical home curriculum/.test(cs) && /never rules a topic out/.test(cs) && /score \(0 to 1/.test(cs) && /order \(1 = learn first/.test(cs) && /goal/.test(cs), "create prompt: curriculum fit only biases; children carry order and a typical-importance score; card has a goal");
  ok(!/Common Core|Montessori|Ontario curriculum|National Curriculum/i.test(cs), "create prompt: no external framework names");
  const nxi = parseLearnInput({ mode: "notice", name: "Mia", messages: [], kind: "next", focus: "Dinosaurs", known: ["Fossils"], favorites: ["Fossils", "Volcanoes"] });
  const ns = createSystem(nxi);
  ok(/Role: create, next/.test(ns) && /exactly 1 item whose node\.name is "Dinosaurs"/.test(ns) && /They already have: Fossils/.test(ns) && /most-used topics lately[^\n]*Volcanoes/.test(ns), "create prompt (next): the focus, what they have, and their favorites steer it");
  ok(/Role: create, more/.test(createSystem(parseLearnInput({ mode: "notice", name: "Mia", messages: [], kind: "more", interests: ["Space"] }))), "create prompt (more): one or two new parents");
  ok(CREATE_SCHEMA.properties.items.items.required.join() === "node,card,children" && CREATE_SCHEMA.properties.items.items.properties.children.items.required.join() === "name,order,score,role", "create schema: node, card and ordered, scored children");

  // strict validation of the creation result
  const kid = (name, order, score, why = "") => ({ name, order, score, why });
  const item = (name, chain, kids, card = { title: name, blurb: "What " + name + " is about.", goal: "Explain " + name + "." }) => ({ node: { name, chain }, card, children: kids });
  const good = { items: [
    item("Dinosaurs", ["Science"], [kid("Fossils", 2, 0.7), kid("Dino Types", 1, 90), kid("Mia", 3, 0.5), kid("dinosaurs", 4, 0.5), kid("Science", 5, 0.5), kid("Extinction", 3, "x")]),
    item("Building Things", ["Making & Coding"], [kid("Bridges", 1, 0.8), kid("Fossils", 2, 0.5), kid("Towers", 2, -3)]),
    item("Mia", ["Science"], [kid("A", 1, 1), kid("B", 2, 1)]),
    item("Reading", [], [kid("Phonics", 1, 0.9), kid("Stories", 2, 0.6)]),
  ] };
  const pc = parseCreate(JSON.stringify(good), "start", "Mia");
  ok(pc && pc.items.length === 3 && pc.items.map((x) => x.node.name).join() === "Dinosaurs,Building Things,Reading", "parseCreate(start): never the learner's name; good items kept in order");
  const d0 = pc.items[0];
  eq(d0.children.map((c) => [c.name, c.order, c.score]), [["Dino Types", 1, 0.9], ["Fossils", 2, 0.7], ["Extinction", 3, 0.5]], "parseCreate: children sorted by order and renumbered; percent scores read as 0-1, junk scores 0.5; the node, its chain and the name dropped");
  ok(pc.items[1].children.map((c) => c.name).join() === "Bridges,Towers" && pc.items[1].children[1].score === 0 && d0.node.chain.join() === "Science" && pc.items[2].node.chain.length === 0, "parseCreate: no child twice across the result; scores clamped; an empty chain is allowed (placed as a subject)");
  ok(d0.card.title === "Dinosaurs" && d0.card.goal === "Explain Dinosaurs." && !/Mia/.test(JSON.stringify(pc)), "parseCreate: card title, blurb and goal");
  ok(parseCreate({ items: [item("Dinosaurs", ["Science"], [kid("Fossils", 1, 0.5), kid("Eggs", 2, 0.5)])] }, "start", "Mia") === null, "parseCreate(start): one parent is not a start (2+ needed)");
  ok(parseCreate({ items: [item("Dinosaurs", ["Science"], [kid("Fossils", 1, 0.5)]), item("Space", ["Science"], [kid("Moon", 1, 0.5)])] }, "start", "Mia") === null && parseCreate("junk", "start") === null && parseCreate({ items: "x" }, "more") === null, "parseCreate: items need 2+ children; junk is null (the app falls back)");
  ok(parseCreate({ items: [1, 2, 3, 4, 5, 6, 7].map((i) => item("Topic " + "ABCDEFG"[i - 1], ["Science"], [kid("Kid " + i + "a", 1, 0.5), kid("Kid " + i + "b", 2, 0.5)])) }, "start").items.length === 5 && parseCreate({ items: [1, 2, 3].map((i) => item("Topic " + "ABC"[i - 1], [], [kid("K" + i + "a", 1, 0.5), kid("K" + i + "b", 2, 0.5)])) }, "more").items.length === 2, "parseCreate: at most 5 parents to start, 2 for more");
  const pn = parseCreate({ items: [item("Space", [], [kid("Moon", 1, 1), kid("Mars", 2, 1)]), item("dinosaurs", ["Science"], [kid("Fossils", 1, 0.9), kid("Eggs", 2, 0.8), kid("Raptors", 3, 0.4)])] }, "next", "Mia", "Dinosaurs", ["fossils"]);
  ok(pn && pn.items.length === 1 && pn.items[0].node.name === "Dinosaurs" && pn.items[0].node.chain.length === 0 && pn.items[0].children.map((c) => c.name).join() === "Eggs,Raptors", "parseCreate(next): only the focus, with children it doesn't already have");
  ok(parseCreate({ items: [item("Dinosaurs", [], [kid("Fossils", 1, 0.9), kid("Eggs", 2, 0.8)])] }, "next", "Mia", "Dinosaurs", ["Fossils"]) === null, "parseCreate(next): fewer than 2 new children is null (nothing half-made)");

  // the creation call: one model call, mocked
  const cf = fakeFetch([() => res(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(good) }] } }] })]);
  const co = await createFor(CI, ENV, cf);
  ok(co.status === 200 && co.body.ok && co.body.kind === "start" && co.body.items.length === 3 && cf.calls.length === 1 && cf.calls[0].url.includes(":generateContent"), "createFor(start): one call -> parents, cards and ordered children");
  const sent = JSON.stringify(cf.calls[0]);
  ok(/Age band: 7-9/.test(sent) && !/M5V|2T6/.test(sent), "createFor: the age band and rough region go along; nothing more precise");
  ok(JSON.parse(cf.calls[0].init.body).generationConfig.maxOutputTokens === MODEL_LIMITS.createMaxTokens && MODEL_LIMITS.createMaxTokens >= 1500 && tf.calls.length && JSON.parse(tf.calls[0].init.body).generationConfig.maxOutputTokens === MODEL_LIMITS.jsonMaxTokens, "the creation call gets room for 5 parents with cards and children; other JSON calls keep their cap");
  const cf2 = fakeFetch([() => res(200, {})]);
  const co2 = await createFor(parseLearnInput({ mode: "notice", name: "Mia", messages: [], kind: "next" }), ENV, cf2);
  ok(co2.status === 422 && co2.body.reason === "focus" && cf2.calls.length === 0, "createFor(next) without a focus: no call");
  const empty2 = () => res(200, { candidates: [{ content: { parts: [{ text: "{\"items\":[]}" }] } }] });
  const cf3 = fakeFetch([empty2, empty2, empty2]);
  const co3 = await createFor(CI, ENV, cf3);
  ok(co3.status >= 500 && !co3.body.ok, "createFor: an unusable answer is an error (the app falls back on the device)");
  const croute = fs.readFileSync("app/api/ikolearn/create/route.ts", "utf8");
  ok(/prepare\(/.test(croute) && /createFor\(/.test(croute) && /maxDuration = 60/.test(croute) && !/requireFocus/.test(croute), "create route: same guards (origin, rate limits, daily budget)");
  ok(!fs.existsSync("lib/ikolearn/chains.ts") && !/from "\.\/chains"/.test(fs.readFileSync("lib/ikolearn/prompts.ts", "utf8")), "the hardcoded chain table is gone");

  // live finding: the model named "Engineering" and "Language" as subjects on an empty map
  const al = C.create("Mia", T0);
  C.applyCreate(al, { items: [item("Building Things", ["Engineering"], [kid("Towers", 1, 0.9), kid("Bridges", 2, 0.8)]), item("Reading Stories", ["Language"], [kid("Plot", 1, 0.9), kid("Characters", 2, 0.8)])] }, { t: T0 });
  ok(C.findSubject(al, "Making & Coding").label === "Making & Coding" && C.findSubject(al, "Reading & Writing").hue === 4 && !al.order.some((id) => ["Engineering", "Language"].includes(al.nodes[id].label)), "a new subject named by an alias takes the palette name and colour (Engineering -> Making & Coding)");
  const gm = C.create("M", T0); C.applyCreate(gm, { items: [item("Chess", ["Games & Strategy"], [kid("Openings", 1, 1), kid("Endgames", 2, 1)])] }, { t: T0 });
  ok(C.findSubject(gm, "Games & Strategy") && C.findSubject(gm, "Games & Strategy").label === "Games & Strategy" && !C.PALETTE.some((q) => q.hue === C.findSubject(gm, "Games & Strategy").hue), "any other subject keeps its own name and takes a free colour");
  const prq = P.createRequest(C.create("Mia", T0), "start");
  ok(prq.parents.join() === C.PALETTE.map((q) => q.label).join() && P.createRequest(seeded("Mia", T0), "start").parents[0] === "Reading & Writing", "createRequest: the palette's broad subject names go along, so the model files parents under them");
  ok(/use an existing subject when one fits: Reading & Writing, Math/.test(createSystem(parseLearnInput({ mode: "notice", name: "Mia", messages: [], kind: "start", parents: prq.parents }))), "create prompt lists the broad subjects to use");

  // building from a creation result, on the device
  const bc = C.create("Mia", T0);
  C.setProfile(bc, { age: "7-9", onboarded: true }, T0);
  const built = C.applyCreate(bc, pc, { t: T0 + 1 });
  const BD = (l) => C.findTopic(bc, l);
  ok(built.nodes.length === 3 && built.children.length === 7 && BD("Dinosaurs").parent === C.findSubject(bc, "Science").id && C.findSubject(bc, "Reading"), "applyCreate: parents placed under their chain (or as a subject), children created");
  ok(C.findSubject(bc, "Science").hue === 48 && !BD("Dinosaurs").ghost && BD("Fossils").ghost && BD("Dinosaurs").blurb && BD("Dinosaurs").goal === "Explain Dinosaurs.", "applyCreate: palette hue, solid parents, dotted child placeholders, card blurb and goal");
  ok(BD("Dinosaurs").path.ids.map((x) => bc.nodes[x].label).join() === "Dino Types,Fossils,Extinction" && BD("Dino Types").imp === 0.9 && BD("Dino Types").impAt === T0 + 1, "applyCreate: children on a path in the model's order, with its importance score and time");
  ok(built.order[0] === C.findSubject(bc, "Science").id && built.order.indexOf(BD("Dinosaurs").id) < built.order.indexOf(BD("Dino Types").id), "applyCreate: build order broadest first, then each parent, then its children (for the visible build)");
  const deckBefore = JSON.stringify(bc.deck), countBefore = Object.keys(bc.nodes).length;
  C.applyCreate(bc, pn, { t: T0 + 2, focusId: BD("Dinosaurs").id });
  ok(BD("Eggs") && BD("Raptors") && BD("Fossils") && Object.keys(bc.nodes).length === countBefore + 2 && JSON.stringify(bc.deck) === deckBefore, "applyCreate(next): adds only new children; nothing is removed");
  ok(BD("Dinosaurs").goal === "Explain Dinosaurs." && BD("Dinosaurs").blurb === "What Dinosaurs is about.", "applyCreate(next): the parent's card line and goal stay as they were");

  // "what comes next": only once a branch is finished, and cached
  const wn = C.create("Mia", T0);
  C.applyCreate(wn, { items: [item("Space", ["Science"], [kid("Moon", 1, 0.9), kid("Mars", 2, 0.5)]), item("Lego", [], [kid("Bricks", 1, 0.9), kid("Gears", 2, 0.5)])] }, { t: T0 });
  ok(!P.needsNext(wn, C.findSubject(wn, "Science").id) && !P.needsNext(wn, C.findSubject(wn, "Lego").id), "what comes next: not for a plain subject, nor before anything is done");
  const sp = C.findTopic(wn, "Space"), moon = C.findTopic(wn, "Moon"), mars = C.findTopic(wn, "Mars");
  ok(!P.needsNext(wn, sp.id), "what comes next: not while the branch still has open children");
  const leafOk = () => !P.needsNext(wn, moon.id) && !P.needsNext(wn, mars.id);
  [moon, mars].forEach((k, i) => { C.engage(wn, k.id, "got", T0 + i); C.confirm(wn, k.id, true, T0 + 10 + i); C.confirm(wn, k.id, true, T0 + 20 + i); });
  ok(P.needsNext(wn, sp.id) && P.readyNext(wn, T0 + 30)[0] === sp.id && leafOk(), "what comes next: offered for the parent once its branch is finished (its finished steps hand it up)");
  ok(P.suggest(wn, { now: T0 + 30 }).some((x) => x.kind === "grow" && x.id === sp.id && /What comes next in Space/.test(x.why)), "suggestions offer \"What comes next\" after a branch ends");
  const nreq = P.createRequest(wn, "next", sp.id);
  ok(nreq.kind === "next" && nreq.focus === "Space" && nreq.known.join() === "Moon,Mars", "createRequest(next): the parent, its trail and what it already has");
  C.applyCreate(wn, { items: [{ node: { name: "Space", chain: [] }, card: {}, children: [{ name: "Stars", order: 1, score: 0.8, why: "" }, { name: "Comets", order: 2, score: 0.4, why: "" }] }] }, { t: T0 + 31, focusId: sp.id });
  ok(!P.needsNext(wn, sp.id) && sp.asked === 3, "what comes next: cached on the parent; not asked again for the same step");
  ok(C.deserialize(C.serialize(wn)).nodes[sp.id].asked === 3, "the cache survives a reload");
  const wd = C.create("Mia", T0); C.applyCreate(wd, { items: [item("Space", ["Science"], [kid("Moon", 1, 0.9), kid("Mars", 2, 0.5)])] }, { t: T0 });
  [C.findTopic(wd, "Moon"), C.findTopic(wd, "Mars")].forEach((k, i) => { C.engage(wd, k.id, "got", T0 + i); C.confirm(wd, k.id, true, T0 + 10 + i); C.confirm(wd, k.id, true, T0 + 20 + i); });
  C.setProfile(wd, { onboarded: true }, T0); C.joinDeck(wd, T0 + 30);
  const wdS = P.suggest(wd, { now: T0 + 5 * DAYMS }), wdD = P.draw(wd, { now: T0 + 5 * DAYMS });
  ok(wdS.some((x) => x.kind === "grow") && wdS.some((x) => x.kind === "ask") && wdD && ["Moon", "Mars"].includes(wd.nodes[wdD].label) && !P.suggest(wd, { now: T0 + 5 * DAYMS, noAsk: true }).some((x) => x.kind === "ask"), "Draw never spends a call: it skips the grow and ask items and takes a card");

  // re-ask lightly: one question when the cloud is thin or the learner seems stuck, every few days at most
  const ra = C.create("Mia", T0);
  ok(P.reask(ra, T0) === null, "re-ask: never before onboarding");
  C.setProfile(ra, { onboarded: true, askedAt: true }, T0);
  ok(P.reask(ra, T0 + DAYMS) === null, "re-ask: not within 3 days of the last question");
  const r1 = P.reask(ra, T0 + 4 * DAYMS);
  ok(r1 && r1.why === "thin" && /curious/.test(r1.q) && r1.chips.length <= 6, "re-ask: one short question when the cloud is thin");
  const rich = seeded("Mia", T0); C.setProfile(rich, { onboarded: true }, T0);
  ok(P.reask(rich, T0 + 4 * DAYMS) === null, "re-ask: not when there is plenty open and the learner is learning");
  rich.profile.visits = 5; rich.profile.lessonVisit = 1;
  ok((P.reask(rich, T0 + 4 * DAYMS) || {}).why === "stuck", "re-ask: offered when several visits pass without a lesson");
  ok(P.suggest(ra, { now: T0 + 4 * DAYMS }).some((x) => x.kind === "ask" && x.id === null) && !P.suggest(ra, { now: T0 + 4 * DAYMS, noAsk: true }).some((x) => x.kind === "ask"), "the question appears as a suggestion (no call until answered)");

  // region from the browser alone, and the profile on the device
  ok(P.regionFrom("America/Toronto", "en-CA") === "Canada / Ontario-ish" && P.regionFrom("Europe/Paris", "fr-FR") === "France", "region: a coarse guess from the time zone");
  ok(P.regionFrom("Etc/UTC", "en-NZ") === "New Zealand" && P.regionFrom("Etc/UTC", "en") === "" && P.regionFrom("", "") === "", "region: the locale's country as a fallback; nothing when unknown");
  const pf = C.create("Mia", T0);
  C.setProfile(pf, { age: "10-12", region: "Canada / Ontario-ish", regionAuto: false, interests: ["Space", "space", "Lego"], onboarded: true }, T0 + 1000);
  const pf2 = C.deserialize(C.serialize(pf)).profile;
  ok(pf2.age === "10-12" && pf2.region === "Canada / Ontario-ish" && pf2.regionAuto === false && pf2.interests.join() === "Space,Lego" && pf2.onboarded && pf2.changedAt === T0 + 1000, "the profile round-trips (v6): age band, region, interests, flags");
  C.setProfile(pf, { region: "" }, T0 + 2000); C.setProfile(pf, { age: "99" }, T0 + 3000);
  ok(C.profileOf(pf).region === "" && C.profileOf(pf).changedAt === T0 + 2000 && C.profileOf(pf).age === "10-12", "region can be cleared; an unknown age band is ignored");

  // UI wiring for the procedural flow
  const priv = fs.readFileSync("public/ikolearn/privacy.html", "utf8");
  ok(/id="you"/.test(html) && /id="you-link"/.test(html) && /id="you-age"/.test(html) && /id="you-region"/.test(html) && /id="you-clear"/.test(html), "About you: age band and region are shown, editable and clearable in a quiet spot");
  ok(/Age and region/.test(priv) && /time zone/i.test(priv), "privacy page explains the age band and rough region");
  ok(/"\/create"/.test(app) && /P\.createRequest\(/.test(app) && /C\.applyCreate\(/.test(app) && /animateBuild/.test(app) && /mode: "notice"/.test(app), "the app builds from one creation call, visibly");
  ok(/P\.onboarding\(/.test(app) && /askTile/.test(app) && /answerReask/.test(app) && /fallbackParents/.test(app), "onboarding questions, a light re-ask, and a local fallback when the call fails");
  ok(!/geolocation|ipapi|ipinfo|ip-api/i.test(app + html), "no location permission prompt and no IP lookup");
  ok(/function nextStep\(/.test(app) && !/C\.nextFor\(state\.cloud, id\)\);\n    return nx/.test(app) && /var rec = nextStep\(id\)/.test(app), "one recommended next step everywhere (fork pick, then the ranked child, then up the tree)");
  ok(C.trimThread([{ role: "ask", text: "q", done: true }, { role: "ask", text: "open" }, { role: "user", text: "a" }]).length === 2, "answered questions stay in the saved chat; open ones are asked again");
  {
  // core sequence + optional side paths (v7)
  const rc = parseCreate({ items: [
    { node: { name: "Dinosaurs", chain: ["Science"] }, card: { title: "Dinosaurs", blurb: "Giant reptiles.", goal: "Name three." }, children: [
      { name: "Fossils", order: 1, score: 0.9, role: "core" }, { name: "Dino Types", order: 2, score: 0.8, role: "core" },
      { name: "Dino Art", order: 3, score: 0.3, role: "optional", after: "Dino Types" }, { name: "Museums", order: 4, score: 0.4, role: "optional", after: "Nowhere" },
      { name: "Extinction", order: 5, score: 0.6, role: "weird" }] },
    { node: { name: "Space", chain: ["Science"] }, card: {}, children: [{ name: "Moon", order: 1, score: 1, role: "optional" }, { name: "Mars", order: 2, score: 1, role: "optional" }] },
  ] }, "start", "Mia");
  const rd = rc.items[0].children;
  ok(rd.map((c) => c.role).join() === "core,core,optional,optional,core" && rd[2].after === "Dino Types" && rd[3].after === "Fossils" && rd[4].after === "", "parseCreate: roles kept (unknown -> core); an optional child's step must be a core child (else the first)");
  ok(rc.items[1].children[0].role === "core" && rc.items[1].children[1].role === "optional", "parseCreate: an item always keeps at least one core child");
  ok(/role \("core": the main sequence/.test(createSystem(CI)) && /"optional": an isolated aspect or side path/.test(createSystem(CI)) && /after \(for an optional child only/.test(createSystem(CI)), "create prompt: core sequence vs optional side paths, with the step they branch off");
  const rv = C.create("Mia", T0);
  C.applyCreate(rv, rc, { t: T0 + 1 });
  const RV = (l) => C.findTopic(rv, l), dn = RV("Dinosaurs");
  ok(dn.path.ids.map((x) => rv.nodes[x].label).join() === "Fossils,Dino Types,Extinction" && ["Fossils", "Dino Types", "Extinction"].every((l) => RV(l).role === "core"), "applyCreate: the core children are the numbered path, in order");
  ok(RV("Dino Art").role === "optional" && RV("Dino Art").off === RV("Dino Types").id && RV("Museums").off === RV("Fossils").id && RV("Dino Art").ghost && RV("Dino Art").parent === dn.id, "applyCreate: optional children hang off their core step (dotted, not on the path)");
  eq(P.orderedChildren(rv, dn.id).map((x) => rv.nodes[x].label).sort(), ["Dino Types", "Extinction", "Fossils"], "branches list: the core sequence only");
  eq(P.sidePaths(rv, dn.id).map((x) => [rv.nodes[x.id].label, rv.nodes[x.off].label]).sort(), [["Dino Art", "Dino Types"], ["Museums", "Fossils"]], "side paths: listed with the step they branch off");
  const lay = C.layout(rv), dist = (a, b) => Math.hypot(lay[a].x - lay[b].x, lay[a].y - lay[b].y, lay[a].z - lay[b].z);
  ok(dist(RV("Dino Art").id, RV("Dino Types").id) < dist(RV("Dino Art").id, dn.id), "layout: a side path sits next to its step on the cloud");
  ["Fossils", "Dino Types", "Extinction"].forEach((l, i) => { const k = RV(l); C.engage(rv, k.id, "got", T0 + 10 + i); C.confirm(rv, k.id, true, T0 + 20 + i); C.confirm(rv, k.id, true, T0 + 30 + i); });
  C.confirm(rv, dn.id, true, T0 + 40); C.confirm(rv, dn.id, true, T0 + 41); C.engage(rv, dn.id, "got", T0 + 42);
  ok(C.isTerminal(rv, dn.id) && !C.isDone(rv, RV("Dino Art").id) && P.needsNext(rv, dn.id), "the branch ends when its core sequence is done; side paths never block (what comes next is offered)");
  C.engage(rv, RV("Dino Art").id, "got", T0 + 50); C.engage(rv, RV("Dino Art").id, "open", T0 + 51);
  ok(P.needsNext(rv, RV("Dino Art").id) && P.createRequest(rv, "next", RV("Dino Art").id).focus === "Dino Art", "an engaged side path can become its own parent (what comes next builds its own core and optional children)");
  C.applyCreate(rv, { items: [{ node: { name: "Dino Art", chain: [] }, card: {}, children: [{ name: "Sketching", order: 1, score: 0.8, role: "core" }, { name: "Clay Models", order: 2, score: 0.6, role: "core" }, { name: "Comics", order: 3, score: 0.3, role: "optional", after: "Sketching" }] }] }, { t: T0 + 60, focusId: RV("Dino Art").id });
  ok(RV("Dino Art").path.ids.length === 2 && RV("Comics").role === "optional" && RV("Comics").off === RV("Sketching").id && RV("Dino Art").role === "optional", "recursively: the side path now has its own core sequence and side path");
  C.engage(rv, RV("Dino Art").id, "got", T0 + 61); C.confirm(rv, RV("Dino Art").id, true, T0 + 62); C.confirm(rv, RV("Dino Art").id, true, T0 + 63);
  const tr2 = P.testRequest(rv, dn.id).material.map((m) => m.label);
  ok(["Fossils", "Dino Types", "Extinction", "Dino Art"].every((l) => tr2.includes(l)) && tr2.indexOf("Dino Art") > tr2.indexOf("Extinction") && !tr2.includes("Museums"), "tests: completed core material first, plus completed side paths (never unfinished ones)");
  const rv2 = C.deserialize(C.serialize(rv));
  ok(rv2.v === 8 && rv2.nodes[RV("Dino Art").id].role === "optional" && rv2.nodes[RV("Dino Art").id].off === RV("Dino Types").id && rv2.nodes[dn.id].made && rv2.nodes[RV("Fossils").id].role === "core", "roles, side-path steps and made round-trip (v7)");

  const lp2 = C.create("Mia", T0); C.applyTopics(lp2, [{ name: "Fractions", parent: "Math", signal: "curious", chain: ["Math"] }], T0);
  const fr = C.findTopic(lp2, "Fractions"); C.applyPath(lp2, fr.id, ["Halves", "Quarters"], "Halves", T0);
  ok(C.findTopic(lp2, "Halves").role === "core" && C.findTopic(lp2, "Quarters").role === "core", "children from a lesson's path are its core sequence too");
  // migrating v5 and v6 saves forward
  const old5 = JSON.parse(C.serialize(rv)); old5.v = 5; old5.n = old5.n.map((a) => a.slice(0, 19)); delete old5.pr;
  const m7 = C.deserialize(JSON.stringify(old5));
  ok(m7 && m7.v === 8 && Object.values(m7.nodes).every((n) => n.role === "" || n.role === "core") && Object.values(m7.nodes).some((n) => n.role === "core"), "v5 -> v7: path steps become core, everything else keeps no role (shown as before)");
  ok(Object.values(m7.nodes).filter((n) => n.role === "core").every((n) => m7.nodes[n.parent].path.ids.includes(n.id)) && !Object.values(m7.nodes).some((n) => n.role === "optional" || n.off || n.absorbedInto), "v5 -> v7: no side paths invented, no absorb links");
  const old6 = JSON.parse(C.serialize(rv)); old6.v = 6; old6.n = old6.n.map((a) => a.slice(0, 23));
  const m6 = C.deserialize(JSON.stringify(old6));
  ok(m6.v === 8 && Object.keys(m6.nodes).length === Object.keys(rv.nodes).length && m6.nodes[RV("Fossils").id].role === "core" && m6.nodes[RV("Dino Art").id].role === "", "v6 -> v7: every node kept; path steps become core");
  ok(C.deserialize(C.serialize(m7)).v === 8 && C.serialize(C.deserialize(C.serialize(m7))) === C.serialize(m7), "a migrated cloud round-trips exactly");

  // groundwork for powerful cards (not built): fields only
  const ab = C.deserialize(C.serialize(rv));
  ab.nodes[dn.id].absorbed = [RV("Fossils").id, "n999"]; ab.nodes[RV("Fossils").id].absorbedInto = dn.id;
  const ab2 = C.deserialize(C.serialize(ab));
  ok(ab2.nodes[dn.id].absorbed.join() === RV("Fossils").id && ab2.nodes[RV("Fossils").id].absorbedInto === dn.id, "absorb fields round-trip; links to missing nodes are dropped");
  ok(C.absorbable(rv, dn.id).length === 3 && Object.values(rv.nodes).every((n) => !n.absorbedInto && !n.absorbed.length) , "absorbable: completed core children not yet merged (nothing merges until the orchestrator says so)");

  // bridging: procedural in-between steps, one call only when there's a gap, cached
  const bq = C.create("Sam", T0);
  C.applyTopics(bq, [{ name: "Sets", parent: "Computer Science", signal: "curious", chain: ["Computer Science"] }], T0, "How do sets work in Python?");
  const bsets = C.findTopic(bq, "Sets");
  ok(bsets && bq.nodes[bsets.parent].label === "Computer Science" && P.needsBridge(bq, bsets.id, 1) && !P.needsBridge(bq, bsets.id, 3), "a gap: a new topic right under its subject on a shallow chain (a full chain needs no bridge)");
  ok(!P.needsBridge(rv, dn.id) && !P.needsBridge(bq, C.findSubject(bq, "Computer Science").id), "no bridge for a parent made by a creation call, or a subject");
  const brq = P.bridgeRequest(bq, bsets.id);
  ok(brq.kind === "bridge" && brq.focus === "Sets" && brq.focusParent === "Computer Science", "bridgeRequest: the topic and its subject");
  const BI = parseLearnInput({ mode: "notice", name: "Sam", messages: [], ...brq });
  const bsys = createSystem(BI);
  ok(BI.kind === "bridge" && /Role: create, bridge/.test(bsys) && /"Sets" sits directly under the broad subject "Computer Science"/.test(bsys) && /every in-between topic/.test(bsys) && !/Python/.test(bsys), "bridge prompt: asks for the logical in-between steps (no table, nothing named for it)");
  const braw = { items: [{ node: { name: "sets", chain: ["Computer Science", "Programming", "Python", "Sam"] }, card: { title: "Sets", blurb: "Groups where each item appears once.", goal: "" }, children: [],
    links: [{ name: "Programming", blurb: "Writing instructions for computers." }, { name: "Python", blurb: "A friendly programming language." }, { name: "Cooking", blurb: "x" }] }] };
  const pb = parseCreate(braw, "bridge", "Sam", "Sets");
  ok(pb && pb.items[0].node.name === "Sets" && pb.items[0].node.chain.join() === "Computer Science,Programming,Python" && pb.items[0].links.map((l) => l.name).join() === "Programming,Python", "parseCreate(bridge): the focus with its chain (never the name) and a card line per link");
  ok(parseCreate({ items: [{ node: { name: "Loops", chain: ["Computer Science"] }, card: {}, children: [] }] }, "bridge", "Sam", "Sets") === null, "parseCreate(bridge): only the topic asked about");
  const bf = fakeFetch([() => res(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(braw) }] } }] })]);
  const bo = await createFor(BI, ENV, bf);
  ok(bo.status === 200 && bo.body.kind === "bridge" && bf.calls.length === 1, "createFor(bridge): one call");
  const bf3 = fakeFetch([() => res(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(braw) }] } }] })]);
  await createFor(parseLearnInput({ mode: "notice", name: "Sam", messages: [{ role: "user", text: "How do sets work in Python?" }], ...brq }), ENV, bf3);
  ok(bf3.calls.length === 1 && /The learner asked: \\"How do sets work in Python\?\\"/.test(bf3.calls[0].init.body), "createFor(bridge): carries the question that brought the topic up");
  ok(/messages: history\(\)\.filter\(function \(m\) \{ return m\.role === "user"; \}\)\.slice\(-1\)/.test(app), "the app sends only the learner's last question with the bridge");
  const bf2 = fakeFetch([() => res(200, {})]);
  ok((await createFor(parseLearnInput({ mode: "notice", name: "Sam", messages: [], kind: "bridge" }), ENV, bf2)).status === 422 && bf2.calls.length === 0, "createFor(bridge) without a topic: no call");
  C.engage(bq, bsets.id, "open", T0 + 1);
  const br = C.applyBridge(bq, bsets.id, bo.body, T0 + 2);
  ok(br.moved && C.chainOf(bq, bsets.id).join(" > ") === "Computer Science > Programming > Python > Sets" && bsets.opened && bsets.bridged, "applyBridge: Sets moves under Computer Science > Programming > Python (same id, history kept)");
  ok(!C.findTopic(bq, "Python").ghost && C.findTopic(bq, "Python").blurb === "A friendly programming language." && C.growthOf(bq, C.findTopic(bq, "Python").id).stage === 0, "the in-between steps are real nodes with sepia cards (their line from the bridge)");
  ok(!P.needsBridge(bq, bsets.id, 1) && !P.needsBridge(bq, C.findTopic(bq, "Python").id, 1), "cached: never asked again for the same topic (nor for its new links)");
  const bq2 = C.create("Sam", T0);
  C.applyTopics(bq2, [{ name: "Coding Basics", parent: "Computer Science", signal: "explored", chain: ["Computer Science"] }], T0);
  C.applyTopics(bq2, [{ name: "Python", parent: "Coding Basics", signal: "explored", chain: ["Computer Science", "Coding Basics"] }], T0);
  C.applyTopics(bq2, [{ name: "Sets", parent: "Computer Science", signal: "curious", chain: ["Computer Science"] }], T0);
  const s2 = C.findTopic(bq2, "Sets"), py2 = C.findTopic(bq2, "Python"), before2 = Object.keys(bq2.nodes).length;
  C.applyBridge(bq2, s2.id, { items: [{ node: { name: "Sets", chain: ["Computer Science", "Programming", "Python"] }, card: {}, children: [] }] }, T0 + 5);
  ok(s2.parent === py2.id && Object.keys(bq2.nodes).length === before2, "applyBridge reuses existing nodes by name (Python already on the map: no duplicate)");
  const bq3 = C.create("Sam", T0); C.applyTopics(bq3, [{ name: "Volcanoes", parent: "Science", signal: "curious", chain: ["Science"] }], T0);
  const vo = C.findTopic(bq3, "Volcanoes"), r3 = C.applyBridge(bq3, vo.id, { items: [{ node: { name: "Volcanoes", chain: ["Science"] }, card: {}, children: [] }] }, T0 + 1);
  ok(!r3.moved && bq3.nodes[vo.parent].label === "Science" && vo.bridged && !P.needsBridge(bq3, vo.id, 1), "when it truly sits under its subject, nothing moves and the answer is cached");
  ok(C.deserialize(C.serialize(bq)).nodes[bsets.id].bridged === Math.round((T0 + 2) / 1000) * 1000, "the bridge cache survives a reload");
  ok(/function runBridge/.test(app) && /P\.needsBridge\(/.test(app) && /C\.applyBridge\(/.test(app) && /runBridge\(\);/.test(app) && /bridgeQueue/.test(app), "the app bridges after the chat reply, one call, only when needed");
  ok(/Side paths/.test(app) && /P\.sidePaths\(/.test(app) && /n\.role === "optional" && n\.off/.test(fs.readFileSync("public/ikolearn/cloud-view.js", "utf8")), "side paths: a quiet list on the card and faint twigs off their step on the cloud");
  }
}

/* ================= the collectible pass (v8): tiers, merging, corpus, repair, camera ================= */
{
  const app = fs.readFileSync("public/ikolearn/app.js", "utf8"), css = fs.readFileSync("public/ikolearn/styles.css", "utf8"), html = fs.readFileSync("public/ikolearn/index.html", "utf8");
  const view = fs.readFileSync("public/ikolearn/cloud-view.js", "utf8"), camJs = fs.readFileSync("public/ikolearn/camera.js", "utf8");
  const KIDS = ["Fossils", "Eras", "Diets", "Habitats", "Footprints"];
  const fixture = () => {
    const c = C.create("Sam", T0);
    C.applyTopics(c, [{ name: "Dinosaurs", parent: "Science", signal: "explored", chain: ["Science"] }], T0);
    KIDS.forEach((nm) => C.applyTopics(c, [{ name: nm, parent: "Dinosaurs", signal: "explored", chain: ["Science", "Dinosaurs"] }], T0));
    return { c, d: C.findTopic(c, "Dinosaurs"), k: (nm) => C.findTopic(c, nm) };
  };
  const right = (c, id, n, t) => { for (let i = 0; i < n; i++) C.confirm(c, id, true, t + i); };

  // the tier ladder: Sketch -> Inked -> Tinted -> Achieved (-> Merged), monotonic, colour earned on the card
  {
    const { c, k } = fixture(), f = k("Fossils");
    C.applyTopics(c, [{ name: "Bones", parent: "Fossils", signal: "explored", chain: ["Science", "Dinosaurs", "Fossils"] }], T0); /* a child of its own, so the branch has not ended and the tiers come from answers */
    const tiers = [];
    tiers.push(C.tierOf(c, f.id).key);
    right(c, f.id, 1, T0 + 10); tiers.push(C.tierOf(c, f.id).key);
    right(c, f.id, 1, T0 + 20); tiers.push(C.tierOf(c, f.id).key);
    right(c, f.id, 1, T0 + 30); tiers.push(C.tierOf(c, f.id).key);
    eq(tiers, ["sketch", "inked", "tinted", "achieved"], "tiers: 0 right Sketch, 1 Inked, 2 (done) Tinted, 3 Achieved");
    const g = C.growthOf(c, f.id);
    ok(g.stage === 4 && g.achieved && !g.ended && g.tierName === "Achieved", "an Achieved card is in full colour (the colour is earned on the card as its tier rises)");
    ok(C.TIER_STAGE.every((st, i) => i === 0 || st >= C.TIER_STAGE[i - 1]), "colour stage never falls as the tier rises");
    C.joinDeck(c, T0 + 40);
    f.mastery = 0; f.correct = 0; f.confirmed = 0;
    ok(C.tierOf(c, f.id).rank === 3, "monotonic: the deck keeps the best tier (tb) even if the topic's numbers drop");
    const sp = D.cardSpec(c, f.id);
    ok(sp.tier === 3 && sp.pips === 3 && D.pipsFor(4, 2) === 5 && D.pipsFor(0, 0) === 0 && D.evolveKey({ tier: 4, stage: 4, level: 2 }) > D.evolveKey({ tier: 4, stage: 4, level: 1 }) && D.evolveKey({ tier: 3, stage: 4, level: 0 }) > D.evolveKey({ tier: 2, stage: 4, level: 0 }), "rarity: corner pips by tier and level; the evolve key only rises");
    ok(C.roman(1) === "I" && C.roman(4) === "IV" && C.roman(9) === "IX" && C.roman(0) === "", "merge levels in Roman numerals");
  }

  // merging: form at >= 3 achieved core children, idempotent, repeatable upgrade, deepest first, test trigger
  {
    const { c, d, k } = fixture();
    ["Fossils", "Eras"].forEach((nm, i) => right(c, k(nm).id, 3, T0 + 100 * i));
    ok(P.mergePlan(c, d.id) === null && P.settleMerges(c, T0 + 300).length === 0, "no merge with only 2 achieved core children (MERGE.first = 3)");
    right(c, k("Diets").id, 3, T0 + 400);
    const plan = P.mergePlan(c, d.id);
    ok(plan && plan.why === "core" && plan.ids.length === 3, "the orchestrator plans a merge once 3 core children are achieved", JSON.stringify(plan));
    const nodesBefore = Object.keys(c.nodes).length, evBefore = (c.events || []).length;
    const m1 = P.settleMerges(c, T0 + 500);
    ok(m1.length === 1 && m1[0].id === d.id && m1[0].level === 1 && d.ml === 1 && d.mergedAt === T0 + 500 && ["Fossils", "Eras", "Diets"].every((nm) => k(nm).absorbedInto === d.id) && d.absorbed.length === 3, "settleMerges forms Merged I: children absorbed, the parent's level 1");
    ok(Object.keys(c.nodes).length === nodesBefore && c.events.length === evBefore + 1 && c.events[c.events.length - 1].k === "merge" && c.events[c.events.length - 1].ids.length === 3, "children are never lost (same nodes); one event logged");
    ok(C.inDeck(c, d.id) && C.tierOf(c, d.id).key === "merged" && C.tierOf(c, d.id).name === "Merged I" && D.cardSpec(c, d.id).corpus.length === 3, "the merged parent is in the deck as a Merged I card with its corpus");
    const snap = C.serialize(c);
    ok(C.mergeInto(c, d.id, ["Fossils", "Eras", "Diets"].map((nm) => k(nm).id), T0 + 600) === null && P.settleMerges(c, T0 + 600).length === 0 && C.serialize(c) === snap, "idempotent: applying the same merge again (or settling again) changes nothing");
    right(c, k("Habitats").id, 3, T0 + 700);
    ok(P.settleMerges(c, T0 + 800).length === 0, "one newly achieved child does not upgrade yet (MERGE.batch = 2) while the core is unfinished");
    right(c, k("Footprints").id, 3, T0 + 900);
    const m2 = P.settleMerges(c, T0 + 1000);
    ok(m2.length === 1 && m2[0].level === 2 && m2[0].ids.length === 2 && d.ml === 2 && d.absorbed.length === 5 && C.tierOf(c, d.id).name === "Merged II", "repeatable: the next batch upgrades it to Merged II");
    ok(D.cardSpec(c, k("Fossils").id).absorbedInto === d.id && !P.draw(c, { now: T0 + DAYMS, seed: 1 }).picks?.some?.((x) => x.id === k("Fossils").id), "absorbed cards show their parent (and are not drawn loose)");
    const dk = D.weigh ? D.weigh(c, T0 + DAYMS) : null;
    ok(!dk || !dk.some((x) => (x.id || x) === k("Fossils").id), "deck weighting skips absorbed cards whose parent is in the deck");

    // persistence: v8 round trip keeps merge, corpus, events and tiers; children removed later stay in the corpus
    const back = C.deserialize(C.serialize(c));
    ok(JSON.parse(C.serialize(back)).v === 8 && back.nodes[d.id].ml === 2 && back.nodes[d.id].absorbed.length === 5 && back.nodes[k("Eras").id].absorbedInto === d.id && back.events.length === c.events.length && C.tierOf(back, d.id).name === "Merged II", "v8 round trip: merge level, absorbed links, events and tiers survive a reload");
    const foss = k("Fossils").id;
    delete back.nodes[foss]; back.order = back.order.filter((x) => x !== foss); /* a topic gone from the cloud */
    C.joinDeck(back, T0 + 2000);
    const cp = C.corpusOf(back, d.id);
    ok(cp.length === 5 && cp.some((x) => x.id === foss && x.label === "Fossils" && !x.live), "the corpus keeps a removed child's label (never lost)");
  }

  // deepest first: a child merges its own subtopics, then counts as achieved for its parent
  {
    const { c, d, k } = fixture(), f = k("Fossils");
    ["Bones", "Teeth", "Amber"].forEach((nm, i) => { C.applyTopics(c, [{ name: nm, parent: "Fossils", signal: "explored", chain: ["Science", "Dinosaurs", "Fossils"] }], T0); right(c, k(nm).id, 3, T0 + i * 10); });
    right(c, k("Eras").id, 3, T0 + 100); right(c, k("Diets").id, 3, T0 + 110);
    const ms = P.settleMerges(c, T0 + 200);
    ok(ms.length === 2 && ms[0].id === f.id && ms[1].id === d.id && f.ml === 1 && d.ml === 1 && f.absorbedInto === d.id, "settleMerges runs deepest first: Fossils merges its subtopics, then Dinosaurs takes Fossils, Eras and Diets", JSON.stringify(ms.map((m) => [m.id, m.level])));
  }

  // a passed test triggers (or upgrades) a merge
  {
    const { c, d, k } = fixture();
    right(c, k("Fossils").id, 2, T0); right(c, k("Eras").id, 2, T0 + 10);
    ok(P.settleMerges(c, T0 + 20).length === 0, "two completed (Tinted) children alone do not merge");
    const tr = C.recordTest(c, d.id, [{ id: k("Fossils").id, right: true }, { id: k("Eras").id, right: true }], T0 + 30);
    const mt = P.settleMerges(c, T0 + 40);
    ok(tr.passed && C.testOf(c, d.id).passAt === T0 + 30 && mt.length === 1 && mt[0].why === "test" && d.ml === 1 && d.absorbed.length === 2, "a passed test merges its completed children (why: test)");
    ok(P.settleMerges(c, T0 + 50).length === 0, "the same pass never merges twice (passAt <= mergedAt)");
    C.recordTest(c, d.id, [{ id: k("Fossils").id, right: false }, { id: k("Eras").id, right: false }], T0 + 60);
    ok(P.settleMerges(c, T0 + 70).length === 0, "a failed test triggers nothing");
    ok(C.deserialize(C.serialize(c)).tests[d.id].passAt === Math.round((T0 + 30) / 1000) * 1000, "passAt survives a reload");
  }

  // migration: a v7 save loads as v8 (no merges), then settles from existing progress on load (0 calls)
  {
    const { c, d, k } = fixture();
    ["Fossils", "Eras", "Diets"].forEach((nm, i) => right(c, k(nm).id, 3, T0 + i));
    const v8 = JSON.parse(C.serialize(c));
    const v7 = JSON.parse(JSON.stringify(v8));
    v7.v = 7; delete v7.ev;
    if (Array.isArray(v7.n)) v7.n = v7.n.map((a) => (Array.isArray(a) ? a.slice(0, 29) : a));
    const old = C.deserialize(JSON.stringify(v7));
    ok(old && JSON.parse(C.serialize(old)).v === 8 && Object.values(old.nodes).every((n) => n.ml === 0 && !n.absorbedInto && n.repaired === 0) && Array.isArray(old.events), "v7 -> v8: new fields default (ml 0, no absorbs, not repaired, empty event log)");
    const mm = P.settleMerges(old, T0 + 100);
    ok(mm.length === 1 && old.nodes[d.id].ml === 1, "an existing save forms its merges from progress it already has");
  }

  // the cloud: absorbed children sit in a tighter constellation round a brighter parent
  {
    const { c, d, k } = fixture();
    const lay0 = C.layout ? C.layout(c) : null;
    ["Fossils", "Eras", "Diets"].forEach((nm, i) => right(c, k(nm).id, 3, T0 + i));
    P.settleMerges(c, T0 + 100);
    const lay1 = C.layout ? C.layout(c) : null;
    if (lay0 && lay1) {
      const dist = (L, a, b) => Math.hypot(L[a].x - L[b].x, L[a].y - L[b].y, L[a].z - L[b].z);
      const f = k("Fossils").id;
      ok(dist(lay1, d.id, f) < dist(lay0, d.id, f) * 0.6, "layout: an absorbed child sits much closer to its parent", `${dist(lay0, d.id, f)} -> ${dist(lay1, d.id, f)}`);
    }
    ok(/1 \+ 0\.16 \* /.test(view) && /absorbedInto/.test(view) && /strokeText/.test(view), "cloud view: merged nodes are larger with rings, absorbed ones quieter, labels have a paper halo");
  }

  // the bridge validation pass and the one-time repair (no table, max 1 extra call per topic, ever)
  {
    const bq = C.create("Sam", T0);
    C.applyTopics(bq, [{ name: "Sets", parent: "Computer Science", signal: "curious", chain: ["Computer Science"] }], T0);
    const sets = C.findTopic(bq, "Sets");
    C.applyBridge(bq, sets.id, { items: [{ node: { name: "Sets", chain: ["Computer Science", "Python"] }, card: {}, children: [], links: [{ name: "Python", blurb: "A friendly language." }] }] }, T0 + 1);
    const py = C.findTopic(bq, "Python");
    ok(C.chainOf(bq, sets.id).join(" > ") === "Computer Science > Python > Sets" && P.needsRepair(bq, sets.id), "a bridged chain that skipped a level (Computer Science > Python > Sets) is still shallow: needs one repair");
    const cc = C.checkChain(bq, sets.id, ["Computer Science", "Programming", "Sets", "Python", "Python", "Sam"]);
    ok(cc.chain.join() === "Computer Science,Programming,Python" && cc.dropped.length >= 2 && !cc.shallow, "checkChain: drops the topic, duplicates and the name; aliases of the subject are allowed as levels", JSON.stringify(cc));
    const rq = P.repairRequest(bq, sets.id);
    ok(rq.kind === "bridge" && rq.repair === true && rq.trail.includes("Python") && rq.focus === "Sets", "repairRequest: the bridge request plus repair and the chain so far");
    const RI = parseLearnInput({ mode: "notice", name: "Sam", messages: [], ...rq });
    const rsys = createSystem(RI);
    ok(RI.repair && /A first pass placed it as: .*Python.*Sets/.test(rsys) && /skipped/.test(rsys) && !/Programming/.test(rsys), "repair prompt: names the chain so far, asks for a skipped level (nothing named for it)");
    ok(!parseLearnInput({ mode: "notice", name: "Sam", messages: [], kind: "bridge", repair: "yes" }).repair && !/A first pass/.test(createSystem(parseLearnInput({ mode: "notice", name: "Sam", messages: [], kind: "bridge", focus: "Sets" }))), "repair only when repair === true");
    const rraw = { items: [{ node: { name: "Sets", chain: ["Computer Science", "Programming", "Python"] }, card: { title: "Sets", blurb: "Groups of unique items.", goal: "" }, children: [], links: [{ name: "Programming", blurb: "Writing instructions for computers." }, { name: "Python", blurb: "A friendly language." }] }] };
    const rf = fakeFetch([() => res(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(rraw) }] } }] })]);
    const ro = await createFor(RI, ENV, rf);
    ok(ro.status === 200 && rf.calls.length === 1 && /Was a level skipped\?/.test(rf.calls[0].init.body), "createFor(repair): one call with the repair ask");
    const rf2 = fakeFetch([() => res(200, {})]);
    ok((await createFor(parseLearnInput({ mode: "notice", name: "Sam", messages: [], kind: "bridge", repair: true }), ENV, rf2)).status === 422 && rf2.calls.length === 0, "createFor(repair) without a topic: no call");
    sets.repaired = T0 + 2; /* the app sets this before the call */
    ok(!P.needsRepair(bq, sets.id), "capped: once repaired is set (before the call), never asked again");
    const pyId = py.id, setsId = sets.id;
    const rr = C.applyRepair(bq, sets.id, ro.body, T0 + 3);
    ok(rr.moved && C.chainOf(bq, sets.id).join(" > ") === "Computer Science > Programming > Python > Sets" && C.findTopic(bq, "Python").id === pyId && C.findTopic(bq, "Sets").id === setsId, "applyRepair inserts the missing level above Python (ids kept, Python moves with its branch)", C.chainOf(bq, sets.id).join(" > "));
    ok(C.findTopic(bq, "Programming").blurb === "Writing instructions for computers." && !P.needsRepair(bq, sets.id) && !P.needsBridge(bq, sets.id, 1), "the new level gets its card line; nothing more is asked");
    const snap = C.serialize(bq);
    C.applyRepair(bq, sets.id, ro.body, T0 + 4);
    ok(C.serialize(bq) === snap, "applying the same repair again changes nothing");
    ok(C.deserialize(C.serialize(bq)).nodes[sets.id].repaired > 0, "the repair cap survives a reload");
    const deep = C.create("Sam", T0);
    C.applyTopics(deep, [{ name: "Chords", parent: "Art & Music", signal: "curious", chain: ["Art & Music"] }], T0);
    const ch = C.findTopic(deep, "Chords");
    C.applyBridge(deep, ch.id, { items: [{ node: { name: "Chords", chain: ["Art & Music", "Instruments", "Guitar"] }, card: {}, children: [] }] }, T0 + 1);
    ok(!P.needsRepair(deep, ch.id), "a chain that is already deep enough needs no repair (0 extra calls)");
    ok(/function runRepair/.test(app) && /n\.repaired = Date\.now\(\);\s*save\(\);/.test(app) && /P\.repairRequest\(/.test(app) && /C\.applyRepair\(/.test(app) && /return runRepair\(id\)/.test(app), "the app: repair after the bridge, capped before the call");
  }

  // camera maths: input map, easing, focus, inertia, zoom
  {
    ok(CAM.gestureFor({ button: 0 }) === "pan" && CAM.gestureFor({ button: 2 }) === "rotate" && CAM.gestureFor({ button: 0, shift: true }) === "rotate" && CAM.gestureFor({ pointers: 2 }) === "pinch", "input map: drag pans, right/Shift-drag turns, two fingers pinch");
    ok(/Drag to move/.test(CAM.hint(true)) && /Pinch/.test(CAM.hint(true)) && /Scroll/.test(CAM.hint(false)) && /Right-drag/.test(CAM.hint(false)), "the hint line documents the input map for touch and mouse");
    ok(CAM.easeInOutCubic(0) === 0 && CAM.easeInOutCubic(1) === 1 && Math.abs(CAM.easeInOutCubic(0.5) - 0.5) < 1e-12 && CAM.easeInOutCubic(0.25) < 0.25 && CAM.easeInOutCubic(0.75) > 0.75 && CAM.easeInOutCubic(2) === 1, "easeInOutCubic: 0 -> 1, symmetric, slow at both ends, clamped");
    ok(Math.abs(CAM.wrap(3 * Math.PI) - Math.PI) < 1e-9 && Math.abs(CAM.wrap(-Math.PI / 2) + Math.PI / 2) < 1e-12, "wrap into (-π, π]");
    const lv = CAM.lerpView({ zoom: 1, panX: 0, panY: 0, yaw: 3, pitch: 0 }, { zoom: 4, panX: 10, panY: -10, yaw: -3, pitch: 0.2 }, 0.5);
    ok(Math.abs(lv.zoom - 2) < 1e-9 && lv.panX === 5 && lv.panY === -5 && lv.yaw > 3 && Math.abs(lv.pitch - 0.1) < 1e-12, "lerpView: zoom in log space (halfway from 1 to 4 is 2), yaw by the shortest arc");
    let worst = 0;
    [[1, 0.3], [-0.4, 2], [0.2, -1], [-1, -1], [0, 1]].forEach(([x, z]) => {
      const y = CAM.forwardYaw({ x, z }), xr = x * Math.cos(y) - z * Math.sin(y), zr = x * Math.sin(y) + z * Math.cos(y);
      worst = Math.max(worst, Math.abs(xr), Math.abs(zr + Math.hypot(x, z)));
    });
    ok(worst < 1e-9 && CAM.forwardYaw({ x: 0, z: 0 }) === null, "forwardYaw brings a point to the front: x' = 0, z' = -r (the nearest side)");
    const z1 = CAM.fitZoom({ x0: -50, x1: 50, y0: -25, y1: 25 }, 1000, 600, 0.6, 60, 0.5);
    ok(Math.abs(z1 - 5) < 1e-9 && CAM.fitZoom({ x0: -50, x1: 50, y0: -25, y1: 25 }, 1000, 600, 0.6, 2, 0.5) === 2 && CAM.fitZoom({ x0: -5000, x1: 5000, y0: 0, y1: 1 }, 1000, 600, 1.5, 60) === 1.5, "fitZoom frames the branch box, within the legibility bounds");
    let v = 1, d = 0;
    for (let i = 0; i < 200; i++) { const g = CAM.glide(v, 16, 260); v = g.v; d += g.d; }
    const one = CAM.glide(1, 3200, 260);
    ok(Math.abs(d - one.d) < 1e-9 && Math.abs(d - 260 * (1 - Math.exp(-3200 / 260))) < 1e-9 && d < 260 && v < 1e-5, "inertia: exponential glide, frame-rate independent, total distance -> v·τ");
    ok(Math.abs(CAM.velocity(0, 10, 10, 1) - 1) < 1e-12 && CAM.velocity(0.5, 10, 0) === 0.5, "pointer velocity: a smoothed px/ms, ignores zero-time samples");
    ok(Math.abs(CAM.twist({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 1 }) - Math.PI / 2) < 1e-12, "a two-finger twist turns by the angle between the finger pairs");
    const za = CAM.zoomAbout({ zoom: 1, panX: 20, panY: -10 }, 2, { x: 700, y: 200 }, 1000, 600);
    const before = { x: (700 - 500 - 20) / 1, y: (200 - 300 + 10) / 1 }, after = { x: (700 - 500 - za.panX) / za.zoom, y: (200 - 300 - za.panY) / za.zoom };
    ok(za.zoom === 2 && Math.abs(before.x - after.x) < 1e-9 && Math.abs(before.y - after.y) < 1e-9 && CAM.zoomAbout({ zoom: 59, panX: 0, panY: 0 }, 10).zoom === 60, "zoomAbout keeps the point under the cursor fixed; zoom clamped");
    ok(CAM.wheelFactor(-10000) === CAM.CAM.wheelStep[1] && CAM.wheelFactor(10000) === CAM.CAM.wheelStep[0] && CAM.wheelFactor(-100) > 1 && CAM.wheelFactor(100) < 1, "wheel zoom is deliberate: one capped step per event");
    ok(!/document\.|window\.|addEventListener/.test(camJs.replace(/window\.IkoCamera|root\.IkoCamera/g, "")), "camera.js is pure (no DOM)");
    ok(html.indexOf("camera.js") > 0 && html.indexOf("camera.js") < html.indexOf("cloud-view.js") && /root\.IkoCamera/.test(view), "camera.js loads before the view that uses it");
    ok(/CAM\.gestureFor\(/.test(view) && /CAM\.glide\(/.test(view) && /CAM\.lerpView\(/.test(view) && /CAM\.forwardYaw\(/.test(view) && /CAM\.fitAround\(/.test(view) && /CAM\.wheelFactor\(/.test(view) && /recentre: /.test(view) && /onView/.test(view), "the view: pan by default, glide, eased focus with forward turn and fit, deliberate wheel, recentre, view callback");
    ok(/big\.recentre\(\)/.test(app) && /Recentre/.test(html) && /CAM\.hint\(/.test(app) && /ikolearn\.v1\.view/.test(app) && /onView: saveView/.test(app) && /big\.setView\(\{ yaw: state\.view\.y/.test(app), "the app: Recentre, the input-map hint, and the view (with focus) persisted and restored");
  }

  // rough edges: the 404 (favicon), the phone branches strip, wiring
  {
    ok(/<link rel="icon" href="\/ikolearn\/icon\.svg" type="image\/svg\+xml">/.test(html) && fs.existsSync("public/ikolearn/icon.svg") && /<svg/.test(fs.readFileSync("public/ikolearn/icon.svg", "utf8")), "the 404 on open: the page has its own icon, so the browser never asks for /favicon.ico");
    ok(/mk\("details", "h-fold"\)/.test(app) && /mk\("summary", "h-sum"\)/.test(app) && /window\.innerWidth >= 900/.test(app) && /\.h-lists \{ max-height: 44vh; overflow: auto;/.test(css) && !/\.h-kids \{[^}]*text-overflow: ellipsis/.test(css), "phone branches: a disclosure with a readable summary (core, side paths, next), opening to a scrollable list (no ellipsis cut)");
    ok((app.match(/D\.renderCorpus\(/g) || []).length >= 2 && /el\.hubCorpus\.appendChild\(D\.renderCorpus\(/.test(app) && /\.corpus-row/.test(css), "corpus view under the holder card and in the card's hub");
    ok((app.match(/settleMerges\(\)[;.]/g) || []).length >= 5 && /var merged = settleMerges\(\)/.test(app) && /function settleMerges\(\) \{\s*var done = P\.settleMerges\(state\.cloud\)/.test(app), "merges settle after answers, I've got it, lesson ready, tests and on load (0 calls)");
    ok(/function markEvolve/.test(app) && /D\.evolveKey\(/.test(app) && /ikolearn\.v1\.seen/.test(app) && /@keyframes ink-bleed/.test(css) && /prefers-reduced-motion[\s\S]*\.gcard\.evolve \.gc-bleed/.test(css), "the evolution transition: an ink wash, once per rise, still under reduced motion");
    ok(/\.gcard\.tier-merged/.test(css) && /\.gcard\.tier-achieved/.test(css) && /\.gc-sheen/.test(css) && /\.gc-pips \.pip/.test(css) && !/<img|icon-/.test(fs.readFileSync("public/ikolearn/deck.js", "utf8")), "tiers: frame weight, paper texture, sheen, pips; no icons");
    ok(/C\.absorbedInto\(state\.cloud, e\.id\)/.test(app), "the deck grid shows absorbed cards inside their parent");
    ok(/getAttribute\("data-sig"\) !== sig/.test(app), "the holder card is only rebuilt when its spec changed (a transition is not cut short by a later redraw)");
  }
}

/* ================= fix: collapsed suggestion cards, suggestions during onboarding ================= */
{
  const app = fs.readFileSync("public/ikolearn/app.js", "utf8"), css = fs.readFileSync("public/ikolearn/styles.css", "utf8");
  // 1) a card in a suggestion cell (a flex column) must not inherit a 0 flex-basis: with overflow: hidden its min-height is 0
  ok(/\.gcard \{[^}]*overflow: hidden/.test(css), "cards clip their frame layers (overflow: hidden), so flex sizing must not shrink them");
  ok(/\.draw-row > \.gcard \{ flex: 1 1 0;/.test(css) && !/\.draw-row \.gcard \{/.test(css), "the row's flex: 1 1 0 applies only to cards placed directly in the row");
  ok(/\.sg \.gcard \{ flex: none;/.test(css) && /\.sg \{[^}]*flex-direction: column/.test(css), "a card inside a suggestion cell keeps its content height (flex: none)");
  const flexZero = [...css.matchAll(/([^{}]+)\{[^}]*flex: 1 1 0[^}]*\}/g)].map((m) => m[1].trim()).filter((sel) => /\.gcard/.test(sel));
  ok(flexZero.every((sel) => /> \.gcard$/.test(sel)), "no card gets a 0 flex-basis except as a direct child of a row", flexZero.join(" | "));

  // 2) onboarding only for learners who haven't started; nothing else shows while its questions are open
  const fresh = C.create("Barry", T0);
  ok(P.needsOnboarding(fresh) && !P.hasStarted(fresh), "a new learner: onboarding");
  const chatted = C.create("Barry", T0);
  C.applyTopics(chatted, [{ name: "Physics", parent: "Science", signal: "curious", chain: ["Science"] }], T0);
  ok(P.needsOnboarding(chatted) && !P.hasStarted(chatted), "one topic from chat, nothing opened yet: still onboarding (the questions build the cloud)");
  const opened = C.create("Barry", T0);
  C.applyTopics(opened, [{ name: "Physics", parent: "Science", signal: "curious", chain: ["Science"] }], T0);
  C.findTopic(opened, "Physics").opened = true;
  ok(P.hasStarted(opened) && !P.needsOnboarding(opened), "a topic they opened: started, never sent back through the first questions");
  const active = C.create("Barry", T0);
  C.applyTopics(active, [{ name: "Physics", parent: "Science", signal: "curious", chain: ["Science"] }], T0);
  active.active = C.findTopic(active, "Physics").id;
  ok(!P.needsOnboarding(active), "a lesson in progress (Continue): no onboarding");
  const decked = C.create("Barry", T0);
  decked.deck = [{ id: "gone", label: "Forces", subject: "Science", hue: 0, at: T0, best: 1, chain: [], blurb: "", ach: 0, tb: 1, ml: 0, inn: null, co: [] }];
  ok(!P.needsOnboarding(decked) && P.hasStarted(decked), "cards in the deck (even if their topics are gone): no onboarding, the deck is kept");
  const snap = C.serialize(decked);
  P.needsOnboarding(decked); P.hasStarted(decked);
  ok(C.serialize(decked) === snap && JSON.parse(snap).v === 8, "derived only: no new stored fields, storage stays v8");
  ok(P.reask(opened, T0 + 1) !== null && P.reask(fresh, T0 + 1) === null, "a started learner who never answered the questions can get the light re-ask instead; a brand-new one gets onboarding");
  const done = C.create("Barry", T0); C.setProfile(done, { onboarded: true });
  ok(!P.needsOnboarding(done), "onboarded: never again");
  ok(/function onboardingOpen\(\) \{ return state\.thread\.some\(function \(m\) \{ return m\.role === "ask" && !m\.done; \}\); \}/.test(app) && /el\.draw\.hidden = !el\.lesson\.hidden \|\| !el\.deck\.hidden \|\| !el\.hub\.hidden \|\| onboardingOpen\(\);/.test(app), "while an onboarding question is open, suggestions, Draw, Continue and Your cloud stay hidden");
  ok((app.match(/[^\w.]ask\(\w+, function/g) || []).length === 1, "only onboarding asks questions in the thread (so hiding on an open ask hides nothing else)");
}

/* ================= album, card hub, orbit pivot, motion, "Make a card" ================= */
{
  const app = fs.readFileSync("public/ikolearn/app.js", "utf8"), css = fs.readFileSync("public/ikolearn/styles.css", "utf8");
  const html = fs.readFileSync("public/ikolearn/index.html", "utf8"), view = fs.readFileSync("public/ikolearn/cloud-view.js", "utf8");
  const fnBody = (src, name) => { const i = src.indexOf("function " + name + "("); if (i < 0) return ""; let d = 0, j = src.indexOf("{", i); for (let k = j; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}" && --d === 0) return src.slice(i, k + 1); } return ""; };
  // a learner partway through Dinosaurs: two children Achieved, one Tinted, one Inked, one untouched; one ghost
  const c = C.create("Maya", T0);
  C.applyTopics(c, [{ name: "Dinosaurs", parent: "Science", signal: "explored", chain: ["Science"] }], T0);
  const kids = { Fossils: 3, Eras: 3, Diets: 2, Habitats: 1, Footprints: 0 };
  Object.keys(kids).forEach((nm) => C.applyTopics(c, [{ name: nm, parent: "Dinosaurs", signal: "explored", chain: ["Science", "Dinosaurs"] }], T0));
  const dino = C.findTopic(c, "Dinosaurs");
  Object.assign(dino, { opened: true, spent: 600, engaged: 4 });
  Object.entries(kids).forEach(([nm, k]) => { const n = C.findTopic(c, nm); Object.assign(n, { role: "core" }); if (k) Object.assign(n, { opened: true, spent: 200, engaged: 2 }); for (let j = 0; j < k; j++) C.confirm(c, n.id, true, T0 + j); });
  C.addGhosts(c, [{ name: "Ancient Seas", parent: "Dinosaurs" }], T0, dino.id);
  for (let j = 0; j < 3; j++) C.confirm(c, dino.id, true, T0);
  C.joinDeck(c, T0);
  const id = (nm) => C.findTopic(c, nm).id;
  const before = C.serialize(c);
  // 1) covered / in progress / uncovered, derived from stored v8 state
  const st = (nm) => D.coverage(c, id(nm)).state;
  eq(["Fossils", "Eras", "Diets", "Habitats", "Footprints"].map(st), ["covered", "covered", "covered", "progress", "uncovered"], "coverage: Achieved and Tinted are covered, Inked is in progress, untouched is uncovered");
  ok(D.coverage(c, id("Ancient Seas")).state === "uncovered" && D.coverage(c, id("Ancient Seas")).how === "ghost", "coverage: a dotted suggestion is uncovered (suggested)");
  ok(D.coverage(c, "nope") === null, "coverage: unknown id -> null");
  const m = C.findTopic(c, "Footprints"); m.doneAt = T0; ok(D.coverage(c, m.id).state === "covered", "coverage: done (\u201cI've got it\u201d) counts as covered"); m.doneAt = 0;
  // merge: absorbed children read as covered (merged in)
  const merged = JSON.parse(JSON.stringify(c)); const mc = C.deserialize(C.serialize(merged));
  C.confirm(mc, C.findTopic(mc, "Diets").id, true, T0 + 9); /* a third Achieved child: enough for the first merge */
  P.settleMerges(mc, T0 + 10);
  const abs = Object.values(mc.nodes).filter((n) => n.absorbedInto);
  ok(abs.length >= 2 && abs.every((n) => D.coverage(mc, n.id).state === "covered" && D.coverage(mc, n.id).how === "merged"), "coverage: cards merged into a parent are covered (merged in)");
  ok(C.serialize(c) === before && JSON.parse(before).v === 8, "coverage and the album read state only: storage stays v8, nothing new is written");
  // 2) the album: a page per subject, a row per branch led by its own card, slots for the known-but-uncovered
  const pages = D.albumModel(c);
  const sci = pages.find((p) => p.subject === "Science");
  ok(sci && sci.rows.length === 1 && sci.rows[0].head === dino.id && sci.rows[0].lead && sci.rows[0].cards[0] === dino.id, "album: Science page, one Dinosaurs row led by the Dinosaurs card");
  ok(sci.rows[0].slots.includes(id("Footprints")) && sci.rows[0].slots.includes(id("Ancient Seas")) && !sci.rows[0].slots.some((x) => C.inDeck(c, x)), "album: empty slots are the branch's topics not yet in the deck (ghosts included)");
  ok(sci.rows[0].cards.slice(1).every((x, i, a) => i === 0 || C.growthOf(c, a[i - 1]).tier >= C.growthOf(c, x).tier), "album: cards after the lead are by rarity");
  ok(sci.known >= 6 && sci.covered >= 3 && sci.covered <= sci.known, "album: the page counts covered of known topics", sci.covered + "/" + sci.known);
  const capped = D.albumModel(c, { slots: 1 }).find((p) => p.subject === "Science").rows[0];
  ok(capped.slots.length === 1 && capped.more >= 1, "album: slots are capped per row, the rest counted as more");
  const mp = D.albumModel(mc).find((p) => p.subject === "Science").rows[0];
  ok(abs.every((n) => !mp.cards.includes(n.id) && !mp.slots.includes(n.id)), "album: cards merged into a decked parent live in its corpus, not loose on the page");
  // a card whose topic is gone keeps its place by its stored chain
  const gone = C.deserialize(before); const fid = id("Fossils"); delete gone.nodes[fid]; gone.order = gone.order.filter((x) => x !== fid);
  ok(D.albumModel(gone).some((p) => p.rows.some((r) => r.cards.includes(fid))), "album: a card whose topic was removed still shows (from its deck entry)");
  // 3) the hub's children: core in the given order, coverage on each, pending steps waiting
  const hk = D.hubChildren(c, dino.id, { core: P.orderedChildren(c, dino.id), side: P.sidePaths(c, dino.id) });
  ok(hk.core.length >= 5 && hk.core.every((x) => x.cov && x.cov.state) && hk.covered === 3 && hk.total === hk.core.length + hk.side.length, "hub: every branch with its state; 3 covered", hk.covered + "/" + hk.total);
  C.setPending(c, id("Footprints"), ["Track ways", "Fossils"], "Track ways");
  eq(D.hubChildren(c, id("Footprints")).waiting, ["Track ways", "Fossils"], "hub: steps waiting for the next lesson are listed (not yet topics)");
  // the slot renders as an outline button with its state (no model)
  const mkEl = (tag) => ({ tag, attrs: {}, kids: [], dataset: {}, style: { props: {}, setProperty(k, v) { this.props[k] = v; } }, listeners: {}, className: "", textContent: "",
    setAttribute(k, v) { this.attrs[k] = v; }, appendChild(k) { this.kids.push(k); return k; }, addEventListener(e, f) { this.listeners[e] = f; } });
  const doc = { createElement: (t) => mkEl(t), createElementNS: (ns, t) => mkEl(t) };
  let hit = null;
  const slot = D.renderSlot(doc, c, id("Footprints"), { onOpen: (x) => { hit = x; } });
  slot.listeners.click({ stopPropagation() {} });
  ok(slot.tag === "button" && /gslot is-uncovered/.test(slot.className) && slot.kids.some((k) => k.className === "gs-title" && k.textContent === "Footprints") && hit === id("Footprints"), "slot: an outline button with the topic's name and state, opening its hub");
  // 4) uniform cards: one 5:7 shape, clamped text, no flex-basis collapse
  ok(/\.gcard \{[^}]*aspect-ratio: 5 \/ 7/.test(css) && /\.gslot \{[^}]*aspect-ratio: 5 \/ 7/.test(css) && !/\.gcard\.size-full \{[^}]*aspect-ratio: auto/.test(css) && !/\.holder \.gcard\.size-full \{[^}]*aspect-ratio: auto/.test(css), "uniform cards: every card and slot is 5:7 (the holder too)");
  ok(/\.gc-title \{[^}]*-webkit-line-clamp: 2/.test(css) && /\.gc-chain \{[^}]*text-overflow: ellipsis/.test(css) && /\.gc-desc \{[^}]*-webkit-line-clamp/.test(css) && /\.gcard \{[^}]*container-type: inline-size/.test(css), "uniform cards: title, chain and text are clamped, type scales with the card (container units)");
  ok(/\.sg \.gcard \{ flex: none;/.test(css) && /\.draw-row > \.gcard \{ flex: 1 1 0;/.test(css), "uniform cards: the suggestion collapse fix still holds");
  // 5) camera: the pivot
  const a = { zoom: 1, panX: 0, panY: 0, yaw: 0, pitch: 0 }, b = { zoom: 4, panX: 10, panY: -20, yaw: 1, pitch: 0.2, pivot: { x: 1, y: 2, z: -3 } };
  eq(CAM.lerpView(a, b, 0).pivot, { x: 0, y: 0, z: 0 }, "pivot: a view without one turns about the origin");
  eq(CAM.lerpView(a, b, 0.5).pivot, { x: 0.5, y: 1, z: -1.5 }, "pivot: tweened in a straight line with the camera");
  eq(CAM.lerpView(b, a, 1).pivot, { x: 0, y: 0, z: 0 }, "pivot: Recentre's tween ends at the origin");
  ok(CAM.fitAround({ x0: -10, x1: 100, y0: -5, y1: 5 }, 400, 400, 0.1, 50) === CAM.fitZoom({ x0: -100, x1: 100, y0: -5, y1: 5 }, 400, 400, 0.1, 50), "fitAround: the node stays put, so the far side of its branch sets the zoom");
  const ph = CAM.focusFrame(390, 760, { sheet: 420, top: 60 });
  ok(ph.cx === 195 && ph.cy === 60 + (760 - 420 - 60) / 2 && ph.cy + ph.ah / 2 <= 760 - 420 && ph.cy - ph.ah / 2 >= 60, "phone focus: the node sits in the middle of the strip above the sheet", JSON.stringify(ph));
  ok(CAM.focusFrame(390, 760, { sheet: 900, top: 60 }).cy > 60, "phone focus: a tall sheet still leaves the node below the top controls");
  const wd = CAM.focusFrame(1280, 720, { wide: true });
  ok(wd.cx === 440 && wd.cy === 360, "wide focus: left of the side panel", JSON.stringify(wd));
  // the projection: a pivot node lands exactly at centre + pan, whatever the turn (so turning orbits it)
  const proj = (p, v, w = 400, h = 400) => { const piv = v.pivot || { x: 0, y: 0, z: 0 }; const px = p.x - piv.x, py = p.y - piv.y, pz = p.z - piv.z, cy = Math.cos(v.yaw), sy = Math.sin(v.yaw), cp = Math.cos(v.pitch), sp = Math.sin(v.pitch); let x = px * cy - pz * sy, z = px * sy + pz * cy; const y = py * cp - z * sp; z = py * sp + z * cp; const f = 3.2 / (3.2 + z), s = Math.min(w, h) * 0.34 * v.zoom; return { x: w / 2 + v.panX + x * f * s, y: h / 2 + v.panY - y * f * s }; };
  const node = { x: 0.8, y: 0.3, z: -0.5 };
  const spots = [0, 0.7, 2.1, -1.4].map((yaw) => proj(node, { yaw, pitch: 0.4, zoom: 3, panX: -20, panY: 35, pivot: node }));
  ok(spots.every((q) => Math.abs(q.x - 180) < 1e-9 && Math.abs(q.y - 235) < 1e-9), "orbit: with the pivot on the node, turning leaves the node fixed on screen");
  ok(new Set([0, 0.7, 2.1].map((yaw) => proj(node, { yaw, pitch: 0.4, zoom: 3, panX: -20, panY: 35 }).x.toFixed(3))).size === 3, "orbit: about the origin (before), the same turn swings the node across the screen");
  ok(/var px = p\.x - pivot\.x, py = p\.y - pivot\.y, pz = p\.z - pivot\.z;/.test(view) && /pivot = pointOf\(id\)/.test(view) && /panX: cx - w \/ 2, panY: cy - h \/ 2/.test(view) && /recentre: function \(\) \{ setFocus\(null\); animateTo\(Object\.assign\(\{ pivot: CAM\.ORIGIN \}, HOME\)/.test(view), "the view: focus moves the pivot to the node, Recentre puts it back at the origin");
  ok(/state\.view\.o = \[v\.pivot\.x, v\.pivot\.y, v\.pivot\.z\]/.test(app) && /pivot: Array\.isArray\(state\.view\.o\)/.test(app), "the pivot is kept with the saved view and restored");
  ok(/CAM\.focusFrame\(cw, ch, \{ wide: wide, sheet: wide \? 0 : sheetH, top: top \}\)/.test(app) && /new ResizeObserver\(/.test(app), "phone: focus frames the node above the open sheet, and re-frames as the sheet grows");
  // 6) the hub and album wiring, with no model calls
  ok(/id="hub"/.test(html) && /id="hub-kids"/.test(html) && /id="hub-lesson"/.test(html) && /id="hub-test"/.test(html) && /id="d-album"/.test(html), "hub and album markup present");
  const noCalls = ["openHub", "renderHub", "renderHubKids", "renderAlbum", "hubBack", "liftCard", "viewIn", "focusInView"].every((f) => { const b = fnBody(app, f); return b && !/postJson\(|stream\(|fetch\(|notice\(|makeCard\(/.test(b); });
  ok(noCalls, "album, hub, camera framing and motion make no model calls");
  ok(/go = function \(cid, src\) \{ openHub\(cid, src, "deck"\); \}/.test(app) && /D\.renderSlot\(document, state\.cloud, sid, \{ onOpen: go \}\)/.test(app), "album: cards and empty slots open the card's hub");
  ok(/state\.pendingFrom = id; openLesson\(x\.id\)/.test(app) && /function hubKidAction/.test(app) && /openHub\(cid, src, id\)/.test(app), "hub: each branch opens its own hub, or starts / continues its lesson");
  ok(/D\.coverage\(state\.cloud, id\)/.test(app) && /P\.testState\(state\.cloud, id\)/.test(app) && /hubCrumb/.test(app), "hub: coverage, test when ready, and the chain back up");
  // 7) "Make a card" is now "Open its card" (the hub, no call); the old note is "Save a note" in chat
  ok(/id="p-card"[^>]*>Open its card</.test(html) && !/Make a card/.test(html + app), "the panel's \u201cMake a card\u201d is now \u201cOpen its card\u201d");
  ok(/el\.pCard\.addEventListener\("click", function \(\) \{\s*var id = state\.panelNode; if \(!nodeOf\(id\)\) return;\s*openHub\(id, null, "cloud"\);/.test(app), "Open its card opens the hub (no model call)");
  ok(/linkBtn\("Save a note on " \+ m\.topic, function \(\) \{ makeCard\(/.test(app), "the chat's one-call note card is labelled for what it is: Save a note");
  // 8) motion: press feedback, view transitions, card lift, all off under reduced motion
  ok(/button\.gcard:active/.test(css) && /\.btn:active/.test(css) && /@keyframes page-in/.test(css) && /@keyframes slot-in/.test(css) && /@keyframes view-in/.test(css) && /@keyframes sheet-up/.test(css), "motion: press feedback, album pages, slots, views and the sheet");
  ok(/prefers-reduced-motion: reduce\)[^@]*\.view-in, \.album\.opening \.album-page/.test(css) && /function liftCard[\s\S]{0,200}motionOK\(\)/.test(app), "motion: all of it stays still under prefers-reduced-motion");
}

if (fails.length) {
  console.error(`ikolearn checks: ${pass} passed, ${fails.length} FAILED`);
  for (const f of fails) console.error("  x " + f);
  process.exit(1);
}
console.log(`ikolearn checks: ${pass} passed`);
