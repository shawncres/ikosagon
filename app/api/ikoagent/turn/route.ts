import { NextResponse } from "next/server";
import {
  alreadyAcknowledged,
  buildAgentTurn,
  dropRepeatedLines,
  collectSlots,
  extractAccountId,
  getCurrentNode,
  greetingReply,
  isGreetingOrAck,
  matchIntent,
  openingAgentText,
  looksLikeInjection,
  topicFromText,
} from "@/lib/ikoagent/engine";
import {
  extractCustomerName,
  getCrmStore,
  looksLikeNoAccount,
  sanitizeAccountId,
} from "@/lib/ikoagent/crm";
import { deriveTurnState, outcomeKey, PENDING, runGraph } from "@/lib/ikoagent/graphTurn";
import { flowGraph } from "@/lib/ikoagent/flowGraph";
import { loadFlow, listFlows } from "@/lib/ikoagent/loadFlow";
import {
  finalizeDraft,
  mergeSlots,
  planTurn,
  safeOpening,
  type LlmStepStatus,
} from "@/lib/ikoagent/llmTurn";
import {
  agentOnlyTexts,
  callerPolicyLines,
  formatIkoAgentContext,
  retrieveIkoAgent,
} from "@/lib/ikoagent/rag";
import { getProviderName } from "@/lib/llm";
import { logDemoTurn } from "@/lib/ikoagent/demoLog";
import {
  MAX_TURNS,
  type FlowNode,
  type HistoryTurn,
  type SlotMap,
  type TurnResponse,
} from "@/lib/ikoagent/types";

export const runtime = "nodejs";
export const maxDuration = 30;

const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 40;
const MAX_CREATES_PER_WINDOW = 8;
const buckets = new Map<string, { count: number; resetAt: number }>();
const createBuckets = new Map<string, { count: number; resetAt: number }>();

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

function createRateLimit(key: string) {
  const now = Date.now();
  const current = createBuckets.get(key);
  if (!current || current.resetAt < now) {
    createBuckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true };
  }
  if (current.count >= MAX_CREATES_PER_WINDOW) return { ok: false };
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

/** Strip internal/engine-only keys a client could try to inject */
function dropInternalSlots(slots: SlotMap): SlotMap {
  const out: SlotMap = {};
  for (const [k, v] of Object.entries(slots)) {
    if (k.startsWith("_") || k === "accountCreated") continue;
    out[k] = v;
  }
  return out;
}

function createLimitedResponse(nodeId: string, slots: SlotMap) {
  return NextResponse.json(
    {
      ok: false,
      error: "Too many new-account creates from this network. Try again later.",
      nodeId,
      agentText: "",
      slots,
    } satisfies TurnResponse,
    { status: 429 },
  );
}

/** Caller only greeted / acked — no issue, name, account, or "I'm new" in the text */
function isPureGreeting(node: FlowNode, text: string): boolean {
  return (
    node.listenFor.some((e) => e.intent === "greeting") &&
    isGreetingOrAck(text) &&
    !topicFromText(text) &&
    !extractAccountId(text) &&
    !looksLikeNoAccount(text) &&
    !extractCustomerName(text, { allowBare: false })
  );
}

export async function GET() {
  const flows = await listFlows();
  const crm = getCrmStore();
  return NextResponse.json({
    ok: true,
    flows,
    provider: getProviderName(),
    crmBackend: crm.backend,
  });
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
      // Node ids/labels/edges only — for the live flow map (no scripts or corpus text)
      graph: flowGraph(flow),
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

  const priorSlots = dropInternalSlots(sanitizeSlots(body.slots));
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

  // A. Heuristic slots first (account numbers, names, topics)
  const heuristicSlots = collectSlots(userText, priorSlots, node.requireSlots);
  const llmStatus: LlmStepStatus = {};
  const acknowledged = alreadyAcknowledged(history);
  const keyword = matchIntent(node, userText);
  // A bare "hi" at a greeting node is deterministic — no LLM request at all.
  const pureGreeting = isPureGreeting(node, userText);
  const allowCreate = () => createRateLimit(clientKey(request)).ok;

  const ragFor = async (speakAt: FlowNode, s: SlotMap, intent: string | null) => {
    if (!speakAt.rag && !node.rag) return [];
    const query = [speakAt.rag?.queryHint, userText, s.reason, s.need, intent].filter(Boolean).join(" ");
    return retrieveIkoAgent(flow.ragCorpus, query || userText, 3, {
      accountVerified: Boolean(sanitizeAccountId(s.accountId || "")) || s.accountId === PENDING.accountId,
    });
  };

  // B. Predict where the graph will land from heuristics alone (dry run: read-only
  // lookups are real, account creation is simulated, nothing is written).
  const heuristicIntent = pureGreeting ? "greeting" : keyword.intent;
  const predictedState = deriveTurnState({ flow, node, userText, slots: heuristicSlots, matchedIntent: heuristicIntent });
  const predicted = pureGreeting
    ? null
    : await runGraph({ flow, node, priorSlots, state: predictedState, mode: { kind: "dry" } });
  const predictedHits = predicted ? await ragFor(predicted.speakNode, predicted.slots, heuristicIntent) : [];

  // C. ONE LLM request: classify for the current node + draft the reply for the
  // predicted node. Keyword intent is the fallback when the call fails.
  if (pureGreeting) llmStatus.call = "skipped";
  const plan = predicted
    ? await planTurn({
        flow,
        node,
        userText,
        slots: predicted.slots,
        history,
        predicted,
        ragContext: formatIkoAgentContext(predictedHits),
        acknowledged,
        status: llmStatus,
      })
    : null;
  const matchedIntent = pureGreeting ? "greeting" : plan?.intent ?? keyword.intent;

  // D. The graph owns the journey: re-derive with the model's intent/slots and run
  // the live pass (real tools, real creates, rate limits).
  const state = deriveTurnState({
    flow,
    node,
    userText,
    slots: plan?.slots ? mergeSlots(heuristicSlots, plan.slots) : heuristicSlots,
    matchedIntent,
  });
  const intentForGraph = state.intentForGraph;
  const live = await runGraph({ flow, node, priorSlots, state, mode: { kind: "live", allowCreate } });
  if (live.limited) return createLimitedResponse(node.id, live.slots);
  const { slots, toolResults, accountNotFound, nextNode, exit, speakNode, transitioned } = live;

  const ragHits = await ragFor(speakNode, slots, matchedIntent);
  // Scripted fallback may only speak authored caller-safe lines, and only on
  // policy nodes (rag.required). Agent-only guidance never reaches the caller.
  const callerFacts = callerPolicyLines(ragHits);
  const ragSnippets = speakNode.rag?.required ? callerFacts : [];
  const greetingOnly = pureGreeting && !transitioned && !exit;

  // E. Use the draft only if the live graph landed where the draft was written for
  // and tools produced the same kind of facts; otherwise scripted (no 2nd request).
  let drafted: string | null = null;
  // Clarify turns (collections identity: no account / not sure / "what is this about"
  // while unverified) always speak the authored clarification — never a free reply
  const clarifyTurn = Boolean(
    !exit && !transitioned && node.clarify && intentForGraph && node.clarify.intents.includes(intentForGraph),
  );
  if (greetingOnly) {
    llmStatus.reply = "skipped";
  } else if (clarifyTurn && plan) {
    llmStatus.reply = "clarify";
  } else if (plan && predicted) {
    if (!plan.reply) {
      llmStatus.reply = "missing";
    } else if (outcomeKey(predicted) !== outcomeKey(live)) {
      llmStatus.reply = "mismatch";
    } else {
      drafted = finalizeDraft({
        reply: plan.reply,
        speakNode,
        slots,
        toolResults,
        history,
        exit,
        transitioned,
        acknowledged,
        accountNotFound,
        agentOnlyTexts: [...agentOnlyTexts(predictedHits), ...agentOnlyTexts(ragHits)],
        callerFacts,
        status: llmStatus,
      });
    }
  }

  let agentText: string;
  let mode: "llm" | "scripted";
  if (greetingOnly) {
    // Never repeat the opener: short, rotating reply to a bare "hi"
    agentText = greetingReply(node, history);
    mode = "scripted";
  } else if (drafted) {
    agentText = drafted;
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
      accountNotFound,
      acknowledged,
      history,
    });
    // The model still classified the turn even when its draft was not used
    mode = plan ? "llm" : "scripted";
  }

  // Never repeat a line the caller already heard (only the verbatim compliance lines of a
  // must-say node, i.e. the mini-Miranda, may be re-read)
  agentText = dropRepeatedLines(agentText, history, {
    keep: [node, speakNode].filter((n) => n.allowParaphrase === false).flatMap((n) => n.agentSay),
    ending: Boolean(exit),
  });

  // Clients get the outcome only (type + label), not close scripts or disposition codes
  const exitOut = exit ? { type: exit.type, label: exit.label } : null;

  // An exit normally ends on the current node; a callback exit lands on its close node
  const finalNodeId = exit ? speakNode.id : nextNode?.id ?? node.id;
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
    exit: exitOut,
    kind: "turn",
    llm: llmStatus,
  });

  const res: TurnResponse = {
    ok: true,
    nodeId: finalNodeId,
    agentText,
    slots,
    toolResults,
    exit: exitOut ?? undefined,
    mode,
    debug: {
      matchedIntent: intentForGraph,
      ragHits: ragHits.map((h) => ({
        title: h.title,
        heading: h.heading,
        score: Math.round(h.score * 100) / 100,
      })),
      offline: !provider,
      llm: llmStatus,
    },
    desk: { policyLine: speakNode.rag?.required ? (callerFacts[0] ?? null) : null },
  };

  return NextResponse.json({
    ...res,
    nodeLabel: finalLabel,
    flowTitle: flow.title,
    sessionId,
    provider,
    crmBackend: getCrmStore().backend,
  });
}
