# IKOREADTUBE

Barebones, mobile-first "read the video" page: a menu list of videos, and a plain-text summary at three detail levels (LESS / STANDARD / MORE).
Pure HTML + CSS + vanilla JS. No frameworks, no build step, no video player, no accounts. Three fixed colour themes (LIGHT sepia paper, GAMEBOY, DARK grey; each a tiny palette, see "Themes"), **Press Start 2P**
from Google Fonts, no rounded corners, gradients, shadows or transitions (the only motion is one steady blinking cursor, off under
`prefers-reduced-motion`). Built to read on an e-ink screen.

On ikosagon.com it lives at **/ikoreadtube/** (and `/ikoreadtube` works too). It is a standalone page: no site nav, `noindex`.

## Files

| File | What it is |
| --- | --- |
| `index.html` | the page: header + three screens (feed, generating, detail), shown/hidden by JS, plus the tiny SVG tone filters |
| `styles.css` | all styling (`--u` is one UI "pixel": 4px phone, 6px desktop; fonts are 16px/24px, multiples of the font's 8px grid) |
| `app.js` | UI + routing (`#/` feed, `#/read/<id>` detail), localStorage "recently read", calls the proxy, falls back to presets |
| `data.js` | **the one data module** - `window.IkoData.loadVideos()` returns the videos |
| `img/` | 1-bit pixel-art thumbnails + the menu arrow (black/white PNGs, recoloured to the theme by the tone filters) |
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
| `GET /api/ikoreadtube/feed` | Data API v3 `playlistItems.list` on the uploads playlist of each channel in `lib/ikoreadtube/channels.json` (about 18), then one batched `videos.list` for duration and live status. Drops Shorts-length and live items, sorts **newest first across all channels** (max 3 per channel), returns `{fetchedAt, videos:[{id,title,channel,published,duration}]}` | about 21 quota units per refresh; edge cache `s-maxage=300, stale-while-revalidate=300` plus a 5 min in-memory copy. See "Home feed freshness" for the quota math |
| `GET /api/ikoreadtube/search?q=` | `search.list` + `videos.list`. Triggered only by Enter / the SEARCH YOUTUBE button | **search.list costs 100 units from the same 10,000/day pool** (an older note here said it had its own bucket; it does not). We stop at 30 searches/day (3,000 units) and show "limit reached". Cached 1 h per query (policy allows at most 30 days) |
| `GET /api/ikoreadtube/summary?id=` | `videos.list` (1 unit) for title, length and description, then ONE Gemini call that reads the public YouTube URL (`file_data.file_uri`) and returns less / standard / more as JSON. The server parses it and returns plain text | cached by video id (memory 7 days, CDN `s-maxage=86400` + 7 days SWR). Daily guard: at most 6 h of video per Pacific day (Google's free tier allows 8 h), videos over 40 min skip AI |
| `GET /api/ikoreadtube/summary?id=&focus=` | same, with the focus (see below) | cache key includes the normalized focus |
| `POST /api/ikoreadtube/ask` | one question about one video (see below) | 1 h in-memory cache, per-IP and global limits, shared budget |
| `POST /api/ikoreadtube/summarize` | unchanged Groq route, used by PASTE TRANSCRIPT and by the sample videos | see "Limits" below |

Summary fallbacks, in order: Gemini answer -> (if Gemini is off, busy, over budget, the video is too long/live, or it fails) the channel's own description shown as-is and labelled "VIDEO DESCRIPTION FROM THE CHANNEL, NOT A SUMMARY" (no LLM rewrite of API data) -> a clear error line. The user can always tap WATCH ON YOUTUBE or paste a transcript. Gemini model: `gemini-3.5-flash-lite` by default (free tier, reads YouTube URLs); one retry on `gemini-3.1-flash-lite` if Google answers 5xx; override with `GEMINI_MODEL`.

Channel IDs are resolved once with `node scripts/ikoreadtube-channels.mjs` (`channels.list?forHandle`, 1 unit per handle) and only the handle -> ID mapping is committed (identifiers, not API content). Titles and everything else are fetched live and never stored for more than minutes/days.

Compliance notes: WATCH ON YOUTUBE (link to `youtube.com/watch?v=`) on every item and at the bottom of every real-video detail screen; footer attribution + links to the YouTube Terms of Service and Google Privacy Policy; `privacy.html` (also at `/ikoreadtube/privacy`) states we use YouTube API Services; thumbnails are OFF by default and, when on, are `default.jpg` shown whole with a grayscale filter; no accounts, localStorage only (recent list, thumbs setting, theme); the API key is read from env on the server only, sent in a header, and never reaches the page. AI summaries are labelled as not coming from YouTube.

Env vars (names only, set in Vercel Production + Preview): `YOUTUBE_API_KEY`, `GEMINI_API_KEY`, optional `GEMINI_MODEL`, `GEMINI_DAILY_VIDEO_SECONDS`. Counters (search cap, video-seconds budget, rate limits) are per server instance: best effort; Google's own quotas are the hard limit and are handled (quotaExceeded -> "limit reached" / description fallback).

Caveats: Gemini YouTube-URL input is a preview feature (free, public videos only, limits can change); on the Gemini free tier Google may use prompts and outputs to improve its products (the privacy page says so); the PHP/GoDaddy build has no feed route, so it stays on the samples.

## Focus, ASK, themes and the detail layout

**SPOKEN WORDS ONLY (never a description of the picture).** Summaries and ASK answers come from what is *said or sung* (the audio track and any captions), not from what the video shows. The Gemini prompts (`GEMINI_SYSTEM`, the focused prompt and `ASK_SYSTEM` in `lib/ikoreadtube/gemini.ts`) forbid describing the setting, clothing, camera work, how people look or what they do on screen. For songs they ask for what the lyrics say (theme, message, story), paraphrased, never reproduced (a few words of a line at most). Output schemas carry `spoken` + `note`: when a video has no meaningful speech or lyrics the model sets `spoken=false` and the server shows **NO SPOKEN CONTENT TO SUMMARIZE.** plus one short audio-only note (ASK answers `answered=false` with NO SPOKEN CONTENT TO ANSWER FROM). The focus behaviour is unchanged: the focus question is answered from the spoken or sung words. Video input is steered toward audio as far as the API allows: `video_metadata.fps = 0.2` (one frame every 5 s; documented to accept values below 1) plus `mediaResolution: MEDIA_RESOLUTION_LOW`, which cuts frame tokens by ~80% while audio is still read in full (fixed ~25-32 tokens/s). Frames cannot be turned off for a YouTube URL. The page asks for `/summary?...&v=2` so summaries cached at the CDN before this change (which could describe visuals) are bypassed; server memory caches reset on deploy. Tests: `npm run check:ikoreadtube` (prompt contents, no-speech path, parsers).

**FOCUS (the search words steer the summary).** When you search and open a result, the words you searched become the *focus*. The summary route gets `focus=<words>`; the detail screen shows `FOCUS: ufc predictions [EDIT] [X]`. EDIT changes it, X clears it (general summary), and a video opened from the plain feed starts with no focus (typing in the feed filter box does not count as a search). The focus rides in the hash (`#/read/<id>?f=...`) so reload and back keep it.

- Server: `lib/ikoreadtube/focus.ts` cleans the text (control chars, quotes, brackets removed, 80 chars max) and rewrites it to a question with plain rules, no LLM: "X predictions" -> "What predictions are made about X?"; picks/odds, review, vs, best/top, tutorial, news/latest, explained, highlights have their own templates; already-a-question stays; everything else -> "What does this video say about X, and what are the key points?".
- Gemini (same video-URL input) gets one extra instruction block, and returns `{covered, about, less, standard, more}`: it extracts only the claims that answer the question (no intros, sponsors, filler), in its own words, same three levels. If `covered` is false the server writes `NOT COVERED IN THIS VIDEO.` plus one line "This video is about: ..." on all three levels (it cannot pad an answer; if the model leaves `about` empty the video title is used).
- Cache key = `videoId|normalized focus` (memory 7 days + CDN). Every focus variant is its own Gemini call and is charged to the same 6 h/day video-seconds budget, so the guards are unchanged. The description fallback (no AI) ignores the focus.

**ASK this video.** The ASK section sits inline under the summary: one short question about the open video. `POST /api/ikoreadtube/ask` with `{id, q, history}` (6 KB body max, question 3..200 chars, last 2 Q/A as context, 300 chars each). Same video-URL Gemini input, answers of at most ~80 words, plain text, "not in the video" said plainly (`answered:false`). Timestamps are shown only when they look like m:ss, fall inside the video and the model is confident (max 3, else none). Per IP 4/min and 20/h, shares the global Gemini limiter, the cooldown after a Google 429, the length caps (20 s..40 min) and the daily video-seconds budget with summaries; a failed call refunds its reservation. Answers to a question without history are cached 1 h in memory (never at the CDN, `no-store`); nothing else is stored on the server. The last 3 Q/A live only in the page's memory and vanish on reload.

**Themes.** One header button cycles **LIGHT -> GAMEBOY -> DARK** and shows the current one (`THEME: LIGHT`). The choice is saved in `localStorage` (`ikoreadtube.theme` = `light` | `gameboy` | `dark`) and applied by a tiny inline script in `<head>` before first paint. The old 2-way toggle stored `light`/`dark`: both are still valid (an old `dark` loads as DARK, an old `light` as LIGHT, which is now sepia); any unknown value falls back to LIGHT and is rewritten. Everything is drawn from CSS variables (`--paper`, `--surface`, `--ink`, `--line`, `--rule`, `--mid`) set per theme on `<html data-theme>`, so the feed, search, detail, ASK and privacy pages all follow it; no colour literal appears outside those declarations.

| Theme | paper | surface | ink | line / rule | body text contrast |
| --- | --- | --- | --- | --- | --- |
| LIGHT (default, sepia paper) | `#f4ecd8` | `#fbf6e8` | `#3b2a1a` | `#3b2a1a` | **11.64:1** on paper, 12.69:1 on surface |
| GAMEBOY (DMG green) | `#9bbc0f` | `#9bbc0f` | `#0a2a0a` | `#0a2a0a` / `#306230` (+ `#8bac0f` for thumbnail frames) | **7.11:1** on paper and surface |
| DARK (neutral grey, xAI-like) | `#0e0e0e` | `#1a1a1a` | `#e5e5e5` | `#6b6b6b` | **15.32:1** on paper, 13.82:1 on surface |

The check script computes these ratios and fails below 7:1 (borders must stay at 3:1 or better). GAMEBOY note: the classic DMG ink `#0f380f` on `#9bbc0f` is only 6.02:1 (that is the best contrast the four canonical shades can give), so we darkened the ink to `#0a2a0a` (7.11:1) and kept the other three shades. DARK uses soft grey (`#6b6b6b`, 3.6:1) borders instead of bold ink ones, so it is the least "boxy" theme.

**E-ink.** LIGHT is the default on purpose and it does not follow `prefers-color-scheme`: warm paper with dark brown ink is the e-ink-friendly look (high contrast, no glare, no big dark areas that e-ink renders as a smeared negative). Keep contrast high if you tune a palette (7:1 for body text). GAMEBOY and DARK are one tap away and remembered.

Thumbnails (off by default) and emoji in real titles are the only non-palette pixels in principle; they are tone-mapped into the theme with small inline SVG filters (`#tone-*` in `index.html`): a straight ink-to-paper ramp in LIGHT and DARK, and a 4-shade snap to the DMG green shades in GAMEBOY. Emoji in titles use the two end colours only. Sample 1-bit pictures show their strokes in the ink colour.

**Detail layout.** There is no fixed or sticky bar. Top to bottom: BACK, title, channel, FOCUS line, then **`- LESS  [STANDARD] 2/3  MORE +`** inline (48 px high targets, scrolls with the page), the summary, the ASK section (hidden for the built-in sample videos), PASTE TRANSCRIPT, and last a small underlined **WATCH ON YOUTUBE** text link with a 44 px high hit area.

## Home feed freshness (why a refresh looked the same, and what we changed)

**Root causes.** (1) *Cache stacking:* a 15 min in-memory copy on the server, behind a 15 min edge cache (`s-maxage=900`), plus `stale-while-revalidate=3600`, so a visitor could be shown a list up to ~90 min old and a reload within 15 min was identical by design. (2) *Ordering:* the list was built in rounds (every channel's newest upload first, then every channel's second-newest), so a fresh second upload from a busy channel sat below a months-old "newest" video from a quiet one; the top of the page barely moved when something new was posted. (3) *No client refresh:* the page fetched the list once on load; coming back to the list (the title, BACK) never re-fetched. There is no localStorage/sessionStorage cache of the feed (only recent list, thumbs and theme live there).

**What it does now.**
- **Freshest first:** the list is strictly newest to oldest across all channels, at most 3 per channel, 36 items; the home screen shows 24: the 12 newest are always pinned on top and the other 12 slots are a random draw from the next-newest ones (shown newest first). So a refresh "feels alive" with zero extra quota (the whole pool arrives in the same response).
- **Shorter cache:** edge `s-maxage=300, stale-while-revalidate=300` and a 5 min in-memory copy: a visitor sees data at most ~10 min old, usually under 5.
- **REFRESH button** (under "NEW FROM YOUTUBE") next to a line like `UPDATED 4:41 PM (3 MIN AGO)`. It re-asks the server with `cache: "no-store"` (bypasses the browser's HTTP cache) and re-draws the rotation. It cannot bypass the server/edge copy on purpose (anyone could otherwise burn the quota), so within 5 min it may show the same videos in a new rotation, and the age line says so honestly.
- Coming back to the list after 5+ minutes (title link, BACK, restored tab) quietly refetches it.
- **Title link:** the app name in the header is a link to `#/` from every screen (also on the privacy page): clears search, filter and focus, scrolls to the top. 44 px tall, themed, keyboard focusable. Ctrl/Cmd-click still opens a new tab.

**Quota math (YouTube Data API, ONE pool of 10,000 units/day, resets midnight Pacific).**

| Call | Units | Notes |
| --- | --- | --- |
| `playlistItems.list` | 1 each | 18 channels = 18 per feed refresh (1 unit however many items) |
| `videos.list` | 1 per call (up to 50 ids) | about 3 per refresh, also 1 per summary/ASK metadata lookup |
| feed refresh | ~21 | 18 + 3 |
| `search.list` | **100** | plus 1 for `videos.list` |

Worst case (someone keeps the page busy all day, so every 5 min window refreshes): 288 refreshes x 21 = **6,048** units. Searches are capped at 30/day = **3,000**. Total about **9,050**, under our soft cap of 9,000 + a small margin, and below Google's 10,000. Real traffic is far lower (a refresh happens only when a visitor arrives after the 5 min copy expired; ~21 units each, e.g. 40 refreshes/day = ~840 units). Guards: above 7,500 units spent today the feed goes into *economy mode* (same list held for 30 min); at 9,000 it serves the last list marked stale (or 503 `quota` if there is none) and searches stop. Counters are per server instance (best effort); Google's own quota remains the hard limit and is handled (`quotaExceeded` -> stale list / "limit reached").

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
(only the three theme palettes in CSS, contrast ratios per theme, no gradients/shadows/rounded corners/transitions, one animation, noindex, data shape).
