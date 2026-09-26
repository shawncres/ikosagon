---
title: AI Recording Artist
slug: ai-recording-artist
---

# AI Recording Artist

Ikosagon is exploring an AI Recording Artist offering: a portfolio page with demo playback (proof of results) and a free talent intake chatbot for artists and partners.

## What exists today

- A featured project page at /projects/ai-recording-artist
- An HTML5 audio playlist with real sample tracks from the project library
- A guided, skippable intake chatbot (genres, favorites, age category, location/geo, tastes, optional voice/photo, contact)
- On complete, `/api/talent-intake` emails Shawn an HTML summary via the same Resend setup as the contact form (`RESEND_API_KEY`, `CONTACT_FROM_EMAIL` such as hello@send.ikosagon.com, `CONTACT_TO_EMAIL`)
- Stub copy for "Active artist representation" — coming after Shawn's approval

## What is not public yet

- No public rate card or package prices for artist collaborations
- No live Suno, ElevenLabs, or Gemini generation on this page
- No automatic star-potential scoring
- Proprietary taste/geo algorithms and career suggestions are future features — they require Shawn's explicit yes before any costed agentic work
- Voice/photo email attachments are size-capped for Vercel Hobby (~1.8 MB voice, ~1.2 MB photo); larger captures are noted in the email without attaching

## How to inquire

Artists can use the intake chatbot on /projects/ai-recording-artist, or the contact form at /contact / email shawn@ikosagon.com. Mention "AI Recording Artist". Scope and pricing are discussed after review — the site assistant must not invent a price.
