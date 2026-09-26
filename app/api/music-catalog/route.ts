import { NextResponse } from "next/server";
import { loadSeedCatalog } from "@/lib/music/loadCatalog";
import { maybeLiveRefresh } from "@/lib/music/liveRefresh";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function GET(request: Request) {
  try {
    const seed = await loadSeedCatalog();
    const { searchParams } = new URL(request.url);
    const live = searchParams.get("live") === "1" || searchParams.get("refresh") === "1";
    const genre = searchParams.get("genre") || undefined;

    if (!live) {
      return NextResponse.json({
        ok: true,
        catalog: seed,
        asOf: seed.asOf,
        liveRefreshed: false,
        note: `Serving curated seed (as of ${seed.asOf}). Pass ?live=1 for a rate-limited iTunes/MusicBrainz overlay.`,
      });
    }

    const catalog = await maybeLiveRefresh(seed, genre || undefined);
    return NextResponse.json({
      ok: true,
      catalog,
      asOf: catalog.asOf,
      liveRefreshed: Boolean(catalog.liveRefreshed),
      note: catalog.liveNote || `Catalog as of ${catalog.asOf}`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Could not load music catalog.",
      },
      { status: 500 },
    );
  }
}
