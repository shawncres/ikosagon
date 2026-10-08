/**
 * One call-graph pass for a turn: caller-text heuristics → tools → transitions →
 * hold / chain. Shared by the real (live) pass and the dry "prediction" pass that
 * tells the single LLM call which node it is most likely drafting for.
 *
 * Live mode runs every tool. Dry mode runs read-only lookups for real (so "account
 * not found" is known up front) but never writes: createCustomer is simulated and
 * volatile ids (account / case / callback numbers) become {{placeholders}} that are
 * filled from the live tool results after the graph decides.
 */
import {
  applyTransition,
  extractAccountId,
  getCurrentNode,
  isGreetingOrAck,
  runToolsForTurn,
  scrubWeakSlots,
  slotsFilled,
  topicFromText,
} from "./engine";
import { extractCustomerName, looksLikeNoAccount, sanitizeAccountId } from "./crm";
import { applyToolSlots, runTool } from "./tools";
import { mergeSlots } from "./llmTurn";
import type { Flow, FlowExit, FlowNode, SlotMap, ToolResult } from "./types";

/** Caller declined having an account after we asked ("no", "nope", "I don't") */
export function looksLikeDecline(text: string): boolean {
  return /^\s*(no|nope|nah|not really|i don'?t|i do not|don'?t have (one|it)|never had one)\b/i.test(text);
}

/**
 * holdForSlots: the node's required slots were only just met this turn and the
 * extra hold slots (e.g. the issue) are still unknown → stay and ask for them.
 */
export function holdHere(node: FlowNode, slots: SlotMap, filledBefore: boolean): boolean {
  if (!node.holdForSlots?.length || filledBefore) return false;
  return node.holdForSlots.some((key) => !slots[key]?.trim());
}

export type TurnState = {
  /** Intent the graph acts on (after deterministic overrides) */
  intentForGraph: string | null;
  slots: SlotMap;
  topic: string;
  /** createCustomer would run for this intent (route applies the create rate limit) */
  createPossible: boolean;
};

/**
 * Deterministic post-processing of the caller text + (LLM or keyword) intent.
 * Never trusts the model for SQL / tool commands — only intent + validated slots.
 */
export function deriveTurnState(opts: {
  flow: Flow;
  node: FlowNode;
  userText: string;
  slots: SlotMap;
  matchedIntent: string | null;
}): TurnState {
  const { flow, node, userText, matchedIntent } = opts;
  let slots = opts.slots;

  // Prefer short topic tags — never let greetings / rants land in {{reason}}/{{need}}
  const topic = topicFromText(userText);
  slots = scrubWeakSlots(slots);
  if (topic) {
    slots = mergeSlots(slots, { reason: topic });
    if (flow.vertical === "sales" || matchedIntent === "discover_need") {
      slots = mergeSlots(slots, { need: topic });
    }
  }
  // Collapse an LLM-stuffed rant without inventing a topic from noise
  if (slots.reason && slots.reason.length > 60) {
    slots = mergeSlots(slots, { reason: topicFromText(slots.reason) || slots.reason.slice(0, 48) });
  }
  if (slots.need && slots.need.length > 60) {
    slots = mergeSlots(slots, { need: topicFromText(slots.need) || slots.need.slice(0, 48) });
  }
  slots = scrubWeakSlots(slots);

  // Name / no-account heuristics (validated)
  const asksForName = node.listenFor.some((e) => e.intent === "provide_name");
  const extractedName = extractCustomerName(userText, { allowBare: asksForName && !slots.customerName });
  if (extractedName) slots = mergeSlots(slots, { customerName: extractedName });
  if (looksLikeNoAccount(userText)) slots = mergeSlots(slots, { needsAccount: "true" });

  // Greeting / small-talk should not advance the graph as if an issue was described
  let intentForGraph = matchedIntent;
  if (matchedIntent === "describe_issue" && isGreetingOrAck(userText) && !topic && !slots.reason) {
    intentForGraph = "greeting";
  }
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
    intentForGraph = "provide_account";
  } else if (extractedName && listenIds.has("provide_name") && !slots.accountId) {
    intentForGraph = "provide_name";
  }

  const createPossible =
    (intentForGraph === "provide_name" || intentForGraph === "no_account") &&
    slots.needsAccount === "true" &&
    Boolean(slots.customerName) &&
    !sanitizeAccountId(slots.accountId || "");

  return { intentForGraph, slots, topic, createPossible };
}

export type GraphOutcome = {
  slots: SlotMap;
  toolResults: ToolResult[];
  accountNotFound: boolean;
  nextNode: FlowNode | null;
  exit: FlowExit | null;
  speakNode: FlowNode;
  transitioned: boolean;
  /** Account create was rate-limited (live mode) */
  limited: boolean;
};

export type GraphMode =
  | { kind: "live"; allowCreate: () => boolean }
  | { kind: "dry" };

/** Placeholder written into dry-run tool facts; filled from the live results */
export const PENDING = {
  accountId: "{{accountId}}",
  caseId: "{{caseId}}",
  callbackId: "{{callbackId}}",
} as const;

function simulateCreate(slots: SlotMap): ToolResult {
  return {
    name: "createCustomer",
    ok: true,
    data: { accountId: PENDING.accountId, name: slots.customerName, created: true },
  };
}

/** Dry mode: run read-only tools for real, simulate writes, hide volatile ids */
function dryTool(result: ToolResult): ToolResult {
  if (result.name === "createCase" && result.ok) {
    return { ...result, data: { ...result.data, caseId: PENDING.caseId } };
  }
  if (result.name === "scheduleCallback" && result.ok) {
    return { ...result, data: { ...result.data, callbackId: PENDING.callbackId } };
  }
  return result;
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
  // Dry pass: an account "created" a moment ago will be found by the live lookup
  if (slots.accountId === PENDING.accountId && node.toolsAllowed?.includes("lookupAccount")) {
    const result: ToolResult = {
      name: "lookupAccount",
      ok: true,
      data: { accountId: PENDING.accountId, name: slots.customerName ?? "", verified: true },
    };
    return { slots, result, notFound: false };
  }
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

function isPending(value: string | undefined): boolean {
  return value === PENDING.accountId;
}

function hasAccount(slots: SlotMap): boolean {
  return Boolean(sanitizeAccountId(slots.accountId || "") || isPending(slots.accountId));
}

/**
 * Name + "no account" on file at a node that may create customers → create now
 * (live) or pretend to (dry) instead of asking for an account number again.
 */
async function ensureAccountAt(
  node: FlowNode,
  slots: SlotMap,
  mode: GraphMode,
): Promise<{ slots: SlotMap; result: ToolResult | null; limited: boolean }> {
  if (
    !node.toolsAllowed?.includes("createCustomer") ||
    slots.needsAccount !== "true" ||
    !slots.customerName ||
    hasAccount(slots)
  ) {
    return { slots, result: null, limited: false };
  }
  if (mode.kind === "dry") {
    const result = simulateCreate(slots);
    return { slots: { ...slots, accountId: PENDING.accountId, accountCreated: "true" }, result, limited: false };
  }
  if (!mode.allowCreate()) return { slots, result: null, limited: true };
  const result = await runTool("createCustomer", slots);
  return { slots: result.ok ? applyToolSlots(slots, [result]) : slots, result, limited: false };
}

async function toolsAt(
  flow: Flow,
  node: FlowNode,
  intent: string | null,
  slots: SlotMap,
  skip: string[],
  mode: GraphMode,
): Promise<ToolResult[]> {
  if (mode.kind === "live") return runToolsForTurn(flow, node, intent, slots, { skip });
  // Dry: same selection, but createCustomer is simulated and ids are placeholders
  const wouldCreate =
    !skip.includes("createCustomer") &&
    (intent === "provide_name" || intent === "no_account") &&
    slots.needsAccount === "true" &&
    Boolean(slots.customerName) &&
    !hasAccount(slots);
  const real = await runToolsForTurn(flow, node, intent, slots, { skip: [...skip, "createCustomer"] });
  return [...real.map(dryTool), ...(wouldCreate ? [simulateCreate(slots)] : [])];
}

function applySlotsDry(slots: SlotMap, results: ToolResult[]): SlotMap {
  let next = applyToolSlots(slots, results.filter((r) => r.name !== "createCustomer"));
  if (results.some((r) => r.name === "createCustomer" && r.ok && r.data.accountId === PENDING.accountId)) {
    next = { ...next, accountId: PENDING.accountId, accountCreated: "true" };
  }
  return next;
}

/** Tools + transitions + hold + chain. The graph (not the model) owns the journey. */
export async function runGraph(opts: {
  flow: Flow;
  node: FlowNode;
  priorSlots: SlotMap;
  state: TurnState;
  mode: GraphMode;
}): Promise<GraphOutcome> {
  const { flow, node, priorSlots, mode } = opts;
  const intent = opts.state.intentForGraph;
  let slots = opts.state.slots;
  const apply = (s: SlotMap, r: ToolResult[]) => (mode.kind === "dry" ? applySlotsDry(s, r) : applyToolSlots(s, r));
  const limitedOutcome = (): GraphOutcome => ({
    slots,
    toolResults: [],
    accountNotFound: false,
    nextNode: null,
    exit: null,
    speakNode: node,
    transitioned: false,
    limited: true,
  });

  if (mode.kind === "live" && opts.state.createPossible && !mode.allowCreate()) return limitedOutcome();

  // Verify any captured account against the CRM before the graph can advance on it
  const verified = await verifyAccountAt(node, slots);
  slots = verified.slots;
  let accountNotFound = verified.notFound;
  let toolResults: ToolResult[] = verified.result ? [verified.result] : [];
  toolResults = [
    ...toolResults,
    ...(await toolsAt(flow, node, intent, slots, verified.result ? ["lookupAccount"] : [], mode)),
  ];
  slots = scrubWeakSlots(apply(slots, toolResults));

  // Name + "no account" already known while sitting on verify → create now
  {
    // The intent-driven create above already counted against the rate limit
    const here = await ensureAccountAt(node, slots, mode);
    if (here.limited) return limitedOutcome();
    slots = here.slots;
    if (here.result) toolResults = [...toolResults, here.result];
  }

  const filledBefore = slotsFilled(priorSlots, node.requireSlots) && Boolean(node.requireSlots?.length);
  let { nextNodeId, exit } = applyTransition(node, intent, slots);
  // Staying put (or self-loop) but required slots are now satisfied → slots_filled edge
  if (!exit && (!nextNodeId || nextNodeId === node.id) && node.transitions.some((tr) => tr.on === "slots_filled")) {
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
    const entry = await ensureAccountAt(nextNode, slots, mode);
    if (entry.limited) return limitedOutcome();
    slots = entry.slots;
    if (entry.result) toolResults = [...toolResults, entry.result];
  }

  // Chain through a slot-collection node whose requirements are already met.
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
    if (hop.nextNodeId && hop.nextNodeId !== nextNode.id && !hop.exit && !holdHere(nextNode, slots, false)) {
      const hopNode = getCurrentNode(flow, hop.nextNodeId);
      if (hopNode) nextNode = hopNode;
    }
  }

  return {
    slots,
    toolResults,
    accountNotFound,
    nextNode,
    exit,
    speakNode: exit ? node : nextNode ?? node,
    transitioned: Boolean(nextNode && nextNode.id !== node.id),
    limited: false,
  };
}

/** Where the turn lands, for comparing the predicted vs live graph pass */
export function outcomeKey(o: GraphOutcome): string {
  const tools = o.toolResults.map((t) => `${t.name}:${t.ok ? 1 : 0}`).sort().join(",");
  return [o.exit ? `exit:${o.exit.type}` : `node:${o.speakNode.id}`, o.transitioned ? "moved" : "stayed", o.accountNotFound ? "notfound" : "", tools].join("|");
}
