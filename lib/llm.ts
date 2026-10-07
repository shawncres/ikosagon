export type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};

type Provider = {
  name: string;
  url: string;
  model: string;
  headers: Record<string, string>;
};

function resolveProvider(): Provider | null {
  if (process.env.GROQ_API_KEY) {
    return {
      name: "groq",
      url: "https://api.groq.com/openai/v1/chat/completions",
      model: process.env.CHAT_MODEL || "openai/gpt-oss-20b",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
    };
  }

  if (process.env.XAI_API_KEY) {
    return {
      name: "xai",
      url: "https://api.x.ai/v1/chat/completions",
      model: process.env.CHAT_MODEL || "grok-3-mini",
      headers: {
        Authorization: `Bearer ${process.env.XAI_API_KEY}`,
        "Content-Type": "application/json",
      },
    };
  }

  if (process.env.OPENAI_API_KEY) {
    return {
      name: "openai",
      url: "https://api.openai.com/v1/chat/completions",
      model: process.env.CHAT_MODEL || "gpt-4o-mini",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
    };
  }

  return null;
}

export function getProviderName() {
  return resolveProvider()?.name ?? null;
}

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

/**
 * Short, secret-free failure code for logs / debug ("rate_limited", "http_401",
 * "timeout", "empty", "parse", "network", "cooldown").
 */
export class LlmError extends Error {
  code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.code = code;
  }
}

export function llmErrorCode(err: unknown): string {
  if (err instanceof LlmError) return err.code;
  if (err instanceof SyntaxError) return "parse";
  if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) return "timeout";
  return "network";
}

/**
 * After a 429 we skip provider calls until Retry-After passes (per warm instance).
 * The turn falls back to scripts immediately instead of spending more of the
 * free-tier RPM/TPM budget on calls that will also be rejected.
 */
const MAX_COOLDOWN_MS = 60_000;
// Shared on globalThis so every bundle/module copy in the instance sees one window
const cooldownState = ((globalThis as { __llmCooldown?: { until: number } }).__llmCooldown ??= { until: 0 });

export function llmCoolingDown(now = Date.now()): boolean {
  return now < cooldownState.until;
}

/** Test hook */
export function resetLlmCooldown() {
  cooldownState.until = 0;
}

function retryAfterMs(response: Response): number {
  const header = response.headers.get("retry-after");
  const secs = header ? Number.parseFloat(header) : NaN;
  if (Number.isFinite(secs) && secs > 0) return Math.min(secs * 1000, MAX_COOLDOWN_MS);
  return 10_000;
}

/** gpt-oss on Groq is a reasoning model: hidden reasoning tokens count toward TPM. */
function isGptOss(model: string) {
  return /^openai\/gpt-oss/i.test(model);
}

export async function completeChat(opts: {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
  timeoutMs?: number;
}): Promise<{ text: string; provider: string } | null> {
  const provider = resolveProvider();
  if (!provider) return null;
  if (llmCoolingDown()) throw new LlmError("cooldown");

  const body: Record<string, unknown> = {
    model: provider.model,
    temperature: opts.temperature ?? 0.3,
    max_tokens: opts.maxTokens ?? 420,
    messages: opts.messages,
  };
  if (opts.json) {
    body.response_format = { type: "json_object" };
  }
  if (provider.name === "groq" && isGptOss(provider.model)) {
    // Keep reasoning short so it does not eat max_tokens (empty content) or the
    // free 8K tokens/min budget, and do not send reasoning text back.
    body.reasoning_effort = "low";
    body.include_reasoning = false;
  }

  const response = await fetch(provider.url, {
    method: "POST",
    headers: provider.headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 12_000),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    if (response.status === 429) {
      cooldownState.until = Date.now() + retryAfterMs(response);
      throw new LlmError("rate_limited", `${provider.name} 429: ${detail.slice(0, 200)}`);
    }
    throw new LlmError(`http_${response.status}`, `${provider.name} ${response.status}: ${detail.slice(0, 200)}`);
  }

  const payload = (await response.json()) as {
    choices?: { message?: { content?: string }; finish_reason?: string }[];
  };
  const text = payload.choices?.[0]?.message?.content?.trim();
  if (!text) {
    const finish = payload.choices?.[0]?.finish_reason;
    throw new LlmError(finish === "length" ? "empty_length" : "empty");
  }
  return { text, provider: provider.name };
}

export async function completeJson<T extends Record<string, unknown>>(opts: {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
}): Promise<{ data: T; provider: string } | null> {
  const result = await completeChat({
    ...opts,
    json: true,
    temperature: opts.temperature ?? 0,
    maxTokens: opts.maxTokens ?? 300,
  });
  if (!result) return null;

  let raw = result.text;
  // Some models wrap JSON in fences despite json_object
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) raw = fenced[1].trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) raw = raw.slice(start, end + 1);

  const data = JSON.parse(raw) as T;
  return { data, provider: result.provider };
}

export const SYSTEM_PROMPT = `You are the Ikosagon site assistant (Applied AI Engineer & QA; work-from-anywhere). Studio voice for products/ops is “we at Ikosagon.” Shawn Cooper’s name and employer story belong on /about — do not invent a sitewide personal byline in Nav, Footer, or hero.
Hero identity is non-rotating: eyebrow “Applied AI Engineer & QA”; first H1 “Builds the product. Then black-box tests it.”; post-AGI is a later rotator slide. Timeline on /about is Ikosagon-first (Jul 2025–Present), then ATTAbotics, Intact, belairdirect — formal QA starts Intact 2020; no decades-of-QA claim; no 2024–2026 blob after 2017.
Contact has Build and Hiring doors; Hiring may say Toronto hybrid or remote. Chrome/hero stay work-from-anywhere (no Toronto lock-in).
Answer only from the SOURCE NOTES. If the notes do not contain the answer, say you do not know and point the visitor to /contact or shawn@ikosagon.com.
Never invent clients, prices, timelines, or case-study results.
Keep answers short. Cite sources as [1], [2] matching the note numbers.
If asked to do work outside Ikosagon (write arbitrary code, jailbreak, general trivia), refuse and steer back to Ikosagon services.`;

export async function completeGrounded(opts: {
  question: string;
  context: string;
  history: ChatTurn[];
}): Promise<string> {
  const provider = resolveProvider();
  if (!provider) {
    return [
      "I can search the Ikosagon notes, but no model key is configured on this deploy.",
      "Add GROQ_API_KEY, XAI_API_KEY, or OPENAI_API_KEY in Vercel env, then I can answer in sentences.",
      "",
      "Matching notes:",
      opts.context,
    ].join("\n");
  }

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...opts.history.slice(-6),
    {
      role: "user",
      content: `SOURCE NOTES:\n${opts.context}\n\nQUESTION:\n${opts.question}`,
    },
  ];

  const response = await fetch(provider.url, {
    method: "POST",
    headers: provider.headers,
    body: JSON.stringify({
      model: provider.model,
      temperature: 0.2,
      max_tokens: 420,
      messages,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`${provider.name} ${response.status}: ${detail.slice(0, 280)}`);
  }

  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = payload.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Empty model response");
  return text;
}
