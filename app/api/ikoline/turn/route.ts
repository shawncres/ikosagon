import { NextResponse } from "next/server";
import {
  applyTransition,
  buildAgentTurn,
  collectSlots,
  getCurrentNode,
  matchIntent,
  openingAgentText,
  runToolsForTurn,
  looksLikeInjection,
} from "@/lib/ikoline/engine";
import { loadFlow, listFlows } from "@/lib/ikoline/loadFlow";
import {
  classifyTurn,
  mergeSlots,
  safeOpening,
  speakTurn,
} from "@/lib/ikoline/llmTurn";
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


function topicFromText(text: string): string {
  const t = text.toLowerCase();
  if (/ship|track(ing)?|deliver|package|late|delay/.test(t)) return "shipping delay";
  if (/refund|return|exchange/.test(t)) return "return or exchange";
  if (/warranty|defect|broken|crack/.test(t)) return "warranty or defect";
  if (/bill|charge|invoice|charged/.test(t)) return "billing";
  if (/login|password|access|locked/.test(t)) return "login access";
  if (/price|expensive|budget|cost/.test(t)) return "pricing";
  if (/hardship|can't pay|cannot pay|lost (my )?job/.test(t)) return "hardship";
  // keep short — never dump the whole utterance into {{reason}}
  const clipped = text.replace(/\s+/g, " ").trim().slice(0, 48);
  return clipped.length >= 8 ? clipped : "";
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

  if (body.start) {
    const agentText = safeOpening(flow, openingAgentText(flow));
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

  const priorSlots = sanitizeSlots(body.slots);
  const history = sanitizeHistory(body.history);

  if (looksLikeInjection(userText)) {
    const agentText =
      "I stay inside the authored call flow. Please continue with a normal customer reply for this step.";
    return NextResponse.json({
      ok: true,
      nodeId: node.id,
      agentText,
      slots: priorSlots,
      mode: "scripted",
      debug: { matchedIntent: null, ragHits: [], offline: !getProviderName() },
      nodeLabel: node.label,
      flowTitle: flow.title,
    });
  }

  // A. Heuristic slots first (account numbers, etc.)
  let slots = collectSlots(userText, priorSlots, node.requireSlots);

  // B. LLM classify (intent + slot updates), keyword fallback
  const classified = await classifyTurn({
    flow,
    node,
    userText,
    slots,
    history,
  });
  const keyword = matchIntent(node, userText);
  const matchedIntent = classified?.intent ?? keyword.intent;
  if (classified?.slots) {
    slots = mergeSlots(slots, classified.slots);
  }
  // Soft-fill short topic tags (not the full rant) when useful for later nodes
  const topic = topicFromText(userText);
  if (!slots.reason && matchedIntent === "describe_issue" && topic) {
    slots = mergeSlots(slots, { reason: topic });
  }
  if (!slots.need && matchedIntent === "discover_need" && topic) {
    slots = mergeSlots(slots, { need: topic });
  }

  // C. Tools + transition (graph still owns the journey)
  const toolResults = runToolsForTurn(flow, node, matchedIntent, slots);
  const { nextNodeId, exit } = applyTransition(node, matchedIntent, slots);
  const nextNode = nextNodeId ? getCurrentNode(flow, nextNodeId) : null;
  const speakNode = exit ? node : nextNode ?? node;
  const transitioned = Boolean(nextNode && nextNode.id !== node.id);

  // RAG against speak node (or current) for reply grounding
  const ragNode = speakNode;
  const ragQuery = [ragNode.rag?.queryHint, userText, slots.reason, slots.need, matchedIntent]
    .filter(Boolean)
    .join(" ");
  const ragHits =
    ragNode.rag || node.rag
      ? await retrieveIkoLine(flow.ragCorpus, ragQuery || userText, 3)
      : [];
  const ragSnippets = ragHits.map((h) => `${h.heading}: ${h.text}`);
  const ragContext = formatIkoLineContext(ragHits);

  // D. LLM speak for destination/current node; E. scripted fallback
  const spoken = await speakTurn({
    flow,
    speakNode,
    fromNode: node,
    userText,
    slots,
    history,
    ragContext,
    toolResults,
    exit,
    matchedIntent,
    transitioned,
  });

  let agentText: string;
  let mode: "llm" | "scripted";
  if (spoken) {
    agentText = spoken.agentText;
    // Classify OR speak counts as llm mode when either succeeded
    mode = "llm";
  } else {
    agentText = buildAgentTurn({
      node,
      nextNode,
      exit,
      slots,
      toolResults,
      ragSnippets,
      matchedIntent,
    });
    mode = classified ? "llm" : "scripted";
    // If classify worked but speak failed, still mark llm for intent path transparency
  }

  const finalNodeId = exit ? node.id : nextNode?.id ?? node.id;

  const res: TurnResponse = {
    ok: true,
    nodeId: finalNodeId,
    agentText,
    slots,
    toolResults,
    exit: exit ?? undefined,
    mode,
    debug: {
      matchedIntent,
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
    nodeLabel: (getCurrentNode(flow, finalNodeId) ?? speakNode).label,
    flowTitle: flow.title,
  });
}
