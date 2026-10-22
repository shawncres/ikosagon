/* eslint-disable @typescript-eslint/no-explicit-any -- parses untyped third-party JSON defensively */
/**
 * IkoLearn's adapter for any OpenAI-compatible chat completions API (OpenAI, Groq, xAI, OpenRouter, and similar):
 * POST {base}/chat/completions with a Bearer key, streamed as SSE ("data: {choices:[{delta:{content}}]}" ... "[DONE]")
 * or one-shot JSON (response_format json_object, the schema given in the system message).
 * Selected only by env vars (see llm.ts). The key stays on the server.
 */
import { MODEL_LIMITS, errorFail, failFromResponse, logFail, readSseWith, statusFail, timedFetch, type Content, type JsonResult, type LlmConfig, type StreamOptions, type StreamStart } from "./llm-types";

/** Provider-neutral turns -> chat messages ("model" -> "assistant"), with the system prompt first. */
export function toMessages(system: string, contents: Content[]) {
  return [{ role: "system", content: system }].concat(
    contents.map((c) => ({ role: c.role === "model" ? "assistant" : "user", content: c.parts.map((p) => p.text).join("") })),
  );
}

export function chatRequest(cfg: LlmConfig, system: string, contents: Content[], opts: StreamOptions = {}) {
  return { model: cfg.model, messages: toMessages(system, contents), temperature: MODEL_LIMITS.chatTemperature, max_tokens: opts.maxTokens || MODEL_LIMITS.chatMaxTokens, stream: true };
}

export function jsonRequest(cfg: LlmConfig, system: string, user: string, schema: unknown, opts: StreamOptions = {}) {
  const sys = `${system}\n\nReply with one JSON object only (no code fences), matching this JSON Schema: ${JSON.stringify(schema)}`;
  return { model: cfg.model, messages: toMessages(sys, [{ role: "user", parts: [{ text: user }] }]), temperature: MODEL_LIMITS.jsonTemperature, max_tokens: opts.maxTokens || MODEL_LIMITS.jsonMaxTokens, response_format: { type: "json_object" } };
}

const headers = (cfg: LlmConfig) => ({ Authorization: `Bearer ${cfg.key}`, "Content-Type": "application/json" });
const deltaOf = (d: any) => (typeof d?.choices?.[0]?.delta?.content === "string" ? d.choices[0].delta.content : "");
const messageOf = (d: any) => {
  const c = d?.choices?.[0]?.message?.content;
  return typeof c === "string" ? c : Array.isArray(c) ? c.map((p: any) => (typeof p?.text === "string" ? p.text : "")).join("") : "";
};

export async function openaiStream(cfg: LlmConfig, system: string, contents: Content[], fetchImpl: typeof fetch, opts: StreamOptions = {}): Promise<StreamStart> {
  try {
    const { res, done, abort } = await timedFetch(fetchImpl, `${cfg.base}/chat/completions`, {
      method: "POST", headers: headers(cfg), body: JSON.stringify(chatRequest(cfg, system, contents, opts)),
    }, MODEL_LIMITS.requestTimeoutMs, MODEL_LIMITS.streamTimeoutMs);
    if (!res.ok || !res.body) {
      done();
      return logFail(cfg, cfg.model, opts, res.ok ? { ...statusFail(502), detail: "empty stream body" } : await failFromResponse(res));
    }
    const pieces = (async function* () {
      try {
        yield* readSseWith(res.body as ReadableStream<Uint8Array>, deltaOf);
      } finally {
        done();
      }
    })();
    return { ok: true, model: cfg.model, pieces, abort };
  } catch (e) {
    return logFail(cfg, cfg.model, opts, errorFail(e));
  }
}

export async function openaiJson<T>(cfg: LlmConfig, system: string, user: string, schema: unknown, parse: (t: string) => T | null, fetchImpl: typeof fetch, opts: StreamOptions = {}): Promise<JsonResult<T>> {
  let done = () => {};
  try {
    const r = await timedFetch(fetchImpl, `${cfg.base}/chat/completions`, {
      method: "POST", headers: headers(cfg), body: JSON.stringify(jsonRequest(cfg, system, user, schema, opts)),
    }, Math.min(opts.timeoutMs || MODEL_LIMITS.jsonTimeoutMs, MODEL_LIMITS.jsonTimeoutMs));
    done = r.done;
    if (!r.res.ok) return logFail(cfg, cfg.model, opts, await failFromResponse(r.res));
    const data = (await r.res.json()) as any;
    if (data?.choices?.[0]?.finish_reason === "content_filter") return logFail(cfg, cfg.model, opts, { ok: false, code: "blocked", status: r.res.status, detail: "finish_reason: content_filter" });
    const value = parse(messageOf(data));
    return value ? { ok: true, value, model: cfg.model } : logFail(cfg, cfg.model, opts, { ok: false, code: "empty", status: r.res.status, detail: `unusable reply (finish_reason: ${data?.choices?.[0]?.finish_reason || "none"})` });
  } catch (e) {
    return logFail(cfg, cfg.model, opts, errorFail(e));
  } finally {
    done();
  }
}
