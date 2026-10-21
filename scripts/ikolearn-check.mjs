// Deterministic checks for IkoLearn: cloud growth/merge, block parsing, the streaming splitter, prompts, route guards,
// mocked Gemini (no network, no key), persistence, and static asset rules.
// Run: npm run check:ikolearn
import fs from "node:fs";
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
  ok(mig && mig.v === C.VERSION && C.VERSION === 6, "v1 cloud migrates forward (to v6)");
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
  ok(st === 3 && !C.growthOf(c, cnt.id).achieved && C.growthOf(c, cnt.id).toNext === 0, "bright, but not achieved until the branch ends", String(st));
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
  ok(m2 && v2.v === 2 && m2.v === 6, "v2 cloud migrates to v6");
  ok(v2.n.every((a) => m2.nodes[a[0]] ? m2.nodes[a[0]].label === a[1] && (m2.nodes[a[0]].spent || 0) === (a[10] || 0) : C.OLD_SEEDS.map(C.norm).includes(C.norm(a[1])) && !(a[10] > 0)), "migration keeps every v2 node with its time spent (only untouched old seeds are pruned)");
  const mc = C.findTopic(m2, "Counting"), mnb = C.findTopic(m2, "Number Bonds");
  ok(C.inDeck(m2, mc.id) && C.growthOf(m2, mc.id).stage === 1 && !C.inDeck(m2, mnb.id), "backfill: Counting (4 min, got it) joins with its first colour; Number Bonds (30 s) not yet");
  ok(C.findTopic(m2, "Counting to 20").end && C.findTopic(m2, "Fractions").path.ids.length === 2, "migration keeps branch ends and paths");
  eq(C.deserialize(C.serialize(m2)).deck, m2.deck, "migrated deck round-trips");
  ok(C.deserialize(fs.readFileSync("scripts/fixtures/ikolearn-cloud-v1.json", "utf8")).v === 6, "v1 still migrates (to v6)");
  // v3 (PR #57) -> v4 without loss: every node, the deck with its best stages, forks, draws and sessions
  const v3raw = fs.readFileSync("scripts/fixtures/ikolearn-cloud-v3.json", "utf8"), v3 = JSON.parse(v3raw), m3 = C.deserialize(v3raw);
  ok(m3 && v3.v === 3 && m3.v === 6, "v3 cloud migrates to v6");
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
  const texts = el.kids.map((k) => k.className + "=" + k.textContent);
  ok(el.tag === "button" && el.className.includes("gcard") && el.className.includes("size-tile") && el.className.includes("stage-" + sp.stage) && svg.tag === "svg" && svg.ns === "http://www.w3.org/2000/svg", "render: a button card with an SVG landscape");
  ok(el.kids[0].className === "gc-art" && texts.includes("gc-chain=Math") && texts.includes("gc-title=Counting") && texts.includes("gc-mark=" + sp.stageName) && el.style.props["--card-ink"] === sp.color.ink && el.style.props["--card-wash"] === sp.color.wash, "render: landscape first (top-left), then chain, title, a quiet text mark; colours from the model");
  el.listeners.click({ stopPropagation() {} });
  ok(opened === t.id && src === el, "render: tapping opens the topic (and hands over the card for the slide into the holder)");
  const full = D.render(doc, sp, { size: "full" });
  ok(full.kids.some((k) => k.className === "gc-desc" && k.textContent === sp.blurb) && full.kids.some((k) => k.className === "gc-chain" && k.textContent === "Math → Counting") && full.kids.some((k) => k.className === "gc-rule"), "render: the full card has the whole chain, a rule and the description");
  ok(D.render(doc, sp, { size: "mini" }).kids.length === 1, "render: mini card is the landscape only");
  const count = (e, tag) => (e.tag === tag ? 1 : 0) + (e.kids || []).reduce((n, k) => n + count(k, tag), 0);
  ok(count(svg, "path") >= sp.art.layers.length * 2 + sp.art.trees.length + sp.art.birds.length && count(svg, "line") >= sp.art.hatch.length, "render: ridges (fill + line), trees, birds and hatching are drawn");
  const all = JSON.stringify(full, (k, v) => (k === "ns" ? undefined : v));
  ok(!/"tag":"(img|image|use|i|picture)"|href|https?:/.test(all) && !/\p{Extended_Pictographic}/u.test(all), "no images, icons or emoji: text and line drawing only");
  const ach = Object.assign({}, sp, { achieved: true, stage: 4, stageName: "Achieved" });
  ok(D.render(doc, ach, {}).className.includes("achieved") && D.render(doc, ach, {}).kids.some((k) => k.className === "gc-mark" && k.textContent === "Achieved"), "render: achieved cards carry a small text-only Achieved mark");

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
  const files = ["index.html", "styles.css", "app.js", "cloud-model.js", "cloud-view.js", "lesson.js", "deck.js", "rank.js", "orchestrator.js"];
  const bytes = files.reduce((n, f) => n + fs.statSync("public/ikolearn/" + f).size, 0);
  ok(bytes < 260_000, "app weight under 260 KB uncompressed", String(bytes));
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
  ok(v4.v === 4 && m5 && m5.v === 6, "v4 cloud migrates to v6");
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
  ok(Object.keys(fresh.nodes).length === 0 && fresh.v === 6 && !C.STARTERS && !C.KNOWN_CHAINS && !RK.POPULAR, "a new learner starts with an empty cloud (no seeded subjects, chains or popularity list)");
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
  ok(CREATE_SCHEMA.properties.items.items.required.join() === "node,card,children" && CREATE_SCHEMA.properties.items.items.properties.children.items.required.join() === "name,order,score", "create schema: node, card and ordered, scored children");

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
}

if (fails.length) {
  console.error(`ikolearn checks: ${pass} passed, ${fails.length} FAILED`);
  for (const f of fails) console.error("  x " + f);
  process.exit(1);
}
console.log(`ikolearn checks: ${pass} passed`);
