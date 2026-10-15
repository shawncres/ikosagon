---
title: IkoArtist
slug: ikoartist
---

# IkoArtist

Ikosagon’s **IkoArtist** (formerly AI Recording Artist) is a **web product** for almost anonymous song participation. Visitors discover tastes and songs they might like — answering as many questions as they want — so the **agentic Ikosagon engine** has enough signal to understand what they’d want to hear. The engine produces the hit over time (curated choices + adapting agentic processes); results compete on a **leaderboard-style playlist ranked by views**. No account required. Low friction.

## What exists today

- Page: /projects/ikoartist (old URL /projects/ai-recording-artist redirects here)
- **Leaderboard-style playlist** player — ranked by views; better tracks rise (framed as product behavior, not a live auto-generate button on every click)
- **Song-brief intake**, click-first with a skip and an optional “add your own” (short, sanitized, never required) on every step:
  - **Sound layer** — a question tree isolates three favorite artists: genre / era / region → anchor pick → up to three discriminating questions chosen from what the anchor can’t explain (raw vs polished, lyrics vs groove, mainstream vs underground, instrumentation, energy, tempo) → second pick offered mostly close to the first → third pick offered further out → a contrast question (what one has that another doesn’t). We compute a taste vector per artist and a **range profile** (center + spread across the three picks).
  - **Theme layer** — tap lyrical themes (heartbreak, love, hustle, nostalgia, faith, party, escapism, social commentary, resilience, rebellion, introspection, home and roots). Themes are tagged on each artist’s best-known tracks; the brief shows the overlap and, when reachable, a dated chart context from the public iTunes Top Songs feed (no ranks shown, honest about how many chart rows matched our tag table).
  - **Audience layer (optional)** — age band, region, language, listening contexts; bands only, anonymous, no account, not part of the transcript.
- **Song brief** on the finish screen: center, range, themes, audience, and **three track leans** (one from the overlap, one from each edge of the range) with a plain “why”. The structured brief is included in the Resend summary (readable section plus a `song-brief.json` attachment).
- **Anonymous finish is enough** — brief + picks go to the agentic song pipeline via `/api/talent-intake`; visitor email is **optional** (opportunities only)
- Optional voice / photo add-ons
- **Data honesty:** artist sound numbers and theme tags are our hand-written editorial estimates (about 175 artists), not measured audio features, and not stream or chart data. Free sources only: iTunes public RSS chart context, MusicBrainz tags for free-text artists, and, when that connection is switched on, Last.fm’s free public API for an artist’s most-played tracks, tags and similar artists (non-commercial terms; credited and linked on the page). Every brief says which source its three track picks came from: Last.fm’s most-played order with an as-of date, or our own editorial picks when Last.fm isn’t available. Last.fm counts are scrobble data, not stream totals across services, and we never show chart ranks. Dated with an **as of** date.

## Employer-facing stack (light)

Next.js on Vercel Hobby; Resend for backend intake email; free music backends (iTunes public RSS, MusicBrainz tags, optional Last.fm free API) with an editorial seed fallback.

## What is not public yet

- No public rate card
- No live click-to-generate / auto Suno spend on the page (agentic engine generates and ranks off-page; takes some time). The brief describes the song to make; it does not generate audio on this page
- No claim that the taste map is measured data, and no published chart ranks
- No automatic star-potential scoring published as a visitor metric

## How to inquire

Use the taste path on /projects/ikoartist (anonymous OK — answer as many questions as you want; song path still runs through the agentic engine), or optionally leave email there / use /contact / shawn@ikosagon.com if you want opportunity follow-up. Do not invent prices.
