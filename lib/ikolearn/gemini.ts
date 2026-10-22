/* eslint-disable @typescript-eslint/no-explicit-any -- parses untyped third-party JSON defensively */
/**
 * IkoLearn's Gemini adapter (the default provider; see llm.ts for how one is chosen).
 * - geminiStream(): streamGenerateContent?alt=sse, yields text pieces as they arrive.
 * - geminiJson(): generateContent with a response schema (cards, adjacent topics, paths).
 * - geminiJsonStream(): the same JSON request streamed (the creation call), so the first items can be used as they arrive.
 * Free-tier models only; one fallback model when the request fails, times out or the model name is retired (never mid-reply).
 * The key goes in a header, server-side only, and never appears in responses or logs.
 */
import { MODEL_LIMITS, errorFail, failFromResponse, logFail, logHedge, readSseWith, statusFail, timedFetch, upperTypes, type Content, type Fail, type JsonResult, type LlmConfig, type StreamOptions, type StreamStart } from "./llm-types";

export const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
export const DEFAULT_MODEL = "gemini-3.5-flash-lite";
export const FALLBACK_MODEL = "gemini-3.1-flash-lite";

const textOf = (data: any) =>
  (data?.candidates?.[0]?.content?.parts || [])
    .filter((p: any) => !p?.thought)
    .map((p: any) => (typeof p?.text === "string" ? p.text : ""))
    .join("");

export function chatBody(system: string, contents: Content[], opts: StreamOptions = {}) {
  return {
    systemInstruction: { parts: [{ text: system }] },
    contents,
    generationConfig: { temperature: MODEL_LIMITS.chatTemperature, maxOutputTokens: opts.maxTokens || MODEL_LIMITS.chatMaxTokens },
  };
}

export function jsonBody(system: string, user: string, schema: unknown, opts: StreamOptions = {}) {
  return {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig: { temperature: MODEL_LIMITS.jsonTemperature, maxOutputTokens: opts.maxTokens || MODEL_LIMITS.jsonMaxTokens, responseMimeType: "application/json", responseSchema: upperTypes(schema) },
  };
}

/** Reads a Gemini SSE body and yields each event's visible text (thought parts skipped). */
export const readSse = (body: ReadableStream<Uint8Array>) => readSseWith(body, textOf);

async function openStream(cfg: LlmConfig, model: string, body: unknown, fetchImpl: typeof fetch, opts: StreamOptions, which: "primary" | "fallback", cancel?: AbortSignal): Promise<StreamStart> {
  try {
    const { res, done, abort } = await timedFetch(fetchImpl, `${cfg.base}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
      method: "POST",
      headers: { "x-goog-api-key": cfg.key, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }, MODEL_LIMITS.requestTimeoutMs, MODEL_LIMITS.streamTimeoutMs, cancel);
    if (!res.ok || !res.body) {
      done();
      return logFail(cfg, model, opts, res.ok ? { ...statusFail(502), detail: "empty stream body" } : await failFromResponse(res), which);
    }
    const pieces = (async function* () {
      try {
        yield* readSse(res.body as ReadableStream<Uint8Array>);
      } finally {
        done();
      }
    })();
    return { ok: true, model, pieces, abort: () => { abort(); done(); } };
  } catch (e) {
    if (cancel?.aborted) return { ok: false, code: "timeout", detail: "cancelled: the other model started first" }; /* the hedge's loser: not a failure */
    return logFail(cfg, model, opts, errorFail(e), which);
  }
}

/** Server errors, network failures, a request timeout and a retired model name (404) try the fallback model once; 429 and bad requests do not. */
function shouldFallBack(f: Fail) {
  return (f.code === "upstream" && (f.status === undefined || f.status >= 500)) || f.code === "timeout" || f.status === 404;
}

export async function geminiStream(cfg: LlmConfig, system: string, contents: Content[], fetchImpl: typeof fetch, opts: StreamOptions = {}): Promise<StreamStart> {
  return streamWithFallback(cfg, chatBody(system, contents, opts), fetchImpl, opts);
}

/** A JSON (response schema) request, streamed: pieces of the JSON text as they arrive (the caller parses as it goes). */
export async function geminiJsonStream(cfg: LlmConfig, system: string, user: string, schema: unknown, fetchImpl: typeof fetch, opts: StreamOptions = {}): Promise<StreamStart> {
  return streamWithFallback(cfg, jsonBody(system, user, schema, opts), fetchImpl, opts);
}

/**
 * The primary model, and the fallback once if it fails (5xx, network, timeout, 404). Hedged: when the primary hasn't
 * started streaming after MODEL_LIMITS.hedgeAfterMs, the fallback starts in parallel (one call from the daily budget,
 * via opts.spend); the first to start streaming is used and the other is aborted. A hedge is logged (ikolearn.llm_hedge).
 */
export async function streamWithFallback(cfg: LlmConfig, body: unknown, fetchImpl: typeof fetch, opts: StreamOptions): Promise<StreamStart> {
  const fb = cfg.fallback && cfg.fallback !== cfg.model ? cfg.fallback : "";
  const pCancel = new AbortController(), fCancel = new AbortController();
  const primary = openStream(cfg, cfg.model, body, fetchImpl, opts, "primary", pCancel.signal);
  if (!fb) return primary;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const t0 = Date.now();
  const hedge = new Promise<"hedge">((r) => { timer = setTimeout(() => r("hedge"), MODEL_LIMITS.hedgeAfterMs); });
  const early = await Promise.race([primary, hedge]);
  if (early !== "hedge") {
    clearTimeout(timer);
    if (early.ok || !shouldFallBack(early)) return early;
    return openStream(cfg, fb, body, fetchImpl, opts, "fallback");
  }
  /* the primary is slow to start: hedge, unless the day's budget is spent */
  if (opts.spend && !opts.spend()) {
    const first = await primary;
    return first.ok || !shouldFallBack(first) ? first : openStream(cfg, fb, body, fetchImpl, opts, "fallback");
  }
  const fallback = openStream(cfg, fb, body, fetchImpl, opts, "fallback", fCancel.signal);
  const afterMs = Date.now() - t0;
  const tagged = (p: Promise<StreamStart>, who: "primary" | "fallback") => p.then((r) => ({ r, who }));
  const pending = new Map([["primary", tagged(primary, "primary")], ["fallback", tagged(fallback, "fallback")]] as const);
  let lastFail: StreamStart | null = null;
  while (pending.size) {
    const { r, who } = await Promise.race(pending.values());
    pending.delete(who);
    if (r.ok) {
      /* the winner: cancel the other (still waiting to start, or started later; its pieces are dropped) */
      if (who === "primary") fCancel.abort(); else pCancel.abort();
      void (who === "primary" ? fallback : primary).then((o) => { if (o.ok) o.abort(); });
      logHedge(cfg, opts, afterMs, who);
      return r;
    }
    lastFail = who === "primary" || !lastFail ? r : lastFail; /* report the primary's failure when both fail */
  }
  logHedge(cfg, opts, afterMs, "none");
  return lastFail as StreamStart;
}

async function jsonOnce<T>(cfg: LlmConfig, model: string, body: unknown, parse: (t: string) => T | null, fetchImpl: typeof fetch, opts: StreamOptions, which: "primary" | "fallback", timeoutMs: number): Promise<JsonResult<T>> {
  let done = () => {};
  try {
    const r = await timedFetch(fetchImpl, `${cfg.base}/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": cfg.key, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }, timeoutMs);
    done = r.done;
    if (!r.res.ok) return logFail(cfg, model, opts, await failFromResponse(r.res), which);
    const data = (await r.res.json()) as any;
    if (!data?.candidates?.[0] && data?.promptFeedback?.blockReason) return logFail(cfg, model, opts, { ok: false, code: "blocked", status: r.res.status, detail: `blockReason: ${data.promptFeedback.blockReason}` }, which);
    const value = parse(textOf(data));
    return value ? { ok: true, value, model } : logFail(cfg, model, opts, { ok: false, code: "empty", status: r.res.status, detail: `unusable reply (finishReason: ${data?.candidates?.[0]?.finishReason || "none"})` }, which);
  } catch (e) {
    return logFail(cfg, model, opts, errorFail(e), which);
  } finally {
    done();
  }
}

export async function geminiJson<T>(cfg: LlmConfig, system: string, user: string, schema: unknown, parse: (t: string) => T | null, fetchImpl: typeof fetch, opts: StreamOptions = {}): Promise<JsonResult<T>> {
  const body = jsonBody(system, user, schema, opts);
  /* opts.timeoutMs is the whole call's budget: the fallback only gets what the first attempt left (and none below 2 s) */
  const budget = Math.min(opts.timeoutMs || MODEL_LIMITS.jsonTimeoutMs, MODEL_LIMITS.jsonTimeoutMs), t0 = Date.now();
  const first = await jsonOnce(cfg, cfg.model, body, parse, fetchImpl, opts, "primary", budget);
  if (first.ok || !cfg.fallback || cfg.model === cfg.fallback || !shouldFallBack(first)) return first;
  const left = opts.timeoutMs ? Math.min(MODEL_LIMITS.jsonTimeoutMs, opts.timeoutMs - (Date.now() - t0)) : MODEL_LIMITS.jsonTimeoutMs;
  if (opts.timeoutMs && left < 2_000) return first;
  return jsonOnce(cfg, cfg.fallback, body, parse, fetchImpl, opts, "fallback", left);
}
