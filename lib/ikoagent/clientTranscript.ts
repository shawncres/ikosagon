/** Browser-only session ring buffer + export helpers (no paid storage). */

import type { DemoSessionTranscript, DemoTurnLog } from "@/lib/ikoagent/demoLog";
import { formatTranscriptPlain } from "@/lib/ikoagent/demoLog";

export { formatTranscriptPlain };

const STORAGE_KEY = "ikoagent-demo-sessions-v1";
const LEGACY_STORAGE_KEY = "ikoline-demo-sessions-v1";
const MAX_SESSIONS = 12;

function migrateLegacySessions(): void {
  if (typeof window === "undefined") return;
  try {
    if (window.localStorage.getItem(STORAGE_KEY)) return;
    const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!legacy) return;
    window.localStorage.setItem(STORAGE_KEY, legacy);
  } catch {
    /* ignore */
  }
}

export function newSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `ikoagent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function loadSessionRing(): DemoSessionTranscript[] {
  if (typeof window === "undefined") return [];
  try {
    migrateLegacySessions();
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (s): s is DemoSessionTranscript =>
        Boolean(s) &&
        typeof s === "object" &&
        (s as DemoSessionTranscript).demoLog === true &&
        typeof (s as DemoSessionTranscript).sessionId === "string" &&
        Array.isArray((s as DemoSessionTranscript).turns),
    );
  } catch {
    return [];
  }
}

export function upsertSessionInRing(session: DemoSessionTranscript): void {
  if (typeof window === "undefined") return;
  try {
    const ring = loadSessionRing().filter((s) => s.sessionId !== session.sessionId);
    ring.unshift(session);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ring.slice(0, MAX_SESSIONS)));
  } catch {
    /* private mode / quota — export buttons still work from memory */
  }
}

export function buildSession(opts: {
  sessionId: string;
  startedAt: string;
  flowId: string;
  flowTitle?: string;
  turns: DemoTurnLog[];
}): DemoSessionTranscript {
  return {
    demoLog: true,
    sessionId: opts.sessionId,
    startedAt: opts.startedAt,
    updatedAt: new Date().toISOString(),
    flowId: opts.flowId,
    flowTitle: opts.flowTitle,
    turns: opts.turns,
  };
}

export function downloadSessionJson(session: DemoSessionTranscript): void {
  const blob = new Blob([JSON.stringify(session, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ikoagent-transcript-${session.flowId}-${session.sessionId.slice(0, 8)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}
