# IkoLearn v2: lessons, cards, the deck and the card game

A learning companion with a visible, evolving learning profile: a point cloud centred on the learner's first name that grows into a tree of topics.
Who it's for: anyone curious, at any age (a thoughtful learning harness, framed neither for kids nor for adults). Parents can also use it to plan and guide homeschool learning, as one use among others.
Tapping a card or a topic opens a short lesson; every topic can map an ordered path of smaller topics, one level at a time, as deep as the learner goes.
There is no pre-built map: a new learner answers a few short questions and the companion builds their first topics on the fly, then keeps growing branches as they finish them (see "A procedural start").
Topics the learner spends time with become collectible cards: an ink-sketch landscape, the topic's chain, a title and one line. They start in sepia, take on their chain's colour as the learner shows what they've learned, and are marked Achieved when the branch is finished. Cards stay in the deck for good. Every visit opens with a few suggested cards and a Draw button; a small on-device orchestrator picks them, balanced over the year and ordered by a living top 10, offers children once a topic is engaged, and offers an optional Test when a branch has enough finished topics.
Static client in `public/ikolearn/`, seven small server routes in `app/api/ikolearn/`, Gemini (free tier) behind them by default; the model provider can be swapped with env vars alone (see "Swapping the model provider").
Unlisted and noindexed while we test with one learner.

## Files

| Piece | File | What it does |
| --- | --- | --- |
| Prompts | `lib/ikolearn/prompts.ts` | Input cleaning, the roles (companion / noticing, card, adjacent, lesson, path, test, create), the hidden-block rules, response schemas, parsing, and the streaming block splitter. No UI or network code. |
| Model interface | `lib/ikolearn/llm.ts`, `llm-types.ts` | What prompts and the service use: `streamText` and `generateJson`, whatever the provider. Picks the provider from env vars (`llmConfig`). Shared types, limits, timeouts and the SSE reader. |
| Gemini adapter | `lib/ikolearn/gemini.ts` | The default. Streaming (`streamGenerateContent?alt=sse`) and structured JSON (`generateContent` + `responseSchema`), fallback model on 5xx. |
| OpenAI-compatible adapter | `lib/ikolearn/openai-compatible.ts` | `/chat/completions` with SSE streaming and JSON mode, any base URL: OpenAI, Groq, xAI, OpenRouter and similar. |
| Service | `lib/ikolearn/service.ts` | Route logic with injectable `fetch`: origin/size/input checks, per-IP rate limit, daily call budget, NDJSON event stream, chat / lesson / card / adjacent / path / test / create handlers. |
| Routes | `app/api/ikolearn/{chat,lesson,card,adjacent,path,test,create}/route.ts` | Thin wrappers around the service. All go through the same `prepare()` guards and budget. |
| Cloud model | `public/ikolearn/cloud-model.js` | Pure data: the recursive topic tree (it starts empty), the learner's profile (interests, onboarding stamps; no age, no region), applying a creation result, growth/merge, paths, next topic, lesson engagement, summary for prompts, colours, 3D layout, compact storage and migration. Runs in the browser and in Node tests. |
| Cloud view | `public/ikolearn/cloud-view.js` | Canvas 2D projection of the 3D points: rotate, pan, zoom, focus a branch, depth- and zoom-aware labels, a draw cap. |
| Ranking | `public/ikolearn/rank.js` | The top 10 (`IkoRank`): pluggable score sources (device-local use, chain, the model's importance scores), per-topic scores, ordering and busiest chains. Pure, no storage or network. |
| Orchestrator | `public/ikolearn/orchestrator.js` | `IkoPlan`: onboarding and re-ask questions, what to suggest, Draw, when to grow children, when to ask "what comes next", when a Test is ready, the context for lesson and creation prompts. Pure, no calls. |
| Deck | `public/ikolearn/deck.js` | Procedural landscapes (deterministic from the topic id, more ink with detail), the card renderer (tile, full, mini), and the balanced session draw. Pure apart from `render`, which takes a `document`. |
| Lesson | `public/ikolearn/lesson.js` | Parses the tagged lesson text (also while it streams) and renders it with text nodes only. |
| App | `public/ikolearn/app.js`, `index.html`, `styles.css` | Chat, cards, the card holder and lesson, questions, the top 10, panel, persistence (localStorage), fallbacks. |
| Tests | `scripts/ikolearn-check.mjs` | `npm run check:ikolearn`: mocked, no network, no key. `scripts/fixtures/ikolearn-cloud-v1.json` to `-v4.json` are saved clouds for the migration tests; `ikolearn-starters.json` is the old starter map, kept only so tests can build a rich cloud. |

## The tree

- Every node has a stable id (`n1`, `n2`, ... never reused), a `parent` (null for a subject) and therefore a path from its subject (`trail`: "Math > Addition > Number Bonds"). There is no depth limit.
- Subjects keep their own hue; every level below is a shade of it (`hueOf`, `colorOf`). Ghosts (dotted) are ideas not explored yet.
- **Chains.** A card's chain is its path in the tree (`chainOf`: "Computer Science → Programming → Python → Sets"). For every new topic the model sends the full logical `chain` (broadest first, up to 4 links), and `placeChain` reuses the deepest link that already exists (promoting a ghost) and creates the missing ones in between as real nodes with explicit parent → child links. The cloud shows them straight away.
- **Validation and one repair.** Every chain goes through `checkChain` before it is placed: duplicates, the topic itself, the learner's name, the topic's own descendants (cycles) and other subjects are dropped (exact names only, so "Programming" can sit under Computer Science). After a bridge, if the chain is still shallow (fewer than 2 links between the subject and the topic, like Computer Science → Python → Sets), the app asks **once** more (`IkoPlan.needsRepair` / `repairRequest`: the bridge request plus `repair: true` and the chain so far; the prompt asks whether a level a learner would meet was skipped). `applyRepair` inserts a missing level along the topic's own ancestry (Python moves under the new Programming with its branch, ids kept). `repaired` is set and saved before the call, so it is at most 1 extra call per topic, ever.
- **Short chains and bridges.** There is no built-in table of chains. The chat prompt asks the model for the full chain in the same call. When it sends only the leaf (or the leaf and a subject), a topic the learner already has and named in their message deepens it, within the same subject only (`deepenChain`: "How do sets work in Python?" with Python on the map lands under Python). No call. If the new topic still lands right under its subject on a shallow chain (`IkoPlan.needsBridge`: not a parent made by a creation call, not bridged before), the app makes one **bridge** creation call after the reply for the logical in-between steps (Computer Science → Programming → Python for Sets). `applyBridge` places them through `placeChain` (existing nodes reused by name and alias), gives each its card line (sepia, like any new card), and moves the topic under the deepest link with its whole branch (same id, history kept). The answer is cached on the topic (`bridged`), including "it really sits under the subject".
- **Subjects and colours.** No subject names are built in and nothing is renamed: a subject keeps the name the model gave it (from the learner's own words). Each subject's hue is stored on it, so a save's colours never change; a new subject takes a stable hue from its name (`subjectHue`: a hash of the normalised name picks a starting slot in `HUES`, then the first hue not already used in this cloud). `HUES` is colour data only.
- Topics match existing nodes by a normalised key (case, plurals, `&`/`and`). A new topic may land under any existing topic; otherwise under a subject with the same normalised name, or a new subject (cap 12).
- Caps keep it light: 600 nodes, 16 children and 6 ghosts per node, 6 steps per path. When room is needed, the oldest free ghost leaf goes first; nodes with children, on a path, or with cards are never pruned.

## A procedural start

Nothing is pre-seeded. The map is built from the learner, one structured "create" call at a time, and kept for years on the device.

1. **The soft opening** (`IkoPlan.onboarding`, on the device, no call): the first name if we don't have it, then `IkoPlan.OPENING` ("Let's begin making a learning path together. We can add more as we go along.") with an **open question** in a free-text field ("What are you curious about, or what do you enjoy?", `IkoPlan.openQuestion`, one wording for everyone). Under it, a few **easy-click examples** with a More link (see *Examples* below). If they answer, one optional, soft **personal-development** follow-up ("And is there something you'd like to grow in yourself?", free text, no examples). There is **no topic list on the device and no age or region**: their words (one plain line, at most 300 characters, sent once as `about`, plus the optional `grow` answer, at most 200; neither is stored) go to one creation call (`kind: "start"`), and the model reads the interests behind them and returns 3-5 parent topics, each with its card and 3-6 child placeholders. **Skip makes no call**: a gentle message leaves the question open, and the first thing the learner types in the chat box (while the cloud has no subjects) is sent as `about` to that same one start call instead of a chat turn (`waitingForStart` in app.js). Nodes come only from what the learner offers; the server also refuses a `start`/`more` with no words (422 `about`, no model call).
   - **Who gets it** (`IkoPlan.needsOnboarding`): only a learner who hasn't started: not onboarded, fewer than 3 live topics, and nothing begun (`hasStarted`: no deck card, no lesson in progress, no topic opened, timed or answered). A learner with progress who never finished the questions (they chatted first, or came from an older save) keeps their cloud and deck and gets the usual flow; the light re-ask can fill in their interests later. Derived only, nothing new is stored.
   - **Examples** (`GET /api/ikolearn/examples`, `examplesFor` in service.ts): one generic set of ~24 short answers ("How volcanoes erupt") made by the model and the same for everyone, since nothing about any learner goes in. It is cached for the Pacific day on the server instance and by the CDN (`Cache-Control: public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400`), so a normal day costs about one model call; concurrent misses share one call, an instance makes at most `LEARN_GUARDS.examplesPerDay` (3) tries a day, each counted in the daily budget, and a failure is never cached (yesterday's set is served briefly if there is one). The app fetches it once per page, when a row first shows, and shows 3 at a time; **More** steps through the set on the device with no call. Once a cloud exists, `IkoPlan.examples` puts the learner's best-ranked next topics first (labels the creation calls made). Tapping one acts exactly like typing it (the open question's answer, the chat box after Skip, the welcome back, or the light re-ask). Offline, or with no set, there is no list: just "Examples couldn't load just now" and Try again. There is no example list anywhere in the client.
   - **Calls during onboarding: at most 2**: the shared examples (usually a CDN hit) and the one start call; the personal-development answer rides in the start call.
   - **While the questions are open** (an `ask` message not yet answered), the Pick-up block (suggestions, Draw, Continue, Your cloud) stays hidden: the questions are the only next step. It comes back once the cloud is built.
2. **Building on it**: parents are solid nodes placed through their chain (`placeChain`), with the card line and a goal ("Goal: ..." on the full card). Children are dotted placeholders on the parent's path in the model's logical order, each with the model's importance score (`imp`) and when it was made (`impAt`).
3. **"What comes next"** (`IkoPlan.needsNext`, `kind: "next"`): offered (a "What comes next in X?" suggestion, a link under the lesson and in the panel) only once a parent's branch is finished, i.e. all its children are done (or it has none and was engaged). A finished step hands it to its parent. One call returns new children for that parent only; it is cached on the parent (`asked` = finished children + 1), so it is not offered again until more is finished. Leaves still get their children through the lesson call.
4. **Re-asking lightly** (`IkoPlan.reask`): one open question ("What's caught your interest lately?", a free-text field, no chips) appears among the suggestions when the cloud is thin (fewer than 3 open topics) or the learner seems stuck (3 visits without opening a lesson), at most every 3 days. Finishing onboarding stamps `askedAt`, so it never shows right after the first build. It costs nothing until answered; an answer is one creation call (`kind: "more"`, 1-2 new parents, their words as `about`).
5. Later sessions mostly draw from the Deck and the cloud (suggestions, Draw), with new branches proposed as branches end.

### No fixed topics

The client has no list of topics to offer: not for interests, suggestions ("Something new in X" picks the next topic of the learner's own quietest subject), Draw, or a failed call. There is no subject palette and no alias table: `HUES` is colour data only. Creation calls list only the learner's own subjects for filing. `OLD_SEEDS` and `CS_TOPICS` in the cloud model are migration-only (they tidy older saves on load). A check scans the discovery code for hardcoded topic lists.

### Core sequence and side paths

- Every child from a creation call has a `role`: **core** (the main sequence, foundational to advanced; it is the parent's numbered path with "next") or **optional** (an isolated aspect or side path, with `off`: the core step it branches from). A lesson's path steps are core too.
- On the cloud a side path sits just off its step, on a faint dotted twig. On the card, the core children are listed as "Branches of X" (ranked, "start here"), and side paths as a quiet "Side paths" list ("· off Dino Types").
- A branch ends when its core sequence is done; side paths never block ("what comes next" is offered then). A side path the learner engages can grow its own core and optional children through "what comes next", recursively.
- Tests use completed core material first, then completed side paths. Never unfinished ones.
- Groundwork for "powerful cards" (not built): `node.absorbed` (child ids) and `child.absorbedInto` (parent id) are stored and kept consistent, and `absorbable(cloud, id)` lists completed core children. Nothing sets them yet and there is no UI.

### The creation call

`POST /api/ikolearn/create` with `{ name, mode: "notice", kind: "start"|"more"|"next"|"bridge", interests, about (start/more: their own words, required unless interests are given), favorites, focus/trail/known (next), cloud, parents }`, through the same `prepare()` guards (origin, size, per-IP rate limits, the daily budget). One `generateJson` call with `CREATE_SCHEMA`; the result, strictly validated by `parseCreate`:

```
{ ok: true, kind, items: [
  { node: { name, chain: [broad subject, ..., parent] },
    card: { title, blurb, goal },
    children: [{ name, order, score, why, role: "core"|"optional", after }],
    links: [{ name, blurb }] /* bridge only: a card line per chain link */ } ] }
```

- Labels are cleaned, never the learner's name, and never repeated across the result; children equal to their node or its chain are dropped, and for `next` so are the ones it already has.
- Children are sorted by `order` and renumbered; `score` is clamped to 0-1 (0-100 is read as a percent; junk is 0.5). Each item needs 2+ children; `start` needs 2-5 items, `more` 1-2, `next` exactly the focus, `bridge` exactly the focus with its chain (children may be empty). Roles: core unless "optional"; an optional child's `after` must name a core child (else the first); each item keeps at least one core child. Anything less is an error (502) and the app falls back on the device.
- The prompt lets the learner's own interests lead, keeps the order logical (foundations first) and tells the model never to rename subjects to a fixed list. No age or place is sent. Their most-used topics go along as favorites.
- **What was noticed** (`start`/`more`/`next`): the chat's signals (strength, struggle, curious) reach the profile summary as "strong" and "found hard"; the prompt builds on strengths, gives a struggle a gentler foundation first, and may name what it noticed in a `why`.
- **Optional precursors** (`start`/`more`/`next`, not bridges): where it truly grows out of the learner's interest, at most one optional child per item may be a small first step toward something that matters more as AI tools spread (making and building, asking good questions, explaining clearly, checking what's true, working with people, caring for living things). Always `role: "optional"`, tied to them in its `why`, never forced, and never about jobs or the future.
- **Grow** (`start` only): the optional personal-development answer goes in the same call; when given, one parent gently serves it.

### No age, no region

- IkoLearn never asks for an age and never guesses a place (no time-zone or locale guess, no permission prompt, no lookup). No request carries either, and `prepare()` drops `age`/`region` fields an older client might still send.
- Older saves (v6-v8) keep an age band, a region, a region-guess flag and `changedAt` in slots 0-2 and 8 of the profile row. They are ignored on read and written back empty, so the row keeps its v8 shape and there is no version bump.

## Lessons, paths and the next topic

1. Tapping a card, Draw, or "Start a lesson" on a topic, opens a lesson (`/api/ikolearn/lesson`, one streamed call). It teaches first: tagged lines INTRO, EXPLAIN x2-3 (plain, concrete explanation), STEP x2-4 ("How to do it"), an optional EXAMPLE (worked example) and NEXT, under 260 words, in a warm, plain voice. `lesson.js` renders them as they arrive.
2. The lesson is visibly two-phase: "1 · Learn" then "2 · Check yourself". The check questions (2-3) only ask about what the lesson explained.
3. The same call ends with a hidden `<<<PATH {"steps":[...],"next":"...","choices":[...],"questions":[...],"blurb":"...","end":false} PATH>>>` block. The server holds it back and sends a `path` event. No extra call. Steps (the topic's children) are asked for only when the topic has no path yet; the fork choices, the questions and the card line come every time.
4. **Children on engagement.** The steps are kept as pending children (`node.pending`) until the learner engages with the topic: a right answer, "I've got it", a second visit, or 2 minutes with the lesson open (`IkoPlan.engaged`). Then `applyPath` turns them into children in learning order, reusing existing children (and anything already inside this branch). Topics that already live elsewhere on the map stay where they are. Children take their parent's colour family, show as sepia ghosts on the cloud, and are listed under the holder ("Branches of Python: Sets · Lists · ...").
5. The next topic is chosen locally (`nextFor`): the path's pick if not done, else the first unfinished step, else the next step further up the tree. It is shown as a dotted ring on the cloud, "next" on "Your path", and "Next up" after a lesson.
6. Reading a lesson nudges mastery a little; a right answer to a question confirms it (`confirm`); "I've got it" marks it strong (mastery >= 0.6) and moves to the next step; "Still tricky" is remembered gently.
7. "What comes next in X?" (the creation call, `kind: "next"`) replaces the old "Map a path" link once a branch is finished. `/api/ikolearn/path` still exists on the server but the app no longer calls it.
8. After a lesson the learner picks where to go next (see Forks). Other branches are suggested only once a branch ends.
9. Lessons are cached per node in `localStorage` (newest 30) with their questions and answers, so reopening costs nothing. "Write a fresh version" asks again.

### Model calls per action

| Action | Calls |
| --- | --- |
| Chat message | 1 |
| Tap a node on the cloud (first time, or after the cloud changed) | 1 (note cached per node) |
| Opening a node from a path or lesson | 0 (note on request) |
| Save a note (chat link under a reply; was "Make a card") | 1 (a short written note card, includes its path) |
| Open its card (the hub), the album, coverage, orbit, animations | 0 |
| Related topics (shown once a branch ends) | 1 |
| Onboarding (first visit) | at most 2: the shared examples set (GET, cached a day on the CDN, ~1 model call a day for everyone) and 1 creation call; the questions and More are on the device |
| What comes next in a finished branch | 1 (cached on the parent until more is finished) |
| Bridge for a topic that landed too close to its subject | +1 after that chat reply, only when there's a gap; cached per topic (0 when the chat call already sent the full chain) |
| Repair re-ask after a bridge whose chain is still shallow | +1 at most, once per topic, ever (`repaired` is stored before the call) |
| Tiers, colour evolution, merging, the corpus, the cloud's camera and focus | 0 (all on the device) |
| Answering the light re-ask | 1 ("more"); showing it 0 |
| Take a Test | 1 (cached until taken; 0 if there isn't enough finished material) |
| New lesson | 1 (includes the questions, the card line, the fork choices, and the children if none yet) |
| Children appearing, answering a test | 0 |
| Answering a question | 0 |
| Picking a fork choice | 0 (+1 if that lesson isn't cached) |
| Cached lesson, "I've got it", "Still tricky", other branches at a branch end | 0 |
| Suggestions, Draw, the orchestrator, ranking, card growth and colour, the holder, the deck, the top 10 | 0 (all on the device) |

## The card game

The loop: suggestions, Draw or chat offer cards, picking one slides it into the holder and opens its lesson, the questions and "I've got it" bring its colour in, the fork picks the next card, and the branch's last card is Achieved. Other branches open only once a branch is done.

### Cards

- Every card has an ink-sketch landscape plate in the corner, the chain in small capitals (each link a separate span, the topic in ink), a serif title, one short line, a frame by tier and a folded corner. No icons or images: the only mark is the tier in small text (Sketch, Inked, Tinted, Achieved, Merged I ...) with its corner pips.
- The card line (`blurb`) comes from the lesson's hidden block (under 12 words, never the learner's name), or a card's first sentence until a lesson has run.
- Sizes: `tile` (draw and deck), `full` (the holder), `mini` (beside a chat card).

### Ink and colour

Two separate measures, both from `growthOf(cloud, id)`:

- **Detail (ink)** comes from use: `spent/60 + 2*engaged + 3*correct + 4*mastery + min(cards, 3)`, in levels at 0, 3, 8, 16, 30. A topic joins the deck at 3. More detail means more hatching, trees, birds and ripples on the same landscape.
- **Colour** comes only from confirmed learning: `correct answers + 2 if mastery >= 0.6` ("I've got it"). 0 is sepia; 1, 3 and 5 confirmations give Warming up, Growing and Bright. The tier sets a floor on this stage (see Tiers below), so colour is earned on the card as the tier rises: an Achieved card (completed with 3 right answers, or its branch finished, `isTerminal`) is in full colour and stays so. Time alone never adds colour.
- The stage a card reached is kept in the deck (`best`), so a card never fades. Full colour comes with the Achieved tier.
- `evolveColor(hue, stage)` is the one place colour is made: the ink mixes in RGB from sepia (hsl 34 24% 36%) towards the chain's hue (58%, 42%) by 0, 18, 40, 65 and 100%, and a wash of the chain's hue bleeds in from the first confirmation. Mixing in RGB means a card never passes through other hues on the way.

### Prerequisites and the completion gate (v9)

- **Prerequisites.** The creation call may give a child `needs`: the names of earlier siblings it truly needs first (usually none, at most 3, never a later one); an item may give `node.needs` (topics it builds on). The server keeps only earlier siblings; the device resolves names to ids (`IkoCloud.addPrereqs`: siblings first, then any topic; never self, a subject, an ancestor, a descendant or a cycle) and stores them as `n.pre`.
- **Locked, but open.** A topic still waiting on a prerequisite (`IkoCloud.lockedBy`) stays visible and learnable: lessons, answers and time all count. It shows a quiet, italic "after X" (path list, branches list, holder note "Best after X. You can explore it now; it completes once that's done.", hub state line, and "After X" on the card). Ranking moves it behind unlocked topics (`PLAN.locked = 2` off its rank score), so the next suggested step is unlocked.
- **The gate (`IkoCloud.completable`).** A topic reaches done (Tinted) and Achieved only once its prerequisites are done **and**, when it has core children, enough of them are done: `GATE = { share: 0.5, min: 2 }` (1 of 1, 2 of 2, 2 of 4, 3 of 5). Side paths and dotted suggestions with no role never count. Leaf topics complete as before (mastered, 2 right answers, or "I've got it"). Completion already recorded (`doneAt`, `achievedAt`) is kept for good; answers given while a topic waited still count once it unlocks. A cycle that slipped in never completes until cut (and is cut on load).


### Tiers (v8)

A card's tier is its rarity, derived from the same data (no new counters), and never goes down (the deck keeps the best, `tb`):

| Tier | When | Colour stage at least |
| --- | --- | --- |
| Sketch | nothing confirmed yet | 0 (sepia, the plate slightly greyed) |
| Inked | 1 confirmation (a right answer or "I've got it") | 1 |
| Tinted | completed (`isDone`: mastered, or 2 right answers) | 2 |
| Achieved | completed and 3 right answers (`ACHIEVE_RIGHT`), or its branch ended | 4 (full colour) |
| Merged I, II, III ... | it has absorbed completed subtopics (`ml` > 0) | 4 |

Rarity is shown without icons: frame weight (hairline, soft, hue-coloured, double ink, triple ink), paper texture that thickens by tier, the plate set into the corner (a hue-ink offset from Achieved, a double rule when Merged), corner pips (`pipsFor(tier, level)` = tier + merge levels beyond I, max 6), a hairline along the bottom showing progress to the next tier (`tierProgress`), and a faint sheen only on Achieved and Merged cards. `growthOf` returns `tier`, `tierKey`, `tierName`, `level`, `progress`, plus `achieved` (tier >= 3) and `ended` (the branch-terminal flag that used to be `achieved`).

**The evolution transition.** `IkoDeck.evolveKey(spec)` = tier·1000 + stage·100 + level, a number that only rises. The app keeps the last key it showed per card (`ikolearn.v1.seen`); when a card renders with a higher key it gets `evolve` (an ink wash bleeds out from the plate as a growing circular clip, the plate's grey filter lifts, and the sheen passes once), `tier-up` and, for a new merge level, `merged-up` (a ring that gathers in). The first sighting only records. `prefers-reduced-motion` shows the final state with no motion. The holder only rebuilds its card when the spec changed, so a redraw in the same turn can't cut a transition short.

### Merging (v8, stricter in v9)

Completed subtopic cards combine into a higher-valued parent card. Pure, deterministic and idempotent, 0 calls.

- **Data.** `child.absorbedInto = parentId`, `parent.absorbed = [childIds]`, `parent.ml` (merge level, I, II, III ...), `parent.mergedAt`, and an event log (`cloud.events`, newest last, capped at 120: `{ t, k: "merge", id, lv, ids, why }`). The parent's deck entry keeps the corpus as `[[id, label]]`, so a child's label survives even if its topic is later removed. Children are never deleted; they stay on the cloud and in the deck data.
- **Transition.** `IkoCloud.mergeInto(cloud, pid, ids, t, why)` absorbs only real, unabsorbed children of `pid`; with none left it returns `null` and changes nothing (applying a plan twice merges once). Each successful call raises the level by one.
- **When (the orchestrator, `IkoPlan.mergePlan`, v9).** `MERGE = { share: 0.75, min: 2, batch: 2 }`. *Form*: the parent is Achieved itself **and** its core is sufficiently complete: at least 75% of its core children done and at least 2 (2 of 2, 3 of 4, 4 of 5); every completed child not yet absorbed joins. *Upgrade*: a merged parent takes the next batch once 2 more children are completed, or the last ones that complete its whole core sequence. A passed test no longer merges on its own; when it coincides with a merge (`tests[pid].passAt > mergedAt`), the merge is marked `why: "test"`. Merges are never undone: levels and absorbed links only grow, and merges formed under the older, looser rule (v8: 3 Achieved children) are kept. `settleMerges` re-plans after each merge, deepest first, so a child merges its own subtopics and then counts for its parent in the same pass. It runs after an answer, "I've got it", a lesson's children landing, a test, and on load. The message stays quiet ("X, Y merged into P. It's a Merged I card now, holding them all.").
- **Shown.** The parent is always in the deck, as a Merged card with "Holds N cards"; absorbed cards leave the deck grid and appear in its **corpus** (a fold under the card in the deck, and under the holder card), each still openable. On the cloud the parent is larger (×(1 + 0.16·level)) with one ring per level; absorbed children are drawn smaller with quieter labels and laid out in a tighter constellation (0.45 of the usual distance). Draw and the deck weights skip absorbed cards (their parent stands for them).

### Landscapes

`IkoDeck.landscape(id, detail)` lays out one scene per topic from a generator seeded by the id: 3-4 ridges, sometimes water with ripples, a sun, trees or birds. Every detail level shows the same scene with more of its marks (the first marks never move), so a card visibly fills in. Drawn as SVG through DOM calls; tinted towards the chain hue with the card's colour. Nothing is generated by a model.

### The holder

Picking a card animates it (a 520 ms slide from where it was tapped) into the holder: a tray on the left with the full card at 1280 px, a slim card docked under the header on phones. The lesson and its questions sit beside or below it. With reduced motion the card simply appears.

### Questions

The lesson call's hidden block brings 1-2 multiple-choice questions (`{q, options, answer}`), which the server validates (2-4 different options, the right one kept) and reorders by a hash of the question, so the answer isn't always first. They are radio groups; the first answer to each counts (`confirm`: a right answer adds colour, a wrong one shows the right option and still counts as use). Answers are stored with the cached lesson.

### The top 10 and ranking

- `IkoRank.top(cloud)` ranks topics by heat: points for opens (also re-opens), minutes, right and wrong answers, "I've got it", "Still tricky", tests, cards and chat, halving every 14 days (`HEAT`, `heatNow`). It lives on the device, for one learner.
- Three built-in sources, each scaled to its best, weighted and summed: `local` (weight 1, the learner's own use), `chain` (0.5: half of a topic's descendants' heat goes to its ancestors, so a busy chain lifts its parents), and `model` (0.35: the importance score the creation call gave each child as a next step in its topic). `model` is a prior: it orders children and suggestions, but only topics the learner has used can enter the top 10. Scores made before the learner changed their age band or region count half until new ones arrive (`impAt < profile.changedAt`). Nothing is ever hidden by a low score.
- `IkoRank.scores` gives every topic a score (ghosts too), `order(cloud, ids)` sorts by it, and `chains(cloud)` lists the busiest chains (shown under the top 10).
- Sources are pluggable: `IkoRank.register({ name, weight, prior, scores(cloud, now) -> { topicKey: score } })`; keys not on the map are skipped. A server source (topics popular across learners, a class's focus) plugs in without changing the draw.
- It is shown as a quiet "Your top 10" list under the deck. In the draw it is a modest nudge: x `1 + 0.3*boost` on a card's weight, and a top card is due back from review a little sooner by the same factor. `boost` is 1 for the top topic, falling by a tenth per rank. Topics outside the top 10 get no nudge. In the simulated year below with three favourite Math topics, the favourites come up about a fifth more often than the other Math cards and Math still gets about a third of the draws. When a branch ends, a nearby top-10 topic is suggested first. Suggestions and fork choices in the top 10 come first and say so ("In your top 10 · ...").

## The album and the card hub

- **Uniform cards.** Every card (holder, suggestions, album, hub, corpus) is one shape: `aspect-ratio: 5 / 7` (a 2.5 x 3.5 in trading card), plate on top (3:2), then title, chain, and the tier mark with pips. Titles clamp to 2 lines, the chain to 1 (ellipsis), descriptions to a fixed number of lines, so text never changes a card's size. Each card is a size container (`container-type: inline-size`), so type in `cqi` units scales with the card's own width.
- **Covered vs uncovered is derived, not stored** (`IkoDeck.coverage`): covered = merged into a parent, Tinted or higher, or `C.isDone` ("I've got it", 2+ right answers, mastered, branch ended); in progress = any confirmation, a deck card, or opened / engaged / time spent; uncovered = the rest (ghosts read "Suggested"). Storage stays v8.
- **The album** (`IkoDeck.albumModel`): a binder page per subject (its hue), a row per branch (a topic directly under the subject) led by the branch's own card (merged parents at 2 x 2 slots), then its deck cards by rarity, then dashed outline slots for known topics not yet collected (capped at 6, the rest "+N more"). Each page shows "covered of known".
- **The hub** (tap any album card, slot, holder card, or "Open its card" on the cloud): the large card, its chain as links up, Start / Continue / Review the lesson, the test when ready, See it on your cloud, and its branches with a covered / in-progress / not-started marker, each opening its own hub or starting its lesson. Back returns where you came from (deck, cloud, chat, or the card above).
- **"Make a card" is gone from the panel.** It was a v1 action: one model call (`/card`) that wrote a short note card (title + up to 700 chars) onto the topic's `cloud.cards`, shown in chat and under the panel. It never touched the deck. The panel button is now "Open its card" (the hub, 0 calls); the one-call note survives as "Save a note on X" under chat replies.

## The camera pivot

The cloud turns about a pivot `P` (the origin, or the focused node). A point is drawn at `centre + pan + zoom·s·persp(R(p − P))`, so `P` itself always lands at `centre + pan` whatever the yaw and pitch: once a node is the pivot, turning orbits it and it stays put. Focusing is therefore simple: `pivot = node`, `pan = target − centre`, zoom from `fitAround` (the node's children mirrored about it, so the far side decides). The tween eases yaw (shortest arc), zoom (log space), pan and the pivot (straight line) together. Recentre tweens the pivot back to the origin. The pivot is saved with the view. On phones the target is the middle of the strip above the open sheet (`focusFrame`), and the sheet growing (its note streaming in) re-frames it for a few seconds.

## Motion

CSS only (no libraries): press feedback (`:active` scale, hover lift with a drop-shadow so the tier frames are untouched), views slide in, album pages turn in with staggered slots, the hub's card lifts from where it was tapped (FLIP with the Web Animations API), the cloud's sheet slides up. Everything is off under `prefers-reduced-motion`.

## Polish: the mini-Deck, the idle spin, newcomer tips, further reading

- **The mini-Deck** (header, beside the cloud thumbnail): a small fanned stack of the learner's three best cards (highest `IkoDeck.evolveKey` first: tier, then colour, then merge level), each drawn with its own landscape plate, with the card count. It drifts gently, and gives one soft pulse when a card joins the deck or rises. Tapping it opens the album. With no cards it is an empty dashed slot (still a way into the album). Still under `prefers-reduced-motion`. On phones it replaces the "Your deck" link; on wide screens the link stays beside it.
- **The idle spin** (big cloud): about one turn every two minutes (`IkoCamera.SPIN`), only while the cloud is open, no panel is open and the tab is visible. Any pointer (even hovering), wheel, key or focus glide pauses it; it resumes after 4 s idle (`IkoCamera.spinState`, pure and tested). Off with reduced motion. The spun angle is not saved as the learner's view.
- **Newcomer tips**: three, each shown once at its moment and dismissible ("Got it"), remembered in `ikolearn.v1.seen` as `h: { cloud, card, deck }` (a UI key, not the cloud; Start over clears it). "Tap a branch and the cloud grows with you." takes the place of the cloud's controls line until dismissed (or a branch is tapped). "Pick or draw a card to open a short lesson." sits above the suggested cards (retired once a card is opened). "Cards are achievements: they stay in your Deck and gain colour as you learn." follows once there is a card, in the chat and at the top of the album.
- **Further reading & viewing** (lessons): the lesson's hidden block now carries `reading: [{ title, q, kind: read|watch }]` (0 extra calls). The model gives only titles and search phrases; `parseReading` (server) and `IkoLesson.cleanReading` (device, also for cached lessons) drop anything that looks like a link. The device builds links only to an allowlist of search pages (`IkoLesson.SEARCH`): Wikipedia search, Khan Academy search, Open Library search, and for things to watch a video search with SafeSearch on, limited to YouTube (`google.com/search?tbm=vid&safe=active`; YouTube's own search has no safe-search setting in its address). The phrase is URL-encoded, every link is labelled "Search ...", opens in a new tab (`noopener noreferrer nofollow`), and no model URL is ever rendered. Collapsed by default; cached with the lesson.
- **After Skip** the waiting message is the only invitation (the "Begin" panel under it is hidden).

## Suggestions, Draw and the orchestrator

`IkoPlan` (`orchestrator.js`) reads the cloud, the deck, completion and ranking and decides what to surface. It makes no calls and doesn't replace the model: it only builds the choices and the prompt context (`lessonContext`: the chain, the steps ahead, finished siblings).

- **Suggestions** (`suggest`, 3 cards) show at session start, and again whenever the learner comes back to the Deck or the cloud. In order: a Test that's ready; the next step in the busiest recent chain (last 10 days); a card from the deck draw; something new from a quiet subject (always kept last). The non-test ones are sorted by rank, top-10 ones first. A new learner gets first steps from different subjects. Each has a short why line.
- **Draw** (`draw`) picks one card with the balanced deck draw (below), skipping the card already in the holder, falls back to the best suggestion, slides it into the left holder and opens its lesson straight away.
- There is always an obvious next step: the suggestions, Draw a card, Continue (the active lesson, `cloud.active`) and Your cloud. On the cloud the same choices sit in a small bar.
- **Children** (`wantChildren`, `childrenReady`): a topic is engaged after 1 right answer, 2 visits, or 120 s. Only then do its pending children grow. Within a parent, children are ordered by rank (use, chain, the model's score) plus a bonus for their logical position (`orderWeight` 0.6 x how early it comes), and +0.2 once explored (`orderedChildren`). So the logical order leads when scores are close, a much more important or much-used child moves up, and the first is marked "start here". Other branches are suggested only after the current branch ends.
- **Grow and ask items**: after a ready Test, a "What comes next in X?" item (`grow`) can lead the suggestions; the light re-ask takes the last slot when due. Draw skips both, so it never spends a call.
- **Tests** (`testState`): a Test is ready (and its diamond test node appears on the cloud, off its parent) once the parent's core children are sufficiently complete: at least half of them and at least 2 (`PLAN.test = { share: 0.5, min: 2 }`: 2 of 2, 2 of 4, 3 of 5; side paths never count). After one is taken it is offered again once 2 more children are finished. It's optional. It is shown as a Test card first in the suggestions, a dashed diamond beside the parent on the cloud ("Test", filled once taken), and "Take the test" in the panel. `/api/ikolearn/test` is one structured call with 5 questions built only from the finished material (the parent if opened, plus finished children with their card lines, up to 8). Fewer than 2 pieces of material answer 422 with no call. Each answer is checked against its topic; a right answer adds colour to that card (`recordTest`). Any attempt strengthens the parent (weight + 0.5, test heat); a pass (60%+) adds 2 confirmations and mastery to the parent.
- Thresholds live in `IkoPlan.PLAN`.

## The deck and the balanced draw

- `node.deck` entries live in `cloud.deck` and are never removed, even if the topic is later pruned (deck topics are never pruned).
- Each Draw uses `drawSession` (3 weighted picks; the first one not in the holder is taken) and logs it in `cloud.draws` (rolling 366 days, at most 3000 entries). The old automatic draw on each visit is replaced by the suggestions.
- How the balancing works: each card gets a weight, and cards are sampled without replacement from a generator seeded by the day, session count and name, so a draw is repeatable and needs no call.
  - Balance: `(target + 0.05) / (share + 0.05)`, where `share` is the subject's share of this year's draws and `target` is an even split across the subjects in the deck. Under-drawn subjects rise, over-drawn ones fall.
  - Fairness inside a subject: x `1 / cards in that subject`, so a subject with eight cards doesn't crowd out one with a single card.
  - Spaced review: x `0.35 + min(3, days since last drawn / interval)`, where the interval grows with the stage (1, 2, 4, 7, 14 days). Young cards come back sooner.
  - x 1.5 if the card was "still tricky" in the last 14 days; x 0.05 if it was already drawn today; x `1 + 0.3*boost` for the top 10.
  - After a pick, the other cards of the same subject drop to 0.3x, so one draw rarely holds two cards from the same subject.
- In a simulated year (8 Math, 2 Science, 1 Art, 1 Reading card), Math gets about a third of the draws instead of the two thirds a plain shuffle would give; the other subjects get 21-24% each. `balance(cloud, day)` reports the shares, shown under the deck.

## Forks

- Every lesson ends with 2 or 3 choices (`choices: [{name, kind, why}]`): `next` (the planned next step, sent as `ahead`), `deeper` (a smaller topic inside this one), and an optional `side` (a nearby topic). Each has a short reason.
- `applyChoices` places them in the tree (deeper under the node, the others beside it, reusing existing topics) and stores `node.fork = {ids, why, picked, at}`. Picking one records it; `nextFor` follows the pick first.
- A branch ends (`isTerminal`) when the topic was marked as an end and is known, or when it and every step of its path are known. Only then does the lesson show "This branch is done" with other branches (`otherBranches`: steps and children of the topics above, and one topic from the least-visited subject). Suggestions elsewhere were removed: the chat adds ghost topics only when asked what else to learn, and the tap note no longer lists topics to try.

## Storage

- `ikolearn.v1.name`, `.cloud`, `.thread`, `.notes`, `.lessons`, `.tests` (cached test questions per parent, until taken) in `localStorage`. The server keeps nothing.
- The cloud is stored in a compact v7 format: one array per node
  `[id, label, parent, flags, weight*10, mastery*100, born(s), touched(s), hue, struggle(s), spent(s), engaged]`, plus `[correct, heat*100, heated(s), blurb, achieved(s)]` and then v5's `[pending ? [stepNames, next] : 0, done(s)]`, only on nodes that have them
  (flags: 1 ghost, 2 opened, 4 branch ends), paths as `{ id: [stepIds, next, at] }`, plus cards, forks (`f`), the deck (`k`: `[id, label, subject, hue, joined(s), best stage, chain, blurb, achieved(s)]`), the draw log (`g`), the session count (`ss`), and v5's tests (`t`: `{ parentId: [at(s), finished children then, best*100, attempts, offered(s)] }`), the last suggestions (`sg`) and the active lesson (`fl`). v6 adds per node `[importance*100 or -1, made(s), goal, asked]` and v7 `[role 0/1 core/2 optional, off step id, made by a creation call, bridged(s), absorbedInto, absorbed ids]` and the profile (`pr`: `[age band, region, region guessed 1/0, interests, onboarded(s), asked(s), visits, lesson visit, changed(s)]`). A fresh cloud is about 1.9 KB; a full 600-node cloud stays under 60 KB.
- v8 adds per node `[merge level, merged(s), repaired(s)]`, per deck entry `[best tier, merge level, absorbed into, corpus [[id, label]]]` (only when set), per test the last pass (`passAt`), and the event log (`ev`: `[[t(s), kind, id, level, ids, why]]`). v7 saves load with these empty, then merges settle from existing progress. Also in `localStorage`: `ikolearn.v1.view` (the big cloud's camera and focused node, restored next time) and `ikolearn.v1.seen` (the last evolve key shown per card); Start over clears both.
- v9 adds per node `[prerequisite ids]` (slot 32, only when set; at most 3). v8 and older saves load with no prerequisites, and their completion is first stamped with the old rules (the gate is off while an older save settles), so nothing earned is lost: done and Achieved times, deck tiers and merges are all kept. Prerequisites are re-checked on load (live ids only, never self, an ancestor, a descendant or a cycle).
- v1 to v4 clouds are migrated on load without loss (every id, label, parent, ghost flag, weight, mastery, time, card, fork, path, deck entry and draw kept); no seed topics are added any more. v2 topics with enough time join the deck straight away. v3 cards keep the stage they had reached; one whose branch had already ended becomes Achieved. v4 clouds get the Computer Science subject, with clearly-CS topics moved there from Making & Coding (ids, cards, paths and forks kept), and finished deck topics get a done time. v5 and older clouds also lose the old starter seeds the learner never touched (`pruneSeeds`): a seeded topic goes only if it was never opened, has no time, answers, card, deck entry, heat, path pick or test, and nothing of theirs under it, and it isn't a remaining step on the path of a topic they worked on. Seeded subjects go once empty and never strengthened. Learned or engaged topics, and everything the learner made, are never removed. v6 and older clouds get roles on load: each path's steps become core, other children keep no role (counted and shown as before), no side paths are invented. New fields go at the end of the row so older rows still load.

## Rendering at depth

Each level is drawn at 0.6x the size of the one above and zoom goes to 60x, so a branch can keep opening. Selecting a node focuses its branch (ancestors plus two levels below). Labels fade in by how big a node reads at the current zoom, sit on a paper-coloured halo so they stay readable over edges, and carry the merge level; at most 260 points are drawn, with collision-avoiding labels.

### The camera (`public/ikolearn/camera.js`, pure, tested in Node)

- **Input map** (`gestureFor`): one finger or left-drag pans; right-drag, Shift-drag or a two-finger twist turns; pinch or the wheel zooms. One faint line under the controls documents it (`hint(coarse)`, touch or mouse wording). Recentre eases back to the whole cloud.
- **Focus.** Tapping a point animates the camera over 650 ms with `easeInOutCubic`: zoom interpolated in log space (each doubling takes the same time), pan linearly, yaw by the shortest arc (`wrap`). The target yaw brings the node to the front: `forwardYaw = atan2(-x, -z)` gives x' = 0 and z' = -r in the view's rotation. The target zoom frames the node and its children (`fitZoom` on their screen box measured at zoom 1, since offsets scale linearly with zoom), bounded so the node's level stays legible.
- **Inertia.** Pan velocity is an exponential moving average of pointer samples; on release it glides with exact exponential decay, v(t) = v₀·e^(−t/τ), distance v₀·τ·(1 − e^(−t/τ)), τ = 260 ms, so it is frame-rate independent.
- **Zoom.** `zoomAbout` keeps the point under the cursor fixed; one wheel event is a capped factor (0.82 to 1.22), so zoom stays deliberate; the buttons animate over 220 ms.
- The view (yaw, pitch, zoom, pan, focus) is reported through `onView` (debounced) and persisted.

## Provider failures and the examples cache

- **One log line per failed attempt** (both adapters, every route): `{"ev":"ikolearn.llm_fail","route","provider","model","status","code","error","attempt","try"}` via `console.warn`, so it shows in Vercel's runtime logs. `status` is the provider's HTTP status (null for a network error), `error` the provider's own error code and message, redacted (the configured key and anything key-shaped become `[key]`) and cut to 200 characters. Never the key, never prompt text.
- **Examples retry once** on a 5xx or a network error only (never a 4xx, a 429, a timeout or an unusable reply), after a jittered 400-800 ms, while the per-instance daily attempt cap (3) and the shared budget allow, and only if enough of the route's 30 s is left (`EXAMPLES_RETRY`).
- **One shared list:** a success carries `Cache-Control: public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400` and `Vercel-CDN-Cache-Control: max-age=86400, stale-while-revalidate=86400`, so Vercel's CDN shares it across instances and serves it stale while it refreshes. Failures are `no-store` on all three headers. There is no built-in fallback list: a failure still shows the retry state.

## Swapping the model provider

Nothing outside the adapters knows which provider answers: prompts are plain text, schemas are plain JSON Schema, and the hidden blocks (`<<<CLOUD … CLOUD>>>`, `<<<PATH … PATH>>>`) are written by the model as text, so they are parsed the same way for every provider. The provider is chosen only by env vars on the server:

| Env var | What it is |
| --- | --- |
| `IKOLEARN_LLM_PROVIDER` | `gemini` (the default when unset) or `openai-compatible` |
| `IKOLEARN_LLM_API_KEY` | The provider's key. For `gemini`, `GEMINI_API_KEY` is used when this is unset. |
| `IKOLEARN_LLM_BASE_URL` | The API base (https). Required for `openai-compatible`. |
| `IKOLEARN_LLM_MODEL` | The model name. Required for `openai-compatible`; for `gemini`, `IKOLEARN_GEMINI_MODEL` still works. |

With none of them set, IkoLearn runs as before: Gemini with `GEMINI_API_KEY`, the default model and one try on its fallback model when the default fails or times out. If a provider is only half set up (a key without a base URL, say), the routes answer "off" and the app falls back to its local answers.

Example: Groq instead of Gemini (set in Vercel, Production; then redeploy):

```
IKOLEARN_LLM_PROVIDER=openai-compatible
IKOLEARN_LLM_API_KEY=<the Groq key>
IKOLEARN_LLM_BASE_URL=https://api.groq.com/openai/v1
IKOLEARN_LLM_MODEL=<a Groq model name>
```

Other bases: `https://api.openai.com/v1`, `https://api.x.ai/v1`, `https://openrouter.ai/api/v1`. To go back, remove the four variables. Check the provider's pricing before switching: only Gemini's free tier is set up today. The privacy page and the footer name Gemini, so update them with a swap.

Timeouts are plain: a request that hasn't started answering in 20 s (the whole answer, for the one-shot JSON calls) gives up; Gemini then tries its fallback model once, and if that fails too the app answers locally. A streamed reply is capped at 38 s, so a timeout plus the fallback still ends inside the routes' 60 s.

## Deploying

Production deploys come from a clean temp clone with the Vercel CLI, never from this working copy, and nothing is linked or pulled, so no `.env.local` is ever created:

```
bash scripts/deploy-ikosagon-prod.sh <full commit sha>            # deploys that commit to production
DRY_RUN=1 bash scripts/deploy-ikosagon-prod.sh <full commit sha>  # checks everything, deploys nothing
```

The script clones the repo into a temp folder, checks out the sha, writes no `.vercel` or env files, sets `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` (defaults are our team and project; override them in the environment), refuses to go on if any `.env*` file other than `.env.example` is there, runs `vercel deploy --prod --yes`, and deletes the clone on exit. Env vars stay in Vercel. Never run `vercel link`, `vercel env pull` or `vercel dev` here: they write `.env.local` with secrets. `.gitignore` ignores `.env*` (except `.env.example`) as a second guard.

## Privacy and cost

- Free tier only, our key stays on the server. Guards: 8 calls/min and 90/hour per IP, 30/min overall, and a daily cap
  (`IKOLEARN_DAILY_CALLS`, default 400, max 1000, per server instance). Lesson and path calls count like the others. Model override: `IKOLEARN_GEMINI_MODEL`.
- The examples set is the only cached answer: generic, no learner data, ~1 call a day (at most 3 per instance per day), served from the CDN.
- When a call fails, the app answers locally and keeps the path usable instead of showing an error.

## Extension notes

- **Time and engagement.** Nodes keep `spent` (seconds with the lesson open, `track`), `engaged` (lesson opens and answers), `mastery`, `opened`, `end` and their cards. `activity(cloud, id)` returns all of it in one place, so evolving cards or a deck can read it without new storage.
- **Colour.** All colour comes from `hueOf`/`colorOf`/`evolveColor` in the model; the view and the cards call these rather than derive their own.
- **Ranking.** Register another `IkoRank` source for a shared or server-side top 10; the draw and suggestions already read the mixed ranking.
- **Branching choices.** A path is an ordered list of step ids plus a pick (`node.path = {ids, next, at}`); a fork is `node.fork = {ids, why, picked, at}`; a node can mark its branch as ended.
- **The draw.** Weights are one function (`IkoDeck.weigh`); new signals (time of year, goals) multiply in there.
- **The orchestrator.** Rules and thresholds are in `IkoPlan.PLAN` and a few small functions; a server-side planner could replace `suggest` with the same output shape.
- **Accounts and sync.** Everything goes through `save()`/`load()` in `app.js` and `serialize`/`deserialize`. Swap that pair for a server store when we add sign-in.
- **Another model.** Set the env vars above. For a provider that isn't OpenAI-compatible, add one adapter next to `gemini.ts` and a branch in `llmConfig`.
- **New prompt roles.** Add a system builder and schema in `prompts.ts`, a handler in `service.ts`, and a thin route.

## Speed: the streamed first build

The first build (`/create`, kinds `start` and `more`) asks for `stream: true` and gets NDJSON: `{t:"item",item}` as soon as
each parent is written and valid (`completeItems` + `createItems`, the same rules as `parseCreate`, prefix-safe), then
`{t:"done",kind,items}` or `{t:"error",reason}`. The app puts each parent on the cloud as it arrives (`cloudBuilder`,
380 ms beats) and shows quiet placeholders until then. Measured on the free tier (same input): the first parent at
~1.7-2.7 s instead of nothing until ~4.3-5 s. Streams give up on a silent provider after 12 s (`requestTimeoutMs`) and
try the fallback model, instead of 20 s. Thinking is already minimal on these models (no thought tokens measured).

## Cards: colour and motifs

A card's hue is always its node's hue on the cloud (`toneOf`); it starts quiet and sepia-toned and reaches the node's
own tone when achieved. The creation call picks a `motif` per topic from a fixed vocabulary (`MOTIFS`, ~40 words, the
same list in prompts.ts, cloud-model.js and deck.js); the device draws it in the plate, placed by a seed from the node
id. Topics without one get a keyword match on the title or chain, else the plain scene. Motifs are stored in an
optional `mo` map, so storage stays v9.

## The lesson flow: confirm locally, clarify on purpose, choose where next

- **I've got it** is confirmed on the device (0 calls): progress is marked, a short "That's it." note shows, and the
  learner stays on the lesson. Nothing opens by itself.
- **Still tricky** stays on the topic and offers three prepared clarifications: *Explain it more simply*, *Show me a
  worked example*, *Ask me a question*. Each is one streamed `/chat` call with `mode: "clarify"` (`clarify`:
  `simpler | example | question`, plus the start of the lesson as `lesson`), answered inline and kept with the lesson,
  so asking again is 0 calls. No hidden block: nothing lands on the cloud.
- **Where Next** is in every lesson (`IkoPlan.whereNext`, 0 calls): the logical next step first (fork pick, best child,
  else the walk up the tree), highlighted and pre-selected, then up to 3 other topics in progress, most recent first.
  Tapping an option selects it; *Open* goes there. The selected topic's card is drawn on the device.
- **Only new content calls the model**: a node tap never writes a note by itself ("What do you notice here?" asks for
  it), and the note is cached per topic and stage, not per cloud revision.
- **Cancel on navigation**: the note, the bridge and its repair, and a lesson or clarification that is no longer on
  screen carry an `AbortController` signal and are cancelled when the learner moves on; the server then stops the
  model's reply too (the NDJSON stream's cancel aborts the upstream request). A cancelled call is never shown as a
  failure. While something else is being written, a lesson, test, note or clarification waits its turn and starts by
  itself; "Try again" appears only on a real generation failure.
- **Hedged fallback** (streams): when the primary model hasn't started after 6 s (`hedgeAfterMs`), the fallback starts
  in parallel; whichever streams first is used and the other is aborted. It costs one call from the daily budget
  (`budgetSpend`) and only happens on a stall; with no budget left, the old order holds (primary until 12 s, then the
  fallback). Each hedge logs one `ikolearn.llm_hedge` line (route, models, `afterMs`, `winner`; no key, no prompt).

Browser checks for all of this, with every call mocked: `IKOLEARN_PW=<playwright-core folder> node scripts/ikolearn-flow-e2e.mjs`.
