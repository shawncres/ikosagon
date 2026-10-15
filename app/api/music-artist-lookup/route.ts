import { NextResponse } from "next/server";
import { sanitizeFreeText } from "@/lib/music/taste/sanitize";
import { getLastfm } from "@/lib/music/lastfm";
import { tagOnlyVector } from "@/lib/music/taste/vector";

export const runtime = "nodejs";
export const maxDuration = 8;

const UA = "IkosagonMusicCatalog/1.0 (https://ikosagon.com; shawn@ikosagon.com)";
const MIN_GAP_MS = 1100; // MusicBrainz asks for at most ~1 request per second
const g = globalThis as typeof globalThis & { __ikoMbAt?: number };

type MbArtist = { name?: string; score?: number; tags?: Array<{ name?: string; count?: number }>; "life-span"?: { begin?: string } };

/** Free-text artist -> tags -> rough sound vector, from MusicBrainz (no key). Best effort, honest about confidence. */
export async function GET(request: Request) {
  const name = sanitizeFreeText(new URL(request.url).searchParams.get("name"), 60);
  if (name.length < 2) return NextResponse.json({ ok: false, error: "Type an artist name." }, { status: 400 });

  const now = Date.now();
  if (g.__ikoMbAt && now - g.__ikoMbAt < MIN_GAP_MS) {
    return NextResponse.json({ ok: false, error: "Busy — try again in a moment." }, { status: 429 });
  }
  g.__ikoMbAt = now;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);
  try {
    const url = `https://musicbrainz.org/ws/2/artist/?query=${encodeURIComponent(`artist:"${name.replace(/"/g, "")}"`)}&fmt=json&limit=3`;
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json", "User-Agent": UA }, cache: "no-store" });
    if (!res.ok) return NextResponse.json({ ok: false, error: "Artist lookup unavailable right now." }, { status: 502 });
    const json = (await res.json()) as { artists?: MbArtist[] };
    const top = (json.artists || []).find((a) => (a.score ?? 0) >= 90 && a.name);

    // Last.fm (free key, server-side, cached) gives richer crowd tags than MusicBrainz. Optional: MusicBrainz alone still works.
    const lf = await getLastfm().enrich(top?.name || name);
    const lfTags = lf.status === "ok" ? lf.data.tags : [];
    if (!top?.name && !lfTags.length) return NextResponse.json({ ok: true, found: false });

    const mbTags = (top?.tags || [])
      .slice()
      .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
      .map((t) => String(t.name || ""))
      .filter(Boolean)
      .slice(0, 10);
    const tags = [...new Set([...lfTags, ...mbTags])].slice(0, 14);
    const { vector, matched, known } = tagOnlyVector(tags);
    const begin = Number(String(top?.["life-span"]?.begin || "").slice(0, 4));
    const peak = Number.isFinite(begin) && begin > 1900 ? Math.max(1960, Math.min(2025, begin + 8)) : 2015;
    const confident = matched.length >= 2 && known >= 3;
    return NextResponse.json({
      ok: true,
      found: true,
      name: sanitizeFreeText(top?.name || name, 60),
      tags: tags.map((t) => sanitizeFreeText(t, 30).toLowerCase()).filter(Boolean),
      matchedTags: matched,
      confident,
      vector: confident ? vector : null,
      peak,
      source: lfTags.length ? "Last.fm + MusicBrainz tags (free, community-edited)" : "MusicBrainz tags (free, community-edited)",
      lastfm: lfTags.length,
    });
  } catch {
    return NextResponse.json({ ok: false, error: "Artist lookup timed out." }, { status: 504 });
  } finally {
    clearTimeout(timer);
  }
}
