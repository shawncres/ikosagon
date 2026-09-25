import { NextResponse } from "next/server";
import { completeGrounded, getProviderName, type ChatTurn } from "@/lib/llm";
import { formatContext, retrieve } from "@/lib/rag";

export const runtime = "nodejs";
export const maxDuration = 30;

const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 20;
const buckets = new Map<string, { count: number; resetAt: number }>();

function clientKey(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

function rateLimit(key: string) {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true, remaining: MAX_PER_WINDOW - 1 };
  }
  if (current.count >= MAX_PER_WINDOW) {
    return { ok: false, remaining: 0, retryAt: current.resetAt };
  }
  current.count += 1;
  return { ok: true, remaining: MAX_PER_WINDOW - current.count };
}

function sanitizeHistory(input: unknown): ChatTurn[] {
  if (!Array.isArray(input)) return [];
  return input
    .slice(-6)
    .map((turn) => {
      if (!turn || typeof turn !== "object") return null;
      const role = (turn as { role?: string }).role;
      const content = (turn as { content?: string }).content;
      if ((role !== "user" && role !== "assistant") || typeof content !== "string") return null;
      return { role, content: content.slice(0, 2000) };
    })
    .filter((turn): turn is ChatTurn => Boolean(turn));
}

export async function POST(request: Request) {
  const limited = rateLimit(clientKey(request));
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: "Rate limit reached. Try again in a bit, or use /contact." },
      { status: 429 },
    );
  }

  let body: { message?: string; history?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const message = String(body.message ?? "").trim().slice(0, 800);
  if (message.length < 2) {
    return NextResponse.json({ ok: false, error: "Ask a short question." }, { status: 400 });
  }

  const chunks = await retrieve(message, 5);
  const context = formatContext(chunks);

  try {
    const answer = await completeGrounded({
      question: message,
      context,
      history: sanitizeHistory(body.history),
    });

    return NextResponse.json({
      ok: true,
      answer,
      provider: getProviderName(),
      sources: chunks.map((chunk) => ({
        title: chunk.title,
        heading: chunk.heading,
        source: chunk.source,
      })),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Model call failed";
    return NextResponse.json(
      {
        ok: false,
        error: "Could not complete the answer. The retrieved notes are below.",
        detail,
        sources: chunks.map((chunk) => ({
          title: chunk.title,
          heading: chunk.heading,
          source: chunk.source,
        })),
        fallback: context,
      },
      { status: 502 },
    );
  }
}
