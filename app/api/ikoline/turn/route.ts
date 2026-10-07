import { NextResponse } from "next/server";
import {
  getCurrentNode,
  openingAgentText,
  processTurn,
} from "@/lib/ikoline/engine";
import { loadFlow, listFlows } from "@/lib/ikoline/loadFlow";
import { formatIkoLineContext, retrieveIkoLine } from "@/lib/ikoline/rag";
import { getProviderName } from "@/lib/llm";
import {
  MAX_TURNS,
  type HistoryTurn,
  type SlotMap,
  type TurnResponse,
} from "@/lib/ikoline/types";

export const runtime = "nodejs";
export const maxDuration = 30;

const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 40;
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
    return { ok: true };
  }
  if (current.count >= MAX_PER_WINDOW) return { ok: false };
  current.count += 1;
  return { ok: true };
}

function sanitizeHistory(input: unknown): HistoryTurn[] {
  if (!Array.isArray(input)) return [];
  return input
    .slice(-MAX_TURNS)
    .map((turn) => {
      if (!turn || typeof turn !== "object") return null;
      const role = (turn as { role?: string }).role;
      const content = (turn as { content?: string }).content;
      if ((role !== "user" && role !== "agent") || typeof content !== "string") return null;
      return { role, content: content.slice(0, 2000) } as HistoryTurn;
    })
    .filter((t): t is HistoryTurn => Boolean(t));
}

function sanitizeSlots(input: unknown): SlotMap {
  if (!input || typeof input !== "object") return {};
  const out: SlotMap = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (typeof value === "string" && key.length < 40) {
      out[key] = value.slice(0, 200);
    }
  }
  return out;
}

async function maybeParaphrase(opts: {
  scripted: string;
  allow: boolean;
  nodeLabel: string;
  userText: string;
  ragContext: string;
}): Promise<{ text: string; mode: "scripted" | "llm" }> {
  if (!opts.allow || !getProviderName()) {
    return { text: opts.scripted, mode: "scripted" };
  }

  const providerKey =
    process.env.GROQ_API_KEY || process.env.XAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!providerKey) return { text: opts.scripted, mode: "scripted" };

  // Reuse Groq-first OpenAI-compatible path via completeGrounded-like fetch
  const base =
    process.env.GROQ_API_KEY
      ? {
          url: "https://api.groq.com/openai/v1/chat/completions",
          model: process.env.CHAT_MODEL || "llama-3.1-8b-instant",
          key: process.env.GROQ_API_KEY,
        }
      : null;
  if (!base) return { text: opts.scripted, mode: "scripted" };

  try {
    const response = await fetch(base.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${base.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: base.model,
        temperature: 0.3,
        max_tokens: 220,
        messages: [
          {
            role: "system",
            content:
              "You are IkoLine, a call-flow agent for Ikosagon demos. Lightly paraphrase the SCRIPT for natural speech. Do not add new promises, prices, or legal claims. Stay in the current step. If POLICY NOTES exist, you may cite them briefly. Studio voice: we at Ikosagon.",
          },
          {
            role: "user",
            content: `NODE: ${opts.nodeLabel}\nCUSTOMER: ${opts.userText}\nPOLICY NOTES:\n${opts.ragContext}\nSCRIPT:\n${opts.scripted}`,
          },
        ],
      }),
    });
    if (!response.ok) return { text: opts.scripted, mode: "scripted" };
    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = payload.choices?.[0]?.message?.content?.trim();
    if (!text) return { text: opts.scripted, mode: "scripted" };
    return { text, mode: "llm" };
  } catch {
    return { text: opts.scripted, mode: "scripted" };
  }
}

export async function GET() {
  const flows = await listFlows();
  return NextResponse.json({ ok: true, flows, provider: getProviderName() });
}

export async function POST(request: Request) {
  if (!rateLimit(clientKey(request)).ok) {
    return NextResponse.json(
      { ok: false, error: "Rate limit reached. Try again shortly." } satisfies Partial<TurnResponse>,
      { status: 429 },
    );
  }

  let body: {
    flowId?: string;
    nodeId?: string;
    slots?: unknown;
    history?: unknown;
    userText?: string;
    turnCount?: number;
    start?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const flowId = String(body.flowId ?? "").trim();
  const flow = await loadFlow(flowId);
  if (!flow) {
    return NextResponse.json({ ok: false, error: "Unknown flow." }, { status: 404 });
  }

  // Session start: return opening agent line without consuming a user turn
  if (body.start) {
    const agentText = openingAgentText(flow);
    const startNode = getCurrentNode(flow, flow.start);
    const res: TurnResponse = {
      ok: true,
      nodeId: flow.start,
      agentText,
      slots: {},
      mode: "scripted",
      debug: { matchedIntent: null, ragHits: [], offline: !getProviderName() },
    };
    return NextResponse.json({
      ...res,
      nodeLabel: startNode?.label ?? flow.start,
      flowTitle: flow.title,
    });
  }

  const turnCount = Number(body.turnCount ?? 0);
  if (turnCount >= MAX_TURNS) {
    return NextResponse.json(
      {
        ok: false,
        error: `Turn cap (${MAX_TURNS}) reached. Restart the demo.`,
        nodeId: String(body.nodeId ?? flow.start),
        agentText: "",
        slots: sanitizeSlots(body.slots),
      } satisfies TurnResponse,
      { status: 400 },
    );
  }

  const userText = String(body.userText ?? "").trim().slice(0, 800);
  if (userText.length < 1) {
    return NextResponse.json({ ok: false, error: "Say something to continue the call." }, { status: 400 });
  }

  const nodeId = String(body.nodeId ?? flow.start);
  const node = getCurrentNode(flow, nodeId) ?? getCurrentNode(flow, flow.start);
  if (!node) {
    return NextResponse.json({ ok: false, error: "Flow node missing." }, { status: 500 });
  }

  const slots = sanitizeSlots(body.slots);
  const history = sanitizeHistory(body.history);

  const ragQuery = [node.rag?.queryHint, userText, slots.reason, slots.need]
    .filter(Boolean)
    .join(" ");
  const ragHits = node.rag
    ? await retrieveIkoLine(flow.ragCorpus, ragQuery || userText, 3)
    : [];
  const ragSnippets = ragHits.map((h) => `${h.heading}: ${h.text}`);
  const ragContext = formatIkoLineContext(ragHits);

  const result = processTurn({
    flow,
    nodeId: node.id,
    slots,
    history,
    userText,
    ragSnippets,
  });

  const speakNode =
    getCurrentNode(flow, result.nodeId) ?? node;
  const paraphrased = await maybeParaphrase({
    scripted: result.agentText,
    allow: Boolean(speakNode.allowParaphrase),
    nodeLabel: speakNode.label,
    userText,
    ragContext,
  });

  const res: TurnResponse = {
    ok: true,
    nodeId: result.nodeId,
    agentText: paraphrased.text,
    slots: result.slots,
    toolResults: result.toolResults,
    exit: result.exit ?? undefined,
    mode: paraphrased.mode,
    debug: {
      matchedIntent: result.matchedIntent,
      ragHits: ragHits.map((h) => ({
        title: h.title,
        heading: h.heading,
        score: Math.round(h.score * 100) / 100,
      })),
      offline: !getProviderName(),
    },
  };

  return NextResponse.json({
    ...res,
    nodeLabel: speakNode.label,
    flowTitle: flow.title,
  });
}

