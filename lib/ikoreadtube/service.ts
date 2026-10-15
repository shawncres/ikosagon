/* eslint-disable @typescript-eslint/no-explicit-any -- parses untyped third-party JSON defensively */
/**
 * Request handlers for the real-YouTube IkoReadTube routes (feed, search, summary). Pure functions with injected
 * fetch / clock / state so scripts/ikoreadtube-check.mjs can test every path with mocked YouTube and Gemini replies.
 * Secrets (YOUTUBE_API_KEY, GEMINI_API_KEY) are read from env here and never put in any response.
 */
import {
  YT_LIMITS,
  YouTubeError,
  cleanQuery,
  createTtlCache,
  fetchFeed,
  isVideoId,
  parseDuration,
  quotaStats,
  searchBudgetLeft,
  searchVideos,
  videoDetails,
  type FeedVideo,
} from "./youtube";
import { GEMINI_LIMITS, summarizeVideoWithGemini, type Levels } from "./gemini";
import { originOk } from "./summarize";

export type Env = Record<string, string | undefined>;
export type Out = { status: number; body: unknown; headers: Record<string, string> };

const NO_STORE = { "Cache-Control": "no-store" };
const json = (status: number, body: unknown, headers: Record<string, string> = NO_STORE): Out => ({ status, body, headers });

const hasKey = (env: Env, name: string) => Boolean((env[name] || "").trim());

/* ---------- small per-instance rate limiter ---------- */

export type RateRule = { perIpPerMinute: number; perIpPerHour: number; globalPerMinute: number };

export function createRateLimiter(rule: RateRule, now: () => number = () => Date.now()) {
  const perIp = new Map<string, number[]>();
  let global: number[] = [];
  return {
    check(ip: string): { ok: true } | { ok: false; code: "ip_rate" | "busy"; retryAfter: number } {
      const t = now();
      const hits = (perIp.get(ip) || []).filter((x) => t - x < 3_600_000);
      if (hits.filter((x) => t - x < 60_000).length >= rule.perIpPerMinute) return { ok: false, code: "ip_rate", retryAfter: 30 };
      if (hits.length >= rule.perIpPerHour) return { ok: false, code: "ip_rate", retryAfter: 600 };
      global = global.filter((x) => t - x < 60_000);
      if (global.length >= rule.globalPerMinute) return { ok: false, code: "busy", retryAfter: 20 };
      hits.push(t);
      global.push(t);
      perIp.set(ip, hits);
      if (perIp.size > 2_000) for (const [k, v] of perIp) if (!v.some((x) => t - x < 3_600_000)) perIp.delete(k);
      return { ok: true };
    },
  };
}

/** Same-origin check shared by the GET routes (no CORS: only our own page calls them). */
export function sameSiteOk(origin: string | null, host: string | null, env: Env): boolean {
  return originOk(origin, host, env);
}

/* ---------- feed ---------- */

export type FeedState = {
  cache: ReturnType<typeof createTtlCache<FeedVideo[]>>;
  last: { videos: FeedVideo[]; at: number } | null;
  inflight: Promise<FeedVideo[]> | null;
};

export function createFeedState(now: () => number = () => Date.now()): FeedState {
  return { cache: createTtlCache<FeedVideo[]>(YT_LIMITS.feedTtlMs, 2, now), last: null, inflight: null };
}

const FEED_HEADERS = { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600" };

export async function handleFeed(opts: { env: Env; state: FeedState; fetchImpl?: typeof fetch; now?: () => number }): Promise<Out> {
  const now = opts.now ?? (() => Date.now());
  const key = (opts.env.YOUTUBE_API_KEY || "").trim();
  if (!key) return json(503, { error: "no_key" });
  const hit = opts.state.cache.get("feed");
  if (hit) return json(200, { source: "youtube", fetchedAt: opts.state.last?.at ?? now(), videos: hit }, FEED_HEADERS);
  try {
    opts.state.inflight ??= fetchFeed(key, opts.fetchImpl ?? fetch, now()).finally(() => {
      opts.state.inflight = null;
    });
    const videos = await opts.state.inflight;
    if (!videos.length) return json(503, { error: "empty" });
    opts.state.cache.set("feed", videos);
    opts.state.last = { videos, at: now() };
    return json(200, { source: "youtube", fetchedAt: now(), videos }, FEED_HEADERS);
  } catch (e) {
    const code = e instanceof YouTubeError ? e.code : "upstream";
    if (opts.state.last) {
      return json(200, { source: "youtube", stale: true, fetchedAt: opts.state.last.at, videos: opts.state.last.videos }, { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" });
    }
    return json(503, { error: code });
  }
}

/* ---------- search ---------- */

export type SearchState = {
  cache: ReturnType<typeof createTtlCache<FeedVideo[]>>;
  limiter: ReturnType<typeof createRateLimiter>;
};

export function createSearchState(now: () => number = () => Date.now()): SearchState {
  return {
    cache: createTtlCache<FeedVideo[]>(YT_LIMITS.searchTtlMs, 200, now),
    limiter: createRateLimiter({ perIpPerMinute: 5, perIpPerHour: 30, globalPerMinute: 20 }, now),
  };
}

export async function handleSearch(opts: { q: unknown; ip: string; env: Env; state: SearchState; fetchImpl?: typeof fetch; now?: () => number }): Promise<Out> {
  const now = opts.now ?? (() => Date.now());
  const q = cleanQuery(opts.q);
  if (q.length < YT_LIMITS.queryMin) return json(400, { error: "bad_query" });
  const key = (opts.env.YOUTUBE_API_KEY || "").trim();
  if (!key) return json(503, { error: "no_key" });
  const ck = q.toLowerCase();
  const hit = opts.state.cache.get(ck);
  const ok = { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=3600" };
  if (hit) return json(200, { source: "youtube", q, videos: hit }, ok);
  const rl = opts.state.limiter.check(opts.ip);
  if (!rl.ok) return json(429, { error: rl.code, retryAfter: rl.retryAfter }, { ...NO_STORE, "Retry-After": String(rl.retryAfter) });
  if (!searchBudgetLeft(now())) return json(429, { error: "limit" });
  try {
    const videos = await searchVideos(q, key, opts.fetchImpl ?? fetch, now());
    opts.state.cache.set(ck, videos);
    return json(200, { source: "youtube", q, videos }, ok);
  } catch (e) {
    if (e instanceof YouTubeError && e.code === "quota") return json(429, { error: "limit" });
    return json(503, { error: e instanceof YouTubeError ? e.code : "upstream" });
  }
}

/* ---------- summary ---------- */

export type SummaryReason = "off" | "long" | "short" | "live" | "budget" | "busy" | "failed";

export type SummaryPayload = {
  id: string;
  source: "gemini" | "description";
  reason?: SummaryReason;
  title: string;
  channel: string;
  published: string;
  duration: number;
  levels: Levels;
};

export type SummaryState = {
  cache: ReturnType<typeof createTtlCache<SummaryPayload>>;
  soft: ReturnType<typeof createTtlCache<SummaryPayload>>;
  inflight: Map<string, Promise<Out>>;
  limiter: ReturnType<typeof createRateLimiter>;
  geminiLimiter: ReturnType<typeof createRateLimiter>;
  budget: { day: string; seconds: number; calls: number };
  cooldownUntil: number;
};

export function createSummaryState(now: () => number = () => Date.now()): SummaryState {
  return {
    cache: createTtlCache<SummaryPayload>(GEMINI_LIMITS.successTtlMs, 400, now),
    soft: createTtlCache<SummaryPayload>(GEMINI_LIMITS.failureTtlMs, 200, now),
    inflight: new Map(),
    limiter: createRateLimiter({ perIpPerMinute: GEMINI_LIMITS.perIpPerMinute, perIpPerHour: GEMINI_LIMITS.perIpPerHour, globalPerMinute: 30 }, now),
    geminiLimiter: createRateLimiter({ perIpPerMinute: 1_000, perIpPerHour: 100_000, globalPerMinute: GEMINI_LIMITS.globalPerMinute }, now),
    budget: { day: "", seconds: 0, calls: 0 },
    cooldownUntil: 0,
  };
}

/** Description text as-is (whitespace collapsed, cut on a word boundary). No rewriting of API data. */
export function excerpt(text: unknown, max: number): string {
  const t = String(text ?? "").replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (!t) return "";
  if (t.length <= max) return t;
  return t.slice(0, max).replace(/\s+\S*$/, "") + "...";
}

function descriptionLevels(desc: unknown): Levels {
  const none = "The channel did not add a description for this video.";
  return { less: excerpt(desc, 220) || none, standard: excerpt(desc, 650) || none, more: excerpt(desc, 1_400) || none };
}

const LONG_HEADERS = { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" };
const SHORT_HEADERS = { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=300" };

function ptDay(t: number) {
  return new Date(t).toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}

export async function handleVideoSummary(opts: {
  id: unknown;
  ip: string;
  env: Env;
  state: SummaryState;
  fetchImpl?: typeof fetch;
  now?: () => number;
}): Promise<Out> {
  const now = opts.now ?? (() => Date.now());
  const fetchImpl = opts.fetchImpl ?? fetch;
  const st = opts.state;
  const id = opts.id;
  if (!isVideoId(id)) return json(400, { error: "bad_id" });
  const key = (opts.env.YOUTUBE_API_KEY || "").trim();
  if (!key) return json(503, { error: "no_key" });

  const cached = st.cache.get(id);
  if (cached) return json(200, cached, LONG_HEADERS);
  const soft = st.soft.get(id);
  if (soft) return json(200, soft, SHORT_HEADERS);

  const running = st.inflight.get(id);
  if (running) return running;

  const rl = st.limiter.check(opts.ip);
  if (!rl.ok) return json(429, { error: rl.code, retryAfter: rl.retryAfter }, { ...NO_STORE, "Retry-After": String(rl.retryAfter) });

  const work = (async (): Promise<Out> => {
    let item: Record<string, any> | undefined;
    try {
      item = (await videoDetails([id], key, fetchImpl, now(), "snippet,contentDetails,status"))[0];
    } catch (e) {
      return json(503, { error: e instanceof YouTubeError ? e.code : "upstream" });
    }
    if (!item || item.status?.privacyStatus === "private") return json(404, { error: "not_found" });
    const sn = item.snippet || {};
    const duration = parseDuration(item.contentDetails?.duration);
    const meta = { id, title: String(sn.title || ""), channel: String(sn.channelTitle || ""), published: String(sn.publishedAt || ""), duration };
    const fallback = (reason: SummaryReason): Out => {
      const payload: SummaryPayload = { ...meta, source: "description", reason, levels: descriptionLevels(sn.description) };
      if (reason !== "off") st.soft.set(id, payload);
      return json(200, payload, SHORT_HEADERS);
    };

    if (!hasKey(opts.env, "GEMINI_API_KEY")) return fallback("off");
    if (sn.liveBroadcastContent && sn.liveBroadcastContent !== "none") return fallback("live");
    if (item.status?.privacyStatus && item.status.privacyStatus !== "public") return fallback("failed"); // Gemini reads public videos only
    if (duration > GEMINI_LIMITS.maxVideoSeconds) return fallback("long");
    if (duration < GEMINI_LIMITS.minVideoSeconds) return fallback("short");

    const t = now();
    const day = ptDay(t);
    if (st.budget.day !== day) st.budget = { day, seconds: 0, calls: 0 };
    const cap = Number(opts.env.GEMINI_DAILY_VIDEO_SECONDS) > 0 ? Number(opts.env.GEMINI_DAILY_VIDEO_SECONDS) : GEMINI_LIMITS.dailyVideoSeconds;
    if (st.budget.seconds + duration > cap) return fallback("budget");
    if (t < st.cooldownUntil || !st.geminiLimiter.check("all").ok) return fallback("busy");

    st.budget.seconds += duration; // reserve; refunded below if the call fails
    const result = await summarizeVideoWithGemini(id, opts.env, fetchImpl);
    if (!result.ok) {
      st.budget.seconds -= duration;
      if (result.code === "busy") st.cooldownUntil = now() + 60_000;
      return fallback(result.code === "busy" ? "busy" : "failed");
    }
    st.budget.calls += 1;
    const payload: SummaryPayload = { ...meta, source: "gemini", levels: result.levels };
    st.cache.set(id, payload);
    return json(200, payload, LONG_HEADERS);
  })();

  st.inflight.set(id, work);
  try {
    return await work;
  } finally {
    st.inflight.delete(id);
  }
}

export { quotaStats, searchBudgetLeft };
