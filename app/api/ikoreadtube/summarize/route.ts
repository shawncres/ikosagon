import { createLimiter, corsHeaders, handleSummarize, originOk, type Limiter } from "@/lib/ikoreadtube/summarize";

export const runtime = "nodejs";
export const maxDuration = 30;

const g = globalThis as typeof globalThis & { __ikoReadTubeLimiter?: Limiter };
const limiter = (g.__ikoReadTubeLimiter ??= createLimiter());

/**
 * POST { id?, title?, transcript, level: "less" | "standard" | "more" } -> plain text summary.
 * Reads GROQ_API_KEY from the environment (never sent to the browser). No key => 503 plain-text error,
 * and the static page falls back to its hardcoded summaries.
 */
export async function POST(request: Request) {
  const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
  const rawBody = await request.text();
  const out = await handleSummarize({
    rawBody: rawBody.slice(0, 200_000),
    ip,
    origin: request.headers.get("origin"),
    host: request.headers.get("x-forwarded-host") || request.headers.get("host"),
    env: process.env,
    limiter,
  });
  return new Response(out.text, { status: out.status, headers: out.headers });
}

export async function OPTIONS(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const ok = originOk(origin, host, process.env);
  return new Response(null, { status: ok ? 204 : 403, headers: corsHeaders(origin, ok) });
}

export async function GET() {
  return new Response("Use POST.", { status: 405, headers: { Allow: "POST, OPTIONS", "Content-Type": "text/plain; charset=utf-8" } });
}
