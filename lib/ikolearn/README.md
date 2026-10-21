# IkoLearn v1

A chat-style learning companion with a visible, evolving learning profile: a point cloud centred on the learner's first name.
Static client in `public/ikolearn/`, three small server routes in `app/api/ikolearn/`, Gemini (free tier) behind them.
Unlisted and noindexed while we test with one learner.

## Files

| Piece | File | What it does |
| --- | --- | --- |
| Prompts | `lib/ikolearn/prompts.ts` | Input cleaning, the three roles (companion / noticing, card, adjacent), the cloud-block rules, response schemas, parsing, and the streaming block splitter. No UI or network code. |
| Model adapter | `lib/ikolearn/gemini.ts` | The only file that knows Gemini: streaming (`streamGenerateContent?alt=sse`) and structured JSON (`generateContent` + `responseSchema`), timeouts, fallback model, error codes. |
| Service | `lib/ikolearn/service.ts` | Route logic with injectable `fetch`: origin/size/input checks, per-IP rate limit, daily call budget, NDJSON event stream, card and adjacent handlers. |
| Routes | `app/api/ikolearn/{chat,card,adjacent}/route.ts` | Thin wrappers around the service. |
| Cloud model | `public/ikolearn/cloud-model.js` | Pure data: starters, growth/merge (`applyTopics`, `addGhosts`, `attachCard`), summary for prompts, colours, 3D layout, (de)serialisation. Runs in the browser and in Node tests. |
| Cloud view | `public/ikolearn/cloud-view.js` | Canvas 2D projection of the 3D points: rotate, pan, zoom (mouse, wheel, touch, pinch), zoom-aware labels, growth pulses. Used for the thumbnail and the full-screen cloud. |
| App | `public/ikolearn/app.js`, `index.html`, `styles.css` | Chat, cards, panel, persistence (localStorage), fallbacks. |
| Tests | `scripts/ikolearn-check.mjs` | `npm run check:ikolearn`: mocked, no network, no key. |

## How the cloud grows

1. Each chat call streams one reply. The companion is told to end it with
   `<<<CLOUD {"topics":[{name,parent,signal}],"ghosts":[{name,parent}]} CLOUD>>>`.
   One call per turn: no extra request for topic extraction.
2. The server splits the stream as it arrives (`createBlockSplitter`): text before the marker goes to the learner,
   the block is held back, validated (`parseCloudBlock`) and sent as a separate `cloud` event. A missing or broken block just means no growth that turn.
3. The client applies it (`applyTopics`, `addGhosts`):
   - topics match existing nodes by a normalised key (case, plurals, `&`/`and`), anywhere in the cloud;
   - an existing topic is strengthened (weight up, mastery up for `strength`, a gentle note for `struggle`);
   - a ghost that gets explored is promoted to a real node;
   - a new topic goes under the named subject (aliases like maths -> Math, biology -> Science); a new subject is created only when none fits (cap 12, then "Curiosities");
   - ghosts never create subjects; caps keep the cloud readable (160 nodes, 16 children and 4 ghosts per subject; oldest ghosts are pruned first).
4. What changed pulses on the cloud for a few seconds, the thumbnail border lights up, and a quiet "Your cloud grew: ..." line appears in the chat.
5. The next request carries a compact summary of the cloud (`summarize`), so replies build on what the learner has done.

Cards (`/api/ikolearn/card`) and related topics (`/api/ikolearn/adjacent`) are one structured call each and also feed the cloud.
Notes on a tapped node use the same streaming route in `notice` mode and are cached per node until the cloud changes.

## Privacy and cost

- Name, chat, cloud and cards live in `localStorage` only (`ikolearn.v1.*`). The server keeps nothing; per-IP counters are in memory.
- Free tier only, our key stays on the server. Guards: 8 calls/min and 90/hour per IP, 30/min overall, and a daily cap
  (`IKOLEARN_DAILY_CALLS`, default 400, max 1000, per server instance). Model override: `IKOLEARN_GEMINI_MODEL`.
- When a call fails, the app answers locally (and suggests a dotted branch) instead of showing an error.

## Extension notes

- **Accounts and sync.** Everything goes through `save()`/`load()` in `app.js` and `serialize`/`deserialize` in the model. Swap that pair for a server store when we add sign-in; the cloud JSON is versioned (`v: 1`).
- **Parent view.** A read-only page can render the same cloud with `IkoCloudView.create(canvas, { mini: false })` and a list from `summarize`. No new model code needed.
- **More learners on one device.** Prefix the storage keys with a learner id.
- **Another model.** Replace `lib/ikolearn/gemini.ts` only; it exposes `streamText` and `generateJson`. Prompts and parsing stay as they are.
- **New prompt roles** (quizzes, reflections). Add a system builder and schema in `prompts.ts`, a handler in `service.ts`, and a thin route.
- **Richer growth.** `applyTopics` already returns created/promoted/strengthened ids, so new visuals (badges, timelines) can hook into the same result.
- **Mastery over time.** Nodes keep `weight`, `mastery`, `touched` and `lastStruggle`; spaced review can be built on these without changing the format.
