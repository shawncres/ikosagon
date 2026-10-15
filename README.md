# Ikosagon Portfolio Site

Dark, neon-accent portfolio built with Next.js App Router, TypeScript, Tailwind v4, and MDX project content.

## Requirements

- Node.js 20.9+ (Node 22 LTS recommended)
- npm 10+

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Content workflow

Add or edit project files in `content/projects/*.mdx`.

Frontmatter schema:

```mdx
---
title: "My App"
slug: "my-app"
summary: "One-line hook"
year: 2026
tags: ["Web", "AI", "Next.js"]
cover: "/projects/my-app/cover.png"
featured: true
repo: "https://github.com/you/my-app"
live: "https://my-app.com"
status: "Shipped"
---
```

Place project assets in `public/projects/<slug>/`.

## Grounded RAG chat

The floating **Ask the notes** widget retrieves from markdown, then (optionally) asks a cloud model to answer only from those passages.

- Notes: `content/knowledge/*.md`
- Project briefs are also indexed: `content/projects/*.mdx`
- Retrieval: lexical overlap in `lib/rag.ts` (no vector database, Hobby-safe)
- API: `POST /api/chat`
- Widget: `components/ChatWidget.tsx`

Edit the knowledge files when the offer changes. Redeploy so the function rereads disk.

Set one key in Vercel or `.env.local`:

- `GROQ_API_KEY` (default model `llama-3.1-8b-instant`)
- `XAI_API_KEY` (default `grok-3-mini`)
- `OPENAI_API_KEY` (default `gpt-4o-mini`)

Without a key the route still returns matching notes. Rate limit is 20 requests per IP per hour.

## Scripts

- `npm run dev` - start dev server
- `npm run lint` - run ESLint
- `npm run build` - production build
- `npm run format` - format code with Prettier

## IkoArtist audio

Product page is `/projects/ikoartist` (301 from `/projects/ai-recording-artist`).
Cover: `public/projects/ikoartist/cover.svg`.
Playlist MP3s remain under `public/projects/ai-recording-artist/` (stable asset URLs) and are committed.
Optional tiny lavfi demos can still be materialized with `node scripts/ensure-demo-audio.mjs`
(from `scripts/demo-audio/*.mp3.b64`); those `demo-*.mp3` outputs are gitignored and unused by the page.

## IkoArtist product loop

Public page `/projects/ikoartist` — almost anonymous song participation (no account):

1. Top tracks player (proof / featured results)
2. **Sound** — a deductive tree to isolate three favorite artists: genre/era/region → anchor pick → up to three discriminating questions (picked from what the anchor can't explain) → second pick (mostly close) → third pick (further out) → a contrast question
3. **Themes** — tap lyrical themes; overlap with theme tags on the artists' top tracks; optional chart context
4. **Audience** — optional, skippable, bands only (never in the transcript)
5. **Song brief** — center, range, themes, audience and three track leans with a "why" each; finish anonymously (brief + path email via `/api/talent-intake` for the song workflow)
6. Optional voice / photo / email — email only if the visitor wants opportunity follow-up

Pure logic lives in `lib/music/taste/*` (vectors, tree, range, leans, brief, sanitizers, chart parsing) and is
covered by `npm run check:ikoartist` (deterministic, no network). The server rebuilds the brief from the raw
choices in `/api/talent-intake`, so client text is never trusted.

### Taste data (free, honest)

- `lib/music/taste/seed.ts` + `seedMore.ts` — hand-written editorial estimates (energy, acousticness, lyric weight, polish, reach, tempo + era) and theme tags for ~175 artists, plus our assumed signature hit / fan favorite / deep cut each. **Not measured audio features, not stream data.** This seed is always the fallback and the only source of theme tags.
- **Last.fm (optional, free key):** `lib/music/lastfm.ts` calls `artist.getTopTracks`, `artist.getTopTags` and `artist.getSimilar` server-side. With `LASTFM_API_KEY` set, best-track picks use Last.fm's own most-played order (shown as "Last.fm top track #n" with an as-of date and links), the second pick can lead with up to two Last.fm-similar artists, and free-text artists get richer tags. With no key, or when Last.fm is slow/down, everything falls back to the seed and no Last.fm credit is shown.
  - Guard rails: key never leaves the server (`/api/music-artist-enrich` returns data, not the key); per-artist cache (6 h, 10 min for misses), one in-flight call per artist, start-rate limiter (~4–5 calls/s), a circuit breaker that pauses calls after rate-limit/key errors, a 3.5 s budget on submit (the seed fills any gap), and `/api/talent-intake` re-fetches on the server instead of trusting client track data.
  - Matching a Last.fm track to one of our seed tracks (by normalized title) keeps its theme tags; a Last.fm track we have no tags for carries **no theme** (we don't guess).
  - **Terms:** Last.fm's API terms are non-commercial and ask for credit/links and approval of public pages; see "Last.fm key and terms" below before turning it on.
- Free tags: `GET /api/music-artist-lookup?name=` reads MusicBrainz tags (no key, ~1 req/s), merged with Last.fm tags when the key is set, to size a free-text artist; falls back to a note.
- Chart context: `GET /api/music-trending` reads the public iTunes Top Songs RSS (no key), cached 1h, shows an as-of date and never shows ranks.
- No Chartmetric / Spotify premium; no invented chart ranks. (The older `/api/music-recommend` and `/api/music-catalog` routes and `data/music-catalog.json` were removed.)

### Last.fm key and terms

1. Sign in (or sign up) at <https://www.last.fm>, then open <https://www.last.fm/api/account/create>.
2. Suggested app name: `Ikosagon IkoArtist`; description: "Taste-brief tool that suggests song directions from an artist's most-played tracks. Non-commercial."
3. Copy the **API key** (the shared secret is not needed).
4. Store it as `LASTFM_API_KEY` in Vercel (Production and Preview) and in `.env.local`. Server-side only; never `NEXT_PUBLIC_`. Redeploy.
5. Terms to check first: <https://www.last.fm/api/tos> — non-commercial use; commercial use needs an agreement (partners at last.fm); credit Last.fm with links (we link every artist and track back); public pages using the API should be approved by Last.fm; respect rate limits and caching; remove Last.fm data if the key is terminated. We have **not** added Last.fm's "powered by" button asset yet.
- `LASTFM_API_BASE` exists only so tests and local screenshots can point at a mock server.

## Contact + talent intake env vars

Copy `.env.example` to `.env.local` and set (shared by `/api/contact` and `/api/talent-intake`):

- `RESEND_API_KEY`
- `CONTACT_TO_EMAIL` (defaults to `shawn@ikosagon.com`)
- `CONTACT_FROM_EMAIL` (production pattern: `hello@send.ikosagon.com`)

Talent intake may attach short voice/photo files when under Hobby size caps; larger media is noted in the email without attachment.

## Deployment

Use Vercel for hosting and connect GoDaddy DNS. Full steps are in `DEPLOY.md`.
