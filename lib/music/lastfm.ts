import { sanitizeFreeText } from "./taste/sanitize";
import { titleKey } from "./taste/titleKey";
import type { ArtistEnrichment, LastfmTrack } from "./taste/types";

/**
 * Server-side Last.fm client (free API key, non-commercial terms). Never imported by client components,
 * so the key stays on the server. Without LASTFM_API_KEY every call returns `disabled` and the caller
 * falls back to the editorial seed.
 *
 * Protections: one in-flight request per artist, a small start-rate limiter, a per-artist cache,
 * a short negative cache, and a circuit breaker that stops calling after rate-limit / key errors.
 */

export const LASTFM_BASE = "https://ws.audioscrobbler.com/2.0/";
export const LASTFM_CREDIT = "Artist data from Last.fm";

const MAX_TRACKS = 5;
const MAX_TAGS = 12;
const MAX_SIMILAR = 24;

export type LastfmApiError = { code: number; message: string };

export function parseApiError(json: unknown): LastfmApiError | null {
  const j = json as { error?: unknown; message?: unknown } | null;
  if (!j || typeof j !== "object" || j.error == null) return null;
  const code = Number(j.error);
  return { code: Number.isFinite(code) ? code : -1, message: String(j.message ?? "Last.fm error").slice(0, 120) };
}

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function cleanTitle(raw: unknown): string {
  return sanitizeFreeText(String(raw ?? ""), 120);
}

const NOISE_TITLE = /\b(live|karaoke|instrumental|demo|acoustic version|remix|cover)\b/i;

/** artist.getTopTracks → our shape. Counts arrive as strings. Drops live/remix versions and duplicates. */
export function parseTopTracks(json: unknown): LastfmTrack[] {
  const raw = (json as { toptracks?: { track?: unknown } } | null)?.toptracks?.track;
  const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? [raw] : [];
  const seen = new Set<string>();
  const out: LastfmTrack[] = [];
  for (const t of list as Array<Record<string, unknown>>) {
    const title = cleanTitle(t?.name);
    if (!title || NOISE_TITLE.test(title)) continue;
    const key = titleKey(title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const url = typeof t.url === "string" && /^https:\/\/www\.last\.fm\//.test(t.url) ? t.url.slice(0, 300) : null;
    out.push({ title, rank: out.length + 1, listeners: num(t.listeners), plays: num(t.playcount), url });
    if (out.length >= MAX_TRACKS) break;
  }
  return out;
}

/** Last.fm tag names are crowd-sourced; keep the heavier ones and drop obvious non-genre noise. */
const TAG_NOISE = /^(seen live|favorites?|favourites?|my favorites?|all|albums i own|owned|spotify|male vocalists?|female vocalists?|awesome|love|cool|best)$/i;

export function parseTopTags(json: unknown): string[] {
  const raw = (json as { toptags?: { tag?: unknown } } | null)?.toptags?.tag;
  const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? [raw] : [];
  const rows = (list as Array<Record<string, unknown>>)
    .map((t) => ({ name: sanitizeFreeText(String(t?.name ?? ""), 30).toLowerCase(), count: num(t?.count) ?? 0 }))
    .filter((t) => t.name && !TAG_NOISE.test(t.name) && t.count >= 10);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of rows.sort((a, b) => b.count - a.count)) {
    if (seen.has(t.name)) continue;
    seen.add(t.name);
    out.push(t.name);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

export function parseSimilar(json: unknown): string[] {
  const raw = (json as { similarartists?: { artist?: unknown } } | null)?.similarartists?.artist;
  const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? [raw] : [];
  const rows = (list as Array<Record<string, unknown>>)
    .map((a) => ({ name: sanitizeFreeText(String(a?.name ?? ""), 60), match: num(a?.match) ?? 0 }))
    .filter((a) => a.name);
  return rows
    .sort((a, b) => b.match - a.match)
    .map((a) => a.name)
    .slice(0, MAX_SIMILAR);
}

export function artistUrl(name: string): string {
  return `https://www.last.fm/music/${encodeURIComponent(name).replace(/%20/g, "+")}`;
}

export type LastfmResult =
  | { status: "ok"; data: Omit<ArtistEnrichment, "id" | "similarSeedIds"> }
  | { status: "notfound" }
  | { status: "disabled" }
  | { status: "unavailable"; reason: string };

export type ClientOptions = {
  apiKey?: string;
  base?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  /** Minimum gap between request starts. */
  minGapMs?: number;
  timeoutMs?: number;
  ttlMs?: number;
  negativeTtlMs?: number;
  maxEntries?: number;
  /** Consecutive transient failures before the breaker opens. */
  breakerFailures?: number;
  breakerOpenMs?: number;
  /** How long to stay off after an invalid/suspended key or a rate-limit reply. */
  hardBreakerMs?: number;
  wait?: (ms: number) => Promise<void>;
};

const HARD_CODES = new Set([10, 26, 29]); // invalid key, suspended key, rate limit exceeded
const TRANSIENT_CODES = new Set([8, 11, 16]); // operation failed, service offline, temporarily unavailable

export function createLastfmClient(opts: ClientOptions = {}) {
  const apiKey = (opts.apiKey ?? "").trim();
  const base = opts.base || LASTFM_BASE;
  const doFetch = opts.fetchImpl || fetch;
  const now = opts.now || (() => Date.now());
  const wait = opts.wait || ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const minGap = opts.minGapMs ?? 220;
  const timeoutMs = opts.timeoutMs ?? 3500;
  const ttl = opts.ttlMs ?? 6 * 60 * 60 * 1000;
  const negTtl = opts.negativeTtlMs ?? 10 * 60 * 1000;
  const maxEntries = opts.maxEntries ?? 400;
  const breakerFailures = opts.breakerFailures ?? 4;
  const breakerOpenMs = opts.breakerOpenMs ?? 2 * 60 * 1000;
  const hardMs = opts.hardBreakerMs ?? 30 * 60 * 1000;

  const cache = new Map<string, { at: number; ttl: number; result: LastfmResult }>();
  const inflight = new Map<string, Promise<LastfmResult>>();
  let nextStart = 0;
  let failures = 0;
  let openUntil = 0;
  let requests = 0;

  /** Serialises request *starts* so a burst never exceeds one per `minGap` ms. */
  async function slot(): Promise<void> {
    const t = now();
    const at = Math.max(t, nextStart);
    nextStart = at + minGap;
    if (at > t) await wait(at - t);
  }

  async function call(method: string, artist: string): Promise<{ json: unknown } | { error: LastfmApiError | { code: 0; message: string } }> {
    await slot();
    requests += 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const params = new URLSearchParams({ method, artist, autocorrect: "1", api_key: apiKey, format: "json" });
      if (method === "artist.getTopTracks") params.set("limit", "25");
      if (method === "artist.getSimilar") params.set("limit", "30");
      const res = await doFetch(`${base}?${params.toString()}`, { signal: controller.signal, headers: { Accept: "application/json" }, cache: "no-store" });
      let json: unknown = null;
      try {
        json = await res.json();
      } catch {
        return { error: { code: 0, message: `HTTP ${res.status}` } };
      }
      const err = parseApiError(json);
      if (err) return { error: err };
      if (!res.ok) return { error: { code: 0, message: `HTTP ${res.status}` } };
      return { json };
    } catch {
      return { error: { code: 0, message: "timeout or network error" } };
    } finally {
      clearTimeout(timer);
    }
  }

  function noteFailure(code: number) {
    if (HARD_CODES.has(code)) {
      openUntil = now() + hardMs;
      return;
    }
    failures += 1;
    if (failures >= breakerFailures) {
      openUntil = now() + breakerOpenMs;
      failures = 0;
    }
  }

  async function fetchArtist(name: string): Promise<LastfmResult> {
    const [tracks, tags, similar] = await Promise.all([
      call("artist.getTopTracks", name),
      call("artist.getTopTags", name),
      call("artist.getSimilar", name),
    ]);
    const all = [tracks, tags, similar];
    const errors = all.filter((r): r is { error: LastfmApiError } => "error" in r).map((r) => r.error);
    // Code 6 on the tracks call means Last.fm does not know this artist.
    if (errors.some((e) => e.code === 6) && "error" in tracks && tracks.error.code === 6) return { status: "notfound" };
    const hard = errors.find((e) => HARD_CODES.has(e.code));
    if (hard) {
      noteFailure(hard.code);
      return { status: "unavailable", reason: hard.code === 29 ? "rate limited" : "key rejected" };
    }
    if ("error" in tracks) {
      noteFailure(tracks.error.code);
      return { status: "unavailable", reason: TRANSIENT_CODES.has(tracks.error.code) ? "service busy" : "lookup failed" };
    }
    failures = 0;
    const topTracks = parseTopTracks(tracks.json);
    if (!topTracks.length) return { status: "notfound" };
    return {
      status: "ok",
      data: {
        name,
        source: "Last.fm",
        asOf: new Date(now()).toISOString().slice(0, 10),
        url: artistUrl(name),
        tags: "json" in tags ? parseTopTags(tags.json) : [],
        similar: "json" in similar ? parseSimilar(similar.json) : [],
        topTracks,
      },
    };
  }

  function remember(key: string, result: LastfmResult, lifetime: number) {
    if (cache.size >= maxEntries) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(key, { at: now(), ttl: lifetime, result });
  }

  async function enrich(rawName: string): Promise<LastfmResult> {
    if (!apiKey) return { status: "disabled" };
    const name = sanitizeFreeText(rawName, 60);
    if (name.length < 2) return { status: "notfound" };
    const key = name.toLowerCase();
    const hit = cache.get(key);
    if (hit && now() - hit.at < hit.ttl) return hit.result;
    if (now() < openUntil) return { status: "unavailable", reason: "paused after errors" };
    const pending = inflight.get(key);
    if (pending) return pending;
    const p = (async () => {
      const result = await fetchArtist(name);
      if (result.status === "ok") remember(key, result, ttl);
      else if (result.status === "notfound") remember(key, result, negTtl * 6);
      else remember(key, result, negTtl / 5);
      return result;
    })().finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  }

  return {
    enrich,
    enabled: Boolean(apiKey),
    stats: () => ({ requests, cached: cache.size, breakerOpen: now() < openUntil }),
  };
}

export type LastfmClient = ReturnType<typeof createLastfmClient>;

const g = globalThis as typeof globalThis & { __ikoLastfm?: LastfmClient };

/** Process-wide client (keeps the cache and rate limiter across requests in a warm instance). */
export function getLastfm(): LastfmClient {
  if (!g.__ikoLastfm) g.__ikoLastfm = createLastfmClient({ apiKey: process.env.LASTFM_API_KEY, base: process.env.LASTFM_API_BASE || LASTFM_BASE });
  return g.__ikoLastfm;
}
