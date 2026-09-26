---
title: IkoArtist
slug: ikoartist
---

# IkoArtist

Ikosagon’s **IkoArtist** (formerly AI Recording Artist) is a **web product** for people to almost anonymously participate in Ikosagon making a song for them. No account required. Low friction.

## What exists today

- Page: /projects/ikoartist (old URL /projects/ai-recording-artist redirects here)
- **Top tracks** player — featured / proof of results (not framed as a generic demo dump)
- Clickable taste path (genre → mood → era → geo-ish → artists → albums) → **3 track leans**
- **Anonymous finish works end-to-end** — path + picks email Shawn via `/api/talent-intake` for the song workflow; visitor email is **optional** (only for opportunity follow-up)
- Optional voice / photo add-ons
- Free catalog seed (`data/music-catalog.json` from iTunes Search; optional `GET /api/music-catalog?live=1` overlay with MusicBrainz best-effort). Labeled with an **as of** date. No paid music-data vendors.

## Employer-facing stack (light)

Next.js on Vercel Hobby; Resend for backend intake email; free music backends (iTunes Search, MusicBrainz) with seed fallback.

## What is not public yet

- No public rate card
- No live generation / auto Suno spend on the page
- No automatic star-potential scoring

## How to inquire

Use the taste path on /projects/ikoartist (anonymous OK), or optionally leave email there / use /contact / shawn@ikosagon.com if you want follow-up. Do not invent prices.
