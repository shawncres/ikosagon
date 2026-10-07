"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DemoTurnLog } from "@/lib/ikoagent/demoLog";
import {
  buildSession,
  copyText,
  downloadSessionJson,
  formatTranscriptPlain,
  loadSessionRing,
  newSessionId,
  upsertSessionInRing,
} from "@/lib/ikoagent/clientTranscript";

type FlowMeta = {
  id: string;
  title: string;
  vertical: string;
  description: string;
};

type HistoryTurn = { role: "user" | "agent"; content: string };

type SlotMap = Record<string, string>;

type ExitInfo = { type: string; label: string };

type ToolResult = { name: string; ok: boolean; data: Record<string, unknown> };

const VERTICALS: { id: string; label: string; blurb: string }[] = [
  {
    id: "customer_service",
    label: "Customer service",
    blurb: "Verify → diagnose → policy → resolve / escalate",
  },
  {
    id: "collections",
    label: "Collections",
    blurb: "Identity → disclosure → balance → plan / hardship",
  },
  {
    id: "sales",
    label: "Sales",
    blurb: "Discover → match offer → objection → close / callback",
  },
];

const TTS_STORAGE_KEY = "ikoagent-tts-enabled";
const LEGACY_TTS_STORAGE_KEY = "ikoline-tts-enabled";

function readTtsEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const cur = window.localStorage.getItem(TTS_STORAGE_KEY);
    if (cur === "0") return false;
    if (cur === "1") return true;
    const legacy = window.localStorage.getItem(LEGACY_TTS_STORAGE_KEY);
    if (legacy === "0") return false;
    if (legacy === "1") return true;
  } catch {
    /* ignore */
  }
  return true;
}

function speechSupported(): boolean {
  return typeof window !== "undefined" && typeof window.speechSynthesis !== "undefined";
}

function cancelSpeech() {
  if (!speechSupported()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
}

function speakAgentLine(text: string) {
  if (!speechSupported()) return;
  const trimmed = text.trim();
  if (!trimmed) return;
  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(trimmed);
    utter.rate = 1;
    utter.pitch = 1;
    // Prefer an English voice when the browser exposes one; otherwise default.
    const voices = window.speechSynthesis.getVoices();
    const en = voices.find((v) => /^en(-|_)/i.test(v.lang)) ?? voices.find((v) => v.lang.startsWith("en"));
    if (en) utter.voice = en;
    window.speechSynthesis.speak(utter);
  } catch {
    /* graceful no-op */
  }
}

export function IkoAgentDemo() {
  const [flowId, setFlowId] = useState("customer_service");
  const [nodeId, setNodeId] = useState("");
  const [nodeLabel, setNodeLabel] = useState("");
  const [slots, setSlots] = useState<SlotMap>({});
  const [history, setHistory] = useState<HistoryTurn[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exit, setExit] = useState<ExitInfo | null>(null);
  const [turnCount, setTurnCount] = useState(0);
  const [mode, setMode] = useState<"scripted" | "llm" | null>(null);
  const [offline, setOffline] = useState(false);
  const [debugIntent, setDebugIntent] = useState<string | null>(null);
  const [toolResults, setToolResults] = useState<ToolResult[]>([]);
  const [flows, setFlows] = useState<FlowMeta[]>([]);
  /** Browser TTS for agent lines — default ON; remembered in localStorage. */
  const [ttsOn, setTtsOn] = useState(true);
  const [ttsAvailable, setTtsAvailable] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [sessionStartedAt, setSessionStartedAt] = useState("");
  const [flowTitle, setFlowTitle] = useState<string | undefined>();
  const [transcriptTurns, setTranscriptTurns] = useState<DemoTurnLog[]>([]);
  const [provider, setProvider] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const ttsOnRef = useRef(true);
  const sessionIdRef = useRef("");
  const sessionStartedAtRef = useRef("");
  const transcriptRef = useRef<DemoTurnLog[]>([]);

  const scrollLog = () => {
    requestAnimationFrame(() => {
      if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
    });
  };

  const speakIfEnabled = useCallback((agentText: string) => {
    if (!ttsOnRef.current) return;
    speakAgentLine(agentText);
  }, []);

  const persistTranscript = useCallback(
    (nextTurns: DemoTurnLog[], opts: { sessionId: string; startedAt: string; flowId: string; flowTitle?: string }) => {
      transcriptRef.current = nextTurns;
      setTranscriptTurns(nextTurns);
      const session = buildSession({
        sessionId: opts.sessionId,
        startedAt: opts.startedAt,
        flowId: opts.flowId,
        flowTitle: opts.flowTitle,
        turns: nextTurns,
      });
      upsertSessionInRing(session);
      setSavedCount(loadSessionRing().length);
    },
    [],
  );

  useEffect(() => {
    ttsOnRef.current = ttsOn;
  }, [ttsOn]);

  useEffect(() => {
    setSavedCount(loadSessionRing().length);
  }, []);

  useEffect(() => {
    const available = speechSupported();
    setTtsAvailable(available);
    if (!available) {
      setTtsOn(false);
      ttsOnRef.current = false;
      return;
    }
    try {
      const enabled = readTtsEnabled();
      setTtsOn(enabled);
      ttsOnRef.current = enabled;
      // Persist under the new key when we only found a legacy preference
      if (window.localStorage.getItem(TTS_STORAGE_KEY) == null) {
        const legacy = window.localStorage.getItem(LEGACY_TTS_STORAGE_KEY);
        if (legacy === "0" || legacy === "1") {
          window.localStorage.setItem(TTS_STORAGE_KEY, legacy);
        }
      }
    } catch {
      /* private mode etc. — keep default ON */
    }
    // Warm voices list (Chrome/Safari populate async)
    const warm = () => {
      void window.speechSynthesis.getVoices();
    };
    warm();
    window.speechSynthesis.addEventListener("voiceschanged", warm);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", warm);
      cancelSpeech();
    };
  }, []);

  function setTtsEnabled(next: boolean) {
    if (!next) cancelSpeech();
    setTtsOn(next);
    ttsOnRef.current = next;
    try {
      window.localStorage.setItem(TTS_STORAGE_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  const startFlow = useCallback(
    async (id: string) => {
      cancelSpeech();
      setPending(true);
      setError(null);
      setExit(null);
      setToolResults([]);
      setDebugIntent(null);
      setTurnCount(0);
      setSlots({});
      setInput("");
      setCopyStatus(null);
      const sid = newSessionId();
      const startedAt = new Date().toISOString();
      sessionIdRef.current = sid;
      sessionStartedAtRef.current = startedAt;
      setSessionId(sid);
      setSessionStartedAt(startedAt);
      setTranscriptTurns([]);
      transcriptRef.current = [];
      try {
        const res = await fetch("/api/ikoagent/turn", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ flowId: id, start: true, sessionId: sid }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setError(data.error || "Could not start flow.");
          setPending(false);
          return;
        }
        setFlowId(id);
        setNodeId(data.nodeId);
        setNodeLabel(data.nodeLabel || data.nodeId);
        setFlowTitle(typeof data.flowTitle === "string" ? data.flowTitle : undefined);
        setHistory([{ role: "agent", content: data.agentText }]);
        setMode(data.mode ?? "scripted");
        setOffline(Boolean(data.debug?.offline));
        setProvider(typeof data.provider === "string" ? data.provider : null);
        const opening: DemoTurnLog = {
          ts: new Date().toISOString(),
          sessionId: sid,
          flowId: id,
          nodeId: data.nodeId,
          nodeLabel: data.nodeLabel || data.nodeId,
          userText: null,
          agentText: data.agentText,
          mode: data.mode === "llm" ? "llm" : "scripted",
          intent: null,
          slots: {},
          provider: typeof data.provider === "string" ? data.provider : null,
          kind: "start",
        };
        persistTranscript([opening], {
          sessionId: sid,
          startedAt,
          flowId: id,
          flowTitle: typeof data.flowTitle === "string" ? data.flowTitle : undefined,
        });
        speakIfEnabled(data.agentText);
        scrollLog();
      } catch {
        setError("Network error starting the demo.");
      } finally {
        setPending(false);
      }
    },
    [speakIfEnabled, persistTranscript],
  );

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/ikoagent/turn");
        const data = await res.json();
        if (data.flows) setFlows(data.flows);
        setOffline(!data.provider);
        if (typeof data.provider === "string") setProvider(data.provider);
      } catch {
        /* ignore */
      }
      await startFlow("customer_service");
    })();
  }, [startFlow]);

  useEffect(() => {
    scrollLog();
  }, [history]);

  async function sendTurn(text: string) {
    const userText = text.trim();
    if (!userText || pending || exit) return;
    cancelSpeech();
    setPending(true);
    setError(null);
    setInput("");
    setHistory((h) => [...h, { role: "user", content: userText }]);
    const sid = sessionIdRef.current || sessionId || newSessionId();
    try {
      const res = await fetch("/api/ikoagent/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flowId,
          nodeId,
          slots,
          history,
          userText,
          turnCount,
          sessionId: sid,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Turn failed.");
        setPending(false);
        return;
      }
      setNodeId(data.nodeId);
      setNodeLabel(data.nodeLabel || data.nodeId);
      setSlots(data.slots || {});
      setHistory((h) => [...h, { role: "agent", content: data.agentText }]);
      setTurnCount((c) => c + 1);
      setMode(data.mode ?? "scripted");
      setOffline(Boolean(data.debug?.offline));
      setDebugIntent(data.debug?.matchedIntent ?? null);
      setToolResults(Array.isArray(data.toolResults) ? data.toolResults : []);
      if (data.exit) setExit(data.exit);
      if (typeof data.flowTitle === "string") setFlowTitle(data.flowTitle);
      const nextProvider = typeof data.provider === "string" ? data.provider : provider;
      setProvider(nextProvider);
      const entry: DemoTurnLog = {
        ts: new Date().toISOString(),
        sessionId: sid,
        flowId,
        nodeId: data.nodeId,
        nodeLabel: data.nodeLabel || data.nodeId,
        userText,
        agentText: data.agentText,
        mode: data.mode === "llm" ? "llm" : "scripted",
        intent: data.debug?.matchedIntent ?? null,
        slots: data.slots || {},
        provider: nextProvider,
        exit: data.exit ?? null,
        kind: "turn",
      };
      persistTranscript([...transcriptRef.current, entry], {
        sessionId: sid,
        startedAt: sessionStartedAtRef.current || sessionStartedAt || new Date().toISOString(),
        flowId,
        flowTitle: typeof data.flowTitle === "string" ? data.flowTitle : flowTitle,
      });
      speakIfEnabled(data.agentText);
    } catch {
      setError("Network error on this turn.");
    } finally {
      setPending(false);
    }
  }

  function currentSession() {
    const sid = sessionIdRef.current || sessionId;
    if (!sid || transcriptRef.current.length < 1) return null;
    return buildSession({
      sessionId: sid,
      startedAt: sessionStartedAtRef.current || sessionStartedAt || new Date().toISOString(),
      flowId,
      flowTitle,
      turns: transcriptRef.current,
    });
  }

  async function handleCopyTranscript() {
    const session = currentSession();
    if (!session) return;
    const ok = await copyText(formatTranscriptPlain(session));
    setCopyStatus(ok ? "Copied — paste into chat for Website Ops" : "Copy failed");
    window.setTimeout(() => setCopyStatus(null), 3500);
  }

  function handleDownloadTranscript() {
    const session = currentSession();
    if (!session) return;
    downloadSessionJson(session);
    setCopyStatus("Downloaded JSON");
    window.setTimeout(() => setCopyStatus(null), 2500);
  }

  async function handleCopyLastSaved() {
    const ring = loadSessionRing();
    const session = ring[0];
    if (!session) return;
    const ok = await copyText(formatTranscriptPlain(session));
    setCopyStatus(ok ? `Copied saved session ${session.sessionId.slice(0, 8)}…` : "Copy failed");
    window.setTimeout(() => setCopyStatus(null), 3500);
  }

  const slotEntries = Object.entries(slots).filter(([, v]) => v);
  const canExport = transcriptTurns.length > 0;

  return (
    <section
      className="card-surface neon-border mb-10 rounded-2xl p-5 md:p-6"
      aria-label="IkoAgent call-flow demo"
    >
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mb-1 font-mono text-xs text-accent">
            IkoAgent · call-flow + LLM turns · browser TTS · transcripts
          </p>
          <h2 className="text-xl font-semibold">Live call demo</h2>
          <p className="mt-1 max-w-2xl text-sm text-zinc-400">
            Three vertical skins on one engine. The graph owns transitions and must-say lines; Groq
            handles intent, slots, and natural replies inside each node (keyword fallback offline).
            Agent lines can speak via free browser text-to-speech (not production contact-center
            voice). Sessions are saved in this browser so you can Copy / Download a transcript for
            language review. No live phone number.
          </p>
        </div>
        <div className="text-right font-mono text-[10px] text-zinc-500">
          <p>
            Turn {turnCount}/20
            {mode ? ` · ${mode}` : ""}
            {offline ? " · offline keywords" : ""}
            {provider ? ` · ${provider}` : ""}
            {ttsAvailable ? (ttsOn ? " · TTS on" : " · TTS muted") : ""}
          </p>
          {nodeLabel ? <p className="text-accent">Node: {nodeLabel}</p> : null}
          {debugIntent ? <p>Intent: {debugIntent}</p> : null}
          {sessionId ? <p title={sessionId}>Session: {sessionId.slice(0, 8)}…</p> : null}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Vertical skin">
        {VERTICALS.map((v) => {
          const active = flowId === v.id;
          const meta = flows.find((f) => f.id === v.id);
          return (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={active}
              disabled={pending}
              onClick={() => void startFlow(v.id)}
              className={
                active
                  ? "rounded-full border border-accent bg-accent/15 px-3 py-1.5 text-left text-xs text-accent"
                  : "rounded-full border border-border px-3 py-1.5 text-left text-xs text-zinc-300 hover:border-accent/50"
              }
            >
              <span className="block font-semibold">{v.label}</span>
              <span className="block text-[10px] text-zinc-500">
                {meta?.description || v.blurb}
              </span>
            </button>
          );
        })}
      </div>

      {slotEntries.length ? (
        <div className="mb-3 flex flex-wrap gap-1.5" aria-label="Collected slots">
          {slotEntries.map(([key, value]) => (
            <span
              key={key}
              className="rounded-full border border-border bg-black/40 px-2 py-0.5 font-mono text-[10px] text-zinc-300"
            >
              {key}: {value}
            </span>
          ))}
        </div>
      ) : null}

      {exit ? (
        <div
          className="mb-3 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-accent"
          role="status"
        >
          Exit · {exit.type}: {exit.label}
        </div>
      ) : null}

      <div
        ref={listRef}
        className="mb-4 max-h-[22rem] space-y-3 overflow-y-auto rounded-xl border border-border/80 bg-black/30 p-3"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
      >
        {history.map((message, index) => (
          <article
            key={`${message.role}-${index}-${message.content.slice(0, 12)}`}
            className={
              message.role === "user"
                ? "ml-8 rounded-xl bg-accent/10 px-3 py-2 text-sm text-zinc-100"
                : "mr-6 rounded-xl border border-border px-3 py-2 text-sm text-zinc-200"
            }
          >
            <p className="mb-1 font-mono text-[10px] uppercase tracking-wide text-zinc-500">
              {message.role === "user" ? "Caller" : "Agent"}
            </p>
            <p className="whitespace-pre-wrap">{message.content}</p>
          </article>
        ))}
      </div>

      {toolResults.length ? (
        <div className="mb-3 rounded-xl border border-border/60 bg-black/20 px-3 py-2 font-mono text-[10px] text-zinc-500">
          Tools:{" "}
          {toolResults
            .map((t) => `${t.name}${t.ok ? "" : "(!)"}`)
            .join(" · ")}
        </div>
      ) : null}

      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          void sendTurn(input);
        }}
      >
        <label className="sr-only" htmlFor="ikoagent-input">
          Caller reply
        </label>
        <input
          id="ikoagent-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={pending || Boolean(exit)}
          placeholder={
            exit ? "Call ended — restart to try another path" : "Type the caller’s reply…"
          }
          className="min-w-0 flex-1 rounded-xl border border-border bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none ring-accent focus:ring-1"
          maxLength={800}
          autoComplete="off"
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={pending || Boolean(exit) || !input.trim()}
            className="rounded-xl border border-accent bg-accent/15 px-4 py-2 text-sm text-accent disabled:opacity-40"
          >
            {pending ? "…" : "Send"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => void startFlow(flowId)}
            className="rounded-xl border border-border px-4 py-2 text-sm text-zinc-300 hover:border-accent/50"
          >
            Restart
          </button>
          <button
            type="button"
            disabled
            title="Microphone / STT is still phase 2"
            className="rounded-xl border border-dashed border-border px-3 py-2 text-xs text-zinc-600"
          >
            Push-to-talk (soon)
          </button>
          <button
            type="button"
            disabled={!ttsAvailable}
            aria-pressed={ttsOn}
            title={
              !ttsAvailable
                ? "Browser speechSynthesis not available"
                : ttsOn
                  ? "Mute agent browser TTS"
                  : "Unmute agent browser TTS"
            }
            onClick={() => setTtsEnabled(!ttsOn)}
            className={
              ttsOn && ttsAvailable
                ? "rounded-xl border border-accent bg-accent/15 px-3 py-2 text-xs text-accent"
                : "rounded-xl border border-border px-3 py-2 text-xs text-zinc-300 hover:border-accent/50 disabled:opacity-40"
            }
          >
            {!ttsAvailable ? "TTS unavailable" : ttsOn ? "🔊 Agent voice" : "🔇 Agent muted"}
          </button>
        </div>
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="Transcript export">
        <button
          type="button"
          disabled={!canExport}
          onClick={() => void handleCopyTranscript()}
          className="rounded-xl border border-border px-3 py-1.5 text-xs text-zinc-300 hover:border-accent/50 disabled:opacity-40"
          title="Copy a plain-text transcript to paste into chat for language review"
        >
          Copy transcript
        </button>
        <button
          type="button"
          disabled={!canExport}
          onClick={handleDownloadTranscript}
          className="rounded-xl border border-border px-3 py-1.5 text-xs text-zinc-300 hover:border-accent/50 disabled:opacity-40"
          title="Download this session as JSON"
        >
          Download JSON
        </button>
        <button
          type="button"
          disabled={savedCount < 1}
          onClick={() => void handleCopyLastSaved()}
          className="rounded-xl border border-border px-3 py-1.5 text-xs text-zinc-300 hover:border-accent/50 disabled:opacity-40"
          title="Copy the most recent session saved in this browser (last 12)"
        >
          Copy last saved ({savedCount})
        </button>
        {copyStatus ? (
          <span className="font-mono text-[10px] text-accent" role="status">
            {copyStatus}
          </span>
        ) : (
          <span className="font-mono text-[10px] text-zinc-600">
            Free local logging — paste into chat so Website Ops can review tone
          </span>
        )}
      </div>

      {error ? (
        <p className="mt-2 font-mono text-xs text-amber-300" role="alert">
          {error}
        </p>
      ) : null}

      <p className="mt-3 font-mono text-[10px] text-zinc-600">
        Tip: try account <span className="text-zinc-400">1001</span>,{" "}
        <span className="text-zinc-400">2044</span>, or <span className="text-zinc-400">3300</span>.
        Collections disclosure nodes never paraphrase. Hobby deploy uses keyword matching when no
        model key is present. Agent voice uses free browser TTS (system voices) — not a production
        contact-center voice stack. Transcripts stay in this browser (ring of 12); nothing is written
        to a paid database.
      </p>
    </section>
  );
}
