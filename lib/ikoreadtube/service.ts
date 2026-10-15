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
  unitsToday,
  searchVideos,
  videoDetails,
  type FeedVideo,
} from "./youtube";
import { ASK_LIMITS, GEMINI_LIMITS, askVideoWithGemini, summarizeVideoWithGemini, type Levels, type Turn } from "./gemini";
import { cleanFocus, focusKey, focusQuestion } from "./focus";
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

/** 5 min at the edge (+5 min stale-while-revalidate); with the 5 min in-memory copy a visitor sees data at most ~10 min old. */
const FEED_HEADERS = { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=300" };
/** Economy mode (many units already spent today): hold the same list for 30 min. */
const ECONOMY_HEADERS = { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=1800" };
const ECONOMY_HOLD_MS = 30 * 60_000;

export async function handleFeed(opts: { env: Env; state: FeedState; fetchImpl?: typeof fetch; now?: () => number }): Promise<Out> {
  const now = opts.now ?? (() => Date.now());
  const key = (opts.env.YOUTUBE_API_KEY || "").trim();
  if (!key) return json(503, { error: "no_key" });
  const hit = opts.state.cache.get("feed");
  if (hit) return json(200, { source: "youtube", fetchedAt: opts.state.last?.at ?? now(), videos: hit }, FEED_HEADERS);
  // Quota guard: this refresh costs ~21 units of the shared 10,000/day pool.
  const used = unitsToday(now());
  const last = opts.state.last;
  if (last && used >= YT_LIMITS.economyUnits && now() - last.at < ECONOMY_HOLD_MS) {
    return json(200, { source: "youtube", economy: true, fetchedAt: last.at, videos: last.videos }, ECONOMY_HEADERS);
  }
  if (used + YT_LIMITS.feedUnitEstimate > YT_LIMITS.dailyUnitCap) {
    if (last) return json(200, { source: "youtube", stale: true, fetchedAt: last.at, videos: last.videos }, { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=600" });
    return json(503, { error: "quota" });
  }
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

/* ---------- summary + ask (Gemini reads the video) ---------- */

export type SummaryReason = "off" | "long" | "short" | "live" | "budget" | "busy" | "failed";

export type SummaryPayload = {
  id: string;
  source: "gemini" | "description";
  reason?: SummaryReason;
  title: string;
  channel: string;
  published: string;
  duration: number;
  /** Cleaned focus the summary answers ("" = general summary). */
  focus: string;
  /** Focused summaries only: false when the video does not address the focus. */
  covered?: boolean;
  levels: Levels;
};

export type VideoMeta = { id: string; title: string; channel: string; published: string; duration: number; description: string; live: boolean; privacy: string };

export type AskPayload =
  | { ok: true; answered: boolean; answer: string; timestamps: string[] }
  | { ok: false; reason: SummaryReason | "ip_rate" };

export type SummaryState = {
  cache: ReturnType<typeof createTtlCache<SummaryPayload>>;
  soft: ReturnType<typeof createTtlCache<SummaryPayload>>;
  meta: ReturnType<typeof createTtlCache<VideoMeta>>;
  askCache: ReturnType<typeof createTtlCache<AskPayload>>;
  inflight: Map<string, Promise<Out>>;
  limiter: ReturnType<typeof createRateLimiter>;
  askLimiter: ReturnType<typeof createRateLimiter>;
  geminiLimiter: ReturnType<typeof createRateLimiter>;
  budget: { day: string; seconds: number; calls: number };
  cooldownUntil: number;
};

export function createSummaryState(now: () => number = () => Date.now()): SummaryState {
  return {
    cache: createTtlCache<SummaryPayload>(GEMINI_LIMITS.successTtlMs, 400, now),
    soft: createTtlCache<SummaryPayload>(GEMINI_LIMITS.failureTtlMs, 200, now),
    meta: createTtlCache<VideoMeta>(6 * 3_600_000, 300, now),
    askCache: createTtlCache<AskPayload>(3_600_000, 200, now),
    inflight: new Map(),
    limiter: createRateLimiter({ perIpPerMinute: GEMINI_LIMITS.perIpPerMinute, perIpPerHour: GEMINI_LIMITS.perIpPerHour, globalPerMinute: 30 }, now),
    askLimiter: createRateLimiter({ perIpPerMinute: 4, perIpPerHour: 20, globalPerMinute: 30 }, now),
    geminiLimiter: createRateLimiter({ perIpPerMinute: 1_000, perIpPerHour: 100_000, globalPerMinute: GEMINI_LIMITS.globalPerMinute + 4 }, now),
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

export const NOT_COVERED = "NOT COVERED IN THIS VIDEO.";

/** Same text on all three levels: the plain verdict plus one line on what the video is about. */
export function notCoveredLevels(about: string): Levels {
  const t = `${NOT_COVERED}\n\nThis video is about: ${about.replace(/^this video is (?:about|mainly about)\s*:?\s*/i, "")}`;
  return { less: t, standard: t, more: t };
}

const LONG_HEADERS = { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" };
const SHORT_HEADERS = { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=300" };

function ptDay(t: number) {
  return new Date(t).toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}

async function getMeta(id: string, key: string, fetchImpl: typeof fetch, now: number, st: SummaryState): Promise<VideoMeta | null> {
  const hit = st.meta.get(id);
  if (hit) return hit;
  const item = (await videoDetails([id], key, fetchImpl, now, "snippet,contentDetails,status"))[0];
  if (!item || item.status?.privacyStatus === "private") return null;
  const sn = item.snippet || {};
  const meta: VideoMeta = {
    id,
    title: String(sn.title || ""),
    channel: String(sn.channelTitle || ""),
    published: String(sn.publishedAt || ""),
    duration: parseDuration(item.contentDetails?.duration),
    description: String(sn.description || ""),
    live: Boolean(sn.liveBroadcastContent && sn.liveBroadcastContent !== "none"),
    privacy: String(item.status?.privacyStatus || ""),
  };
  st.meta.set(id, meta);
  return meta;
}

/** Shared by summary and ask: why Gemini may NOT be used for this video right now (null = go ahead; reserves a rate-limit slot). */
function gate(meta: VideoMeta, env: Env, st: SummaryState, t: number): SummaryReason | null {
  if (!hasKey(env, "GEMINI_API_KEY")) return "off";
  if (meta.live) return "live";
  if (meta.privacy && meta.privacy !== "public") return "failed"; // Gemini reads public videos only
  if (meta.duration > GEMINI_LIMITS.maxVideoSeconds) return "long";
  if (meta.duration < GEMINI_LIMITS.minVideoSeconds) return "short";
  const day = ptDay(t);
  if (st.budget.day !== day) st.budget = { day, seconds: 0, calls: 0 };
  const cap = Number(env.GEMINI_DAILY_VIDEO_SECONDS) > 0 ? Number(env.GEMINI_DAILY_VIDEO_SECONDS) : GEMINI_LIMITS.dailyVideoSeconds;
  if (st.budget.seconds + meta.duration > cap) return "budget";
  if (t < st.cooldownUntil || !st.geminiLimiter.check("all").ok) return "busy";
  return null;
}

export async function handleVideoSummary(opts: {
  id: unknown;
  /** Reader's search words or their edited focus ("" / undefined = general summary). */
  focus?: unknown;
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
  const focus = cleanFocus(opts.focus);
  const ck = `${id}|${focusKey(focus)}`; // cache key includes the normalized focus

  const cached = st.cache.get(ck);
  if (cached) return json(200, cached, LONG_HEADERS);
  const soft = st.soft.get(ck);
  if (soft) return json(200, soft, SHORT_HEADERS);

  const running = st.inflight.get(ck);
  if (running) return running;

  const rl = st.limiter.check(opts.ip);
  if (!rl.ok) return json(429, { error: rl.code, retryAfter: rl.retryAfter }, { ...NO_STORE, "Retry-After": String(rl.retryAfter) });

  const work = (async (): Promise<Out> => {
    let meta: VideoMeta | null;
    try {
      meta = await getMeta(id, key, fetchImpl, now(), st);
    } catch (e) {
      return json(503, { error: e instanceof YouTubeError ? e.code : "upstream" });
    }
    if (!meta) return json(404, { error: "not_found" });
    const base = { id, title: meta.title, channel: meta.channel, published: meta.published, duration: meta.duration, focus };
    const fallback = (reason: SummaryReason): Out => {
      const payload: SummaryPayload = { ...base, source: "description", reason, levels: descriptionLevels(meta.description) };
      if (reason !== "off") st.soft.set(ck, payload);
      return json(200, payload, SHORT_HEADERS);
    };

    const why = gate(meta, opts.env, st, now());
    if (why) return fallback(why);

    st.budget.seconds += meta.duration; // reserve; refunded below if the call fails
    const result = await summarizeVideoWithGemini(id, opts.env, fetchImpl, focus ? { text: focus, question: focusQuestion(focus) } : undefined);
    if (!result.ok) {
      st.budget.seconds -= meta.duration;
      if (result.code === "busy") st.cooldownUntil = now() + 60_000;
      return fallback(result.code === "busy" ? "busy" : "failed");
    }
    st.budget.calls += 1;
    const covered = focus ? result.covered !== false : undefined;
    const levels = focus && covered === false ? notCoveredLevels(result.about || meta.title || "something else") : result.levels;
    const payload: SummaryPayload = { ...base, source: "gemini", ...(covered === undefined ? {} : { covered }), levels };
    st.cache.set(ck, payload);
    return json(200, payload, LONG_HEADERS);
  })();

  st.inflight.set(ck, work);
  try {
    return await work;
  } finally {
    st.inflight.delete(ck);
  }
}

/* ---------- ask: a question about one video ---------- */

export function cleanQuestion(raw: unknown): string {
  return String(raw ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, ASK_LIMITS.questionMax);
}

export function cleanHistory(raw: unknown): Turn[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(-ASK_LIMITS.historyTurns)
    .map((t) => ({ q: cleanQuestion((t as any)?.q).slice(0, ASK_LIMITS.historyChars), a: cleanQuestion((t as any)?.a).slice(0, ASK_LIMITS.historyChars) }))
    .filter((t) => t.q && t.a);
}

export async function handleAsk(opts: {
  id: unknown;
  question: unknown;
  history?: unknown;
  ip: string;
  env: Env;
  state: SummaryState;
  fetchImpl?: typeof fetch;
  now?: () => number;
}): Promise<Out> {
  const now = opts.now ?? (() => Date.now());
  const st = opts.state;
  const id = opts.id;
  if (!isVideoId(id)) return json(400, { error: "bad_id" });
  const question = cleanQuestion(opts.question);
  if (question.length < ASK_LIMITS.questionMin) return json(400, { error: "bad_question" });
  const key = (opts.env.YOUTUBE_API_KEY || "").trim();
  if (!key) return json(503, { error: "no_key" });
  const history = cleanHistory(opts.history);

  const ck = `${id}|${question.toLowerCase()}`;
  if (!history.length) {
    const hit = st.askCache.get(ck);
    if (hit) return json(200, hit);
  }
  const rl = st.askLimiter.check(opts.ip);
  if (!rl.ok) return json(429, { error: rl.code, retryAfter: rl.retryAfter }, { ...NO_STORE, "Retry-After": String(rl.retryAfter) });

  let meta: VideoMeta | null;
  try {
    meta = await getMeta(id, key, opts.fetchImpl ?? fetch, now(), st);
  } catch (e) {
    return json(503, { error: e instanceof YouTubeError ? e.code : "upstream" });
  }
  if (!meta) return json(404, { error: "not_found" });
  const why = gate(meta, opts.env, st, now());
  if (why) return json(200, { ok: false, reason: why } satisfies AskPayload);

  st.budget.seconds += meta.duration;
  const r = await askVideoWithGemini(id, question, history, meta.duration, opts.env, opts.fetchImpl ?? fetch);
  if (!r.ok) {
    st.budget.seconds -= meta.duration;
    if (r.code === "busy") st.cooldownUntil = now() + 60_000;
    return json(200, { ok: false, reason: r.code === "busy" ? "busy" : "failed" } satisfies AskPayload);
  }
  st.budget.calls += 1;
  const payload: AskPayload = { ok: true, answered: r.answered, answer: r.answer, timestamps: r.timestamps };
  if (!history.length) st.askCache.set(ck, payload);
  return json(200, payload);
}

export { quotaStats, searchBudgetLeft, unitsToday };
