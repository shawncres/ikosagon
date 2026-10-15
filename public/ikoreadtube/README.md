# IKOREADTUBE

Barebones, mobile-first "read the video" page: a menu list of videos, and a plain-text summary at three detail levels (LESS / STANDARD / MORE).
Pure HTML + CSS + vanilla JS. No frameworks, no build step, no video player, no accounts. Pure `#000` / `#fff`, **Press Start 2P**
from Google Fonts, no rounded corners, gradients, shadows or transitions (the only motion is one steady blinking cursor, off under
`prefers-reduced-motion`). Built to read on an e-ink screen.

On ikosagon.com it lives at **/ikoreadtube/** (and `/ikoreadtube` works too). It is a standalone page: no site nav, `noindex`.

## Files

| File | What it is |
| --- | --- |
| `index.html` | the page: header + three screens (feed, generating, detail), shown/hidden by JS |
| `styles.css` | all styling (`--u` is one UI "pixel": 4px phone, 6px desktop; fonts are 16px/24px, multiples of the font's 8px grid) |
| `app.js` | UI + routing (`#/` feed, `#/read/<id>` detail), localStorage "recently read", calls the proxy, falls back to presets |
| `data.js` | **the one data module** - `window.IkoData.loadVideos()` returns the videos |
| `img/` | 1-bit pixel-art thumbnails + the menu arrow (pure black/white PNGs) |
| `api/summarize.php` | example PHP proxy for GoDaddy / any PHP host |
| `api/config.sample.php`, `api/.htaccess` | where the PHP proxy's key goes, and the rule that hides it |

## Replacing the sample data

Edit only `data.js` (replace the body of `loadVideos()`; it may fetch your own JSON). Shape:

```js
{ id: "11charVideoId", title: "...", channel: "...", thumb: "img/x.png" /* optional */,
  transcript: "text the proxy summarizes" /* optional */,
  summaries: { less: "...", standard: "...", more: "..." } /* offline fallback */ }
```

The samples are original text with made-up channels; no real transcripts. Transcript text (not a bare video id) is what the proxy
summarizes - fetching YouTube transcripts is **not** built in (no unofficial scraping).

## How summaries work

1. Opening a video or pressing LESS / MORE shows the generating screen and POSTs `{ id, title, transcript, level }` to the proxy.
2. The proxy returns **only plain text** (200) or a plain-text `ERROR: ...` (non-200, plus an `X-Ikoreadtube-Error` header).
3. On any error (no key, rate limit, offline, timeout) the page silently shows the hardcoded `summaries[level]` and labels it
   `PRESET SUMMARY (reason)`. Real summaries are labelled `AI SUMMARY`.

## Proxy A: Next.js route (ikosagon.com, Vercel)

`app/api/ikoreadtube/summarize/route.ts` (logic in `lib/ikoreadtube/summarize.ts`). The page calls it by default (`/api/ikoreadtube/summarize`).

- Env var: **`GROQ_API_KEY`** (server-side only, never `NEXT_PUBLIC_`; the site chat already uses this same name). Optional: `GROQ_MODEL`
  (default `openai/gpt-oss-20b`), `IKOREADTUBE_ALLOWED_ORIGINS` (comma list of extra CORS origins).
- Get a free key at <https://console.groq.com/keys>, add it in Vercel -> Project -> Settings -> Environment Variables (Production +
  Preview), then redeploy. Never commit it.
- No key -> HTTP 503 `ERROR: GROQ_API_KEY is not set on the server...`; the page uses the presets.

## Proxy B: PHP (GoDaddy)

1. Upload this whole folder (e.g. to `public_html/ikoreadtube/`). `index.html` works from any subfolder, with or without the trailing slash.
2. In `index.html` add, before `app.js`: `<script>window.IKOREADTUBE_PROXY = "api/summarize.php";</script>`
3. Copy `api/config.sample.php` to `api/config.php` and paste your Groq key (or set the `GROQ_API_KEY` env var if your host allows it).
   `api/.htaccess` blocks `config.php` from the web; keep it. Needs PHP 7.4+ with curl.
4. If the page and PHP are on different domains, set `IKOREADTUBE_ALLOWED_ORIGINS` (env or in `config.php`).

Rate-limit state lives in the system temp dir (`ikoreadtube-rl/state.json`).

## Real YouTube mode (Next.js on Vercel)

When `YOUTUBE_API_KEY` is set, the list is a live feed from YouTube; without it (or on any error, or on the static PHP host) the page shows the 8 built-in sample videos and says so. Everything uses the **official APIs only** (no scraping, no unofficial endpoints, no video download).

| Route | What it does | Cost / cache |
| --- | --- | --- |
| `GET /api/ikoreadtube/feed` | Data API v3 `playlistItems.list` on the uploads playlist of each channel in `lib/ikoreadtube/channels.json` (about 18), then one batched `videos.list` for duration and live status. Drops Shorts-length and live items, interleaves channels, returns `{id,title,channel,published,duration}` | about 21 quota units per refresh; edge cache `s-maxage=900, stale-while-revalidate` plus a 15 min in-memory copy. At most ~96 refreshes/day = ~2,000 of the 10,000 free units |
| `GET /api/ikoreadtube/search?q=` | `search.list` + `videos.list`. Triggered only by Enter / the SEARCH YOUTUBE button | search.list has its own 100 calls/day bucket; we stop at 90 and show "limit reached". Cached 1 h per query (policy allows at most 30 days) |
| `GET /api/ikoreadtube/summary?id=` | `videos.list` (1 unit) for title, length and description, then ONE Gemini call that reads the public YouTube URL (`file_data.file_uri`) and returns less / standard / more as JSON. The server parses it and returns plain text | cached by video id (memory 7 days, CDN `s-maxage=86400` + 7 days SWR). Daily guard: at most 6 h of video per Pacific day (Google's free tier allows 8 h), videos over 40 min skip AI |
| `GET /api/ikoreadtube/summary?id=&focus=` | same, with the focus (see below) | cache key includes the normalized focus |
| `POST /api/ikoreadtube/ask` | one question about one video (see below) | 1 h in-memory cache, per-IP and global limits, shared budget |
| `POST /api/ikoreadtube/summarize` | unchanged Groq route, used by PASTE TRANSCRIPT and by the sample videos | see "Limits" below |

Summary fallbacks, in order: Gemini answer -> (if Gemini is off, busy, over budget, the video is too long/live, or it fails) the channel's own description shown as-is and labelled "VIDEO DESCRIPTION FROM THE CHANNEL, NOT A SUMMARY" (no LLM rewrite of API data) -> a clear error line. The user can always tap WATCH ON YOUTUBE or paste a transcript. Gemini model: `gemini-3.5-flash-lite` by default (free tier, reads YouTube URLs); one retry on `gemini-3.1-flash-lite` if Google answers 5xx; override with `GEMINI_MODEL`.

Channel IDs are resolved once with `node scripts/ikoreadtube-channels.mjs` (`channels.list?forHandle`, 1 unit per handle) and only the handle -> ID mapping is committed (identifiers, not API content). Titles and everything else are fetched live and never stored for more than minutes/days.

Compliance notes: WATCH ON YOUTUBE (link to `youtube.com/watch?v=`) on every item and detail screen; footer attribution + links to the YouTube Terms of Service and Google Privacy Policy; `privacy.html` (also at `/ikoreadtube/privacy`) states we use YouTube API Services; thumbnails are OFF by default and, when on, are `default.jpg` shown whole with a grayscale filter; no accounts, localStorage only (recent list, thumbs setting, theme); the API key is read from env on the server only, sent in a header, and never reaches the page. AI summaries are labelled as not coming from YouTube.

Env vars (names only, set in Vercel Production + Preview): `YOUTUBE_API_KEY`, `GEMINI_API_KEY`, optional `GEMINI_MODEL`, `GEMINI_DAILY_VIDEO_SECONDS`. Counters (search cap, video-seconds budget, rate limits) are per server instance: best effort; Google's own quotas are the hard limit and are handled (quotaExceeded -> "limit reached" / description fallback).

Caveats: Gemini YouTube-URL input is a preview feature (free, public videos only, limits can change); on the Gemini free tier Google may use prompts and outputs to improve its products (the privacy page says so); the PHP/GoDaddy build has no feed route, so it stays on the samples.

## Focus, ASK, dark mode and the bottom bar

**FOCUS (the search words steer the summary).** When you search and open a result, the words you searched become the *focus*. The summary route gets `focus=<words>`; the detail screen shows `FOCUS: ufc predictions [EDIT] [X]`. EDIT changes it, X clears it (general summary), and a video opened from the plain feed starts with no focus (typing in the feed filter box does not count as a search). The focus rides in the hash (`#/read/<id>?f=...`) so reload and back keep it.

- Server: `lib/ikoreadtube/focus.ts` cleans the text (control chars, quotes, brackets removed, 80 chars max) and rewrites it to a question with plain rules, no LLM: "X predictions" -> "What predictions are made about X?"; picks/odds, review, vs, best/top, tutorial, news/latest, explained, highlights have their own templates; already-a-question stays; everything else -> "What does this video say about X, and what are the key points?".
- Gemini (same video-URL input) gets one extra instruction block, and returns `{covered, about, less, standard, more}`: it extracts only the claims that answer the question (no intros, sponsors, filler), in its own words, same three levels. If `covered` is false the server writes `NOT COVERED IN THIS VIDEO.` plus one line "This video is about: ..." on all three levels (it cannot pad an answer; if the model leaves `about` empty the video title is used).
- Cache key = `videoId|normalized focus` (memory 7 days + CDN). Every focus variant is its own Gemini call and is charged to the same 6 h/day video-seconds budget, so the guards are unchanged. The description fallback (no AI) ignores the focus.

**ASK this video.** ASK in the bottom bar opens a box: one short question about the open video. `POST /api/ikoreadtube/ask` with `{id, q, history}` (6 KB body max, question 3..200 chars, last 2 Q/A as context, 300 chars each). Same video-URL Gemini input, answers of at most ~80 words, plain text, "not in the video" said plainly (`answered:false`). Timestamps are shown only when they look like m:ss, fall inside the video and the model is confident (max 3, else none). Per IP 4/min and 20/h, shares the global Gemini limiter, the cooldown after a Google 429, the length caps (20 s..40 min) and the daily video-seconds budget with summaries; a failed call refunds its reservation. Answers to a question without history are cached 1 h in memory (never at the CDN, `no-store`); nothing else is stored on the server. The last 3 Q/A live only in the page's memory and vanish on reload.

**Dark mode.** Header button `DARK: OFF/ON`. Dark is the same two colors swapped (`--black:#fff; --white:#000` on `html[data-theme=dark]`), so it is still strictly `#000`/`#fff`, no grays (sample thumbnails and the arrow are inverted with `filter:invert(1)`). The choice is saved in `localStorage` (`ikoreadtube.theme`) and applied by a tiny inline script in `<head>` before first paint. **The default is light and it does not follow `prefers-color-scheme`**, on purpose: black-on-white is the e-ink look the page is built for (most e-ink browsers report "light" anyway, but a phone in dark mode should not silently turn a reading page into a white-on-black one that e-ink renders as a smeared negative). Switching is one tap and remembered.

**Bottom bar.** On the detail screen a fixed bar shows `- LESS  [STANDARD] 2/3  MORE +` and, below it, `ASK` and `WATCH ON YOUTUBE`. Targets are 48 px high on phones (60 px on desktop), pure monochrome, no motion. LESS/MORE stay at the end of the range as no-ops. The row with ASK and WATCH is hidden on the sample videos (no real video to ask about).

## Limits and abuse guard (both proxies, same rules)

- Groq free tier for `openai/gpt-oss-20b`: about 30 requests/min, 1,000/day, **8,000 tokens/min** (check your console; limits change).
- Input: JSON body <= 24 KB, transcript 40..9,000 characters (about 2.6K tokens), title 120, level in less/standard/more.
- Output: `max_completion_tokens` 500 / 800 / 1,200 (less / standard / more; includes gpt-oss's reasoning, set to `low`), answer cleaned
  to plain text (markdown stripped) and capped at 2,500 characters.
- Per IP: 5 per minute, 30 per hour. Global: 6,500 estimated tokens per minute (stays under the 8K TPM), 800 requests per day.
  Over a limit -> 429 with `Retry-After`. (Next.js keeps counters in memory per warm instance, so they are best-effort on serverless; the PHP proxy keeps them in a file.)
- CORS: only `https://ikosagon.com`, `https://www.ikosagon.com` and same-origin by default; others are refused (403).
- The transcript is treated as untrusted text (prompt tells the model never to follow instructions inside it).

## Checks

`npm run check:ikoreadtube` (repo root): proxy logic with mocked Groq (no network), CORS/limits, plus static rules for the page
(only `#000`/`#fff` in CSS, no gradients/shadows/rounded corners/transitions, one animation, noindex, data shape).
