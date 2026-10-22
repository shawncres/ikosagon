/* eslint-disable @typescript-eslint/no-explicit-any -- parses untyped third-party JSON defensively */
/**
 * Provider-neutral pieces shared by the model adapters (gemini.ts, openai-compatible.ts) and llm.ts.
 * Nothing here knows a provider: messages, limits, failure codes, a timed fetch and an SSE line reader.
 */

export type Env = Record<string, string | undefined>;
/** One conversation turn. "model" is the assistant; adapters map it to their own role names. */
export type Content = { role: "user" | "model"; parts: { text: string }[] };
export type FailCode = "no_key" | "busy" | "refused" | "timeout" | "upstream" | "empty" | "blocked";
/** status: the provider's HTTP status (none for a network error); detail: its error code and message, redacted and short (logs only, never sent to the browser). */
export type Fail = { ok: false; code: FailCode; status?: number; detail?: string };
/**
 * route and attempt label the failure log line (attempt: the caller's call number, 1 unless it retried);
 * timeoutMs caps a one-shot JSON call below MODEL_LIMITS.jsonTimeoutMs, so a retry fits inside a route's time limit.
 */
export type StreamOptions = { maxTokens?: number; route?: string; attempt?: number; timeoutMs?: number };
export type StreamStart = { ok: true; model: string; pieces: AsyncGenerator<string>; abort: () => void } | Fail;
export type JsonResult<T> = { ok: true; value: T; model: string } | Fail;

/** Resolved settings for one provider (see llmConfig in llm.ts). */
export type LlmConfig = { provider: "gemini" | "openai-compatible"; key: string; model: string; base: string; fallback?: string };

export const MODEL_LIMITS = {
  /** a request that hasn't answered (response headers) by now gives up, so visitors aren't left waiting */
  requestTimeoutMs: 20_000,
  /** a one-shot JSON call (the whole answer) */
  jsonTimeoutMs: 20_000,
  /** hard cap on a whole streamed reply; a timed-out request plus one fallback stays inside the routes' 60 s */
  streamTimeoutMs: 38_000,
  chatMaxTokens: 900,
  lessonMaxTokens: 1_800,
  jsonMaxTokens: 600,
  /** the creation call: up to 5 parents, each with a card and up to 6 children */
  createMaxTokens: 2_000,
  chatTemperature: 0.4,
  jsonTemperature: 0.3,
};

export function statusFail(status: number): Fail {
  if (status === 429) return { ok: false, code: "busy", status };
  if (status === 400 || status === 401 || status === 403 || status === 404) return { ok: false, code: "refused", status };
  return { ok: false, code: "upstream", status };
}

export const errorFail = (e: unknown): Fail => {
  const err = e as Error | undefined;
  return { ok: false, code: err?.name === "AbortError" ? "timeout" : "upstream", detail: `${err?.name || "Error"}: ${err?.message || String(e)}` };
};

/* ---------- failure logging: one structured line per failed provider attempt (never the key, never prompt text) ---------- */

export const LOG_DETAIL_CHARS = 200;
/** Key-like strings removed from anything logged, whatever the provider (Google keys, sk- keys, xai- keys, bearer tokens). */
const KEYLIKE = /AIza[0-9A-Za-z_-]{20,}|\b(?:sk|xai|gsk)-[0-9A-Za-z_-]{12,}|Bearer\s+\S+|key=[^&\s"]+/g;

/** Removes the key (and anything key-shaped), flattens whitespace and cuts to LOG_DETAIL_CHARS. */
export function redact(text: string, key?: string): string {
  let t = String(text || "");
  if (key && key.length >= 6) t = t.split(key).join("[key]");
  t = t.replace(KEYLIKE, "[key]").replace(/\s+/g, " ").trim();
  return t.length > LOG_DETAIL_CHARS ? t.slice(0, LOG_DETAIL_CHARS - 1) + "…" : t;
}

/**
 * A failed HTTP response as a Fail: the status mapped by statusFail, plus the provider's own error code and message
 * when the body has them (Gemini: { error: { code, status, message } }; OpenAI-style: { error: { type, code, message } }).
 */
export async function failFromResponse(res: Response): Promise<Fail> {
  const f = statusFail(res.status);
  let text = "";
  try {
    text = (await res.text()).slice(0, 4_000);
  } catch {
    /* no body */
  }
  let detail = text;
  try {
    const e = JSON.parse(text)?.error;
    if (e && typeof e === "object") detail = [e.status || e.type || e.code, e.message].filter((x) => x !== undefined && x !== null && x !== "").join(": ");
    else if (typeof e === "string") detail = e;
  } catch {
    /* not JSON: keep the text */
  }
  detail = detail === "null" || detail === "{}" ? "" : detail;
  return detail ? { ...f, detail } : f;
}

export type LlmFailLog = { ev: "ikolearn.llm_fail"; route: string; provider: string; model: string; status: number | null; code: FailCode; error: string; attempt: number; try: "primary" | "fallback" };

let logSink: (line: string) => void = (line) => console.warn(line);
/** Swaps where failure lines go (the checks capture them); returns the previous sink. */
export function setLlmLogSink(fn: (line: string) => void): (line: string) => void {
  const prev = logSink;
  logSink = fn;
  return prev;
}

/** Logs one failed attempt as a single JSON line and returns the Fail unchanged. */
export function logFail(cfg: LlmConfig, model: string, opts: StreamOptions, f: Fail, which: "primary" | "fallback" = "primary"): Fail {
  const line: LlmFailLog = {
    ev: "ikolearn.llm_fail",
    route: opts.route || "unknown",
    provider: cfg.provider,
    model,
    status: f.status ?? null,
    code: f.code,
    error: redact(f.detail || "", cfg.key),
    attempt: opts.attempt || 1,
    try: which,
  };
  try {
    logSink(JSON.stringify(line));
  } catch {
    /* logging never breaks a reply */
  }
  return f;
}

/**
 * fetch with a plain request timeout: aborts if the response hasn't started within `requestMs`. For streams, `totalMs`
 * keeps running until `done()` is called (the reply finished or was dropped).
 */
export async function timedFetch(fetchImpl: typeof fetch, url: string, init: RequestInit, requestMs: number, totalMs = requestMs) {
  const controller = new AbortController();
  const first = setTimeout(() => controller.abort(), requestMs);
  const total = setTimeout(() => controller.abort(), totalMs);
  const done = () => { clearTimeout(first); clearTimeout(total); };
  try {
    const res = await fetchImpl(url, { ...init, signal: controller.signal, cache: "no-store" });
    clearTimeout(first);
    return { res, done, abort: () => controller.abort() };
  } catch (e) {
    done();
    throw e;
  }
}

/** Reads an SSE body ("data: {json}" lines) and yields the text `pick` finds in each event (empty ones skipped). */
export async function* readSseWith(body: ReadableStream<Uint8Array>, pick: (data: any) => string): AsyncGenerator<string> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const one = (line: string) => {
    if (!line.startsWith("data:")) return "";
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") return "";
    try {
      return pick(JSON.parse(payload)) || "";
    } catch {
      return ""; /* partial or non-JSON line: skip */
    }
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const t = one(buf.slice(0, nl).trim());
      buf = buf.slice(nl + 1);
      if (t) yield t;
    }
    if (done) break;
  }
  const t = one(buf.trim());
  if (t) yield t;
}

/** Prompts write schemas in plain JSON Schema (lowercase types); this upper-cases `type` for providers that want it. */
export function upperTypes(schema: any): any {
  if (Array.isArray(schema)) return schema.map(upperTypes);
  if (!schema || typeof schema !== "object") return schema;
  const out: any = {};
  for (const [k, v] of Object.entries(schema)) out[k] = k === "type" && typeof v === "string" ? v.toUpperCase() : upperTypes(v);
  return out;
}
