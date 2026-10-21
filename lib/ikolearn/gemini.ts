/* eslint-disable @typescript-eslint/no-explicit-any -- parses untyped third-party JSON defensively */
/**
 * IkoLearn model adapter: the only file that knows how to talk to Gemini.
 * - streamText(): streamGenerateContent?alt=sse, yields text pieces as they arrive.
 * - generateJson(): generateContent with a response schema (cards, adjacent topics).
 * Free-tier models only, the same defaults as IkoReadTube; one fallback model when Google answers 5xx before any text arrived.
 * The key goes in a header, server-side only, and never appears in responses or logs.
 */

export const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
export const DEFAULT_MODEL = "gemini-3.5-flash-lite";
export const FALLBACK_MODEL = "gemini-3.1-flash-lite";

export const MODEL_LIMITS = {
  timeoutMs: 30_000,
  chatMaxTokens: 900,
  lessonMaxTokens: 1_400,
  jsonMaxTokens: 600,
  chatTemperature: 0.4,
  jsonTemperature: 0.3,
};

export type Env = Record<string, string | undefined>;
export type Content = { role: "user" | "model"; parts: { text: string }[] };
export type FailCode = "no_key" | "busy" | "refused" | "timeout" | "upstream" | "empty" | "blocked";
export type Fail = { ok: false; code: FailCode; status?: number };

const keyOf = (env: Env) => (env.GEMINI_API_KEY || "").trim();
const modelOf = (env: Env) => (env.IKOLEARN_GEMINI_MODEL || DEFAULT_MODEL).trim().replace(/^models\//, "");
const baseOf = (env: Env) => (env.GEMINI_API_BASE || GEMINI_BASE).replace(/\/$/, "");

function statusFail(status: number): Fail {
  if (status === 429) return { ok: false, code: "busy", status };
  if (status === 400 || status === 403 || status === 404) return { ok: false, code: "refused", status };
  return { ok: false, code: "upstream", status };
}

const textOf = (data: any) =>
  (data?.candidates?.[0]?.content?.parts || [])
    .filter((p: any) => !p?.thought)
    .map((p: any) => (typeof p?.text === "string" ? p.text : ""))
    .join("");

export type StreamOptions = { maxTokens?: number };

export function chatBody(system: string, contents: Content[], opts: StreamOptions = {}) {
  return {
    systemInstruction: { parts: [{ text: system }] },
    contents,
    generationConfig: { temperature: MODEL_LIMITS.chatTemperature, maxOutputTokens: opts.maxTokens || MODEL_LIMITS.chatMaxTokens },
  };
}

export function jsonBody(system: string, user: string, schema: unknown) {
  return {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig: { temperature: MODEL_LIMITS.jsonTemperature, maxOutputTokens: MODEL_LIMITS.jsonMaxTokens, responseMimeType: "application/json", responseSchema: schema },
  };
}

/** Reads an SSE body ("data: {json}" lines) and yields each event's text. */
export async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const t = textOf(JSON.parse(payload));
        if (t) yield t;
      } catch {
        /* partial or non-JSON line: skip */
      }
    }
    if (done) break;
  }
  const last = buf.trim();
  if (last.startsWith("data:")) {
    try {
      const t = textOf(JSON.parse(last.slice(5).trim()));
      if (t) yield t;
    } catch {
      /* ignore */
    }
  }
}

export type StreamStart = { ok: true; model: string; pieces: AsyncGenerator<string>; abort: () => void } | Fail;

async function openStream(model: string, body: unknown, env: Env, fetchImpl: typeof fetch): Promise<StreamStart> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MODEL_LIMITS.timeoutMs);
  try {
    const res = await fetchImpl(`${baseOf(env)}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
      method: "POST",
      headers: { "x-goog-api-key": keyOf(env), "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok || !res.body) {
      clearTimeout(timer);
      return statusFail(res.ok ? 502 : res.status);
    }
    const pieces = (async function* () {
      try {
        yield* readSse(res.body as ReadableStream<Uint8Array>);
      } finally {
        clearTimeout(timer);
      }
    })();
    return { ok: true, model, pieces, abort: () => controller.abort() };
  } catch (e) {
    clearTimeout(timer);
    return { ok: false, code: (e as Error)?.name === "AbortError" ? "timeout" : "upstream" };
  }
}

/** Server errors, network failures and a retired model name (404) try the fallback model once; 429 and bad requests do not. */
function shouldFallBack(f: Fail) {
  return (f.code === "upstream" && (f.status === undefined || f.status >= 500)) || f.status === 404;
}

/** Opens a streamed reply; tries the fallback model once (see shouldFallBack). */
export async function streamText(system: string, contents: Content[], env: Env, fetchImpl: typeof fetch = fetch, opts: StreamOptions = {}): Promise<StreamStart> {
  if (!keyOf(env)) return { ok: false, code: "no_key" };
  const body = chatBody(system, contents, opts);
  const primary = modelOf(env);
  const first = await openStream(primary, body, env, fetchImpl);
  if (first.ok || primary === FALLBACK_MODEL) return first;
  return shouldFallBack(first) ? openStream(FALLBACK_MODEL, body, env, fetchImpl) : first;
}

async function jsonOnce<T>(model: string, body: unknown, parse: (t: string) => T | null, env: Env, fetchImpl: typeof fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MODEL_LIMITS.timeoutMs);
  try {
    const res = await fetchImpl(`${baseOf(env)}/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": keyOf(env), "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return statusFail(res.status);
    const data = (await res.json()) as any;
    if (!data?.candidates?.[0] && data?.promptFeedback?.blockReason) return { ok: false, code: "blocked" } as Fail;
    const value = parse(textOf(data));
    return value ? ({ ok: true, value, model } as const) : ({ ok: false, code: "empty" } as Fail);
  } catch (e) {
    return { ok: false, code: (e as Error)?.name === "AbortError" ? "timeout" : "upstream" } as Fail;
  } finally {
    clearTimeout(timer);
  }
}

/** One structured (JSON schema) call with the same fallback rule. */
export async function generateJson<T>(system: string, user: string, schema: unknown, parse: (t: string) => T | null, env: Env, fetchImpl: typeof fetch = fetch) {
  if (!keyOf(env)) return { ok: false, code: "no_key" } as Fail;
  const body = jsonBody(system, user, schema);
  const primary = modelOf(env);
  const first = await jsonOnce(primary, body, parse, env, fetchImpl);
  if (first.ok || primary === FALLBACK_MODEL || !shouldFallBack(first)) return first;
  return jsonOnce(FALLBACK_MODEL, body, parse, env, fetchImpl);
}
