---
title: IkoArtist
slug: ikoartist
---

# IkoArtist

Ikosagon’s **IkoArtist** (formerly AI Recording Artist) is a **web product** for almost anonymous song participation. Visitors discover tastes and songs they might like — answering as many questions as they want — so the **agentic Ikosagon engine** has enough signal to understand what they’d want to hear. The engine produces the hit over time (curated choices + adapting agentic processes); results compete on a **leaderboard-style playlist ranked by views**. No account required. Low friction.

## What exists today

- Page: /projects/ikoartist (old URL /projects/ai-recording-artist redirects here)
- **Leaderboard-style playlist** player — ranked by views; better tracks rise (framed as product behavior, not a live auto-generate button on every click)
- Low-commitment taste path (genre → mood → era → geo-ish → artists → albums) — answer as many as you want → **3 track leans** (songs you might like)
- **Anonymous finish is enough** — path + picks go to the agentic song pipeline via `/api/talent-intake`; visitor email is **optional** (opportunities only)
- Optional voice / photo add-ons
- Free catalog seed (`data/music-catalog.json` from iTunes Search; optional `GET /api/music-catalog?live=1` overlay with MusicBrainz best-effort). Labeled with an **as of** date. No paid music-data vendors.

## Employer-facing stack (light)

Next.js on Vercel Hobby; Resend for backend intake email; free music backends (iTunes Search, MusicBrainz) with seed fallback.

## What is not public yet

- No public rate card
- No live click-to-generate / auto Suno spend on the page (agentic engine generates and ranks off-page; takes some time)
- No automatic star-potential scoring published as a visitor metric

## How to inquire

Use the taste path on /projects/ikoartist (anonymous OK — answer as many questions as you want; song path still runs through the agentic engine), or optionally leave email there / use /contact / shawn@ikosagon.com if you want opportunity follow-up. Do not invent prices.
