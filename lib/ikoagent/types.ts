export type FlowVertical = "customer_service" | "collections" | "sales";

export type ExitType = "resolve" | "escalate" | "transfer" | "callback" | "refuse";

export type FlowExit = {
  type: ExitType;
  label: string;
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
      | "greetingReply",
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
  error?: string;
};

export const MAX_TURNS = 20;
