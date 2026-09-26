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

## AI Recording Artist audio

Real playlist MP3s live under `public/projects/ai-recording-artist/` and are committed.
Optional tiny lavfi demos can still be materialized with `node scripts/ensure-demo-audio.mjs`
(from `scripts/demo-audio/*.mp3.b64`); those `demo-*.mp3` outputs are gitignored and unused by the page.

## Contact form env vars

Copy `.env.example` to `.env.local` and set:

- `RESEND_API_KEY`
- `CONTACT_TO_EMAIL`
- `CONTACT_FROM_EMAIL`

## Deployment

Use Vercel for hosting and connect GoDaddy DNS. Full steps are in `DEPLOY.md`.
