import { completeChat, completeJson, getProviderName } from "@/lib/llm";
import {
  interpolate,
  interpolateLines,
  stripPlaceholders,
} from "@/lib/ikoline/engine";
import type {
  Flow,
  FlowExit,
  FlowNode,
  HistoryTurn,
  SlotMap,
  ToolResult,
} from "@/lib/ikoline/types";

export type ClassifyResult = {
  intent: string | null;
  slots: SlotMap;
  mode: "llm" | "scripted";
};

export type SpeakResult = {
  agentText: string;
  mode: "llm" | "scripted";
};

type ClassifyJson = {
  intent?: string | null;
  slots?: Record<string, unknown>;
};

function historyBlock(history: HistoryTurn[], limit = 6): string {
  return history
    .slice(-limit)
    .map((t) => `${t.role === "user" ? "Caller" : "Agent"}: ${t.content}`)
    .join("\n");
}

function intentCatalog(node: FlowNode): string {
  return node.listenFor
    .map((entry) => {
      const examples = (entry.examples ?? []).slice(0, 4).join(" | ");
      return `- ${entry.intent}${examples ? ` (e.g. ${examples})` : ""}`;
    })
    .join("\n");
}

function sanitizeSlotUpdates(
  incoming: Record<string, unknown> | undefined,
  allowedKeys: string[],
): SlotMap {
  if (!incoming) return {};
  const out: SlotMap = {};
  const allow = new Set(allowedKeys);
  for (const [key, value] of Object.entries(incoming)) {
    if (!allow.has(key)) continue;
    if (typeof value !== "string") continue;
    const trimmed = value.trim().slice(0, 200);
    if (trimmed) out[key] = trimmed;
  }
  return out;
}

function toolFacts(tools: ToolResult[]): string {
  const lines: string[] = [];
  for (const tr of tools) {
    if (!tr.ok) {
      lines.push(`${tr.name}: failed`);
      continue;
    }
    const bits = Object.entries(tr.data)
      .slice(0, 8)
      .map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
      .join(", ");
    lines.push(`${tr.name}: ${bits}`);
  }
  return lines.join("\n") || "(none)";
}

/**
 * LLM classifies intent + optional slot updates for the current node.
 * Returns null fields with mode scripted when provider missing / parse failure
 * — caller should apply keyword fallback.
 */
export async function classifyTurn(opts: {
  flow: Flow;
  node: FlowNode;
  userText: string;
  slots: SlotMap;
  history: HistoryTurn[];
}): Promise<ClassifyResult | null> {
  if (!getProviderName()) return null;

  const allowedIntents = opts.node.listenFor.map((e) => e.intent);
  const slotKeys = [
    ...new Set([
      ...(opts.node.requireSlots ?? []),
      "accountId",
      "last4",
      "reason",
      "need",
      "amount",
      "planMonths",
      "callbackWindow",
      "offer",
      "objection",
      "notes",
    ]),
  ];

  try {
    const result = await completeJson<ClassifyJson>({
      temperature: 0,
      maxTokens: 220,
      messages: [
        {
          role: "system",
          content: [
            "You are the NLP layer for IkoLine, a contact-center call-flow demo by we at Ikosagon.",
            "Classify the caller's latest message for the CURRENT step only.",
            "Return JSON: {\"intent\": string|null, \"slots\": object}.",
            "intent MUST be one of the listed intents, or null if none fit.",
            "Only fill slots you can extract from the caller text. Do not invent account numbers or amounts.",
            "Stay inside the call graph — never invent a new intent name.",
          ].join(" "),
        },
        {
          role: "user",
          content: [
            `VERTICAL: ${opts.flow.vertical}`,
            `FLOW: ${opts.flow.title}`,
            `NODE: ${opts.node.id} (${opts.node.label})`,
            `ALLOWED_INTENTS:\n${intentCatalog(opts.node) || "(none)"}`,
            `CURRENT_SLOTS: ${JSON.stringify(opts.slots)}`,
            `SLOT_KEYS_YOU_MAY_UPDATE: ${slotKeys.join(", ")}`,
            `RECENT_HISTORY:\n${historyBlock(opts.history) || "(none)"}`,
            `CALLER: ${opts.userText}`,
          ].join("\n\n"),
        },
      ],
    });

    if (!result) return null;

    let intent: string | null =
      typeof result.data.intent === "string" ? result.data.intent.trim() : null;
    if (intent === "null" || intent === "") intent = null;
    if (intent && !allowedIntents.includes(intent)) intent = null;

    const slots = sanitizeSlotUpdates(result.data.slots, slotKeys);
    return { intent, slots, mode: "llm" };
  } catch {
    return null;
  }
}

/**
 * LLM drafts a natural agent reply for the node being spoken
 * (destination after transition, or current if staying).
 */
export async function speakTurn(opts: {
  flow: Flow;
  speakNode: FlowNode;
  fromNode: FlowNode;
  userText: string;
  slots: SlotMap;
  history: HistoryTurn[];
  ragContext: string;
  toolResults: ToolResult[];
  exit: FlowExit | null;
  matchedIntent: string | null;
  transitioned: boolean;
}): Promise<SpeakResult | null> {
  if (!getProviderName()) return null;

  const mustSayExact = opts.speakNode.allowParaphrase === false;
  const scriptLines = interpolateLines(
    opts.speakNode.agentSay,
    opts.slots,
    opts.toolResults,
  );
  const mustLead = scriptLines[0] ?? "";
  const scriptGuide = scriptLines.join("\n");

  const system = [
    "You are IkoLine, a professional contact-center agent demo for we at Ikosagon.",
    "Stay in the current call step. Conversational, calm, concise (2–4 short sentences).",
    "Never invent prices, balances, policies, or legal claims beyond POLICY NOTES and TOOL FACTS.",
    "Do not mention being an AI unless asked. Do not break character into a free chat.",
    "Never leave {{placeholders}} in your reply.",
    mustSayExact && mustLead
      ? "COMPLIANCE: Your reply MUST begin with the MUST-SAY line verbatim (same words), then you may add one short natural follow-up sentence."
      : "Use SCRIPT GUIDE as intent and tone — say it naturally; do not dump every line robotically.",
  ]
    .filter(Boolean)
    .join(" ");

  const user = [
    `VERTICAL: ${opts.flow.vertical}`,
    `FROM_NODE: ${opts.fromNode.id} (${opts.fromNode.label})`,
    `SPEAK_NODE: ${opts.speakNode.id} (${opts.speakNode.label})`,
    `TRANSITIONED: ${opts.transitioned ? "yes" : "no"}`,
    `MATCHED_INTENT: ${opts.matchedIntent ?? "null"}`,
    opts.exit ? `EXIT: ${opts.exit.type} — ${opts.exit.label}` : "EXIT: none",
    `SLOTS: ${JSON.stringify(opts.slots)}`,
    `TOOL FACTS:\n${toolFacts(opts.toolResults)}`,
    `POLICY NOTES:\n${opts.ragContext || "(none)"}`,
    mustSayExact && mustLead ? `MUST-SAY (verbatim lead):\n${mustLead}` : "",
    `SCRIPT GUIDE:\n${scriptGuide || "(improvise briefly for this step)"}`,
    `RECENT_HISTORY:\n${historyBlock(opts.history) || "(none)"}`,
    `CALLER: ${opts.userText}`,
    "Write the agent reply only — no JSON, no labels.",
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const result = await completeChat({
      temperature: 0.45,
      maxTokens: 280,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    if (!result) return null;
    let text = stripPlaceholders(result.text);
    // Soft enforce must-say lead
    if (mustSayExact && mustLead) {
      const normalized = text.replace(/\s+/g, " ").trim();
      const lead = mustLead.replace(/\s+/g, " ").trim();
      if (!normalized.toLowerCase().startsWith(lead.toLowerCase().slice(0, Math.min(40, lead.length)))) {
        const rest = text.trim();
        text = rest && rest !== mustLead ? `${mustLead} ${rest}` : mustLead;
      }
    }
    if (opts.exit && !/call outcome/i.test(text)) {
      text = `${text}\n\nCall outcome: ${opts.exit.label}`;
    }
    return { agentText: text.trim(), mode: "llm" };
  } catch {
    return null;
  }
}

/** Ensure opening interpolated scripts never leak braces */
export function safeOpening(flow: Flow, opening: string): string {
  return stripPlaceholders(opening);
}

export function mergeSlots(base: SlotMap, ...updates: SlotMap[]): SlotMap {
  const next: SlotMap = { ...base };
  for (const u of updates) {
    for (const [k, v] of Object.entries(u)) {
      if (v?.trim()) next[k] = v.trim();
    }
  }
  return next;
}

/** Debug helper: interpolate a single template the way the engine does */
export function fillTemplate(
  template: string,
  slots: SlotMap,
  tools: ToolResult[] = [],
): string {
  return stripPlaceholders(interpolate(template, slots, tools));
}
