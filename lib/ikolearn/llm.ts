/**
 * IkoLearn's model interface. prompts.ts and service.ts only use this file: one streamed text call and one JSON call,
 * whatever the provider. The provider is chosen by env vars alone, so swapping is a key swap:
 *
 *   IKOLEARN_LLM_PROVIDER   "gemini" (default when unset) or "openai-compatible"
 *   IKOLEARN_LLM_API_KEY    the provider's key (for gemini, GEMINI_API_KEY is used when this is unset)
 *   IKOLEARN_LLM_BASE_URL   API base, e.g. https://api.groq.com/openai/v1 (required for openai-compatible)
 *   IKOLEARN_LLM_MODEL      model name (required for openai-compatible; for gemini, IKOLEARN_GEMINI_MODEL still works)
 *
 * With none of these set, IkoLearn behaves exactly as before: Gemini, GEMINI_API_KEY, the default and fallback models.
 */
import { DEFAULT_MODEL, FALLBACK_MODEL, GEMINI_BASE, geminiJson, geminiStream } from "./gemini";
import { openaiJson, openaiStream } from "./openai-compatible";
import type { Content, Env, Fail, JsonResult, LlmConfig, StreamOptions, StreamStart } from "./llm-types";

export { MODEL_LIMITS } from "./llm-types";
export type { Content, Env, Fail, FailCode, JsonResult, LlmConfig, StreamOptions, StreamStart } from "./llm-types";

export const PROVIDERS = ["gemini", "openai-compatible"] as const;
export type ConfigError = "unknown_provider" | "no_key" | "no_base" | "no_model";

const val = (v: string | undefined) => (v || "").trim();
const cleanBase = (v: string) => v.replace(/\/+$/, "");
const safeBase = (v: string) => /^https:\/\/[^\s/]+/i.test(v) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(v);

/** The provider settings from env, or what is missing. Never includes anything a client can see. */
export function llmConfig(env: Env): LlmConfig | { error: ConfigError } {
  const provider = val(env.IKOLEARN_LLM_PROVIDER).toLowerCase() || "gemini";
  if (provider === "gemini") {
    const key = val(env.IKOLEARN_LLM_API_KEY) || val(env.GEMINI_API_KEY);
    if (!key) return { error: "no_key" };
    const base = cleanBase(val(env.IKOLEARN_LLM_BASE_URL) || val(env.GEMINI_API_BASE) || GEMINI_BASE);
    if (!safeBase(base)) return { error: "no_base" };
    const model = (val(env.IKOLEARN_LLM_MODEL) || val(env.IKOLEARN_GEMINI_MODEL) || DEFAULT_MODEL).replace(/^models\//, "");
    return { provider: "gemini", key, model, base, fallback: FALLBACK_MODEL };
  }
  if (provider === "openai-compatible" || provider === "openai") {
    const key = val(env.IKOLEARN_LLM_API_KEY);
    if (!key) return { error: "no_key" };
    const base = cleanBase(val(env.IKOLEARN_LLM_BASE_URL));
    if (!base || !safeBase(base)) return { error: "no_base" };
    const model = val(env.IKOLEARN_LLM_MODEL);
    if (!model) return { error: "no_model" };
    return { provider: "openai-compatible", key, model, base };
  }
  return { error: "unknown_provider" };
}

/** True when a provider is fully configured (the routes answer 503 "off" otherwise). */
export const llmReady = (env: Env) => !("error" in llmConfig(env));

const notReady = (): Fail => ({ ok: false, code: "no_key" });

/** Opens a streamed reply from the configured provider. */
export async function streamText(system: string, contents: Content[], env: Env, fetchImpl: typeof fetch = fetch, opts: StreamOptions = {}): Promise<StreamStart> {
  const cfg = llmConfig(env);
  if ("error" in cfg) return notReady();
  return cfg.provider === "gemini" ? geminiStream(cfg, system, contents, fetchImpl, opts) : openaiStream(cfg, system, contents, fetchImpl, opts);
}

/** One structured (JSON) call to the configured provider; `parse` validates the text, null means unusable. */
export async function generateJson<T>(system: string, user: string, schema: unknown, parse: (t: string) => T | null, env: Env, fetchImpl: typeof fetch = fetch, opts: StreamOptions = {}): Promise<JsonResult<T>> {
  const cfg = llmConfig(env);
  if ("error" in cfg) return notReady();
  return cfg.provider === "gemini" ? geminiJson(cfg, system, user, schema, parse, fetchImpl, opts) : openaiJson(cfg, system, user, schema, parse, fetchImpl, opts);
}
