# IkoLearn v2

A learning companion with a visible, evolving learning profile: a point cloud centred on the learner's first name that grows into a tree of topics.
Tapping a card or a topic opens a short lesson; every topic can map an ordered path of smaller topics, one level at a time, as deep as the learner goes.
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
| Lesson | `public/ikolearn/lesson.js` | Parses the tagged lesson text (also while it streams) and renders it with text nodes only. |
| App | `public/ikolearn/app.js`, `index.html`, `styles.css` | Chat, cards, lesson view, panel, persistence (localStorage), fallbacks. |
| Tests | `scripts/ikolearn-check.mjs` | `npm run check:ikolearn`: mocked, no network, no key. `scripts/fixtures/ikolearn-cloud-v1.json` is a saved v1 cloud for the migration test. |

## The tree

- Every node has a stable id (`n1`, `n2`, ... never reused), a `parent` (null for a subject) and therefore a path from its subject (`trail`: "Math > Addition > Number Bonds"). There is no depth limit.
- Subjects keep their own hue; every level below is a shade of it (`hueOf`, `colorOf`). Ghosts (dotted) are ideas not explored yet.
- Topics match existing nodes by a normalised key (case, plurals, `&`/`and`). A new topic may land under any existing topic; otherwise under a subject (aliases like maths -> Math), or a new subject (cap 12).
- Caps keep it light: 600 nodes, 16 children and 6 ghosts per node, 6 steps per path. When room is needed, the oldest free ghost leaf goes first; nodes with children, on a path, or with cards are never pruned.
- Math is the worked example: Counting, Number Sense, Addition, Subtraction, Multiplication, Fractions in order, with a few seeded levels below. Everything else uses the same subject-agnostic code.

## Lessons, paths and the next topic

1. Tapping a card, or "Start a lesson" on a topic, opens a lesson (`/api/ikolearn/lesson`, one streamed call). The model writes tagged lines (INTRO, STEP x3-5, EXAMPLE, CHECK, ANSWER, NEXT); `lesson.js` renders them as they arrive.
2. If the topic has no path yet, the same call ends with a hidden `<<<PATH {"steps":[...],"next":"..."} PATH>>>` block. The server holds it back and sends a `path` event. No extra call.
3. `applyPath` turns the steps into ghost children in learning order, reusing existing children (and anything already inside this branch). Topics that already live elsewhere on the map stay where they are.
4. The next topic is chosen locally (`nextFor`): the path's pick if not done, else the first unfinished step, else the next step further up the tree. It is shown as a dotted ring on the cloud, "next" on "Your path", and "Next up" after a lesson.
5. Reading a lesson nudges mastery a little; "I've got it" marks it strong (mastery >= 0.6) and moves to the next step; "Still tricky" is remembered gently.
6. "Map a path for X" (`/api/ikolearn/path`, one structured call) maps the next level on demand. The model may answer that a topic is small enough to end the branch (`end`); `markEnd` records it and `nextFor` moves on.
7. Lessons are cached per node in `localStorage` (newest 30), so reopening costs nothing. "Write a fresh version" asks again.

### Gemini calls per action

| Action | Calls |
| --- | --- |
| Chat message | 1 |
| Tap a node on the cloud (first time, or after the cloud changed) | 1 (note cached per node) |
| Opening a node from a path or lesson | 0 (note on request) |
| Make a card | 1 (includes its path) |
| Related topics | 1 |
| Map a path | 1 |
| New lesson | 1 (includes the path if none yet) |
| Cached lesson, "I've got it", "Still tricky", next step choice | 0 |

## Storage

- `ikolearn.v1.name`, `.cloud`, `.thread`, `.notes`, `.lessons` in `localStorage`. The server keeps nothing.
- The cloud is stored in a compact v2 format: one array per node
  `[id, label, parent, flags, weight*10, mastery*100, born(s), touched(s), hue, struggle(s), spent(s), engaged]`
  (flags: 1 ghost, 2 opened, 4 branch ends), paths as `{ id: [stepIds, next, at] }`, plus cards. A fresh cloud is about 1.7 KB; a full 600-node cloud stays under 60 KB.
- v1 clouds are migrated on load without loss (every id, label, parent, ghost flag, weight, mastery and card kept); missing seed topics arrive as ghosts. New fields go at the end of the row so older rows still load.

## Rendering at depth

Each level is drawn at 0.6x the size of the one above and zoom goes to 60x, so a branch can keep opening. Selecting a node focuses its branch (ancestors plus two levels below). Labels fade in by how big a node reads at the current zoom; at most 260 points are drawn, with collision-avoiding labels.

## Privacy and cost

- Free tier only, our key stays on the server. Guards: 8 calls/min and 90/hour per IP, 30/min overall, and a daily cap
  (`IKOLEARN_DAILY_CALLS`, default 400, max 1000, per server instance). Lesson and path calls count like the others. Model override: `IKOLEARN_GEMINI_MODEL`.
- When a call fails, the app answers locally and keeps the path usable instead of showing an error.

## Extension notes

- **Time and engagement.** Nodes keep `spent` (seconds with the lesson open, `track`), `engaged` (lesson opens and answers), `mastery`, `opened`, `end` and their cards. `activity(cloud, id)` returns all of it in one place, so evolving cards or a deck can read it without new storage.
- **Colour.** All colour comes from `hueOf`/`colorOf` in the model; the view and any future card designs should call these rather than derive their own.
- **Branching choices.** A path is an ordered list of step ids plus a pick (`node.path = {ids, next, at}`) and a node can mark its branch as ended. Multiple-choice branches can sit on the same structure.
- **Accounts and sync.** Everything goes through `save()`/`load()` in `app.js` and `serialize`/`deserialize`. Swap that pair for a server store when we add sign-in.
- **Another model.** Replace `lib/ikolearn/gemini.ts` only; it exposes `streamText` and `generateJson`.
- **New prompt roles.** Add a system builder and schema in `prompts.ts`, a handler in `service.ts`, and a thin route.
