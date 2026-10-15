import { DIMS, type Dim, type Level, type Vector } from "./types";

export const DIM_WEIGHT: Record<Dim, number> = {
  energy: 1,
  acoustic: 1,
  lyric: 1,
  polish: 1,
  mainstream: 1,
  tempo: 1,
};

const ERA_WEIGHT = 0.6;
const ERA_SPAN = 60;

export const ERA_YEAR: Record<string, number> = {
  "2020s current": 2022,
  "2010s": 2015,
  "2000s": 2005,
  "90s & earlier": 1985,
};

export const LEVEL_VALUE: Record<Exclude<Level, "any">, number> = { low: 0.15, mid: 0.5, high: 0.85 };

export function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function vec(energy: number, acoustic: number, lyric: number, polish: number, mainstream: number, tempo: number): Vector {
  return { energy, acoustic, lyric, polish, mainstream, tempo };
}

/** Weighted euclidean distance, 0..1. Era is included when both years are known. */
export function distance(a: Vector, b: Vector, aYear?: number | null, bYear?: number | null): number {
  let sum = 0;
  let w = 0;
  for (const d of DIMS) {
    sum += DIM_WEIGHT[d] * (a[d] - b[d]) ** 2;
    w += DIM_WEIGHT[d];
  }
  if (aYear != null && bYear != null) {
    const e = Math.min(1, Math.abs(aYear - bYear) / ERA_SPAN);
    sum += ERA_WEIGHT * e * e;
    w += ERA_WEIGHT;
  }
  return Math.sqrt(sum / w);
}

export function meanVector(vs: Vector[], weights?: Array<Partial<Record<Dim, number>>>): Vector {
  const out = {} as Vector;
  for (const d of DIMS) {
    let s = 0;
    let w = 0;
    vs.forEach((v, i) => {
      const wi = weights?.[i]?.[d] ?? 1;
      s += v[d] * wi;
      w += wi;
    });
    out[d] = w ? s / w : 0.5;
  }
  return out;
}

/** Free-tag vocabulary -> partial vector. Used to blend in tags (or to size up an unknown artist). */
const TAG_HINTS: Record<string, Partial<Vector>> = {
  acoustic: { acoustic: 0.85, energy: 0.35 },
  folk: { acoustic: 0.8, lyric: 0.8 },
  "singer-songwriter": { acoustic: 0.7, lyric: 0.85 },
  country: { acoustic: 0.6, lyric: 0.75 },
  blues: { acoustic: 0.65, polish: 0.4 },
  jazz: { acoustic: 0.8, lyric: 0.15, mainstream: 0.4 },
  soul: { energy: 0.5, lyric: 0.65 },
  "r&b": { energy: 0.45, polish: 0.75 },
  "hip hop": { lyric: 0.85, acoustic: 0.1 },
  "hip-hop": { lyric: 0.85, acoustic: 0.1 },
  rap: { lyric: 0.9, acoustic: 0.1 },
  trap: { energy: 0.7, acoustic: 0.05, lyric: 0.5 },
  pop: { polish: 0.85, mainstream: 0.85 },
  "synth-pop": { acoustic: 0.1, polish: 0.85 },
  synthpop: { acoustic: 0.1, polish: 0.85 },
  electronic: { acoustic: 0.05, lyric: 0.15 },
  house: { acoustic: 0.05, energy: 0.75, tempo: 0.7, lyric: 0.15 },
  techno: { acoustic: 0.02, energy: 0.85, tempo: 0.75, lyric: 0.05 },
  edm: { energy: 0.9, tempo: 0.75, acoustic: 0.05, lyric: 0.15 },
  dance: { energy: 0.8, tempo: 0.75 },
  ambient: { energy: 0.15, tempo: 0.2, lyric: 0.05 },
  rock: { energy: 0.75 },
  "alternative rock": { energy: 0.7, polish: 0.5 },
  indie: { mainstream: 0.5, polish: 0.5 },
  "indie rock": { mainstream: 0.5, polish: 0.45, energy: 0.65 },
  punk: { energy: 0.92, polish: 0.2, tempo: 0.8 },
  grunge: { energy: 0.85, polish: 0.2 },
  metal: { energy: 0.97, polish: 0.5, tempo: 0.75 },
  "lo-fi": { polish: 0.15, energy: 0.3 },
  afrobeats: { energy: 0.65, tempo: 0.55, acoustic: 0.2 },
  afrobeat: { energy: 0.75, acoustic: 0.5, lyric: 0.65 },
  latin: { energy: 0.7, tempo: 0.6 },
  reggaeton: { energy: 0.78, tempo: 0.65, acoustic: 0.05 },
  gospel: { lyric: 0.6, energy: 0.5 },
  worship: { lyric: 0.55, energy: 0.45, polish: 0.75 },
  underground: { mainstream: 0.2 },
  experimental: { mainstream: 0.25, polish: 0.45 },
  chillout: { energy: 0.2, tempo: 0.3 },
  mellow: { energy: 0.2, tempo: 0.3 },
  instrumental: { lyric: 0.03 },
};

export function normalizeTag(tag: string): string {
  return tag.toLowerCase().replace(/[^a-z0-9&\- ]/g, "").trim();
}

/** Average of every dimension a recognised tag speaks to. Returns how many tags were recognised. */
export function vectorFromTags(tags: string[]): { vector: Partial<Vector>; matched: string[] } {
  const sums: Partial<Record<Dim, { s: number; n: number }>> = {};
  const matched: string[] = [];
  for (const raw of tags) {
    const tag = normalizeTag(raw);
    const hint = TAG_HINTS[tag];
    if (!hint || matched.includes(tag)) continue;
    matched.push(tag);
    for (const d of DIMS) {
      const v = hint[d];
      if (v == null) continue;
      const cur = sums[d] || { s: 0, n: 0 };
      cur.s += v;
      cur.n += 1;
      sums[d] = cur;
    }
  }
  const vector: Partial<Vector> = {};
  for (const d of DIMS) {
    const x = sums[d];
    if (x) vector[d] = x.s / x.n;
  }
  return { vector, matched };
}

/** Blend a base vector toward tag evidence. weight 0..1 is how much the tags count. */
export function blendTags(base: Vector, tags: string[], weight = 0.2): Vector {
  const { vector } = vectorFromTags(tags);
  const out = { ...base };
  for (const d of DIMS) {
    const t = vector[d];
    if (t != null) out[d] = clamp01(base[d] * (1 - weight) + t * weight);
  }
  return out;
}

/** Fill in unknown dims with neutral 0.5; only used for tag-only artists. */
export function tagOnlyVector(tags: string[]): { vector: Vector; matched: string[]; known: number } {
  const { vector, matched } = vectorFromTags(tags);
  const out = {} as Vector;
  let known = 0;
  for (const d of DIMS) {
    if (vector[d] != null) known += 1;
    out[d] = clamp01(vector[d] ?? 0.5);
  }
  return { vector: out, matched, known };
}

export const DIM_COPY: Record<
  Dim,
  { name: string; low: string; high: string; lowTrait: string; highTrait: string; question: string }
> = {
  energy: {
    name: "energy",
    low: "Laid-back, easy",
    high: "High-energy, hits hard",
    lowTrait: "laid-back feel",
    highTrait: "high-energy punch",
    question: "How much punch should the song have?",
  },
  tempo: {
    name: "tempo",
    low: "Slow burn",
    high: "Fast, driving",
    lowTrait: "slow-burn pacing",
    highTrait: "fast, driving pace",
    question: "Where does the tempo sit?",
  },
  acoustic: {
    name: "instrumentation",
    low: "Produced — synths, programmed beats",
    high: "Organic — guitars, piano, live feel",
    lowTrait: "produced, electronic textures",
    highTrait: "organic, live instruments",
    question: "What carries the sound — instruments or production?",
  },
  polish: {
    name: "polish",
    low: "Raw, rough edges, lo-fi",
    high: "Polished, studio-clean",
    lowTrait: "raw, unvarnished vocals",
    highTrait: "polished, studio-clean sound",
    question: "Vocals and production: raw or polished?",
  },
  lyric: {
    name: "lyric weight",
    low: "The groove — beat and feel first",
    high: "The words — lyrics and story first",
    lowTrait: "groove-first feel",
    highTrait: "lyric-first storytelling",
    question: "What grabs you first — the words or the groove?",
  },
  mainstream: {
    name: "reach",
    low: "Underground, deeper cuts",
    high: "Mainstream, everyone knows it",
    lowTrait: "underground edge",
    highTrait: "mainstream reach",
    question: "How well-known should the sound feel?",
  },
};

export function pct(n: number): number {
  return Math.round(clamp01(n) * 100);
}

export function dimPhrase(dim: Dim, value: number): string | null {
  const c = DIM_COPY[dim];
  if (value >= 0.65) return c.highTrait;
  if (value <= 0.35) return c.lowTrait;
  return null;
}
