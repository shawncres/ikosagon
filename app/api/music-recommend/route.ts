import { NextResponse } from "next/server";
import { loadSeedCatalog } from "@/lib/music/loadCatalog";
import { recommendTracks } from "@/lib/music/recommend";
import type { TasteProfile } from "@/lib/music/types";

export const runtime = "nodejs";
export const maxDuration = 8;

function asStringArray(value: unknown, max = 20): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .slice(0, max);
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const profile: TasteProfile = {
    genres: asStringArray(body.genres, 8),
    mood: body.mood ? String(body.mood).trim().slice(0, 80) : undefined,
    era: body.era ? String(body.era).trim().slice(0, 80) : undefined,
    region: body.region ? String(body.region).trim().slice(0, 80) : undefined,
    artists: asStringArray(body.artists, 12),
    albums: asStringArray(body.albums, 12),
  };

  try {
    const catalog = await loadSeedCatalog();
    const picks = recommendTracks(catalog, profile, 3);
    return NextResponse.json({
      ok: true,
      asOf: catalog.asOf,
      source: catalog.source,
      picks,
      profile,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Recommendation failed.",
      },
      { status: 500 },
    );
  }
}
