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
};

export type Flow = {
  id: string;
  title: string;
  vertical: FlowVertical;
  description: string;
  start: string;
  /** Folder name under content/ikoline/corpus/ */
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
  };
  error?: string;
};

export const MAX_TURNS = 20;
