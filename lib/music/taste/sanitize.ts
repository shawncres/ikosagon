import {
  AUDIENCE_AGE_BANDS,
  AUDIENCE_CONTEXTS,
  AUDIENCE_LANGUAGES,
  AUDIENCE_REGIONS,
  DIMS,
  EXTRA_KEYS,
  THEME_IDS,
  type Audience,
  type CustomArtist,
  type Dim,
  type ExtraKey,
  type Extras,
  type Level,
  type ProfileInput,
  type ThemeId,
  type TrendingContext,
  type Vector,
} from "./types";
import { seedArtist } from "./seed";
import { clamp01 } from "./vector";

export const EXTRA_MAX: Record<ExtraKey, number> = {
  genres: 60,
  anchor: 80,
  sound: 120,
  second: 80,
  third: 80,
  contrast: 120,
  themes: 80,
  audience: 120,
  final: 200,
};

/**
 * Optional "add your own" text. Plain text only: control characters, tags, links, emails and long
 * digit runs (phone-like) are dropped, whitespace collapsed, length capped. Returns "" when nothing is left.
 */
export function sanitizeFreeText(raw: unknown, max = 120): string {
  if (typeof raw !== "string") return "";
  let s = raw.normalize("NFKC");
  s = s.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, " ");
  s = s.replace(/<[^>]*>/g, " ");
  s = s.replace(/[<>`{}\\]/g, " ");
  s = s.replace(/\b(?:https?:\/\/|www\.)\S+/gi, " ");
  s = s.replace(/\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g, " ");
  // Phone-like runs: 9+ digits once separators are ignored (so years and dates such as 2026-10-14 survive).
  s = s.replace(/\+?\d[\d\s().-]{6,}\d/g, (m) => (m.replace(/\D/g, "").length >= 9 ? " " : m));
  s = s.replace(/\s+/g, " ").trim();
  return s.slice(0, Math.max(0, max)).trim();
}

export function sanitizeExtras(raw: unknown): Extras {
  const out: Extras = {};
  if (!raw || typeof raw !== "object") return out;
  const src = raw as Record<string, unknown>;
  for (const key of EXTRA_KEYS) {
    const text = sanitizeFreeText(src[key], EXTRA_MAX[key]);
    if (text) out[key] = text;
  }
  return out;
}

function pickOne(value: unknown, allowed: readonly string[]): string | null {
  return typeof value === "string" && allowed.includes(value) ? value : null;
}

function pickMany(value: unknown, allowed: readonly string[], max: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const v of value) {
    if (typeof v === "string" && allowed.includes(v) && !out.includes(v)) out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

/** Bands only. Anything that is not on the fixed option lists is dropped. Null when nothing was answered. */
export function sanitizeAudience(raw: unknown): Audience | null {
  if (!raw || typeof raw !== "object") return null;
  const src = raw as Record<string, unknown>;
  const audience: Audience = {
    ageBand: pickOne(src.ageBand, AUDIENCE_AGE_BANDS),
    region: pickOne(src.region, AUDIENCE_REGIONS),
    languages: pickMany(src.languages, AUDIENCE_LANGUAGES, 3),
    contexts: pickMany(src.contexts, AUDIENCE_CONTEXTS, 4),
  };
  if (!audience.ageBand && !audience.region && !audience.languages.length && !audience.contexts.length) return null;
  return audience;
}

function isDim(v: unknown): v is Dim {
  return typeof v === "string" && (DIMS as readonly string[]).includes(v);
}

function sanitizeVector(raw: unknown): Vector | null {
  if (!raw || typeof raw !== "object") return null;
  const src = raw as Record<string, unknown>;
  const out = {} as Vector;
  for (const d of DIMS) {
    const n = Number(src[d]);
    if (!Number.isFinite(n)) return null;
    out[d] = clamp01(n);
  }
  return out;
}

export function sanitizeCustomArtists(raw: unknown): CustomArtist[] {
  if (!Array.isArray(raw)) return [];
  const out: CustomArtist[] = [];
  for (const item of raw.slice(0, 3)) {
    if (!item || typeof item !== "object") continue;
    const src = item as Record<string, unknown>;
    const name = sanitizeFreeText(src.name, 60);
    const vector = sanitizeVector(src.vector);
    if (!name || !vector) continue;
    const id = `custom:${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "artist"}`;
    const peakN = Number(src.peak);
    const peak = Number.isFinite(peakN) ? Math.max(1950, Math.min(2030, Math.round(peakN))) : 2015;
    const tags = Array.isArray(src.tags)
      ? src.tags.map((t) => sanitizeFreeText(t, 30).toLowerCase()).filter(Boolean).slice(0, 8)
      : [];
    out.push({ id, name, vector, peak, tags });
  }
  return out;
}

/** The single entry point for untrusted profile input (client or server). */
export function sanitizeProfile(raw: unknown): ProfileInput {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const custom = sanitizeCustomArtists(src.custom);
  const customIds = new Set(custom.map((c) => c.id));
  const artistIds: string[] = [];
  if (Array.isArray(src.artistIds)) {
    for (const id of src.artistIds) {
      if (typeof id !== "string") continue;
      if (artistIds.includes(id)) continue;
      if (seedArtist(id) || customIds.has(id)) artistIds.push(id);
      if (artistIds.length >= 3) break;
    }
  }

  const answers: Partial<Record<Dim, Level>> = {};
  if (src.answers && typeof src.answers === "object") {
    for (const [k, v] of Object.entries(src.answers as Record<string, unknown>)) {
      if (isDim(k) && (v === "low" || v === "mid" || v === "high" || v === "any")) answers[k] = v;
    }
  }

  let contrast: ProfileInput["contrast"] = null;
  const c = src.contrast as Record<string, unknown> | null | undefined;
  if (c && isDim(c.dim) && typeof c.favors === "string" && artistIds.includes(c.favors)) {
    contrast = { dim: c.dim, favors: c.favors };
  }

  const clipList = (v: unknown, max: number, len: number) =>
    Array.isArray(v) ? v.map((x) => sanitizeFreeText(x, len)).filter(Boolean).slice(0, max) : [];

  return {
    genres: clipList(src.genres, 6, 40),
    era: sanitizeFreeText(src.era, 30) || null,
    region: sanitizeFreeText(src.region, 40) || null,
    artistIds,
    answers,
    contrast,
    themes: pickMany(src.themes, THEME_IDS, 4),
    audience: sanitizeAudience(src.audience),
    extras: sanitizeExtras(src.extras),
    custom,
  };
}

/** Trending context is informational; keep only whitelisted themes and bounded numbers. */
export function sanitizeTrending(raw: unknown): TrendingContext | null {
  if (!raw || typeof raw !== "object") return null;
  const src = raw as Record<string, unknown>;
  const asOf = sanitizeFreeText(src.asOf, 12);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return null;
  const themes = Array.isArray(src.themes)
    ? (src.themes as Array<Record<string, unknown>>)
        .filter((t) => t && (THEME_IDS as readonly string[]).includes(String(t.theme)))
        .slice(0, 5)
        .map((t) => ({ theme: String(t.theme) as ThemeId, artists: Math.max(0, Math.min(50, Math.round(Number(t.artists) || 0))) }))
    : [];
  const genreMix = Array.isArray(src.genreMix)
    ? (src.genreMix as Array<Record<string, unknown>>)
        .slice(0, 5)
        .map((g) => ({ genre: sanitizeFreeText(g?.genre, 30), count: Math.max(0, Math.min(100, Math.round(Number(g?.count) || 0))) }))
        .filter((g) => g.genre)
    : [];
  return {
    asOf,
    source: sanitizeFreeText(src.source, 80),
    matched: Math.max(0, Math.min(100, Math.round(Number(src.matched) || 0))),
    total: Math.max(0, Math.min(100, Math.round(Number(src.total) || 0))),
    themes,
    genreMix,
    note: sanitizeFreeText(src.note, 300),
  };
}
