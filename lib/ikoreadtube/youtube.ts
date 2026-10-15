/* eslint-disable @typescript-eslint/no-explicit-any -- parses untyped third-party JSON defensively */
/**
 * IkoReadTube real-YouTube feed + search, using ONLY the official YouTube Data API v3 (no scraping).
 * Pure logic with an injectable fetch so scripts/ikoreadtube-check.mjs can test it with mocked responses.
 *
 * Quota (default project quota): playlistItems.list and videos.list cost 1 unit each; search.list has its own
 * bucket of 100 calls/day. A feed refresh over 18 channels is 18 playlist calls + about 3 videos.list calls.
 * YouTube API data is cached for minutes to hours only (the API policy allows at most 30 days).
 */
import channelsFile from "./channels.json";

export const YT_BASE = "https://www.googleapis.com/youtube/v3";

export type Channel = { handle: string; category: string; id?: string };
export const CHANNELS: Channel[] = channelsFile as Channel[];

export type FeedVideo = {
  id: string;
  title: string;
  channel: string;
  /** ISO timestamp of publication. */
  published: string;
  /** Length in seconds. */
  duration: number;
};

export const YT_LIMITS = {
  perChannel: 6, // newest uploads fetched per channel
  shownPerChannel: 2, // keep the feed varied
  feedMax: 36,
  minSeconds: 61, // drops Shorts-length clips
  feedTtlMs: 15 * 60_000,
  searchTtlMs: 60 * 60_000,
  searchMax: 12,
  searchDailyCap: 90, // Data API gives 100 search calls/day; keep a margin
  queryMin: 2,
  queryMax: 60,
  timeoutMs: 10_000,
};

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
export const isVideoId = (s: unknown): s is string => typeof s === "string" && VIDEO_ID.test(s);

export function parseDuration(iso: unknown): number {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(String(iso ?? ""));
  if (!m) return 0;
  return Number(m[1] || 0) * 86_400 + Number(m[2] || 0) * 3_600 + Number(m[3] || 0) * 60 + Number(m[4] || 0);
}

export class YouTubeError extends Error {
  constructor(
    public code: "no_key" | "key_rejected" | "quota" | "upstream" | "timeout" | "bad_request" | "not_found",
    message: string,
  ) {
    super(message);
  }
}

type FetchImpl = typeof fetch;

/** Quota units used by this server instance since it started (diagnostics only; the real counter is Google's). */
export const quotaStats = { units: 0, searches: 0, day: "" };

function ptDay(now: number): string {
  return new Date(now).toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}

function rollDay(now: number) {
  const d = ptDay(now);
  if (quotaStats.day !== d) {
    quotaStats.day = d;
    quotaStats.units = 0;
    quotaStats.searches = 0;
  }
}

async function call(path: string, params: Record<string, string>, key: string, fetchImpl: FetchImpl, cost: number, now: number) {
  rollDay(now);
  const url = `${YT_BASE}/${path}?${new URLSearchParams(params).toString()}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), YT_LIMITS.timeoutMs);
  try {
    const res = await fetchImpl(url, { headers: { "x-goog-api-key": key, Accept: "application/json" }, signal: controller.signal, cache: "no-store" });
    quotaStats.units += cost;
    if (res.ok) return (await res.json()) as Record<string, any>;
    let reason = "";
    try {
      const body = (await res.json()) as any;
      reason = String(body?.error?.errors?.[0]?.reason || body?.error?.status || "");
    } catch {
      /* ignore */
    }
    if (res.status === 403 && /quota|rateLimit|dailyLimit/i.test(reason)) throw new YouTubeError("quota", "YouTube quota reached");
    if (res.status === 400 && /keyInvalid|API key/i.test(reason)) throw new YouTubeError("key_rejected", "YouTube key rejected");
    if (res.status === 400 || res.status === 401 || res.status === 403) throw new YouTubeError("key_rejected", `YouTube refused the request (${res.status} ${reason})`);
    if (res.status === 404) throw new YouTubeError("not_found", "not found");
    throw new YouTubeError("upstream", `YouTube error ${res.status}`);
  } catch (e) {
    if (e instanceof YouTubeError) throw e;
    if ((e as Error)?.name === "AbortError") throw new YouTubeError("timeout", "YouTube timed out");
    throw new YouTubeError("upstream", "YouTube could not be reached");
  } finally {
    clearTimeout(timer);
  }
}

/** Channel IDs start with "UC"; the uploads playlist is the same ID starting with "UU". */
export function uploadsPlaylist(channelId: string): string | null {
  return /^UC[A-Za-z0-9_-]{22}$/.test(channelId) ? `UU${channelId.slice(2)}` : null;
}

const resolved = new Map<string, string>();

/** Fills in missing channel IDs once per server instance (channels.json normally already has them). */
export async function resolveChannels(channels: Channel[], key: string, fetchImpl: FetchImpl = fetch, now = Date.now()): Promise<Array<Channel & { id: string }>> {
  const out: Array<Channel & { id: string }> = [];
  for (const c of channels) {
    let id = c.id || resolved.get(c.handle);
    if (!id) {
      try {
        const data = await call("channels", { part: "id", forHandle: c.handle }, key, fetchImpl, 1, now);
        id = data.items?.[0]?.id;
        if (id) resolved.set(c.handle, id);
      } catch (e) {
        if (e instanceof YouTubeError && (e.code === "quota" || e.code === "key_rejected")) throw e;
      }
    }
    if (id && uploadsPlaylist(id)) out.push({ ...c, id });
  }
  return out;
}

function chunk<T>(a: T[], n: number): T[][] {
  const r: T[][] = [];
  for (let i = 0; i < a.length; i += n) r.push(a.slice(i, i + n));
  return r;
}

/** videos.list details (duration, live status, title, channel) for up to many ids, 50 per call. */
export async function videoDetails(ids: string[], key: string, fetchImpl: FetchImpl = fetch, now = Date.now(), parts = "snippet,contentDetails") {
  const items: Array<Record<string, any>> = [];
  for (const group of chunk(ids, 50)) {
    const data = await call("videos", { part: parts, id: group.join(",") }, key, fetchImpl, 1, now);
    items.push(...((data.items as any[]) || []));
  }
  return items;
}

function toFeedVideo(it: Record<string, any>): FeedVideo | null {
  const id = it?.id;
  if (!isVideoId(id)) return null;
  const sn = it.snippet || {};
  if (sn.liveBroadcastContent && sn.liveBroadcastContent !== "none") return null; // live / upcoming
  const duration = parseDuration(it.contentDetails?.duration);
  if (duration < YT_LIMITS.minSeconds) return null;
  const title = String(sn.title || "").trim();
  if (!title) return null;
  return { id, title, channel: String(sn.channelTitle || "").trim(), published: String(sn.publishedAt || ""), duration };
}

export async function fetchFeed(key: string, fetchImpl: FetchImpl = fetch, now = Date.now(), channels: Channel[] = CHANNELS): Promise<FeedVideo[]> {
  const chans = await resolveChannels(channels, key, fetchImpl, now);
  const lists = await Promise.all(
    chans.map(async (c) => {
      try {
        const data = await call(
          "playlistItems",
          { part: "contentDetails", playlistId: uploadsPlaylist(c.id)!, maxResults: String(YT_LIMITS.perChannel) },
          key,
          fetchImpl,
          1,
          now,
        );
        return ((data.items as any[]) || []).map((i) => String(i?.contentDetails?.videoId || "")).filter(isVideoId);
      } catch (e) {
        if (e instanceof YouTubeError && (e.code === "quota" || e.code === "key_rejected")) throw e;
        return []; // one broken channel must not break the feed
      }
    }),
  );
  const ids = Array.from(new Set(lists.flat()));
  if (!ids.length) return [];
  const details = (await videoDetails(ids, key, fetchImpl, now)).map(toFeedVideo).filter((v): v is FeedVideo => Boolean(v));
  // Round-robin across channels (each channel's newest first) so a busy news channel cannot crowd out the rest.
  const byChannel = new Map<string, FeedVideo[]>();
  for (const v of details.sort((x, y) => Date.parse(y.published) - Date.parse(x.published))) {
    byChannel.set(v.channel, [...(byChannel.get(v.channel) || []), v]);
  }
  const out: FeedVideo[] = [];
  for (let round = 0; round < YT_LIMITS.shownPerChannel; round += 1) {
    const layer = Array.from(byChannel.values())
      .map((list) => list[round])
      .filter((v): v is FeedVideo => Boolean(v))
      .sort((x, y) => Date.parse(y.published) - Date.parse(x.published));
    out.push(...layer);
  }
  return out.slice(0, YT_LIMITS.feedMax);
}

export function cleanQuery(q: unknown): string {
  return String(q ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, YT_LIMITS.queryMax);
}

/** Daily guard for search.list (Data API: 100 calls/day). True when another search may be spent. */
export function searchBudgetLeft(now = Date.now()): boolean {
  rollDay(now);
  return quotaStats.searches < YT_LIMITS.searchDailyCap;
}

export async function searchVideos(q: string, key: string, fetchImpl: FetchImpl = fetch, now = Date.now()): Promise<FeedVideo[]> {
  rollDay(now);
  quotaStats.searches += 1;
  const data = await call(
    "search",
    { part: "snippet", type: "video", q, maxResults: String(YT_LIMITS.searchMax), safeSearch: "moderate" },
    key,
    fetchImpl,
    0,
    now,
  );
  const ids = ((data.items as any[]) || []).map((i) => String(i?.id?.videoId || "")).filter(isVideoId);
  if (!ids.length) return [];
  const details = (await videoDetails(ids, key, fetchImpl, now)).map(toFeedVideo).filter((v): v is FeedVideo => Boolean(v));
  const order = new Map(ids.map((id, i) => [id, i]));
  return details.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

/* ---------- small in-memory TTL cache (per server instance; the CDN is the shared cache) ---------- */

export function createTtlCache<T>(ttlMs: number, max = 100, now: () => number = () => Date.now()) {
  const m = new Map<string, { at: number; v: T }>();
  return {
    get(k: string): T | undefined {
      const e = m.get(k);
      if (!e) return undefined;
      if (now() - e.at > ttlMs) {
        m.delete(k);
        return undefined;
      }
      return e.v;
    },
    set(k: string, v: T) {
      m.set(k, { at: now(), v });
      if (m.size > max) m.delete(m.keys().next().value as string);
    },
    size: () => m.size,
  };
}
