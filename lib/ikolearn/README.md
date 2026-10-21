# IkoLearn v2: lessons, cards, the deck and the card game

A learning companion with a visible, evolving learning profile: a point cloud centred on the learner's first name that grows into a tree of topics.
Tapping a card or a topic opens a short lesson; every topic can map an ordered path of smaller topics, one level at a time, as deep as the learner goes.
Topics the learner spends time with become collectible cards: an ink-sketch landscape, the topic's chain, a title and one line. They start in sepia, take on their chain's colour as the learner shows what they've learned, and are marked Achieved when the branch is finished. Cards stay in the deck for good. Every visit opens with a few suggested cards and a Draw button; a small on-device orchestrator picks them, balanced over the year and ordered by a living top 10, offers children once a topic is engaged, and offers an optional Test when a branch has enough finished topics.
Static client in `public/ikolearn/`, six small server routes in `app/api/ikolearn/`, Gemini (free tier) behind them by default; the model provider can be swapped with env vars alone (see "Swapping the model provider").
Unlisted and noindexed while we test with one learner.

## Files

| Piece | File | What it does |
| --- | --- | --- |
| Prompts | `lib/ikolearn/prompts.ts` | Input cleaning, the roles (companion / noticing, card, adjacent, lesson, path), the hidden-block rules, response schemas, parsing, and the streaming block splitter. No UI or network code. |
| Model interface | `lib/ikolearn/llm.ts`, `llm-types.ts` | What prompts and the service use: `streamText` and `generateJson`, whatever the provider. Picks the provider from env vars (`llmConfig`). Shared types, limits, timeouts and the SSE reader. |
| Gemini adapter | `lib/ikolearn/gemini.ts` | The default. Streaming (`streamGenerateContent?alt=sse`) and structured JSON (`generateContent` + `responseSchema`), fallback model on 5xx. |
| OpenAI-compatible adapter | `lib/ikolearn/openai-compatible.ts` | `/chat/completions` with SSE streaming and JSON mode, any base URL: OpenAI, Groq, xAI, OpenRouter and similar. |
| Service | `lib/ikolearn/service.ts` | Route logic with injectable `fetch`: origin/size/input checks, per-IP rate limit, daily call budget, NDJSON event stream, chat / lesson / card / adjacent / path handlers. |
| Chains | `lib/ikolearn/chains.ts` | Known chains for common topics ("Sets" in Python: Computer Science → Programming → Python). Fills a chain the model left short. Mirrors `KNOWN_CHAINS` in `cloud-model.js`. |
| Routes | `app/api/ikolearn/{chat,lesson,card,adjacent,path,test}/route.ts` | Thin wrappers around the service. All go through the same `prepare()` guards and budget. |
| Cloud model | `public/ikolearn/cloud-model.js` | Pure data: the recursive topic tree, starters (Math seeded deeper), growth/merge, paths, next topic, lesson engagement, summary for prompts, colours, 3D layout, compact storage and migration. Runs in the browser and in Node tests. |
| Cloud view | `public/ikolearn/cloud-view.js` | Canvas 2D projection of the 3D points: rotate, pan, zoom, focus a branch, depth- and zoom-aware labels, a draw cap. |
| Ranking | `public/ikolearn/rank.js` | The top 10 (`IkoRank`): pluggable score sources (device-local use, chain, a popularity prior), per-topic scores, ordering and busiest chains. Pure, no storage or network. |
| Orchestrator | `public/ikolearn/orchestrator.js` | `IkoPlan`: what to suggest, Draw, when to grow children, when a Test is ready, the context for lesson prompts. Pure, no calls. |
| Deck | `public/ikolearn/deck.js` | Procedural landscapes (deterministic from the topic id, more ink with detail), the card renderer (tile, full, mini), and the balanced session draw. Pure apart from `render`, which takes a `document`. |
| Lesson | `public/ikolearn/lesson.js` | Parses the tagged lesson text (also while it streams) and renders it with text nodes only. |
| App | `public/ikolearn/app.js`, `index.html`, `styles.css` | Chat, cards, the card holder and lesson, questions, the top 10, panel, persistence (localStorage), fallbacks. |
| Tests | `scripts/ikolearn-check.mjs` | `npm run check:ikolearn`: mocked, no network, no key. `scripts/fixtures/ikolearn-cloud-v1.json` to `-v4.json` are saved clouds for the migration tests. |

## The tree

- Every node has a stable id (`n1`, `n2`, ... never reused), a `parent` (null for a subject) and therefore a path from its subject (`trail`: "Math > Addition > Number Bonds"). There is no depth limit.
- Subjects keep their own hue; every level below is a shade of it (`hueOf`, `colorOf`). Ghosts (dotted) are ideas not explored yet.
- **Chains.** A card's chain is its path in the tree (`chainOf`: "Computer Science → Programming → Python → Sets"). For every new topic the model sends the full logical `chain` (broadest first, up to 4 links), and `placeChain` reuses the deepest link that already exists (promoting a ghost) and creates the missing ones in between as real nodes with explicit parent → child links. The cloud shows them straight away.
- **Chain fallback.** When the model sends only the leaf, or a leaf and its parent, the chain is filled in deterministically, on the server (`fillChain` in `chains.ts`) and again on the device (`fallbackChain` in `cloud-model.js`): from a table of known chains (`KNOWN_CHAINS`, e.g. Python, Sets, Loops, Fractions, Halves, Photosynthesis), else from where the parent already sits on the map. If the chain is still short, a known topic the learner named in their message deepens it, within the same subject only (`deepenChain`: "How do sets work in Python?" with Sets under Computer Science lands under Python; we saw the model skip those links live). No call.
- **Computer Science** is its own subject (its own hue, 252), seeded with ghosts Algorithms, Programming, How Computers Work and How AI Works. Aliases: cs, computing, computers, coding, programming, software. Making & Coding keeps Building, Puzzles and Robots. On migration, clearly-CS topics under Making & Coding (Coding, Programming, Python, Algorithms, ...) move to Computer Science with their whole branch, ids kept. A new subject takes the first unused rainbow hue.
- Topics match existing nodes by a normalised key (case, plurals, `&`/`and`). A new topic may land under any existing topic; otherwise under a subject (aliases like maths -> Math), or a new subject (cap 12).
- Caps keep it light: 600 nodes, 16 children and 6 ghosts per node, 6 steps per path. When room is needed, the oldest free ghost leaf goes first; nodes with children, on a path, or with cards are never pruned.
- Math is the worked example: Counting, Number Sense, Addition, Subtraction, Multiplication, Fractions in order, with a few seeded levels below. Everything else uses the same subject-agnostic code.

## Lessons, paths and the next topic

1. Tapping a card, Draw, or "Start a lesson" on a topic, opens a lesson (`/api/ikolearn/lesson`, one streamed call). It teaches first: tagged lines INTRO, EXPLAIN x2-3 (plain, concrete explanation), STEP x2-4 ("How to do it"), an optional EXAMPLE (worked example) and NEXT, under 260 words, in a warm, plain voice. `lesson.js` renders them as they arrive.
2. The lesson is visibly two-phase: "1 · Learn" then "2 · Check yourself". The check questions (2-3) only ask about what the lesson explained.
3. The same call ends with a hidden `<<<PATH {"steps":[...],"next":"...","choices":[...],"questions":[...],"blurb":"...","end":false} PATH>>>` block. The server holds it back and sends a `path` event. No extra call. Steps (the topic's children) are asked for only when the topic has no path yet; the fork choices, the questions and the card line come every time.
4. **Children on engagement.** The steps are kept as pending children (`node.pending`) until the learner engages with the topic: a right answer, "I've got it", a second visit, or 2 minutes with the lesson open (`IkoPlan.engaged`). Then `applyPath` turns them into children in learning order, reusing existing children (and anything already inside this branch). Topics that already live elsewhere on the map stay where they are. Children take their parent's colour family, show as sepia ghosts on the cloud, and are listed under the holder ("Branches of Python: Sets · Lists · ...").
5. The next topic is chosen locally (`nextFor`): the path's pick if not done, else the first unfinished step, else the next step further up the tree. It is shown as a dotted ring on the cloud, "next" on "Your path", and "Next up" after a lesson.
6. Reading a lesson nudges mastery a little; a right answer to a question confirms it (`confirm`); "I've got it" marks it strong (mastery >= 0.6) and moves to the next step; "Still tricky" is remembered gently.
7. "Map a path for X" (`/api/ikolearn/path`, one structured call) maps the next level on demand. The model may answer that a topic is small enough to end the branch (`end`); `markEnd` records it and `nextFor` moves on.
8. After a lesson the learner picks where to go next (see Forks). Other branches are suggested only once a branch ends.
9. Lessons are cached per node in `localStorage` (newest 30) with their questions and answers, so reopening costs nothing. "Write a fresh version" asks again.

### Model calls per action

| Action | Calls |
| --- | --- |
| Chat message | 1 |
| Tap a node on the cloud (first time, or after the cloud changed) | 1 (note cached per node) |
| Opening a node from a path or lesson | 0 (note on request) |
| Make a card | 1 (includes its path) |
| Related topics (shown once a branch ends) | 1 |
| Map a path | 1 |
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

- Every card has an ink-sketch landscape top left, the chain in small type with thin arrows, a serif title, one short line, a thin double border and a folded corner. No icons or images: the only mark is the stage in small text ("New", "Warming up", "Growing", "Bright", "Achieved").
- The card line (`blurb`) comes from the lesson's hidden block (under 12 words, never the learner's name), or a card's first sentence until a lesson has run.
- Sizes: `tile` (draw and deck), `full` (the holder), `mini` (beside a chat card).

### Ink and colour

Two separate measures, both from `growthOf(cloud, id)`:

- **Detail (ink)** comes from use: `spent/60 + 2*engaged + 3*correct + 4*mastery + min(cards, 3)`, in levels at 0, 3, 8, 16, 30. A topic joins the deck at 3. More detail means more hatching, trees, birds and ripples on the same landscape.
- **Colour** comes only from confirmed learning: `correct answers + 2 if mastery >= 0.6` ("I've got it"). 0 is sepia; 1, 3 and 5 confirmations give Warming up, Growing and Bright. **Achieved** (full colour, the ink-coloured border) needs the branch to be finished (`isTerminal`), and stays once reached (`achievedAt`). Time alone never adds colour.
- The stage a card reached is kept in the deck (`best`), so a card never fades. It stops at Bright until its branch is achieved.
- `evolveColor(hue, stage)` is the one place colour is made: the ink mixes in RGB from sepia (hsl 34 24% 36%) towards the chain's hue (58%, 42%) by 0, 18, 40, 65 and 100%, and a wash of the chain's hue bleeds in from the first confirmation. Mixing in RGB means a card never passes through other hues on the way.

### Landscapes

`IkoDeck.landscape(id, detail)` lays out one scene per topic from a generator seeded by the id: 3-4 ridges, sometimes water with ripples, a sun, trees or birds. Every detail level shows the same scene with more of its marks (the first marks never move), so a card visibly fills in. Drawn as SVG through DOM calls; tinted towards the chain hue with the card's colour. Nothing is generated by a model.

### The holder

Picking a card animates it (a 520 ms slide from where it was tapped) into the holder: a tray on the left with the full card at 1280 px, a slim card docked under the header on phones. The lesson and its questions sit beside or below it. With reduced motion the card simply appears.

### Questions

The lesson call's hidden block brings 1-2 multiple-choice questions (`{q, options, answer}`), which the server validates (2-4 different options, the right one kept) and reorders by a hash of the question, so the answer isn't always first. They are radio groups; the first answer to each counts (`confirm`: a right answer adds colour, a wrong one shows the right option and still counts as use). Answers are stored with the cached lesson.

### The top 10 and ranking

- `IkoRank.top(cloud)` ranks topics by heat: points for opens (also re-opens), minutes, right and wrong answers, "I've got it", "Still tricky", tests, cards and chat, halving every 14 days (`HEAT`, `heatNow`). It lives on the device, for one learner.
- Three built-in sources, each scaled to its best, weighted and summed: `local` (weight 1, the learner's own use), `chain` (0.5: half of a topic's descendants' heat goes to its ancestors, so a busy chain lifts its parents), and `popular` (0.35, a small built-in list of well-loved first topics standing in for a shared source later). `popular` is a prior: it orders suggestions, but only topics the learner has used can enter the top 10.
- `IkoRank.scores` gives every topic a score (ghosts too), `order(cloud, ids)` sorts by it, and `chains(cloud)` lists the busiest chains (shown under the top 10).
- Sources are pluggable: `IkoRank.register({ name, weight, prior, scores(cloud, now) -> { topicKey: score } })`; keys not on the map are skipped. A server source (popular topics, a class's focus) plugs in without changing the draw.
- It is shown as a quiet "Your top 10" list under the deck. In the draw it is a modest nudge: x `1 + 0.3*boost` on a card's weight, and a top card is due back from review a little sooner by the same factor. `boost` is 1 for the top topic, falling by a tenth per rank. Topics outside the top 10 get no nudge. In the simulated year below with three favourite Math topics, the favourites come up about a fifth more often than the other Math cards and Math still gets about a third of the draws. When a branch ends, a nearby top-10 topic is suggested first. Suggestions and fork choices in the top 10 come first and say so ("In your top 10 · ...").

## Suggestions, Draw and the orchestrator

`IkoPlan` (`orchestrator.js`) reads the cloud, the deck, completion and ranking and decides what to surface. It makes no calls and doesn't replace the model: it only builds the choices and the prompt context (`lessonContext`: the chain, the steps ahead, finished siblings).

- **Suggestions** (`suggest`, 3 cards) show at session start, and again whenever the learner comes back to the Deck or the cloud. In order: a Test that's ready; the next step in the busiest recent chain (last 10 days); a card from the deck draw; something new from a quiet subject (always kept last). The non-test ones are sorted by rank, top-10 ones first. A new learner gets first steps from different subjects. Each has a short why line.
- **Draw** (`draw`) picks one card with the balanced deck draw (below), skipping the card already in the holder, falls back to the best suggestion, slides it into the left holder and opens its lesson straight away.
- There is always an obvious next step: the suggestions, Draw a card, Continue (the active lesson, `cloud.active`) and Your cloud. On the cloud the same choices sit in a small bar.
- **Children** (`wantChildren`, `childrenReady`): a topic is engaged after 1 right answer, 2 visits, or 120 s. Only then do its pending children grow. Within a parent, the path order (foundational first, as the model lists it) wins; the remaining children follow by rank, explored before ghosts (`orderedChildren`). Other branches are suggested only after the current branch ends.
- **Tests** (`testState`): a Test is ready when a parent has 3 finished children, or a whole path of at least 2 finished; after one is taken it is offered again once 2 more are finished. It's optional. It is shown as a Test card first in the suggestions, a dashed diamond beside the parent on the cloud ("Test", filled once taken), and "Take the test" in the panel. `/api/ikolearn/test` is one structured call with 5 questions built only from the finished material (the parent if opened, plus finished children with their card lines, up to 8). Fewer than 2 pieces of material answer 422 with no call. Each answer is checked against its topic; a right answer adds colour to that card (`recordTest`). Any attempt strengthens the parent (weight + 0.5, test heat); a pass (60%+) adds 2 confirmations and mastery to the parent.
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
- The cloud is stored in a compact v5 format: one array per node
  `[id, label, parent, flags, weight*10, mastery*100, born(s), touched(s), hue, struggle(s), spent(s), engaged]`, plus `[correct, heat*100, heated(s), blurb, achieved(s)]` and then v5's `[pending ? [stepNames, next] : 0, done(s)]`, only on nodes that have them
  (flags: 1 ghost, 2 opened, 4 branch ends), paths as `{ id: [stepIds, next, at] }`, plus cards, forks (`f`), the deck (`k`: `[id, label, subject, hue, joined(s), best stage, chain, blurb, achieved(s)]`), the draw log (`g`), the session count (`ss`), and v5's tests (`t`: `{ parentId: [at(s), finished children then, best*100, attempts, offered(s)] }`), the last suggestions (`sg`) and the active lesson (`fl`). A fresh cloud is about 1.9 KB; a full 600-node cloud stays under 60 KB.
- v1 to v4 clouds are migrated on load without loss (every id, label, parent, ghost flag, weight, mastery, time, card, fork, path, deck entry and draw kept); missing seed topics arrive as ghosts. v2 topics with enough time join the deck straight away. v3 cards keep the stage they had reached; one whose branch had already ended becomes Achieved. v4 clouds get the Computer Science subject, with clearly-CS topics moved there from Making & Coding (ids, cards, paths and forks kept), and finished deck topics get a done time. New fields go at the end of the row so older rows still load.

## Rendering at depth

Each level is drawn at 0.6x the size of the one above and zoom goes to 60x, so a branch can keep opening. Selecting a node focuses its branch (ancestors plus two levels below). Labels fade in by how big a node reads at the current zoom; at most 260 points are drawn, with collision-avoiding labels.

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
scripts/deploy-ikosagon-prod.sh <full commit sha>            # deploys that commit to production
DRY_RUN=1 scripts/deploy-ikosagon-prod.sh <full commit sha>  # checks everything, deploys nothing
```

The script clones the repo into a temp folder, checks out the sha, writes no `.vercel` or env files, sets `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` (defaults are our team and project; override them in the environment), refuses to go on if any `.env*` file other than `.env.example` is there, runs `vercel deploy --prod --yes`, and deletes the clone on exit. Env vars stay in Vercel. Never run `vercel link`, `vercel env pull` or `vercel dev` here: they write `.env.local` with secrets. `.gitignore` ignores `.env*` (except `.env.example`) as a second guard.

## Privacy and cost

- Free tier only, our key stays on the server. Guards: 8 calls/min and 90/hour per IP, 30/min overall, and a daily cap
  (`IKOLEARN_DAILY_CALLS`, default 400, max 1000, per server instance). Lesson and path calls count like the others. Model override: `IKOLEARN_GEMINI_MODEL`.
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
