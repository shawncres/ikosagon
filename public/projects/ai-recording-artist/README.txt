Demo audio for the AI Recording Artist project page.

Source: ffmpeg lavfi sine tones, encoded to tiny MP3s, stored as base64 in
scripts/demo-audio/*.mp3.b64 (text-only for easy PR pushes).

Materialize with:
  node scripts/ensure-demo-audio.mjs
(also runs on npm postinstall / prebuild)

Tracks are labeled as demos / placeholders in the UI.
Replace with real AI artist demos when ready.
