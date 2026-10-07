import type {
  Flow,
  FlowExit,
  FlowNode,
  HistoryTurn,
  SlotMap,
  ToolResult,
} from "./types";
import { runTool, toolsForIntent } from "./tools";

const TOKEN = /[a-z0-9]{2,}/g;

function tokenize(value: string): string[] {
  return (value.toLowerCase().match(TOKEN) ?? []).filter((t) => t.length > 1);
}

export function getCurrentNode(flow: Flow, nodeId: string): FlowNode | null {
  return flow.nodes[nodeId] ?? null;
}

/** Keyword / example overlap scoring for intents declared on the node */
export function matchIntent(
  node: FlowNode,
  userText: string,
): { intent: string | null; score: number } {
  const text = userText.toLowerCase().trim();
  const userTokens = new Set(tokenize(text));
  if (!text || !node.listenFor.length) return { intent: null, score: 0 };

  let best: { intent: string; score: number } | null = null;

  for (const entry of node.listenFor) {
    let score = 0;
    const intentTokens = tokenize(entry.intent.replace(/_/g, " "));
    for (const t of intentTokens) {
      if (userTokens.has(t) || text.includes(t)) score += 1.2;
    }
    for (const example of entry.examples ?? []) {
      const ex = example.toLowerCase();
      if (text.includes(ex) || ex.includes(text)) {
        score += 3;
        continue;
      }
      const overlap = tokenize(ex).filter((t) => userTokens.has(t)).length;
      score += overlap * 0.9;
    }
    // Common synonyms for demo verticals
    score += synonymBoost(entry.intent, text);
    if (!best || score > best.score) best = { intent: entry.intent, score };
  }

  if (!best || best.score < 1.2) return { intent: null, score: best?.score ?? 0 };
  return best;
}

function synonymBoost(intent: string, text: string): number {
  const rules: Record<string, string[]> = {
    greeting: ["hi", "hello", "hey", "good morning", "good afternoon", "thanks", "thank you"],
    verify_identity: ["account", "verify", "it's me", "my name", "last four", "last 4"],
    provide_account: ["account", "number", "1001", "2044", "3300"],
    provide_name: ["my name is", "i am", "i'm", "call me", "this is"],
    no_account: ["no account", "don't have", "new customer", "set one up", "create an account"],
    describe_issue: [
      "broken",
      "not working",
      "problem",
      "issue",
      "error",
      "help",
      "ship",
      "shipping",
      "tracking",
      "delay",
      "late",
      "package",
      "delivery",
      "frustrated",
      "ridiculous",
      "still waiting",
      "charged twice",
      "password",
      "login",
    ],
    ask_policy: ["policy", "refund", "return", "warranty", "how long", "eligible"],
    escalate: ["supervisor", "manager", "escalate", "human", "agent", "person"],
    resolve: ["thanks", "thank you", "that works", "resolved", "fixed", "done"],
    ask_balance: ["balance", "owe", "how much", "what do i owe"],
    arrange_payment: ["pay", "payment", "plan", "installment", "arrange"],
    accept_plan: ["yes", "accept", "i'll take", "sign me up", "agree"],
    hardship: ["hardship", "can't pay", "lost job", "unemployed", "medical", "struggle"],
    refuse_payment: ["won't pay", "refuse", "not paying", "dispute"],
    discover_need: ["need", "looking for", "want", "interested", "help with"],
    ask_offer: ["price", "plan", "package", "offer", "features", "what's included"],
    objection_price: ["expensive", "too much", "cost", "budget", "cheaper"],
    objection_timing: ["later", "not now", "think about", "next quarter"],
    close_won: ["buy", "sign up", "let's do it", "purchase", "i'll take it"],
    request_callback: ["call me", "callback", "call back", "later today", "tomorrow"],
    affirm: ["yes", "yeah", "correct", "that's right", "ok", "okay", "sure"],
    deny: ["no", "nope", "wrong", "incorrect", "not me"],
  };
  const needles = rules[intent] ?? [];
  let boost = 0;
  for (const n of needles) {
    // Short tokens need word boundaries ("hi" must not match inside "this" / "shipping")
    if (n.length <= 3) {
      const re = new RegExp(`(?:^|[^a-z0-9])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:[^a-z0-9]|$)`);
      if (re.test(text)) boost += 1.5;
    } else if (text.includes(n)) {
      boost += 1.5;
    }
  }
  return boost;
}


/** Greetings / acks that must never become the issue reason */
export function isGreetingOrAck(text: string): boolean {
  const t = text.toLowerCase().replace(/[^a-z0-9\s']/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return true;
  // Pure short social openers / fillers
  if (
    /^(hi|hii+|hello|hey|hey there|hi there|howdy|yo|sup|good (morning|afternoon|evening)|thanks|thank you|ty|ok|okay|sure|yes|yeah|yep|yup|no|nope|cool|great|alright|all right|please|nm|never ?mind)[\s!.]*$/i.test(
      t,
    )
  ) {
    return true;
  }
  // Very short non-issue chatter
  if (t.split(" ").length <= 2 && /^(hi|hello|hey|thanks|thank you|ok|okay|sure|yes|yeah)\b/.test(t)) {
    return true;
  }
  return false;
}

/** Weak / garbage topics that should not be spoken as {{reason}} */
export function isWeakTopic(value: string | undefined | null): boolean {
  if (!value) return true;
  const t = value.toLowerCase().replace(/\s+/g, " ").trim();
  if (!t || t.length < 3) return true;
  if (isGreetingOrAck(t)) return true;
  if (/^(account|number|demo|please|help|issue|problem|question|hi|hello)\b/.test(t) && t.length < 18) {
    return true;
  }
  // Account digits alone
  if (/^(1001|2044|3300|\d{4,6})$/.test(t)) return true;
  return false;
}

/** Map free text to a short CS/sales topic tag (empty if nothing real) */
export function topicFromText(text: string): string {
  const t = text.toLowerCase();
  if (!t.trim() || isGreetingOrAck(t)) return "";
  if (/lost\s+(my\s+)?package|never\s+(got|received|arrived)|haven'?t\s+received|no\s+scan/.test(t)) {
    return "lost package";
  }
  if (/ship|track(ing)?|deliver|package|late|delay|still\s+waiting/.test(t)) return "shipping delay";
  if (/refund|return|exchange/.test(t)) return "return or exchange";
  if (/warranty|defect|broken|crack/.test(t)) return "warranty or defect";
  if (/bill|charge|invoice|charged/.test(t)) return "billing";
  if (/login|password|access|locked/.test(t)) return "login access";
  if (/price|expensive|budget|cost/.test(t)) return "pricing";
  if (/hardship|can'?t pay|cannot pay|lost (my )?job/.test(t)) return "hardship";
  return "";
}

/** Drop weak reason/need so scripts never say "help with hi" */
export function scrubWeakSlots(slots: SlotMap): SlotMap {
  const next: SlotMap = { ...slots };
  if (isWeakTopic(next.reason)) delete next.reason;
  if (isWeakTopic(next.need)) delete next.need;
  return next;
}

/** Pull common demo slots from free text */
export function collectSlots(userText: string, existing: SlotMap, required?: string[]): SlotMap {
  const next: SlotMap = { ...existing };
  const text = userText.trim();

  const accountMatch = text.match(/\b(1001|2044|3300|\d{4,6})\b/);
  if (accountMatch) next.accountId = accountMatch[1];

  const last4 = text.match(/\blast\s*(?:four|4)\D*(\d{4})\b/i) || text.match(/\b(\d{4})\b/);
  if (last4 && !next.last4) next.last4 = last4[1];

  const amount = text.match(/\$?\s*(\d+(?:\.\d{1,2})?)\s*(dollars)?/i);
  if (amount && /pay|owe|balance|amount/i.test(text)) next.amount = amount[1];

  const months = text.match(/\b(\d+)\s*(?:month|mo)\b/i);
  if (months) next.planMonths = months[1];

  // Prefer short topic tags — never stash greetings as the issue reason
  const topic = topicFromText(text);
  if (topic) next.reason = topic;

  if (/morning|afternoon|evening|tomorrow|today/i.test(text)) {
    const m = text.match(/\b(morning|afternoon|evening|tomorrow|today)\b/i);
    if (m) next.callbackWindow = m[1].toLowerCase();
  }

  if (/pro|basic|enterprise|support\s*plus/i.test(text)) {
    const m = text.match(/\b(pro|basic|enterprise|support\s*plus)\b/i);
    if (m) next.offer = m[1].toLowerCase().replace(/\s+/g, "_");
  }

  // Customer name (validated) — never treat account digits or issue phrases as names
  {
    const nameMatch = text.match(
      /\b(?:my name is|i(?:'m| am)|this is|call me)\s+([A-Za-z][A-Za-z .'\-]{1,40})/i,
    );
    let candidate = nameMatch?.[1]?.replace(/[.,!?]+$/, "").trim() ?? "";
    if (
      !candidate &&
      /^[A-Za-z][A-Za-z .'\-]{1,40}$/.test(text) &&
      !/\d/.test(text) &&
      !/package|refund|account|help|late|order|billing|login|hi|hello|hey/i.test(text)
    ) {
      candidate = text.trim();
    }
    if (
      candidate.length >= 2 &&
      candidate.length <= 60 &&
      /^[A-Za-z][A-Za-z .'\-]*[A-Za-z.]$/.test(candidate)
    ) {
      next.customerName = candidate
        .split(" ")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
    }
  }

  // Soft-fill notes/objection only — never dump raw text into reason/need (greetings poisoned those)
  if (required?.length === 1 && !next[required[0]] && text.length > 1) {
    const key = required[0];
    if ((key === "notes" || key === "objection") && !isGreetingOrAck(text)) {
      next[key] = text.slice(0, 200);
    }
  }

  return scrubWeakSlots(next);
}

export function slotsFilled(slots: SlotMap, required?: string[]): boolean {
  if (!required?.length) return true;
  return required.every((key) => Boolean(slots[key]?.trim()));
}

export function applyTransition(
  node: FlowNode,
  intent: string | null,
  slots: SlotMap,
): { nextNodeId: string | null; exit: FlowExit | null } {
  // Explicit exit intents
  if (intent === "escalate" && node.exits?.some((e) => e.type === "escalate")) {
    return { nextNodeId: null, exit: node.exits.find((e) => e.type === "escalate")! };
  }
  if (intent === "resolve" && node.exits?.some((e) => e.type === "resolve")) {
    return { nextNodeId: null, exit: node.exits.find((e) => e.type === "resolve")! };
  }
  if (intent === "request_callback" && node.exits?.some((e) => e.type === "callback")) {
    return { nextNodeId: null, exit: node.exits.find((e) => e.type === "callback")! };
  }
  if (intent === "refuse_payment" && node.exits?.some((e) => e.type === "refuse")) {
    return { nextNodeId: null, exit: node.exits.find((e) => e.type === "refuse")! };
  }

  const filled = slotsFilled(slots, node.requireSlots);

  // Prefer specific intent matches, then slots_filled, then *
  const candidates = node.transitions.filter((t) => {
    if (t.whenSlotsFilled?.length && !slotsFilled(slots, t.whenSlotsFilled)) return false;
    if (t.on === "slots_filled") return filled;
    if (t.on === "*") return Boolean(intent) || filled;
    return intent === t.on;
  });

  // Rank: exact intent > slots_filled > *
  candidates.sort((a, b) => {
    const rank = (on: string) => (on === "slots_filled" ? 1 : on === "*" ? 0 : 2);
    return rank(b.on) - rank(a.on);
  });

  const chosen = candidates[0];
  if (!chosen) {
    // Terminal exits on node if no transition
    if (node.exits?.length === 1 && filled) {
      return { nextNodeId: null, exit: node.exits[0] };
    }
    return { nextNodeId: null, exit: null };
  }

  const target = chosen.to;
  if (target.startsWith("exit:")) {
    const type = target.slice(5) as FlowExit["type"];
    const exit = node.exits?.find((e) => e.type === type) ?? {
      type,
      label: type,
    };
    return { nextNodeId: null, exit };
  }

  return { nextNodeId: target, exit: null };
}

export function buildAgentTurn(opts: {
  node: FlowNode;
  nextNode: FlowNode | null;
  exit: FlowExit | null;
  slots: SlotMap;
  toolResults: ToolResult[];
  ragSnippets: string[];
  matchedIntent: string | null;
}): string {
  const lines: string[] = [];

  // On first visit / scripted path: speak current or next node lines
  const speakNode = opts.nextNode ?? opts.node;
  const say = speakNode.agentSay ?? [];

  if (opts.exit) {
    // Closing line from current node if any, then exit label framing
    if (say.length) lines.push(interpolate(say[0], opts.slots, opts.toolResults));
    lines.push(`Call outcome: ${opts.exit.label}`);
    return lines.join("\n\n");
  }

  // If we transitioned, prefer the destination script
  if (opts.nextNode && opts.nextNode.id !== opts.node.id) {
    for (const line of opts.nextNode.agentSay) {
      lines.push(interpolate(line, opts.slots, opts.toolResults));
    }
  } else {
    // Stay on node — clarify or restate
    const clarify =
      opts.node.requireSlots?.filter((s) => !opts.slots[s]) ?? [];
    if (opts.matchedIntent === "greeting") {
      lines.push(
        "Hello there — how can I help you today? Orders, billing, login, returns — I'm right here with you.",
      );
    } else if (clarify.length) {
      lines.push(
        interpolate(
          opts.node.agentSay[0] ?? "Could you share a bit more so we can continue?",
          opts.slots,
          opts.toolResults,
        ),
      );
      lines.push(`Still need: ${clarify.join(", ")}.`);
    } else if (opts.matchedIntent) {
      lines.push(
        interpolate(
          opts.node.agentSay[0] ?? "Got it — let’s keep going.",
          opts.slots,
          opts.toolResults,
        ),
      );
    } else {
      lines.push(
        "I want to stay on-script for this step. " +
          (opts.node.listenFor[0]
            ? `You can say something like: “${opts.node.listenFor[0].examples?.[0] ?? opts.node.listenFor[0].intent}”.`
            : "Please reply with a short answer for this step."),
      );
    }
  }

  if (opts.ragSnippets.length) {
    const cleaned = cleanRagSnippet(opts.ragSnippets[0]);
    if (cleaned) lines.push(cleaned);
  }

  // Surface key tool facts briefly
  for (const tr of opts.toolResults) {
    if (!tr.ok) continue;
    if (tr.name === "checkBalance" && typeof tr.data.balance === "number") {
      lines.push(
        `Balance on file: ${tr.data.currency ?? "USD"} ${Number(tr.data.balance).toFixed(2)}.`,
      );
    }
    if (tr.name === "offerPaymentPlan" && tr.data.eligible) {
      lines.push(
        `Plan option: ${tr.data.months} months at ${tr.data.currency ?? "USD"} ${tr.data.installment}/mo.`,
      );
    }
    if (tr.name === "createCase" && tr.data.caseId) {
      lines.push(`Opened case ${tr.data.caseId}.`);
    }
    if (tr.name === "scheduleCallback" && tr.data.callbackId) {
      lines.push(`Callback ${tr.data.callbackId} set for ${tr.data.window}.`);
    }
    if (tr.name === "createCustomer" && tr.data.accountId && tr.data.created === true) {
      lines.push(
        `I've set up demo account ${tr.data.accountId} for ${tr.data.name}.`,
      );
    }
    if (tr.name === "lookupAccount" && tr.data.verified && tr.data.name) {
      lines.push(`Account on file for ${tr.data.name}.`);
    }
  }

  return stripPlaceholders(lines.filter(Boolean).join("\n\n"));
}

export function interpolate(template: string, slots: SlotMap, tools: ToolResult[] = []): string {
  let out = template;
  const safe: SlotMap = scrubWeakSlots(slots);
  for (const [key, value] of Object.entries(safe)) {
    out = out.replaceAll(`{{${key}}}`, value);
  }
  const balance = tools.find((t) => t.name === "checkBalance");
  if (balance && typeof balance.data.balance === "number") {
    out = out.replaceAll("{{balance}}", String(balance.data.balance));
  }
  const plan = tools.find((t) => t.name === "offerPaymentPlan");
  if (plan?.data.installment != null) {
    out = out.replaceAll("{{installment}}", String(plan.data.installment));
    out = out.replaceAll("{{planMonths}}", String(plan.data.months ?? ""));
  }
  // stripPlaceholders removes any {{reason}} left after scrubbing weak topics
  return stripPlaceholders(out);
}

function cleanRagSnippet(raw: string): string {
  let t = raw
    .replace(/^[^:]+:\s*/u, "")
    .replace(/^#+\s*/gm, "")
    .replace(/##\s*Say this\s*/gi, "")
    .replace(/["“”]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (t.length < 20) return "";
  // Prefer a single spoken sentence
  const sentence = t.match(/[A-Z][^.!?]{20,}[.!?]/);
  const pick = (sentence?.[0] ?? t).slice(0, 220).trim();
  return pick ? `Quick policy note: ${pick}` : "";
}

export function stripPlaceholders(text: string): string {
  return text
    .replace(/\{\{[a-zA-Z0-9_]+\}\}/g, "")
    // Collapse awkward gaps left by empty reason/need ("help with .", "about the ,")
    .replace(/\b(with|about the|for|regarding)\s*([.,;:]|$)/gi, "$2")
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

export function interpolateLines(
  lines: string[],
  slots: SlotMap,
  tools: ToolResult[] = [],
): string[] {
  return lines.map((line) => stripPlaceholders(interpolate(line, slots, tools))).filter(Boolean);
}

export function openingAgentText(flow: Flow): string {
  const start = getCurrentNode(flow, flow.start);
  if (!start) return "Flow start node missing.";
  return stripPlaceholders(
    start.agentSay.map((line) => interpolate(line, {}, [])).join("\n\n"),
  );
}

export async function runToolsForTurn(
  flow: Flow,
  node: FlowNode,
  intent: string | null,
  slots: SlotMap,
): Promise<ToolResult[]> {
  const names = toolsForIntent(intent, node.toolsAllowed, flow.tools);
  // Also auto-run tools listed on the destination-oriented node when slots just filled
  const extra =
    intent === "ask_balance" || intent === "arrange_payment"
      ? ["checkBalance"]
      : intent === "provide_account" || intent === "verify_identity"
        ? ["lookupAccount"]
        : intent === "provide_name"
          ? ["createCustomer"]
          : [];
  const unique = [...new Set([...names, ...extra])].filter(
    (n) => flow.tools.includes(n) || node.toolsAllowed?.includes(n),
  );
  const results: ToolResult[] = [];
  for (const name of unique) {
    results.push(await runTool(name, slots));
  }
  return results;
}

export function looksLikeInjection(text: string): boolean {
  const t = text.toLowerCase();
  return (
    /ignore\s+(all|any|previous)\b.{0,40}\binstructions/.test(t) ||
    /system prompt/.test(t) ||
    /jailbreak/.test(t) ||
    /do not follow (the )?flow/.test(t) ||
    /\b(drop|truncate|delete)\s+table\b/.test(t) ||
    /\bunion\s+select\b/.test(t) ||
    /\binsert\s+into\b/.test(t) ||
    /\b(exec|execute)\s*\(/.test(t)
  );
}

export type ProcessTurnResult = {
  nodeId: string;
  agentText: string;
  slots: SlotMap;
  toolResults: ToolResult[];
  exit: FlowExit | null;
  matchedIntent: string | null;
  history: HistoryTurn[];
};

export async function processTurn(opts: {
  flow: Flow;
  nodeId: string;
  slots: SlotMap;
  history: HistoryTurn[];
  userText: string;
  ragSnippets?: string[];
}): Promise<ProcessTurnResult> {
  const node = getCurrentNode(opts.flow, opts.nodeId);
  if (!node) {
    return {
      nodeId: opts.nodeId,
      agentText: "This step is not in the flow. Restart the demo.",
      slots: opts.slots,
      toolResults: [],
      exit: { type: "refuse", label: "Invalid node" },
      matchedIntent: null,
      history: opts.history,
    };
  }

  if (looksLikeInjection(opts.userText)) {
    return {
      nodeId: node.id,
      agentText:
        "I stay inside the authored call flow. Please continue with a normal customer reply for this step.",
      slots: opts.slots,
      toolResults: [],
      exit: null,
      matchedIntent: null,
      history: [
        ...opts.history,
        { role: "user", content: opts.userText },
        {
          role: "agent",
          content:
            "I stay inside the authored call flow. Please continue with a normal customer reply for this step.",
        },
      ],
    };
  }

  const slots = collectSlots(opts.userText, opts.slots, node.requireSlots);
  const { intent } = matchIntent(node, opts.userText);
  const toolResults = await runToolsForTurn(opts.flow, node, intent, slots);
  const { nextNodeId, exit } = applyTransition(node, intent, slots);
  const nextNode = nextNodeId ? getCurrentNode(opts.flow, nextNodeId) : null;

  const agentText = buildAgentTurn({
    node,
    nextNode,
    exit,
    slots,
    toolResults,
    ragSnippets: opts.ragSnippets ?? [],
    matchedIntent: intent,
  });

  const finalNodeId = exit ? node.id : nextNode?.id ?? node.id;

  return {
    nodeId: finalNodeId,
    agentText,
    slots,
    toolResults,
    exit,
    matchedIntent: intent,
    history: [
      ...opts.history,
      { role: "user", content: opts.userText },
      { role: "agent", content: agentText },
    ],
  };
}
