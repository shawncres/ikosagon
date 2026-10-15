import { SEED_ARTISTS } from "./seed";
import type { ThemeId, TrendingContext } from "./types";

export const CHART_SOURCE = "Apple iTunes Store US Top Songs (public RSS, no key)";
export const CHART_URL = "https://itunes.apple.com/us/rss/topsongs/limit=25/json";

export type ChartRow = { artist: string; title: string; genre: string };

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

type RawEntry = {
  "im:name"?: { label?: string };
  "im:artist"?: { label?: string };
  category?: { attributes?: { label?: string } };
};

/** Parse the public iTunes RSS JSON. Returns the rows and the feed's own updated date (YYYY-MM-DD). */
export function parseChart(json: unknown): { rows: ChartRow[]; asOf: string | null } {
  const feed = (json as { feed?: { updated?: { label?: string }; entry?: RawEntry[] } } | null)?.feed;
  const entries = Array.isArray(feed?.entry) ? feed.entry : [];
  const rows: ChartRow[] = entries
    .map((e) => ({
      artist: String(e["im:artist"]?.label || "").slice(0, 160),
      title: String(e["im:name"]?.label || "").slice(0, 160),
      genre: String(e.category?.attributes?.label || "").slice(0, 40),
    }))
    .filter((r) => r.artist && r.title);
  const updated = String(feed?.updated?.label || "");
  const asOf = /^\d{4}-\d{2}-\d{2}/.test(updated) ? updated.slice(0, 10) : null;
  return { rows, asOf };
}

const SEED_BY_NAME = new Map(SEED_ARTISTS.map((a) => [norm(a.name), a]));

function artistsInRow(artist: string) {
  const parts = artist
    .split(/\s*(?:&|,|\bfeat\.?|\bft\.?|\bwith\b|\band\b|\bx\b)\s*/i)
    .map((p) => norm(p))
    .filter(Boolean);
  const found = new Set<string>();
  const whole = SEED_BY_NAME.get(norm(artist));
  if (whole) found.add(whole.id);
  for (const p of parts) {
    const a = SEED_BY_NAME.get(p);
    if (a) found.add(a.id);
  }
  return [...found].map((id) => SEED_ARTISTS.find((a) => a.id === id)!);
}

/**
 * Honest chart context: which of OUR theme tags show up among the artists currently on a public chart.
 * It reads artists, not songs, shows no chart ranks, and says how many rows it could match.
 */
export function trendingFromChart(rows: ChartRow[], asOf: string): TrendingContext {
  const themeArtists = new Map<ThemeId, Set<string>>();
  let matched = 0;
  const genreCount = new Map<string, number>();
  for (const row of rows) {
    if (row.genre) genreCount.set(row.genre, (genreCount.get(row.genre) || 0) + 1);
    const found = artistsInRow(row.artist);
    if (!found.length) continue;
    matched += 1;
    for (const a of found) {
      for (const t of a.tracks) {
        for (const th of t.themes) {
          const set = themeArtists.get(th) || new Set<string>();
          set.add(a.id);
          themeArtists.set(th, set);
        }
      }
    }
  }
  const enough = matched >= 2;
  const themes = enough
    ? [...themeArtists.entries()]
        .map(([theme, set]) => ({ theme, artists: set.size }))
        .sort((a, b) => b.artists - a.artists || a.theme.localeCompare(b.theme))
        .slice(0, 4)
    : [];
  const genreMix = [...genreCount.entries()]
    .map(([genre, count]) => ({ genre, count }))
    .sort((a, b) => b.count - a.count || a.genre.localeCompare(b.genre))
    .slice(0, 4);
  const note = enough
    ? `Chart context: ${CHART_SOURCE}, as of ${asOf}. ${matched} of ${rows.length} rows include an artist in our tag table; themes are our editorial tags on those artists, not an analysis of the songs. No chart ranks shown.`
    : `Chart context: ${CHART_SOURCE}, as of ${asOf}. Only ${matched} of ${rows.length} rows matched our tag table, so no theme read this time (genre mix only). No chart ranks shown.`;
  return { asOf, source: CHART_SOURCE, matched, total: rows.length, themes, genreMix, note };
}
