import { NextResponse } from "next/server";
import {
  logDemoSessionDump,
  type DemoSessionTranscript,
  type DemoTurnLog,
} from "@/lib/ikoline/demoLog";

export const runtime = "nodejs";

/**
 * Optional secret-gated session dump for Website Ops / Shawn tooling.
 * Free path: structured stdout (Vercel runtime logs). No Blob/KV unless wired later.
 * Set IKOLINE_LOG_SECRET in Vercel env; clients must NOT embed this secret.
 */
function authorized(request: Request): boolean {
  const expected = process.env.IKOLINE_LOG_SECRET?.trim();
  if (!expected) return false;
  const header = request.headers.get("x-ikoline-log-secret")?.trim();
  return Boolean(header && header === expected);
}

function sanitizeSession(input: unknown): DemoSessionTranscript | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  if (raw.demoLog !== true) return null;
  const sessionId = typeof raw.sessionId === "string" ? raw.sessionId.slice(0, 80) : "";
  const flowId = typeof raw.flowId === "string" ? raw.flowId.slice(0, 64) : "";
  if (!sessionId || !flowId || !Array.isArray(raw.turns)) return null;

  const turns: DemoTurnLog[] = [];
  for (const item of raw.turns.slice(0, 40)) {
    if (!item || typeof item !== "object") continue;
    const t = item as Record<string, unknown>;
    const agentText = typeof t.agentText === "string" ? t.agentText.slice(0, 2000) : "";
    if (!agentText) continue;
    const slots: Record<string, string> = {};
    if (t.slots && typeof t.slots === "object") {
      for (const [k, v] of Object.entries(t.slots as Record<string, unknown>)) {
        if (typeof v === "string" && k.length < 40) slots[k] = v.slice(0, 200);
      }
    }
    turns.push({
      ts: typeof t.ts === "string" ? t.ts : new Date().toISOString(),
      sessionId,
      flowId,
      nodeId: typeof t.nodeId === "string" ? t.nodeId.slice(0, 80) : "unknown",
      nodeLabel: typeof t.nodeLabel === "string" ? t.nodeLabel.slice(0, 120) : undefined,
      userText:
        t.userText === null
          ? null
          : typeof t.userText === "string"
            ? t.userText.slice(0, 800)
            : null,
      agentText,
      mode: t.mode === "llm" ? "llm" : "scripted",
      intent: typeof t.intent === "string" ? t.intent.slice(0, 80) : null,
      slots,
      provider: typeof t.provider === "string" ? t.provider.slice(0, 40) : null,
      exit:
        t.exit && typeof t.exit === "object"
          ? {
              type: String((t.exit as { type?: string }).type ?? "").slice(0, 40),
              label: String((t.exit as { label?: string }).label ?? "").slice(0, 120),
            }
          : null,
      kind: t.kind === "start" ? "start" : "turn",
    });
  }

  return {
    demoLog: true,
    sessionId,
    startedAt:
      typeof raw.startedAt === "string" ? raw.startedAt : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    flowId,
    flowTitle: typeof raw.flowTitle === "string" ? raw.flowTitle.slice(0, 120) : undefined,
    turns,
  };
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    logging: Boolean(process.env.IKOLINE_LOG_SECRET?.trim()),
    storage: "stdout",
    note: "POST a DemoSessionTranscript with header x-ikoline-log-secret. Free Hobby path logs to Vercel runtime stdout only — no Blob/KV unless added later.",
  });
}

export async function POST(request: Request) {
  if (!process.env.IKOLINE_LOG_SECRET?.trim()) {
    return NextResponse.json(
      {
        ok: false,
        error: "IKOLINE_LOG_SECRET is not configured. Use Copy/Download in the demo UI instead.",
      },
      { status: 503 },
    );
  }
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const session = sanitizeSession(body);
  if (!session || session.turns.length < 1) {
    return NextResponse.json({ ok: false, error: "Invalid session transcript." }, { status: 400 });
  }

  logDemoSessionDump(session);
  return NextResponse.json({
    ok: true,
    sessionId: session.sessionId,
    turnCount: session.turns.length,
    storage: "stdout",
  });
}
