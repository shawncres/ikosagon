import { SEED_ARTISTS } from "./seed";
import {
  DIMS,
  type CustomArtist,
  type Dim,
  type Level,
  type SeedArtist,
  type PickTrack,
  type SeedTrack,
  type Vector,
} from "./types";
import { DIM_COPY, ERA_YEAR, LEVEL_VALUE, clamp01, distance, pct } from "./vector";

/** A seed artist or a free-text artist sized from tags (no tracks). */
export type Pickable = {
  id: string;
  name: string;
  genres: string[];
  region: string;
  peak: number;
  vector: Vector;
  /** Seed tracks (the source of theme tags). Empty for free-text artists. */
  tracks: SeedTrack[];
  /** Lean candidates from Last.fm, when enrichment was applied. Falls back to `tracks`. */
  topTracks?: PickTrack[];
  custom: boolean;
};

export function fromSeed(a: SeedArtist): Pickable {
  return { id: a.id, name: a.name, genres: a.genres, region: a.region, peak: a.peak, vector: a.vector, tracks: a.tracks, custom: false };
}

export function fromCustom(c: CustomArtist): Pickable {
  return { id: c.id, name: c.name, genres: [], region: "", peak: c.peak, vector: c.vector, tracks: [], custom: true };
}

export function resolveArtists(ids: string[], custom: CustomArtist[] = []): Pickable[] {
  const out: Pickable[] = [];
  for (const id of ids) {
    const seed = SEED_ARTISTS.find((a) => a.id === id);
    if (seed) {
      out.push(fromSeed(seed));
      continue;
    }
    const c = custom.find((x) => x.id === id);
    if (c) out.push(fromCustom(c));
  }
  return out;
}

function byName(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name);
}

function eraProximity(peak: number, eraYear: number | null): number {
  if (eraYear == null) return 0.5;
  return 1 - Math.min(1, Math.abs(peak - eraYear) / 40);
}

export type AnchorCriteria = { genres: string[]; era: string | null; region: string | null };

/**
 * Step 1 of the sound tree: the anchor pick. Branches from genre, era and region, favours artists most
 * people recognise, and keeps each page of options from being all one genre. Deterministic.
 */
export function anchorOptions(criteria: AnchorCriteria, page = 0, size = 8): { options: SeedArtist[]; pages: number } {
  const eraYear = criteria.era ? (ERA_YEAR[criteria.era] ?? null) : null;
  const inGenre = criteria.genres.length
    ? SEED_ARTISTS.filter((a) => a.genres.some((g) => criteria.genres.includes(g)))
    : SEED_ARTISTS;
  const pool = inGenre.length >= size ? inGenre : SEED_ARTISTS;
  const regionPref = criteria.region && criteria.region !== "Global mix" ? criteria.region : null;
  const scored = pool
    .map((a) => ({
      a,
      s: 0.5 * eraProximity(a.peak, eraYear) + (regionPref && a.region === regionPref ? 0.3 : 0) + 0.2 * a.vector.mainstream,
    }))
    .sort((x, y) => y.s - x.s || byName(x.a, y.a));

  // Keep any one genre from filling a page unless the visitor already pinned a single genre or a region.
  const diversify = criteria.genres.length >= 2 || (!criteria.genres.length && !regionPref);
  const pages: SeedArtist[][] = [];
  const left = scored.map((x) => x.a);
  while (left.length) {
    const pageItems: SeedArtist[] = [];
    const counts: Record<string, number> = {};
    // First pass: cap any one genre at 3 per page. Second pass: fill whatever is left in order.
    for (const cap of [diversify ? 3 : Infinity, Infinity]) {
      for (let i = 0; i < left.length && pageItems.length < size; ) {
        const g = left[i].genres[0];
        if ((counts[g] || 0) >= cap) {
          i += 1;
          continue;
        }
        counts[g] = (counts[g] || 0) + 1;
        pageItems.push(left[i]);
        left.splice(i, 1);
      }
    }
    pages.push(pageItems);
  }
  const idx = ((page % pages.length) + pages.length) % pages.length;
  return { options: pages[idx], pages: pages.length };
}

function std(values: number[]): number {
  if (!values.length) return 0;
  const m = values.reduce((s, v) => s + v, 0) / values.length;
  return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length);
}

/**
 * Step 2: which dimensions can the anchor NOT explain? A dimension where the anchor sits near the middle
 * says little about what the visitor wants, and where artists in their genres disagree a lot it matters.
 * Returns up to `count` unanswered dimensions, most informative first.
 */
export function nextQuestions(anchor: Pickable, genres: string[], answered: Dim[], count = 3): Dim[] {
  const pool = (genres.length ? SEED_ARTISTS.filter((a) => a.genres.some((g) => genres.includes(g))) : SEED_ARTISTS) as Array<{
    vector: Vector;
  }>;
  const rows = DIMS.filter((d) => !answered.includes(d)).map((d, order) => {
    const ambiguity = 1 - Math.abs(2 * anchor.vector[d] - 1);
    const spread = Math.min(1, std(pool.map((a) => a.vector[d])) / 0.3);
    return { d, order, score: 0.7 * ambiguity + 0.3 * spread };
  });
  rows.sort((x, y) => y.score - x.score || x.order - y.order);
  return rows.slice(0, count).map((r) => r.d);
}

/** Preference vector: the anchor's sound, pulled toward each answered dimension. */
export function targetVector(anchor: Pickable, answers: Partial<Record<Dim, Level>>): Vector {
  const out = { ...anchor.vector };
  for (const d of DIMS) {
    const lvl = answers[d];
    if (!lvl || lvl === "any") continue;
    out[d] = clamp01(0.4 * anchor.vector[d] + 0.6 * LEVEL_VALUE[lvl]);
  }
  return out;
}

export type PickBand = "near" | "step" | "far" | "wild";
export type PickOption = { artist: SeedArtist; band: PickBand; label: string; distance: number; /** True when Last.fm lists this artist as similar to the anchor. */ similar?: boolean };

function meanDistance(x: SeedArtist, chosen: Pickable[]): number {
  return chosen.reduce((s, c) => s + distance(x.vector, c.vector, x.peak, c.peak), 0) / Math.max(1, chosen.length);
}

/**
 * Steps 3 and 4: second and third picks, offered at deliberately different distances from what is
 * already chosen. Stage 2 is mostly close neighbours plus a step away; stage 3 reaches further out.
 * Within a band, artists are ranked by fit to the visitor's preference vector.
 */
export function suggestNext(
  stage: 2 | 3,
  chosen: Pickable[],
  target: Vector,
  genres: string[],
  era: string | null,
  /** Seed ids Last.fm lists as similar to the anchor, best match first. Only used for the second pick. */
  similarIds: string[] = [],
): PickOption[] {
  if (!chosen.length) return [];
  const chosenIds = new Set(chosen.map((c) => c.id));
  const chosenNames = new Set(chosen.map((c) => c.name.toLowerCase()));
  const pool = SEED_ARTISTS.filter((a) => !chosenIds.has(a.id) && !chosenNames.has(a.name.toLowerCase()));
  const sorted = pool.map((a) => ({ a, d: meanDistance(a, chosen) })).sort((x, y) => x.d - y.d || byName(x.a, y.a));
  const n = sorted.length;
  const band = (i: number): PickBand => (i < 0.2 * n ? "near" : i < 0.45 * n ? "step" : i < 0.8 * n ? "far" : "wild");
  const eraYear = era ? (ERA_YEAR[era] ?? null) : null;
  const fit = (a: SeedArtist) =>
    1 - distance(a.vector, target, a.peak, eraYear) + (a.genres.some((g) => genres.includes(g)) ? 0.08 : 0);

  const buckets: Record<PickBand, Array<{ a: SeedArtist; d: number }>> = { near: [], step: [], far: [], wild: [] };
  sorted.forEach((row, i) => buckets[band(i)].push(row));
  for (const b of Object.keys(buckets) as PickBand[]) buckets[b].sort((x, y) => fit(y.a) - fit(x.a) || byName(x.a, y.a));

  const anchorName = chosen[0].name;
  const labelFor = (b: PickBand): string =>
    b === "near" ? `Close to ${anchorName}` : b === "step" ? "A step away" : b === "far" ? "Different angle" : "Wildcard";
  const plan: Array<[PickBand, number]> = stage === 2 ? [["near", 4], ["step", 2]] : [["step", 2], ["far", 3], ["wild", 1]];

  // Last.fm "similar artists" (second pick only): up to two seed artists lead the list, labelled as such.
  const lead: PickOption[] = [];
  if (stage === 2 && similarIds.length) {
    const byId = new Map(sorted.map((r, i) => [r.a.id, { ...r, band: band(i) }]));
    for (const id of similarIds) {
      const row = byId.get(id);
      if (!row || lead.length >= 2) continue;
      lead.push({ artist: row.a, band: row.band, label: `Last.fm: similar to ${anchorName}`, distance: Math.round(row.d * 100) / 100, similar: true });
    }
  }
  const leadIds = new Set(lead.map((o) => o.artist.id));
  const out: PickOption[] = [...lead];
  for (const [b, take] of plan) {
    let n2 = 0;
    for (const row of buckets[b]) {
      if (n2 >= take) break;
      if (leadIds.has(row.a.id)) continue;
      out.push({ artist: row.a, band: b, label: labelFor(b), distance: Math.round(row.d * 100) / 100 });
      n2 += 1;
    }
  }
  return stage === 2 ? out.slice(0, 6) : out;
}

export type ContrastOption = { dim: Dim; favors: string; label: string };

/** Contrast question: what does the farthest-apart pair differ on? Two chips per big difference. */
export function contrastOptions(chosen: Pickable[]): { pair: [Pickable, Pickable] | null; options: ContrastOption[] } {
  if (chosen.length < 2) return { pair: null, options: [] };
  let best: [Pickable, Pickable] = [chosen[0], chosen[1]];
  let bestD = -1;
  for (let i = 0; i < chosen.length; i += 1) {
    for (let j = i + 1; j < chosen.length; j += 1) {
      const d = distance(chosen[i].vector, chosen[j].vector, chosen[i].peak, chosen[j].peak);
      if (d > bestD + 1e-9) {
        bestD = d;
        best = [chosen[i], chosen[j]];
      }
    }
  }
  const [x, y] = best;
  const diffs = DIMS.map((d) => ({ d, diff: Math.abs(x.vector[d] - y.vector[d]) }))
    .filter((r) => r.diff >= 0.12)
    .sort((p, q) => q.diff - p.diff || DIMS.indexOf(p.d) - DIMS.indexOf(q.d))
    .slice(0, 2);
  const options: ContrastOption[] = [];
  for (const { d } of diffs) {
    const xHigh = x.vector[d] > y.vector[d];
    options.push({ dim: d, favors: x.id, label: `${x.name}: ${xHigh ? DIM_COPY[d].highTrait : DIM_COPY[d].lowTrait}` });
    options.push({ dim: d, favors: y.id, label: `${y.name}: ${xHigh ? DIM_COPY[d].lowTrait : DIM_COPY[d].highTrait}` });
  }
  return { pair: best, options };
}

/** Plain-language read of an anchor, used as the lead-in to the discriminating questions. */
export function anchorReadout(anchor: Pickable): string {
  const strong = DIMS.map((d) => ({ d, off: Math.abs(anchor.vector[d] - 0.5) }))
    .filter((r) => r.off >= 0.25)
    .sort((a, b) => b.off - a.off)
    .slice(0, 2)
    .map((r) => `${anchor.vector[r.d] >= 0.5 ? DIM_COPY[r.d].highTrait : DIM_COPY[r.d].lowTrait} (${pct(anchor.vector[r.d])})`);
  return strong.length ? `${anchor.name} reads as ${strong.join(" and ")}.` : `${anchor.name} sits mid-range on most things.`;
}
