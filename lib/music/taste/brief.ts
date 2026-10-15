import { SEED_AS_OF } from "./seed";
import { resolveArtists, type Pickable } from "./tree";
import {
  DIMS,
  type Dim,
  type Lean,
  type ProfileInput,
  type SeedTrack,
  type SongBrief,
  type ThemeId,
  type TrendingContext,
  type Vector,
} from "./types";
import { DIM_COPY, ERA_YEAR, LEVEL_VALUE, clamp01, dimPhrase, distance, meanVector, pct, round2 } from "./vector";

export const THEME_LABEL: Record<ThemeId, string> = {
  heartbreak: "Heartbreak",
  love: "Love & devotion",
  hustle: "Hustle & ambition",
  nostalgia: "Nostalgia",
  faith: "Faith & hope",
  party: "Party & celebration",
  escapism: "Escapism & wanderlust",
  social: "Social commentary",
  resilience: "Resilience & self-worth",
  rebellion: "Rebellion",
  introspection: "Introspection",
  roots: "Home & roots",
};

export type TrackRow = {
  artist: Pickable;
  track: SeedTrack;
  vector: Vector;
  id: string;
};

export function trackVector(artist: Pickable, track: SeedTrack): Vector {
  const v = { ...artist.vector };
  if (track.tweak) {
    for (const d of Object.keys(track.tweak) as Array<keyof NonNullable<SeedTrack["tweak"]>>) {
      const val = track.tweak[d];
      if (val != null) v[d] = clamp01(val);
    }
  }
  return v;
}

export function tracksOf(artists: Pickable[]): TrackRow[] {
  const rows: TrackRow[] = [];
  for (const a of artists) {
    for (const t of a.tracks) {
      rows.push({ artist: a, track: t, vector: trackVector(a, t), id: `${a.id}:${t.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` });
    }
  }
  return rows;
}

/** Themes carried by an artist = union of its three assumed best tracks. */
export function artistThemes(a: Pickable): ThemeId[] {
  const out: ThemeId[] = [];
  for (const t of a.tracks) for (const th of t.themes) if (!out.includes(th)) out.push(th);
  return out;
}

export function themeTally(artists: Pickable[]): Array<{ theme: ThemeId; count: number; tracks: number }> {
  const map = new Map<ThemeId, { count: number; tracks: number }>();
  for (const a of artists) {
    const seen = new Set<ThemeId>();
    for (const t of a.tracks) {
      for (const th of t.themes) {
        const cur = map.get(th) || { count: 0, tracks: 0 };
        cur.tracks += 1;
        if (!seen.has(th)) {
          cur.count += 1;
          seen.add(th);
        }
        map.set(th, cur);
      }
    }
  }
  return [...map.entries()]
    .map(([theme, v]) => ({ theme, ...v }))
    .sort((a, b) => b.count - a.count || b.tracks - a.tracks || a.theme.localeCompare(b.theme));
}

export function centerOf(
  artists: Pickable[],
  answers: ProfileInput["answers"],
  contrast: ProfileInput["contrast"],
): { vector: Vector; eraYear: number | null } {
  if (!artists.length) return { vector: meanVector([]), eraYear: null };
  const weights = artists.map((a) => {
    const w: Partial<Record<Dim, number>> = {};
    if (contrast && contrast.favors === a.id) w[contrast.dim] = 2;
    return w;
  });
  const mean = meanVector(
    artists.map((a) => a.vector),
    weights,
  );
  const vector = { ...mean };
  for (const d of DIMS) {
    const lvl = answers[d];
    if (lvl && lvl !== "any") vector[d] = clamp01(0.75 * mean[d] + 0.25 * LEVEL_VALUE[lvl]);
  }
  const eraYear = Math.round(artists.reduce((s, a) => s + a.peak, 0) / artists.length);
  return { vector, eraYear };
}

export function rangeOf(artists: Pickable[]): SongBrief["range"] {
  const perDim = DIMS.map((d) => {
    const vals = artists.map((a) => a.vector[d]);
    return { dim: d, min: round2(Math.min(...vals)), max: round2(Math.max(...vals)) };
  });
  if (artists.length < 2) {
    return { spread: 0, label: "single anchor", perDim: artists.length ? perDim : [], widest: null, summary: "Only one artist so far, so there is no range yet — just a center." };
  }
  const widths = perDim.map((r) => r.max - r.min);
  const eraSpan = Math.min(1, (Math.max(...artists.map((a) => a.peak)) - Math.min(...artists.map((a) => a.peak))) / 60);
  const spread = round2((widths.reduce((s, w) => s + w, 0) + eraSpan) / (widths.length + 1));
  const label = spread < 0.18 ? "tight" : spread < 0.32 ? "balanced" : "wide";
  let wi = 0;
  widths.forEach((w, i) => {
    if (w > widths[wi] + 1e-9) wi = i;
  });
  const widest = widths[wi] >= 0.12 ? perDim[wi].dim : null;
  const c = widest ? DIM_COPY[widest] : null;
  const summary =
    label === "tight"
      ? "Your picks live close together, so the song can stay in one lane."
      : `${label === "wide" ? "Wide" : "Balanced"} range${c ? `: your picks disagree most on ${c.name} (${c.lowTrait} ↔ ${c.highTrait})` : ""}.`;
  return { spread, label, perDim, widest, summary };
}

export function describeCenter(vector: Vector, eraYear: number | null): string {
  const phrases = DIMS.map((d) => dimPhrase(d, vector[d])).filter((p): p is string => Boolean(p));
  const base = phrases.length ? phrases.join(", ") : "a mid-range blend with no extreme leanings";
  return eraYear ? `${base}; sound anchored around ${eraYear}.` : `${base}.`;
}

function poss(name: string): string {
  return /s$/i.test(name) ? `${name}'` : `${name}'s`;
}

function themeList(ts: ThemeId[]): string {
  return ts.map((t) => THEME_LABEL[t].toLowerCase()).join(" / ");
}

/**
 * Three leans from the artists' assumed best tracks: one from the overlap (closest to the center of the
 * range, with a nudge for the visitor's themes) and one from each edge of the widest dimension. Every
 * `why` is built only from the numbers computed here.
 */
export function pickLeans(
  artists: Pickable[],
  center: Vector,
  range: SongBrief["range"],
  themes: ThemeId[],
): Lean[] {
  const rows = tracksOf(artists);
  if (!rows.length) return [];
  const themeScore = (r: TrackRow) => r.track.themes.filter((t) => themes.includes(t)).length;
  const dist = (r: TrackRow) => distance(r.vector, center);
  const used = new Set<string>();
  const leans: Lean[] = [];

  const mk = (r: TrackRow, kind: Lean["kind"], why: string): Lean => ({
    id: r.id,
    title: r.track.title,
    artist: r.artist.name,
    album: r.track.album && r.track.album !== "Single" ? r.track.album : undefined,
    year: String(r.track.year),
    genre: r.artist.genres[0],
    why,
    kind,
    trackRole: r.track.role,
    themes: r.track.themes,
    assumed: true,
  });

  const themeBit = (r: TrackRow) => {
    const hit = r.track.themes.filter((t) => themes.includes(t));
    return hit.length ? `carries your ${themeList(hit)} theme` : "chosen on sound alone (no theme match)";
  };

  // 1. Overlap
  const overlap = [...rows];
  overlap.sort((a, b) => dist(a) - 0.12 * themeScore(a) - (dist(b) - 0.12 * themeScore(b)) || a.id.localeCompare(b.id));
  const first = overlap[0];
  used.add(first.id);
  leans.push(
    mk(
      first,
      "overlap",
      `Sits closest to the center of your range (${pct(dist(first))} points off) and ${themeBit(first)}. ${poss(first.artist.name)} ${first.track.role}.`,
    ),
  );

  // 2/3. Edges of the widest dimension
  let dim: Dim | null = range.widest;
  if (!dim) {
    let bestW = -1;
    for (const d of DIMS) {
      const vals = rows.map((r) => r.vector[d]);
      const w = Math.max(...vals) - Math.min(...vals);
      if (w > bestW + 1e-9) {
        bestW = w;
        dim = d;
      }
    }
  }
  if (dim) {
    const d = dim;
    const copy = DIM_COPY[d];
    const edge = (high: boolean) => {
      const avoidArtists = new Set(leans.map((l) => l.artist));
      const pool = rows.filter((r) => !used.has(r.id));
      const preferred = pool.filter((r) => !avoidArtists.has(r.artist.name));
      const list = (preferred.length ? preferred : pool).slice();
      list.sort((a, b) => {
        const av = high ? a.vector[d] : -a.vector[d];
        const bv = high ? b.vector[d] : -b.vector[d];
        return bv + 0.05 * themeScore(b) - (av + 0.05 * themeScore(a)) || a.id.localeCompare(b.id);
      });
      return list[0];
    };
    for (const high of [true, false]) {
      const r = edge(high);
      if (!r) continue;
      used.add(r.id);
      // Only name the trait when the track really is that far out; otherwise just state the numbers.
      const trait = dimPhrase(d, r.vector[d]);
      leans.push(
        mk(
          r,
          high ? "edge-high" : "edge-low",
          `Pushes to the ${high ? "high" : "low"} edge of your range on ${copy.name} (${pct(r.vector[d])} vs your center ${pct(center[d])})${trait ? `: ${trait}` : ""}; ${themeBit(r)}. ${poss(r.artist.name)} ${r.track.role}.`,
        ),
      );
    }
  }
  return leans;
}

export function buildBrief(profile: ProfileInput, opts: { trending?: TrendingContext | null } = {}): SongBrief {
  const artists = resolveArtists(profile.artistIds, profile.custom);
  const { vector, eraYear: pickedEra } = centerOf(artists, profile.answers, profile.contrast);
  const eraYear = pickedEra ?? (profile.era ? (ERA_YEAR[profile.era] ?? null) : null);
  const range = rangeOf(artists);
  const chosenThemes = profile.themes.filter((t): t is ThemeId => t in THEME_LABEL);
  const tally = themeTally(artists);
  const overlap = tally.filter((t) => t.count >= 2).map((t) => t.theme);

  // Blend: the visitor's own picks always lead (strongest first), then the themes their artists share most.
  const base = new Map<ThemeId, number>(tally.map((t) => [t.theme, t.count + t.tracks * 0.25]));
  const byScore = (a: ThemeId, b: ThemeId) => (base.get(b) || 0) - (base.get(a) || 0) || a.localeCompare(b);
  const blend: ThemeId[] = [...chosenThemes].sort(byScore).slice(0, 3);
  for (const t of [...base.keys()].sort(byScore)) {
    if (blend.length >= 3) break;
    if (!blend.includes(t)) blend.push(t);
  }

  const leans = pickLeans(artists, vector, range, chosenThemes);

  const caveats = [
    "Artist numbers, theme tags and the three best tracks per artist are our editorial estimates, not measured audio features or stream data.",
  ];
  const customCount = artists.filter((a) => a.custom).length;
  if (customCount) caveats.push(`${customCount} free-text artist(s) were sized from free MusicBrainz tags only; leans are drawn from catalog artists.`);
  if (artists.length < 3) caveats.push(`Only ${artists.length} artist(s) chosen, so the range is ${artists.length < 2 ? "not defined" : "narrow"}.`);
  if (opts.trending) caveats.push(opts.trending.note);

  return {
    version: 1,
    asOf: SEED_AS_OF,
    artists: artists.map((a) => ({ id: a.id, name: a.name, custom: a.custom, themes: artistThemes(a) })),
    center: { vector: Object.fromEntries(DIMS.map((d) => [d, round2(vector[d])])) as Vector, eraYear, summary: describeCenter(vector, eraYear) },
    range,
    themes: {
      chosen: chosenThemes,
      fromArtists: tally.map(({ theme, count }) => ({ theme, count })),
      overlap,
      blend,
      trending: opts.trending ?? null,
    },
    audience: profile.audience,
    leans,
    notes: profile.extras,
    caveats,
  };
}

/** Plain text rows for the Resend summary. Audience is intentionally NOT part of the transcript rows. */
export function briefLines(b: SongBrief): string[] {
  const lines: string[] = [];
  lines.push(`Artists: ${b.artists.map((a) => a.name).join(" | ") || "-"}`);
  lines.push(`Center: ${b.center.summary}`);
  lines.push(`Range: ${b.range.label} (spread ${pct(b.range.spread)}). ${b.range.summary}`);
  lines.push(`Themes (blend): ${b.themes.blend.map((t) => THEME_LABEL[t]).join(", ") || "-"}`);
  lines.push(`Themes chosen: ${b.themes.chosen.map((t) => THEME_LABEL[t]).join(", ") || "-"}`);
  lines.push(`Theme overlap across artists: ${b.themes.overlap.map((t) => THEME_LABEL[t]).join(", ") || "none"}`);
  if (b.themes.trending) {
    const t = b.themes.trending;
    lines.push(`Chart context (${t.source}, as of ${t.asOf}; ${t.matched}/${t.total} rows matched): ${t.themes.map((x) => `${THEME_LABEL[x.theme]} (${x.artists})`).join(", ") || "no theme read"}`);
  }
  if (b.audience) {
    const a = b.audience;
    lines.push(
      `Audience (bands only): age ${a.ageBand || "-"}; region ${a.region || "-"}; languages ${a.languages.join(", ") || "-"}; contexts ${a.contexts.join(", ") || "-"}`,
    );
  } else {
    lines.push("Audience: skipped");
  }
  b.leans.forEach((l, i) => lines.push(`Lean ${i + 1} [${l.kind}]: ${l.title} - ${l.artist} (${l.trackRole}). Why: ${l.why}`));
  for (const [k, v] of Object.entries(b.notes)) lines.push(`Note (${k}): ${v}`);
  return lines;
}
