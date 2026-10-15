import { NextResponse } from "next/server";
import { enrichTargets, targetsFrom } from "@/lib/music/enrichArtists";
import { LASTFM_CREDIT } from "@/lib/music/lastfm";

export const runtime = "nodejs";
export const maxDuration = 15;

/**
 * Optional Last.fm detail for up to three picked artists (top tracks, tags, similar artists).
 * The API key stays on the server. With no key configured this answers `enabled: false` and the page
 * keeps using the editorial seed. `ids` are seed ids; `custom` are free-text artist names (separated by "|").
 */
export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const ids = (sp.get("ids") || "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 3);
  const custom = (sp.get("custom") || "").split("|").map((s) => s.trim()).filter(Boolean).slice(0, 3);
  const targets = targetsFrom(ids, custom);
  if (!targets.length) return NextResponse.json({ ok: true, enabled: false, artists: {}, missing: [], credit: LASTFM_CREDIT });
  const out = await enrichTargets(targets, { budgetMs: 6000 });
  return NextResponse.json(
    { ok: true, enabled: out.enabled, artists: out.artists, missing: out.missing, credit: LASTFM_CREDIT },
    { headers: { "Cache-Control": "no-store" } },
  );
}
