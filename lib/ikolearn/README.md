# IkoLearn v2: lessons, cards and the deck

A learning companion with a visible, evolving learning profile: a point cloud centred on the learner's first name that grows into a tree of topics.
Tapping a card or a topic opens a short lesson; every topic can map an ordered path of smaller topics, one level at a time, as deep as the learner goes.
Topics the learner spends time with become cards: sepia at first, gaining colour as they grow, and kept in their deck for good. Each visit draws a few cards from the deck, balanced over the year.
Static client in `public/ikolearn/`, five small server routes in `app/api/ikolearn/`, Gemini (free tier) behind them.
Unlisted and noindexed while we test with one learner.

## Files

| Piece | File | What it does |
| --- | --- | --- |
| Prompts | `lib/ikolearn/prompts.ts` | Input cleaning, the roles (companion / noticing, card, adjacent, lesson, path), the hidden-block rules, response schemas, parsing, and the streaming block splitter. No UI or network code. |
| Model adapter | `lib/ikolearn/gemini.ts` | The only file that knows Gemini: streaming (`streamGenerateContent?alt=sse`) and structured JSON (`generateContent` + `responseSchema`), timeouts, fallback model, error codes. |
| Service | `lib/ikolearn/service.ts` | Route logic with injectable `fetch`: origin/size/input checks, per-IP rate limit, daily call budget, NDJSON event stream, chat / lesson / card / adjacent / path handlers. |
| Routes | `app/api/ikolearn/{chat,lesson,card,adjacent,path}/route.ts` | Thin wrappers around the service. All go through the same `prepare()` guards and budget. |
| Cloud model | `public/ikolearn/cloud-model.js` | Pure data: the recursive topic tree, starters (Math seeded deeper), growth/merge, paths, next topic, lesson engagement, summary for prompts, colours, 3D layout, compact storage and migration. Runs in the browser and in Node tests. |
| Cloud view | `public/ikolearn/cloud-view.js` | Canvas 2D projection of the 3D points: rotate, pan, zoom, focus a branch, depth- and zoom-aware labels, a draw cap. |
| Deck | `public/ikolearn/deck.js` | Procedural card art (deterministic from the topic id and stage), the card renderer, and the balanced session draw. Pure apart from `render`, which takes a `document`. |
| Lesson | `public/ikolearn/lesson.js` | Parses the tagged lesson text (also while it streams) and renders it with text nodes only. |
| App | `public/ikolearn/app.js`, `index.html`, `styles.css` | Chat, cards, lesson view, panel, persistence (localStorage), fallbacks. |
| Tests | `scripts/ikolearn-check.mjs` | `npm run check:ikolearn`: mocked, no network, no key. `scripts/fixtures/ikolearn-cloud-v1.json` and `-v2.json` are saved clouds for the migration tests. |

## The tree

- Every node has a stable id (`n1`, `n2`, ... never reused), a `parent` (null for a subject) and therefore a path from its subject (`trail`: "Math > Addition > Number Bonds"). There is no depth limit.
- Subjects keep their own hue; every level below is a shade of it (`hueOf`, `colorOf`). Ghosts (dotted) are ideas not explored yet.
- Topics match existing nodes by a normalised key (case, plurals, `&`/`and`). A new topic may land under any existing topic; otherwise under a subject (aliases like maths -> Math), or a new subject (cap 12).
- Caps keep it light: 600 nodes, 16 children and 6 ghosts per node, 6 steps per path. When room is needed, the oldest free ghost leaf goes first; nodes with children, on a path, or with cards are never pruned.
- Math is the worked example: Counting, Number Sense, Addition, Subtraction, Multiplication, Fractions in order, with a few seeded levels below. Everything else uses the same subject-agnostic code.

## Lessons, paths and the next topic

1. Tapping a card, or "Start a lesson" on a topic, opens a lesson (`/api/ikolearn/lesson`, one streamed call). The model writes tagged lines (INTRO, STEP x3-5, EXAMPLE, CHECK, ANSWER, NEXT); `lesson.js` renders them as they arrive.
2. The same call ends with a hidden `<<<PATH {"steps":[...],"next":"...","choices":[...],"end":false} PATH>>>` block. The server holds it back and sends a `path` event. No extra call. Steps are asked for only when the topic has no path yet; the fork choices come every time.
3. `applyPath` turns the steps into ghost children in learning order, reusing existing children (and anything already inside this branch). Topics that already live elsewhere on the map stay where they are.
4. The next topic is chosen locally (`nextFor`): the path's pick if not done, else the first unfinished step, else the next step further up the tree. It is shown as a dotted ring on the cloud, "next" on "Your path", and "Next up" after a lesson.
5. Reading a lesson nudges mastery a little; "I've got it" marks it strong (mastery >= 0.6) and moves to the next step; "Still tricky" is remembered gently.
6. "Map a path for X" (`/api/ikolearn/path`, one structured call) maps the next level on demand. The model may answer that a topic is small enough to end the branch (`end`); `markEnd` records it and `nextFor` moves on.
7. After a lesson the learner picks where to go next (see Forks). Other branches are suggested only once a branch ends.
8. Lessons are cached per node in `localStorage` (newest 30), so reopening costs nothing. "Write a fresh version" asks again.

### Gemini calls per action

| Action | Calls |
| --- | --- |
| Chat message | 1 |
| Tap a node on the cloud (first time, or after the cloud changed) | 1 (note cached per node) |
| Opening a node from a path or lesson | 0 (note on request) |
| Make a card | 1 (includes its path) |
| Related topics (shown once a branch ends) | 1 |
| Map a path | 1 |
| New lesson | 1 (includes the fork choices, and the path if none yet) |
| Picking a fork choice | 0 (+1 if that lesson isn't cached) |
| Cached lesson, "I've got it", "Still tricky", other branches at a branch end | 0 |
| Card growth, the deck, the session draw | 0 (all on the device) |

## Cards and growth

- A topic's growth score is `spent/60 + 2*engaged + 4*mastery + min(cards, 3)`: minutes with the lesson open, lesson opens and answers, how well it's known, and cards made (`growthOf`).
- Stages at scores 0, 3, 8, 16, 30: New, Warming up, Growing, Bright, Full colour. A topic joins the deck at 3. The best stage reached is kept, so a card never fades.
- Colour comes from one place, `evolveColor(hue, stage)` in the model: the hue moves from sepia (34) to the subject's own shade, saturation 20 to 72, lightness 36 to 60. `cardColor` applies it to a node.
- Art is procedural and deterministic from the topic id (`IkoDeck.design`): one of six line patterns (dots, hatch, rings, waves, grid, rays) laid out by a seeded generator. Higher stages draw more of the same marks, heavier and less faded, then add a wash and an inner border. Paper card with a folded corner, no icons.
- Subjects and ghosts never become cards. When a card grows, the lesson says so in one line ("Your Fractions card grew: Growing").

## The deck and the session draw

- `node.deck` entries live in `cloud.deck` and are never removed, even if the topic is later pruned (deck topics are never pruned).
- Once per visit per day (`sessionStorage` key `ikolearn.v1.session`), `drawSession` picks 3 cards and logs them in `cloud.draws` (rolling 366 days, at most 3000 entries).
- How the balancing works: each card gets a weight, and cards are sampled without replacement from a generator seeded by the day, session count and name, so a draw is repeatable and needs no call.
  - Balance: `(target + 0.05) / (share + 0.05)`, where `share` is the subject's share of this year's draws and `target` is an even split across the subjects in the deck. Under-drawn subjects rise, over-drawn ones fall.
  - Fairness inside a subject: x `1 / cards in that subject`, so a subject with eight cards doesn't crowd out one with a single card.
  - Spaced review: x `0.35 + min(3, days since last drawn / interval)`, where the interval grows with the stage (1, 2, 4, 7, 14 days). Young cards come back sooner.
  - x 1.5 if the card was "still tricky" in the last 14 days; x 0.05 if it was already drawn today.
  - After a pick, the other cards of the same subject drop to 0.3x, so one draw rarely holds two cards from the same subject.
- In a simulated year (8 Math, 2 Science, 1 Art, 1 Reading card), Math gets about a third of the draws instead of the two thirds a plain shuffle would give; the other subjects get 21-24% each. `balance(cloud, day)` reports the shares, shown under the deck.

## Forks

- Every lesson ends with 2 or 3 choices (`choices: [{name, kind, why}]`): `next` (the planned next step, sent as `ahead`), `deeper` (a smaller topic inside this one), and an optional `side` (a nearby topic). Each has a short reason.
- `applyChoices` places them in the tree (deeper under the node, the others beside it, reusing existing topics) and stores `node.fork = {ids, why, picked, at}`. Picking one records it; `nextFor` follows the pick first.
- A branch ends (`isTerminal`) when the topic was marked as an end and is known, or when it and every step of its path are known. Only then does the lesson show "This branch is done" with other branches (`otherBranches`: steps and children of the topics above, and one topic from the least-visited subject). Suggestions elsewhere were removed: the chat adds ghost topics only when asked what else to learn, and the tap note no longer lists topics to try.

## Storage

- `ikolearn.v1.name`, `.cloud`, `.thread`, `.notes`, `.lessons` in `localStorage`. The server keeps nothing.
- The cloud is stored in a compact v3 format: one array per node
  `[id, label, parent, flags, weight*10, mastery*100, born(s), touched(s), hue, struggle(s), spent(s), engaged]`
  (flags: 1 ghost, 2 opened, 4 branch ends), paths as `{ id: [stepIds, next, at] }`, plus cards, forks (`f`), the deck (`k`: `[id, label, subject, hue, joined(s), best stage]`), the draw log (`g`) and the session count (`ss`). A fresh cloud is about 1.7 KB; a full 600-node cloud stays under 60 KB.
- `ikolearn.v1.session` in `sessionStorage` holds today's draw for this visit.
- v1 and v2 clouds are migrated on load (v2 topics with enough time spent join the deck straight away) without loss (every id, label, parent, ghost flag, weight, mastery and card kept); missing seed topics arrive as ghosts. New fields go at the end of the row so older rows still load.

## Rendering at depth

Each level is drawn at 0.6x the size of the one above and zoom goes to 60x, so a branch can keep opening. Selecting a node focuses its branch (ancestors plus two levels below). Labels fade in by how big a node reads at the current zoom; at most 260 points are drawn, with collision-avoiding labels.

## Privacy and cost

- Free tier only, our key stays on the server. Guards: 8 calls/min and 90/hour per IP, 30/min overall, and a daily cap
  (`IKOLEARN_DAILY_CALLS`, default 400, max 1000, per server instance). Lesson and path calls count like the others. Model override: `IKOLEARN_GEMINI_MODEL`.
- When a call fails, the app answers locally and keeps the path usable instead of showing an error.

## Extension notes

- **Time and engagement.** Nodes keep `spent` (seconds with the lesson open, `track`), `engaged` (lesson opens and answers), `mastery`, `opened`, `end` and their cards. `activity(cloud, id)` returns all of it in one place, so evolving cards or a deck can read it without new storage.
- **Colour.** All colour comes from `hueOf`/`colorOf`/`evolveColor` in the model; the view and the cards call these rather than derive their own.
- **Branching choices.** A path is an ordered list of step ids plus a pick (`node.path = {ids, next, at}`); a fork is `node.fork = {ids, why, picked, at}`; a node can mark its branch as ended.
- **The draw.** Weights are one function (`IkoDeck.weigh`); new signals (time of year, goals) multiply in there.
- **Accounts and sync.** Everything goes through `save()`/`load()` in `app.js` and `serialize`/`deserialize`. Swap that pair for a server store when we add sign-in.
- **Another model.** Replace `lib/ikolearn/gemini.ts` only; it exposes `streamText` and `generateJson`.
- **New prompt roles.** Add a system builder and schema in `prompts.ts`, a handler in `service.ts`, and a thin route.
