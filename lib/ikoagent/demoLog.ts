/** Shared IkoAgent demo transcript types + free structured logging (Vercel stdout). */

export type DemoTurnLog = {
  ts: string;
  sessionId: string;
  flowId: string;
  nodeId: string;
  nodeLabel?: string;
  /** null on opening / start turn */
  userText: string | null;
  agentText: string;
  mode: "llm" | "scripted";
  intent: string | null;
  /** Short slot summary for tone QA — mock accounts only in demos */
  slots: Record<string, string>;
  provider: string | null;
  exit?: { type: string; label: string } | null;
  kind: "start" | "turn";
};

export type DemoSessionTranscript = {
  demoLog: true;
  sessionId: string;
  startedAt: string;
  updatedAt: string;
  flowId: string;
  flowTitle?: string;
  turns: DemoTurnLog[];
};

/** Emit one structured line for Vercel Hobby runtime logs (free, short retention). */
export function logDemoTurn(entry: DemoTurnLog): void {
  try {
    console.info(JSON.stringify({ demoLog: true as const, ...entry }));
  } catch {
    /* never break the turn path */
  }
}

export function logDemoSessionDump(session: DemoSessionTranscript): void {
  try {
    console.info(
      JSON.stringify({
        demoLog: true as const,
        kind: "session_dump",
        sessionId: session.sessionId,
        flowId: session.flowId,
        flowTitle: session.flowTitle,
        startedAt: session.startedAt,
        updatedAt: session.updatedAt,
        turnCount: session.turns.length,
        turns: session.turns,
      }),
    );
  } catch {
    /* ignore */
  }
}

/** Human-readable paste format for Website Ops language review. */
export function formatTranscriptPlain(session: DemoSessionTranscript): string {
  const lines: string[] = [
    `IkoAgent demo transcript`,
    `sessionId: ${session.sessionId}`,
    `flow: ${session.flowId}${session.flowTitle ? ` (${session.flowTitle})` : ""}`,
    `started: ${session.startedAt}`,
    `updated: ${session.updatedAt}`,
    `turns: ${session.turns.length}`,
    `---`,
  ];
  for (const t of session.turns) {
    lines.push(`[${t.ts}] ${t.kind} · node=${t.nodeId}${t.nodeLabel ? ` (${t.nodeLabel})` : ""} · mode=${t.mode} · intent=${t.intent ?? "—"} · provider=${t.provider ?? "none"}`);
    if (Object.keys(t.slots).length) {
      lines.push(`  slots: ${JSON.stringify(t.slots)}`);
    }
    if (t.userText) lines.push(`  Caller: ${t.userText}`);
    lines.push(`  Agent: ${t.agentText}`);
    if (t.exit) lines.push(`  Exit: ${t.exit.type} — ${t.exit.label}`);
    lines.push("");
  }
  return lines.join("\n").trimEnd() + "\n";
}
