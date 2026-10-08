import { NextResponse } from "next/server";
import {
  alreadyAcknowledged,
  applyTransition,
  buildAgentTurn,
  collectSlots,
  extractAccountId,
  getCurrentNode,
  greetingReply,
  isGreetingOrAck,
  matchIntent,
  openingAgentText,
  runToolsForTurn,
  looksLikeInjection,
  scrubWeakSlots,
  slotsFilled,
  topicFromText,
} from "@/lib/ikoagent/engine";
import {
  extractCustomerName,
  getCrmStore,
  looksLikeNoAccount,
  sanitizeAccountId,
} from "@/lib/ikoagent/crm";
import { applyToolSlots, runTool } from "@/lib/ikoagent/tools";
import { loadFlow, listFlows } from "@/lib/ikoagent/loadFlow";
import {
  classifyTurn,
  mergeSlots,
  safeOpening,
  speakTurn,
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
  type ToolResult,
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

/**
 * Verify a captured account number with the CRM lookup tool at nodes that allow it.
 * Found → slots get the CRM name; not found → the bad digits are cleared so the
 * graph cannot advance on an unknown account.
 */
async function verifyAccountAt(
  node: FlowNode,
  slots: SlotMap,
): Promise<{ slots: SlotMap; result: ToolResult | null; notFound: boolean }> {
  const id = sanitizeAccountId(slots.accountId || "");
  if (!id || !node.toolsAllowed?.includes("lookupAccount")) {
    return { slots, result: null, notFound: false };
  }
  const result = await runTool("lookupAccount", { ...slots, accountId: id });
  if (result.ok) {
    return { slots: applyToolSlots(slots, [result]), result, notFound: false };
  }
  const next: SlotMap = { ...slots };
  delete next.accountId;
  delete next.last4;
  return { slots: next, result, notFound: true };
}

/** Caller declined having an account after we asked ("no", "nope", "I don't") */
function looksLikeDecline(text: string): boolean {
  return /^\s*(no|nope|nah|not really|i don'?t|i do not|don'?t have (one|it)|never had one)\b/i.test(text);
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

/**
 * Entering (or sitting on) a node that may create customers, with a captured name
 * and "no account / I'm new" already on file → create the account now instead of
 * asking "Do you have an account number handy?" again.
 */
async function ensureAccountAt(
  node: FlowNode,
  slots: SlotMap,
  request: Request,
): Promise<{ slots: SlotMap; result: ToolResult | null; limited: boolean }> {
  if (
    !node.toolsAllowed?.includes("createCustomer") ||
    slots.needsAccount !== "true" ||
    !slots.customerName ||
    sanitizeAccountId(slots.accountId || "")
  ) {
    return { slots, result: null, limited: false };
  }
  if (!createRateLimit(clientKey(request)).ok) return { slots, result: null, limited: true };
  const result = await runTool("createCustomer", slots);
  return { slots: result.ok ? applyToolSlots(slots, [result]) : slots, result, limited: false };
}

/**
 * holdForSlots: the node's required slots were only just met this turn and the
 * extra hold slots (e.g. the issue) are still unknown → stay and ask for them.
 */
function holdHere(node: FlowNode, slots: SlotMap, filledBefore: boolean): boolean {
  if (!node.holdForSlots?.length || filledBefore) return false;
  return node.holdForSlots.some((key) => !slots[key]?.trim());
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

  // A. Heuristic slots first (account numbers, etc.)
  let slots = collectSlots(userText, priorSlots, node.requireSlots);
  const llmStatus: LlmStepStatus = {};

  // B. LLM classify (intent + slot updates), keyword fallback.
  // A bare "hi" at a greeting node is deterministic — no LLM calls (saves free-tier TPM).
  const pureGreeting = isPureGreeting(node, userText);
  const classified = pureGreeting
    ? null
    : await classifyTurn({
        flow,
        node,
        userText,
        slots,
        history,
        status: llmStatus,
      });
  if (pureGreeting) llmStatus.classify = "skipped";
  const keyword = matchIntent(node, userText);
  const matchedIntent = pureGreeting ? "greeting" : classified?.intent ?? keyword.intent;
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

  // Name / no-account heuristics (validated) — never from raw LLM SQL
  const asksForName = node.listenFor.some((e) => e.intent === "provide_name");
  const extractedName = extractCustomerName(userText, {
    allowBare: asksForName && !slots.customerName,
  });
  if (extractedName) {
    slots = mergeSlots(slots, { customerName: extractedName });
  }
  if (looksLikeNoAccount(userText)) {
    slots = mergeSlots(slots, { needsAccount: "true" });
  }

  // Greeting / small-talk should not advance the graph as if an issue was described
  let intentForGraph = matchedIntent;
  if (matchedIntent === "describe_issue" && isGreetingOrAck(userText) && !topic && !slots.reason) {
    intentForGraph = "greeting";
  }
  // Prefer deterministic intents when keywords match and node listens for them
  const listenIds = new Set(node.listenFor.map((e) => e.intent));
  const accountInText = extractAccountId(userText);
  if (
    (intentForGraph === "greeting" || !intentForGraph) &&
    listenIds.has("describe_issue") &&
    (topic || (accountInText && slots.reason))
  ) {
    // "Hi, my package still hasn't shown up" is an issue, not a greeting
    intentForGraph = "describe_issue";
  }
  if (
    (looksLikeNoAccount(userText) ||
      (slots.customerName && !slots.accountId && looksLikeDecline(userText))) &&
    listenIds.has("no_account")
  ) {
    intentForGraph = "no_account";
    slots = mergeSlots(slots, { needsAccount: "true" });
  } else if (accountInText && listenIds.has("provide_account")) {
    // Account digits win (name may ride along: "I'm Alex Rivera — account 1001")
    intentForGraph = "provide_account";
  } else if (extractedName && listenIds.has("provide_name") && !slots.accountId) {
    // Name only → ask for the account (or create one if they already said they're new)
    intentForGraph = "provide_name";
  }

  // C. Tools + transition (graph still owns the journey)
  // Rate-limit account creates separately (abuse / prompt-injection spam)
  const createPossible =
    (intentForGraph === "provide_name" || intentForGraph === "no_account") &&
    slots.needsAccount === "true" &&
    Boolean(slots.customerName) &&
    !sanitizeAccountId(slots.accountId || "");
  if (createPossible) {
    if (!createRateLimit(clientKey(request)).ok) {
      return createLimitedResponse(node.id, slots);
    }
  }

  // Verify any captured account against the CRM before the graph can advance on it
  const verified = await verifyAccountAt(node, slots);
  slots = verified.slots;
  let accountNotFound = verified.notFound;
  let toolResults: ToolResult[] = verified.result ? [verified.result] : [];

  toolResults = [
    ...toolResults,
    ...(await runToolsForTurn(flow, node, intentForGraph, slots, {
      skip: verified.result ? ["lookupAccount"] : [],
    })),
  ];
  slots = applyToolSlots(slots, toolResults);
  slots = scrubWeakSlots(slots);

  // Name + "no account" already known while sitting on verify → create now
  {
    const here = await ensureAccountAt(node, slots, request);
    if (here.limited) return createLimitedResponse(node.id, slots);
    slots = here.slots;
    if (here.result) toolResults = [...toolResults, here.result];
  }

  const filledBefore = slotsFilled(priorSlots, node.requireSlots) && Boolean(node.requireSlots?.length);
  let { nextNodeId, exit } = applyTransition(node, intentForGraph, slots);
  // Staying put (or self-loop like no_account → verify) but required slots are now
  // satisfied (e.g. a new account was just created) → take the slots_filled edge.
  if (
    !exit &&
    (!nextNodeId || nextNodeId === node.id) &&
    node.transitions.some((tr) => tr.on === "slots_filled")
  ) {
    const retry = applyTransition(node, "slots_filled", slots);
    if (retry.nextNodeId && retry.nextNodeId !== node.id) {
      nextNodeId = retry.nextNodeId;
      exit = retry.exit;
    }
  }
  // Requirements met only this turn but the issue is still unknown → stay and ask
  if (!exit && nextNodeId && nextNodeId !== node.id && holdHere(node, slots, filledBefore)) {
    nextNodeId = node.id;
  }
  let nextNode = nextNodeId ? getCurrentNode(flow, nextNodeId) : null;

  // Entering verify with name + "no account" carried from greet → create on entry
  if (!exit && nextNode && nextNode.id !== node.id) {
    const entry = await ensureAccountAt(nextNode, slots, request);
    if (entry.limited) return createLimitedResponse(node.id, slots);
    slots = entry.slots;
    if (entry.result) toolResults = [...toolResults, entry.result];
  }

  // Chain through a slot-collection node whose requirements are already met
  // (e.g. caller gave name + account at greet → skip re-asking at verify).
  // Never skip compliance nodes (allowParaphrase: false) — must-say lines stay.
  if (
    !exit &&
    nextNode &&
    nextNode.id !== node.id &&
    nextNode.allowParaphrase !== false &&
    nextNode.requireSlots?.length &&
    nextNode.transitions.some((tr) => tr.on === "slots_filled")
  ) {
    const chained = await verifyAccountAt(nextNode, slots);
    slots = chained.slots;
    if (chained.result) toolResults = [...toolResults, chained.result];
    if (chained.notFound) accountNotFound = true;
    const hop = applyTransition(nextNode, "slots_filled", slots);
    if (
      hop.nextNodeId &&
      hop.nextNodeId !== nextNode.id &&
      !hop.exit &&
      !holdHere(nextNode, slots, false)
    ) {
      const hopNode = getCurrentNode(flow, hop.nextNodeId);
      if (hopNode) nextNode = hopNode;
    }
  }

  const speakNode = exit ? node : nextNode ?? node;
  const transitioned = Boolean(nextNode && nextNode.id !== node.id);
  const acknowledged = alreadyAcknowledged(history);

  // RAG against speak node (or current) for reply grounding
  const ragNode = speakNode;
  const ragQuery = [ragNode.rag?.queryHint, userText, slots.reason, slots.need, matchedIntent]
    .filter(Boolean)
    .join(" ");
  const ragHits =
    ragNode.rag || node.rag
      ? await retrieveIkoAgent(flow.ragCorpus, ragQuery || userText, 3, {
          accountVerified: Boolean(sanitizeAccountId(slots.accountId || "")),
        })
      : [];
  // Scripted fallback may only speak authored caller-safe lines, and only on
  // policy nodes (rag.required). Agent-only guidance never reaches the caller.
  const callerFacts = callerPolicyLines(ragHits);
  const ragSnippets = speakNode.rag?.required ? callerFacts : [];
  const ragContext = formatIkoAgentContext(ragHits);
  const greetingOnly = pureGreeting && !transitioned && !exit;

  // D. LLM speak for destination/current node; E. scripted fallback
  if (greetingOnly) llmStatus.speak = "skipped";
  const spoken = greetingOnly
    ? null
    : await speakTurn({
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
        acknowledged,
        accountNotFound,
        agentOnlyTexts: agentOnlyTexts(ragHits),
        callerFacts,
        status: llmStatus,
      });

  let agentText: string;
  let mode: "llm" | "scripted";
  if (greetingOnly) {
    // Never repeat the opener: short, rotating reply to a bare "hi"
    agentText = greetingReply(node, history);
    mode = "scripted";
  } else if (spoken) {
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
      accountNotFound,
      acknowledged,
      history,
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
    llm: llmStatus,
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
      llm: llmStatus,
    },
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
