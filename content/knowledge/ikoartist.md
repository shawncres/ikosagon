---
title: IkoArtist
slug: ikoartist
---

# IkoArtist

Ikosagon’s **IkoArtist** (formerly AI Recording Artist) is a **web product** for almost anonymous song participation. An **agentic system** produces music and **cycles it into the player**; **better songs get higher priority** in the playlist. No account required. Low friction.

## What exists today

- Page: /projects/ikoartist (old URL /projects/ai-recording-artist redirects here)
- **Ranked playlist** player — agentic pipeline feeds tracks; stronger songs rise (framed as product behavior, not a live auto-generate button on every click)
- Clickable taste path (genre → mood → era → geo-ish → artists → albums) → **3 track leans**
- **Anonymous finish is enough** — path + picks go to the agentic song pipeline via `/api/talent-intake`; visitor email is **optional** (opportunities only)
- Optional voice / photo add-ons
- Free catalog seed (`data/music-catalog.json` from iTunes Search; optional `GET /api/music-catalog?live=1` overlay with MusicBrainz best-effort). Labeled with an **as of** date. No paid music-data vendors.

## Employer-facing stack (light)

Next.js on Vercel Hobby; Resend for backend intake email; free music backends (iTunes Search, MusicBrainz) with seed fallback.

## What is not public yet

- No public rate card
- No live click-to-generate / auto Suno spend on the page (pipeline generates and ranks off-page)
- No automatic star-potential scoring published as a visitor metric

## How to inquire

Use the taste path on /projects/ikoartist (anonymous OK — song path still runs through the agentic pipeline), or optionally leave email there / use /contact / shawn@ikosagon.com if you want opportunity follow-up. Do not invent prices.
