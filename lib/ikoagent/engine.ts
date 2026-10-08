import type {
  Flow,
  FlowExit,
  FlowNode,
  HistoryTurn,
  SlotMap,
  ToolResult,
} from "./types";
import { runTool, toolsForIntent } from "./tools";
import { extractCustomerName } from "./crm/validate";

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
  if (/lost\s+(my\s+)?package|never\s+(got|received|arrived|came|showed)|haven'?t\s+received|no\s+scan/.test(t)) {
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

  const accountDigits = extractAccountId(text);
  if (accountDigits) next.accountId = accountDigits;

  // Only an explicit "last four" phrase fills last4 — account digits are not a card's last 4
  const last4 = text.match(/\blast\s*(?:four|4)\D*(\d{4})\b/i);
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

  // Customer name (validated) — never treat account digits, issue phrases, or
  // sentences like "I was charged twice" / "no" as names
  {
    // Intro phrases only ("my name is…", "I'm…"); bare "Maya Chen" replies are
    // handled by the route at nodes that actually asked for a name.
    const name = extractCustomerName(text, { allowBare: false });
    if (name) next.customerName = name;
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


/**
 * Pull a standalone 4–6 digit account number from caller text.
 * Never concatenates scattered digits ("10 days … the 28th" is NOT account 1028).
 */
export function extractAccountId(text: string): string | null {
  const m = text.match(/(?:^|[^\d])(\d{4,6})(?![\d]|st|nd|rd|th)/i);
  return m ? m[1] : null;
}

/** Required slots for a node that are still empty */
export function missingSlots(node: FlowNode, slots: SlotMap): string[] {
  return (node.requireSlots ?? []).filter((key) => !slots[key]?.trim());
}

/** Has the agent already used the "I can help you with …" acknowledgement this call? */
export function alreadyAcknowledged(history: HistoryTurn[]): boolean {
  return history.some(
    (t) =>
      t.role === "agent" &&
      /\b(absolutely|of course|certainly)\b[^.!?]{0,6}\s*(i can|i'd be happy to|i will)\s+help\b|\bi can help (you )?with\b/i.test(
        t.content,
      ),
  );
}

const REPEAT_ACK =
  /^\s*(?:(?:absolutely|of course|certainly|sure)(?:,\s*[A-Z][a-z]+)?\s*[,!—–-]*\s*)?(?:i can (?:definitely )?help(?: you)? with (?:that|this|your [^.!?]{1,40}|[^.!?]{1,40})|i(?:'d| would) be happy to help(?: with that)?)\s*[.!—–-]*\s*/i;
const BARE_ABSOLUTELY = /^\s*(?:absolutely|of course|certainly)(?:,\s*[A-Z][a-z]+)?\s*[,!—–-]+\s*/i;

/** Drop a repeated "Absolutely, I can help you with that." opener (keeps the rest) */
export function stripRepeatAck(text: string): string {
  let out = text.replace(REPEAT_ACK, "");
  out = out.replace(BARE_ABSOLUTELY, "");
  out = out.trim();
  if (!out) return text.trim();
  return out.charAt(0).toUpperCase() + out.slice(1);
}

const ASK_RE = /\?|\b(may i (have|get)|could you|can you|would you|please (share|provide|give|tell)|what(?:'s| is) your|let me (have|get)|i(?:'ll| will) need)\b/i;
const NEVER_COLLECTED_RE =
  /\b(order (number|no\.?|id|date)|tracking (number|no\.?|id|code)|e-?mail(?: address)?|phone number|date (you|it was) (placed|ordered)|the email you used)\b/i;

/**
 * Remove sentences that re-ask for things we already have (name / account) or
 * that this demo never collects (order #, tracking #, email, phone).
 */
export function stripReasks(text: string, slots: SlotMap): string {
  const sentences = text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);
  const kept = sentences.filter((s) => {
    if (!ASK_RE.test(s)) return true;
    if (NEVER_COLLECTED_RE.test(s)) return false;
    if (slots.customerName && /\b(your (full )?name|who (am i|i'm) speaking with|name (on|for) the account)\b/i.test(s)) {
      return false;
    }
    const asksAccount = /\b(account (number|no\.?|id)|your account\b(?! is))/i.test(s);
    // Caller already said they have no account → never ask "account number handy?"
    if (asksAccount && slots.needsAccount === "true") return false;
    if (slots.accountId && asksAccount && !/\bset (one|it|an account) up\b/i.test(s)) {
      return false;
    }
    return true;
  });
  return kept.join(" ").trim();
}

/**
 * Context-aware script lines for a node: pick a variant so the agent asks only
 * for what is missing, then interpolate. Compliance nodes always use agentSay.
 */
export function scriptLinesFor(
  node: FlowNode,
  slots: SlotMap,
  tools: ToolResult[] = [],
  ctx: { transitioned?: boolean; accountNotFound?: boolean; acknowledged?: boolean } = {},
): string[] {
  let lines = node.agentSay ?? [];
  const v = node.allowParaphrase === false ? undefined : node.agentSayVariants;
  if (v) {
    const hasReason = Boolean(slots.reason && !isWeakTopic(slots.reason));
    const newCustomer = slots.needsAccount === "true";
    if (ctx.accountNotFound && v.accountNotFound?.length) lines = v.accountNotFound;
    // Account just created / found but no issue yet → confirm and ask how to help
    else if (slots.accountId && !hasReason && slots.accountCreated === "true" && v.accountCreated?.length) {
      lines = v.accountCreated;
    } else if (slots.accountId && !hasReason && v.accountReady?.length) lines = v.accountReady;
    // Caller said they're new: ask only for the missing name, never for an account number
    else if (newCustomer && !slots.accountId && !slots.customerName && v.needsName?.length) lines = v.needsName;
    else if (newCustomer && !slots.accountId && slots.customerName && v.settingUp?.length) lines = v.settingUp;
    else if (slots.customerName && !slots.accountId && v.knownName?.length) lines = v.knownName;
    else if (slots.reason && !isWeakTopic(slots.reason) && v.knownReason?.length) lines = v.knownReason;
    else if (ctx.transitioned === false && v.reprompt?.length) lines = v.reprompt;
  }
  let out = interpolateLines(lines, scrubWeakSlots(slots), tools);
  if (ctx.acknowledged && node.allowParaphrase !== false && out.length) {
    out = [stripRepeatAck(out[0]), ...out.slice(1)].filter(Boolean);
  }
  return out;
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
  /** Caller gave digits that did not match an account this turn */
  accountNotFound?: boolean;
  /** The "I can help you with …" acknowledgement was already used this call */
  acknowledged?: boolean;
  /** Prior turns, so a greeting reply never repeats an earlier agent line */
  history?: HistoryTurn[];
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

  const transitioned = Boolean(opts.nextNode && opts.nextNode.id !== opts.node.id);
  if (transitioned && opts.nextNode) {
    // Destination script — variant-aware so we only ask for what is missing
    lines.push(
      ...scriptLinesFor(opts.nextNode, opts.slots, opts.toolResults, {
        transitioned: true,
        accountNotFound: opts.accountNotFound,
        acknowledged: opts.acknowledged,
      }),
    );
  } else {
    // Stay on node — clarify or restate
    const clarify = missingSlots(opts.node, opts.slots);
    if (opts.matchedIntent === "greeting") {
      lines.push(greetingReply(opts.node, opts.history ?? []));
    } else if (clarify.length || opts.matchedIntent) {
      const scripted = scriptLinesFor(opts.node, opts.slots, opts.toolResults, {
        transitioned: false,
        accountNotFound: opts.accountNotFound,
        acknowledged: opts.acknowledged,
      });
      lines.push(...(scripted.length ? scripted : ["Could you share a bit more so we can continue?"]));
    } else {
      lines.push(
        "I want to stay on-script for this step. " +
          (opts.node.listenFor[0]
            ? `You can say something like: “${opts.node.listenFor[0].examples?.[0] ?? opts.node.listenFor[0].intent}”.`
            : "Please reply with a short answer for this step."),
      );
    }
  }

  // ragSnippets are caller-safe policy lines only (agent-only guidance is filtered upstream)
  if (opts.ragSnippets.length) {
    const cleaned = callerPolicyNote(opts.ragSnippets[0]);
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
    if (
      tr.name === "createCustomer" &&
      tr.data.accountId &&
      tr.data.created === true &&
      !lines.some((l) => l.includes(String(tr.data.accountId)))
    ) {
      lines.push(
        `I've set up demo account ${tr.data.accountId} for ${tr.data.name}.`,
      );
    }
    if (
      tr.name === "lookupAccount" &&
      tr.data.verified &&
      tr.data.name &&
      !lines.some((l) => l.includes(String(tr.data.accountId ?? "")) || l.includes(String(tr.data.name)))
    ) {
      lines.push(`Account on file for ${tr.data.name}.`);
    }
  }

  const joined = stripPlaceholders(lines.filter(Boolean).join("\n\n"));
  if (speakNode.allowParaphrase === false) return joined;
  return joined
    .split("\n\n")
    .map((para) => stripReasks(para, opts.slots))
    .filter(Boolean)
    .join("\n\n");
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

/** Speak one authored caller-safe policy line (never raw corpus guidance). */
export function callerPolicyNote(line: string): string {
  const t = line
    .replace(/\*\*/g, "")
    .replace(/`[^`]*`/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (t.length < 20) return "";
  return `Here's what our policy says: ${t.charAt(0).toLowerCase()}${t.slice(1)}`;
}

const STOP_SHINGLE = 6;

function words(text: string): string[] {
  return text.toLowerCase().replace(/[*`"“”]/g, "").match(/[a-z0-9']+/g) ?? [];
}

/**
 * Drop sentences that leak agent-only guidance: internal labels ("Quick policy note",
 * "Say this", disposition codes like SHIP_LOST) or any 6-word run copied from an
 * agent-only corpus chunk. Caller-safe lines are passed as `allowed` and kept.
 */
export function stripAgentGuidance(text: string, agentTexts: string[], allowed: string[] = []): string {
  const shingles = new Set<string>();
  for (const src of agentTexts) {
    const w = words(src);
    for (let i = 0; i + STOP_SHINGLE <= w.length; i++) shingles.add(w.slice(i, i + STOP_SHINGLE).join(" "));
  }
  for (const ok of allowed) {
    const w = words(ok);
    for (let i = 0; i + STOP_SHINGLE <= w.length; i++) shingles.delete(w.slice(i, i + STOP_SHINGLE).join(" "));
  }
  const paragraphs = text.split(/\n{2,}/);
  const out = paragraphs
    .map((para) =>
      para
        .replace(/\s+/g, " ")
        .trim()
        .split(/(?<=[.!?])\s+/)
        .filter((sentence) => {
          if (/\bquick policy note\b|\bsay this\b|\bagent[- ]only\b|\bpolicy notes\b|\bscript guide\b/i.test(sentence)) return false;
          if (/\b[A-Z]{3,}_[A-Z_]{2,}\b/.test(sentence)) return false; // disposition codes
          const w = words(sentence);
          for (let i = 0; i + STOP_SHINGLE <= w.length; i++) {
            if (shingles.has(w.slice(i, i + STOP_SHINGLE).join(" "))) return false;
          }
          return true;
        })
        .join(" ")
        .trim(),
    )
    .filter(Boolean);
  return out.join("\n\n").trim();
}

const DEFAULT_GREETING_REPLIES = [
  "Hi! What can I help you with today?",
  "Hey there! What's going on — an order, billing, a login, or a return?",
  "Hi again! Tell me what you need and I'll take it from there.",
];

function normalizeLine(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** True when `text` repeats (or opens with) an earlier agent line verbatim */
export function repeatsEarlierAgentLine(text: string, history: HistoryTurn[]): boolean {
  const t = normalizeLine(text);
  if (!t) return false;
  return history.some((h) => {
    if (h.role !== "agent") return false;
    const prior = normalizeLine(h.content);
    if (!prior) return false;
    if (t === prior) return true;
    // Opening with a whole earlier line ("Hello there — how can I help you today? …")
    if (prior.length >= 20 && t.startsWith(prior)) return true;
    // Being a long prefix of an earlier line
    return t.length >= 30 && prior.startsWith(t);
  });
}

/**
 * Short reply when the caller only greets back after the opener. Never identical
 * to the opener or any earlier agent line; rotates through the node's variants.
 */
export function greetingReply(node: FlowNode, history: HistoryTurn[]): string {
  const pool = node.agentSayVariants?.greetingReply?.length
    ? node.agentSayVariants.greetingReply
    : DEFAULT_GREETING_REPLIES;
  const greetsSoFar = history.filter((h) => h.role === "user" && isGreetingOrAck(h.content)).length;
  for (let i = 0; i < pool.length; i++) {
    const pick = pool[(greetsSoFar + i) % pool.length];
    if (!repeatsEarlierAgentLine(pick, history)) return pick;
  }
  return "I'm here whenever you're ready — what can I help you with?";
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
  opts: { skip?: string[] } = {},
): Promise<ToolResult[]> {
  const names = toolsForIntent(intent, node.toolsAllowed, flow.tools);
  // Also auto-run tools listed on the destination-oriented node when slots just filled
  const extra =
    intent === "ask_balance" || intent === "arrange_payment"
      ? ["checkBalance"]
      : intent === "provide_account" || intent === "verify_identity"
        ? ["lookupAccount"]
        : intent === "provide_name" || intent === "no_account"
          ? ["createCustomer"]
          : [];
  const skip = new Set(opts.skip ?? []);
  const unique = [...new Set([...names, ...extra])].filter((n) => {
    if (skip.has(n)) return false;
    if (!(flow.tools.includes(n) || node.toolsAllowed?.includes(n))) return false;
    // Only create a new account when the caller said they don't have one,
    // we have a valid name, and no account is on file yet.
    if (n === "createCustomer") {
      return slots.needsAccount === "true" && Boolean(slots.customerName) && !slots.accountId;
    }
    return true;
  });
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

// ---------------------------------------------------------------------------
// Unsupported-commitment guard
// The demo sends no emails/texts, issues no tracking numbers, and processes no
// refunds. Any promise must be backed by a caller-safe policy line, an authored
// script line, or an actual tool result from this turn.
// ---------------------------------------------------------------------------

const NUMBER_WORDS: Record<string, string> = {
  one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7",
  eight: "8", nine: "9", ten: "10", twelve: "12", fourteen: "14", fifteen: "15",
  thirty: "30", "twenty-four": "24", "forty-eight": "48",
};

function numbersIn(text: string): string[] {
  const t = text.toLowerCase();
  const digits = t.match(/\d+/g) ?? [];
  const words = (t.match(/[a-z-]+/g) ?? []).map((w) => NUMBER_WORDS[w]).filter(Boolean);
  return [...digits, ...words];
}

/** Commitments this demo cannot back unless a fact says so */
const CHANNEL_PROMISE =
  /\b(?:you(?:'ll| will)|we(?:'ll| will)|i(?:'ll| will)|it(?:'ll| will)|(?:is|are|has been|have been) (?:being )?sent)\b[^.!?]{0,80}\b(e-?mails?|texts?|text messages?|sms|letters?|notifications?|confirmations?)\b|\bconfirmation (?:e-?mail|text|sms|message|number|code)\b|\b(?:e-?mail|text|sms)(?:ed)? (?:you|a confirmation)\b/i;
const TRACKING_PROMISE = /\b(?:new|updated|replacement|fresh) tracking\b|\btracking (?:number|link|code|id)\b/i;
const DONE_CLAIM =
  /\b(?:refund|replacement|credit|reversal|exchange|return label|label|shipment|order)\b[^.!?]{0,40}\b(?:has been|have been|is being|was|is now|got)\s+(?:processed|issued|submitted|sent|shipped|approved|initiated|refunded|credited|reversed|dispatched)\b|\bi(?:'ve| have)\s+(?:already\s+)?(?:processed|issued|submitted|sent|shipped|approved|initiated|refunded|credited|reversed|dispatched|ordered)\b/i;
/** "Let me start that process" — an action no tool in this demo performs */
const ACTION_PROMISE =
  /\b(?:let me|i(?:'ll| will)|i'm going to|i am going to|we(?:'ll| will))\s+(?:go ahead and\s+|get\s+)?(?:start(?:ed)?|process|issue|initiate|submit|send|ship|arrange|refund|credit|reverse|expedite|file|put (?:in|through))\b/i;
const RECEIVE_PROMISE = /\byou(?:'ll| will| should)\s+(?:receive|get|see|be getting|hear back|be contacted)\b/i;
const TIMELINE =
  /\b(?:within|in|over|by)\s+(?:the\s+next\s+)?(?:\d+|one|two|three|four|five|seven|ten|twenty-four|forty-eight|a few|a couple of)\s*(?:(?:-|to)\s*\d+\s*)?(?:minutes?|hours?|business days?|days?|weeks?)\b|\b(?:shortly|right away|immediately|by (?:tomorrow|tonight|end of (?:the )?(?:day|week)|monday|tuesday|wednesday|thursday|friday))\b/i;

export type PromiseBacking = {
  toolResults: ToolResult[];
  /** Caller-safe policy lines + authored script lines for this turn */
  facts: string[];
};

function factText(backing: PromiseBacking): string {
  const toolBits = backing.toolResults
    .filter((t) => t.ok)
    .map((t) => `${t.name} ${Object.values(t.data).filter((v) => typeof v === "string" || typeof v === "number").join(" ")}`);
  return [...backing.facts, ...toolBits].join(" \n ").toLowerCase();
}

/** Why a sentence is an unsupported commitment, or null if it is fine */
export function unsupportedPromise(sentence: string, backing: PromiseBacking): string | null {
  const facts = factText(backing);
  const okTools = new Set(backing.toolResults.filter((t) => t.ok).map((t) => t.name));
  const s = sentence.toLowerCase();

  const channel = sentence.match(CHANNEL_PROMISE);
  if (channel) {
    const word = (channel[1] ?? channel[0]).toLowerCase().replace(/^e-?mail.*/, "email").replace(/s$/, "");
    const stem = word.startsWith("email") ? "email" : word.split(" ")[0];
    // Only backed when a fact itself describes that channel being used for the caller
    if (!new RegExp(`\\b(?:by|via|send|sent|receive)\\b[^.]{0,30}\\b${stem}`).test(facts)) return `channel:${stem}`;
  }
  if (TRACKING_PROMISE.test(sentence) && !/\btracking (?:number|link|code|id)\b/.test(facts)) return "tracking";
  if (DONE_CLAIM.test(sentence)) {
    // Only tool results can make something "done"; this demo has no refund/shipping tool
    const caseDone = /\b(?:case|ticket)\b/.test(s) && okTools.has("createCase");
    const callbackDone = /\bcall ?back\b/.test(s) && okTools.has("scheduleCallback");
    const accountDone = /\baccount\b/.test(s) && (okTools.has("createCustomer") || okTools.has("lookupAccount"));
    if (!caseDone && !callbackDone && !accountDone) return "done-claim";
  }
  if (ACTION_PROMISE.test(sentence)) {
    const caseAction = /\b(?:case|ticket)\b/.test(s) && okTools.has("createCase");
    const callbackAction = /\bcall ?back\b/.test(s) && okTools.has("scheduleCallback");
    if (!caseAction && !callbackAction) return "action";
  }
  const timeline = TIMELINE.test(sentence);
  if (timeline) {
    const nums = numbersIn(sentence);
    const backedNums = nums.length > 0 && nums.every((n) => new RegExp(`\\b${n}\\b`).test(facts) || facts.includes(Object.entries(NUMBER_WORDS).find(([, d]) => d === n)?.[0] ?? "\u0000"));
    const vague = /\b(shortly|right away|immediately|by (tomorrow|tonight|end of|monday|tuesday|wednesday|thursday|friday))\b/i.test(sentence);
    const callbackWindow = okTools.has("scheduleCallback") && /\bcall ?back\b/.test(s);
    if (!callbackWindow && (vague || !backedNums)) return "timeline";
  }
  if (RECEIVE_PROMISE.test(sentence)) {
    const backedByTool =
      (/\bcall ?back|\bcall\b/.test(s) && okTools.has("scheduleCallback")) ||
      (/\bcase\b|\bspecialist\b/.test(s) && okTools.has("createCase"));
    const keywords = (s.match(/\b(refund|replacement|credit|exchange|label|trial|support|seats?|analytics)\b/g) ?? []);
    const backedByFact = keywords.length > 0 && keywords.every((k) => facts.includes(k));
    if (!backedByTool && !backedByFact) return "receive";
  }
  return null;
}

/**
 * Remove sentences that promise things no policy line, script line, or tool result
 * backs (confirmation emails/texts, new tracking numbers, "refund processed",
 * invented timelines). Returns the kept text and how many sentences were dropped.
 */
export function stripUnsupportedPromises(
  text: string,
  backing: PromiseBacking,
): { text: string; removed: string[] } {
  const removed: string[] = [];
  const paragraphs = text.split(/\n{2,}/).map((para) =>
    para
      .replace(/\s+/g, " ")
      .trim()
      .split(/(?<=[.!?])\s+/)
      .filter((sentence) => {
        if (/^call outcome:/i.test(sentence)) return true;
        const why = unsupportedPromise(sentence, backing);
        if (why) removed.push(`${why}: ${sentence}`);
        return !why;
      })
      .join(" ")
      .trim(),
  );
  return { text: paragraphs.filter(Boolean).join("\n\n").trim(), removed };
}
