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
2. Click-path taste intake (genre → mood → era → geo-ish → artists → albums)
3. Three track leans (`POST /api/music-recommend`) with short “why” copy
4. Finish anonymously (path + picks still email Shawn via `/api/talent-intake` for the song workflow)
5. Optional voice / photo / email — email only if the visitor wants opportunity follow-up

### Catalog freshness (free backends)

- Seed: `data/music-catalog.json` (built from **iTunes Search API**, no key) labeled with an **as of** date
- Read: `GET /api/music-catalog` (seed by default)
- Optional live overlay: `GET /api/music-catalog?live=1` — rate-limited (~60s), short timeouts; tries iTunes refresh and MusicBrainz artist enrichment; falls back to seed if flaky
- No Chartmetric / Spotify premium; no invented chart ranks

## Contact + talent intake env vars

Copy `.env.example` to `.env.local` and set (shared by `/api/contact` and `/api/talent-intake`):

- `RESEND_API_KEY`
- `CONTACT_TO_EMAIL` (defaults to `shawn@ikosagon.com`)
- `CONTACT_FROM_EMAIL` (production pattern: `hello@send.ikosagon.com`)

Talent intake may attach short voice/photo files when under Hobby size caps; larger media is noted in the email without attachment.

## Deployment

Use Vercel for hosting and connect GoDaddy DNS. Full steps are in `DEPLOY.md`.
