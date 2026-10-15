import { SEED_ARTISTS } from "./seed";
import { titleKey } from "./titleKey";
import type { Pickable } from "./tree";
import type { ArtistEnrichment, PickTrack, SeedTrack } from "./types";

function nameKey(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const SEED_BY_NAME = new Map(SEED_ARTISTS.map((a) => [nameKey(a.name), a.id]));

/** Which of the names Last.fm calls "similar" are artists in our seed. Order follows Last.fm's own order. */
export function similarSeedIds(similar: string[], excludeId?: string): string[] {
  const out: string[] = [];
  for (const n of similar) {
    const id = SEED_BY_NAME.get(nameKey(n));
    if (id && id !== excludeId && !out.includes(id)) out.push(id);
  }
  return out;
}

/**
 * Replace an artist's lean candidates with its Last.fm top tracks. A Last.fm track that matches one of
 * our seed tracks by title keeps that track's theme tags and per-track sound nudges; any other Last.fm
 * track uses the artist's own sound numbers and carries no theme tag (we do not guess themes).
 * Themes for the brief still come from the seed tracks, so a Last.fm outage never changes them.
 */
export function applyEnrichment(artists: Pickable[], enrichment: Record<string, ArtistEnrichment | undefined>): Pickable[] {
  return artists.map((a) => {
    const e = enrichment[a.id];
    if (!e || !e.topTracks.length) return a;
    const seedByKey = new Map<string, SeedTrack>(a.tracks.map((t) => [titleKey(t.title), t]));
    const topTracks: PickTrack[] = e.topTracks.map((t) => {
      const seed = seedByKey.get(titleKey(t.title));
      return {
        title: t.title,
        album: seed?.album ?? "",
        year: seed?.year ?? null,
        themes: seed ? seed.themes : [],
        role: "Last.fm top track" as const,
        ...(seed?.tweak ? { tweak: seed.tweak } : {}),
        lastfm: t,
      };
    });
    return { ...a, topTracks };
  });
}

/** Validate the enrichment map a page receives from our own endpoint before using it. Anything odd is dropped. */
export function parseEnrichmentMap(raw: unknown): Record<string, ArtistEnrichment> {
  const out: Record<string, ArtistEnrichment> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [id, v] of Object.entries(raw as Record<string, unknown>).slice(0, 3)) {
    const e = v as Partial<ArtistEnrichment> | null;
    if (!e || typeof e !== "object" || e.source !== "Last.fm" || typeof e.name !== "string" || !Array.isArray(e.topTracks)) continue;
    if (typeof e.url !== "string" || !/^https:\/\/www\.last\.fm\//.test(e.url)) continue;
    const str = (x: unknown, n: number) => String(x ?? "").slice(0, n);
    const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : null);
    const topTracks = e.topTracks.slice(0, 5).flatMap((t, i) => {
      const title = str(t?.title, 120);
      if (!title) return [];
      const url = typeof t?.url === "string" && /^https:\/\/www\.last\.fm\//.test(t.url) ? t.url.slice(0, 300) : null;
      return [{ title, rank: i + 1, listeners: num(t?.listeners), plays: num(t?.plays), url }];
    });
    out[id] = {
      id,
      name: str(e.name, 60),
      source: "Last.fm",
      asOf: /^\d{4}-\d{2}-\d{2}$/.test(String(e.asOf)) ? String(e.asOf) : "",
      url: e.url.slice(0, 300),
      tags: (Array.isArray(e.tags) ? e.tags : []).slice(0, 12).map((t) => str(t, 30)).filter(Boolean),
      similar: (Array.isArray(e.similar) ? e.similar : []).slice(0, 24).map((t) => str(t, 60)).filter(Boolean),
      similarSeedIds: (Array.isArray(e.similarSeedIds) ? e.similarSeedIds : []).map((t) => str(t, 60)).filter((t) => SEED_ARTISTS.some((a) => a.id === t)).slice(0, 12),
      topTracks,
    };
    if (!out[id].asOf) delete out[id];
  }
  return out;
}
