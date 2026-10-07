import { NextResponse } from "next/server";
import {
  applyTransition,
  buildAgentTurn,
  collectSlots,
  getCurrentNode,
  isGreetingOrAck,
  matchIntent,
  openingAgentText,
  runToolsForTurn,
  looksLikeInjection,
  scrubWeakSlots,
  topicFromText,
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
import { logDemoTurn } from "@/lib/ikoline/demoLog";
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
    /** Client-generated id so Vercel logs + browser exports correlate */
    sessionId?: string;
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

  const sessionId = String(body.sessionId ?? "").trim().slice(0, 80) || "anon";
  const provider = getProviderName();

  if (body.start) {
    const agentText = safeOpening(flow, openingAgentText(flow));
    const startNode = getCurrentNode(flow, flow.start);
    const nodeLabel = startNode?.label ?? flow.start;
    logDemoTurn({
      ts: new Date().toISOString(),
      sessionId,
      flowId: flow.id,
      nodeId: flow.start,
      nodeLabel,
      userText: null,
      agentText,
      mode: "scripted",
      intent: null,
      slots: {},
      provider,
      kind: "start",
    });
    const res: TurnResponse = {
      ok: true,
      nodeId: flow.start,
      agentText,
      slots: {},
      mode: "scripted",
      debug: { matchedIntent: null, ragHits: [], offline: !provider },
    };
    return NextResponse.json({
      ...res,
      nodeLabel,
      flowTitle: flow.title,
      sessionId,
      provider,
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
    logDemoTurn({
      ts: new Date().toISOString(),
      sessionId,
      flowId: flow.id,
      nodeId: node.id,
      nodeLabel: node.label,
      userText,
      agentText,
      mode: "scripted",
      intent: null,
      slots: priorSlots,
      provider,
      kind: "turn",
    });
    return NextResponse.json({
      ok: true,
      nodeId: node.id,
      agentText,
      slots: priorSlots,
      mode: "scripted",
      debug: { matchedIntent: null, ragHits: [], offline: !provider },
      nodeLabel: node.label,
      flowTitle: flow.title,
      sessionId,
      provider,
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
  // Prefer short topic tags — never let greetings / rants land in {{reason}}/{{need}}
  // Always overwrite a weak prior reason when the caller later describes a real issue.
  const topic = topicFromText(userText);
  slots = scrubWeakSlots(slots);

  if (topic) {
    // Real issue phrases always win — overwrite "hi" / empty / other weak priors
    slots = mergeSlots(slots, { reason: topic });
    if (flow.vertical === "sales" || matchedIntent === "discover_need") {
      slots = mergeSlots(slots, { need: topic });
    }
  } else if (matchedIntent === "describe_issue" && isGreetingOrAck(userText)) {
    // LLM sometimes mislabels "hi" as describe_issue — do not keep a garbage reason
    slots = scrubWeakSlots(slots);
  }

  // Collapse an LLM-stuffed rant without inventing a topic from noise
  if (slots.reason && slots.reason.length > 60) {
    const collapsed = topicFromText(slots.reason) || slots.reason.slice(0, 48);
    slots = mergeSlots(slots, { reason: collapsed });
  }
  if (slots.need && slots.need.length > 60) {
    const collapsed = topicFromText(slots.need) || slots.need.slice(0, 48);
    slots = mergeSlots(slots, { need: collapsed });
  }
  slots = scrubWeakSlots(slots);

  // Greeting / small-talk should not advance the graph as if an issue was described
  let intentForGraph = matchedIntent;
  if (matchedIntent === "describe_issue" && isGreetingOrAck(userText) && !topic && !slots.reason) {
    intentForGraph = "greeting";
  }

  // C. Tools + transition (graph still owns the journey)
  const toolResults = runToolsForTurn(flow, node, intentForGraph, slots);
  const { nextNodeId, exit } = applyTransition(node, intentForGraph, slots);
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
    matchedIntent: intentForGraph,
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
      matchedIntent: intentForGraph,
    });
    mode = classified ? "llm" : "scripted";
    // If classify worked but speak failed, still mark llm for intent path transparency
  }

  const finalNodeId = exit ? node.id : nextNode?.id ?? node.id;
  const finalLabel = (getCurrentNode(flow, finalNodeId) ?? speakNode).label;

  logDemoTurn({
    ts: new Date().toISOString(),
    sessionId,
    flowId: flow.id,
    nodeId: finalNodeId,
    nodeLabel: finalLabel,
    userText,
    agentText,
    mode,
    intent: intentForGraph,
    slots,
    provider,
    exit: exit ?? null,
    kind: "turn",
  });

  const res: TurnResponse = {
    ok: true,
    nodeId: finalNodeId,
    agentText,
    slots,
    toolResults,
    exit: exit ?? undefined,
    mode,
    debug: {
      matchedIntent: intentForGraph,
      ragHits: ragHits.map((h) => ({
        title: h.title,
        heading: h.heading,
        score: Math.round(h.score * 100) / 100,
      })),
      offline: !provider,
    },
  };

  return NextResponse.json({
    ...res,
    nodeLabel: finalLabel,
    flowTitle: flow.title,
    sessionId,
    provider,
  });
}
