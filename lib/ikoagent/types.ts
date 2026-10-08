export type FlowVertical = "customer_service" | "collections" | "sales";

export type ExitType = "resolve" | "escalate" | "transfer" | "callback" | "refuse";

export type FlowExit = {
  type: ExitType;
  label: string;
  /**
   * Close line spoken when the call ends through this exit (instead of the node's
   * own prompt, which the caller already heard). Paraphrasable; no must-say lead.
   */
  say?: string[];
  /** logDisposition code recorded when the call ends here (node must allow the tool) */
  disposition?: string;
};

export type ListenIntent = {
  intent: string;
  examples?: string[];
};

export type FlowTransition = {
  /** Intent name, "*" (any), or "slots_filled" */
  on: string;
  to: string;
  whenSlotsFilled?: string[];
};

export type FlowNode = {
  id: string;
  label: string;
  /** Must-say / scripted lines (agent speaks these; LLM may lightly paraphrase if allowed) */
  agentSay: string[];
  /** Default false for compliance-heavy nodes */
  allowParaphrase?: boolean;
  listenFor: ListenIntent[];
  requireSlots?: string[];
  rag?: { queryHint?: string; required?: boolean };
  transitions: FlowTransition[];
  exits?: FlowExit[];
  toolsAllowed?: string[];
  /**
   * When the flow arrives here with requireSlots already met in the same turn
   * (e.g. name + "no account" at greet → account created on entry), stay on this
   * node until these extra slots are also known instead of chain-skipping past it.
   * Lets verify ask "what can I help you with?" before diagnose.
   */
  holdForSlots?: string[];
  /**
   * Clarify-before-exit: when the caller's intent is one of `intents` and the node stays
   * put, `slot` counts the clarifications given. Transitions gated with
   * whenSlotsFilled: [slot] (e.g. wrong party → exit) only fire after one clarification.
   */
  clarify?: { intents: string[]; slot: string };
  /**
   * The caller is not verified yet: model drafts mentioning debts, balances or payments
   * are rejected (scripted line instead), so nothing is disclosed to a third party.
   */
  noDisclosure?: boolean;
  /**
   * Optional context-aware script variants (paraphrasable nodes only).
   * knownName: caller gave a name but no account yet.
   * accountNotFound: caller gave digits that did not match an account.
   * knownReason: issue topic already captured (avoid re-asking "what happened?").
   * reprompt: staying on this node without new info (skip the long intro).
   */
  agentSayVariants?: Partial<
    Record<
      | "knownName"
      | "accountNotFound"
      | "knownReason"
      | "reprompt"
      /** Account just created this turn, issue not known yet */
      | "accountCreated"
      /** Account on file, issue not known yet */
      | "accountReady"
      /** Caller is new but has not given a name yet */
      | "needsName"
      /** Caller is new and named; account create pending / unavailable */
      | "settingUp"
      /** Caller only greeted back after the opener */
      | "greetingReply"
      /** scheduleCallback succeeded this turn: confirm the real callback id + window */
      | "scheduled"
      /** First clarification (clarify intents), e.g. "this line is for existing accounts…" */
      | "clarify"
      /** Later clarification once the first one was already said */
      | "clarifyAgain",
      string[]
    >
  >;
};

export type Flow = {
  id: string;
  title: string;
  vertical: FlowVertical;
  description: string;
  start: string;
  /** Folder name under content/ikoagent/corpus/ */
  ragCorpus?: string;
  tools: string[];
  nodes: Record<string, FlowNode>;
};

export type SlotMap = Record<string, string>;

export type HistoryTurn = {
  role: "user" | "agent";
  content: string;
};

export type ToolResult = {
  name: string;
  ok: boolean;
  data: Record<string, unknown>;
};

export type TurnRequest = {
  flowId: string;
  nodeId: string;
  slots: SlotMap;
  history: HistoryTurn[];
  userText: string;
  /** Client-tracked turn count for the session */
  turnCount?: number;
};

export type TurnResponse = {
  ok: boolean;
  nodeId: string;
  agentText: string;
  slots: SlotMap;
  toolResults?: ToolResult[];
  exit?: FlowExit;
  mode?: "scripted" | "llm";
  debug?: {
    matchedIntent: string | null;
    ragHits: { title: string; heading: string; score: number }[];
    offline?: boolean;
    /** Why a turn was scripted vs LLM (see DemoTurnLog.llm) */
    llm?: { call?: string; reply?: string };
  };
  /**
   * Agent desk extras. policyLine is the authored caller-facing policy line for this
   * turn (rag.required nodes only) — never agent-only guidance or corpus notes.
   */
  desk?: { policyLine: string | null };
  error?: string;
};

export const MAX_TURNS = 20;
