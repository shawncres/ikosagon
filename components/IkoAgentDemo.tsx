"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
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
import type { FlowGraph } from "@/lib/ikoagent/flowGraph";
import { formatCallTime, toolEvent, type DeskToolResult } from "@/lib/ikoagent/desk";
import { SCENARIOS, type Scenario } from "@/lib/ikoagent/scenarios";
import { DeskPanel, type DeskState } from "@/components/ikoagent/DeskPanel";
import { MicButton } from "@/components/ikoagent/MicButton";
import { ScenarioPicker } from "@/components/ikoagent/ScenarioPicker";
import { useMicLevel } from "@/components/ikoagent/useMicLevel";
import { useSpeechInput } from "@/components/ikoagent/useSpeechInput";

type FlowMeta = { id: string; title: string; vertical: string; description: string };
type HistoryTurn = { role: "user" | "agent"; content: string };
type SlotMap = Record<string, string>;
type ExitInfo = { type: string; label: string };
type CallState = "idle" | "connecting" | "live" | "ended";

const VERTICALS: { id: string; label: string; blurb: string }[] = [
  { id: "customer_service", label: "Customer service", blurb: "Verify → diagnose → policy → resolve / escalate" },
  { id: "collections", label: "Collections", blurb: "Identity → disclosure → balance → plan / hardship" },
  { id: "sales", label: "Sales", blurb: "Discover → match offer → objection → close / callback" },
];

const TTS_STORAGE_KEY = "ikoagent-tts-enabled";
const LEGACY_TTS_STORAGE_KEY = "ikoline-tts-enabled";
const TTS_VOLUME_KEY = "ikoagent-tts-volume";

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

function readTtsVolume(): number {
  try {
    const v = Number(window.localStorage.getItem(TTS_VOLUME_KEY));
    if (Number.isFinite(v) && v > 0 && v <= 1) return v;
  } catch {
    /* ignore */
  }
  return 1;
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

const noopSubscribe = () => () => {};
const nowMs = () => Date.now();

const EMPTY_DESK: DeskState = {
  nodeLabel: "",
  slots: {},
  policyLine: null,
  events: [],
  exit: null,
  llm: null,
  mode: null,
  offline: false,
  intent: null,
};

export function IkoAgentDemo() {
  const [flowId, setFlowId] = useState("customer_service");
  const [callState, setCallState] = useState<CallState>("idle");
  const [nodeId, setNodeId] = useState("");
  const [history, setHistory] = useState<HistoryTurn[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exit, setExit] = useState<ExitInfo | null>(null);
  const [turnCount, setTurnCount] = useState(0);
  const [offline, setOffline] = useState(false);
  const [flows, setFlows] = useState<FlowMeta[]>([]);
  const [graph, setGraph] = useState<FlowGraph | null>(null);
  const [path, setPath] = useState<string[]>([]);
  const [desk, setDesk] = useState<DeskState>(EMPTY_DESK);
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const ttsAvailable = hydrated && speechSupported();
  const [ttsPref, setTtsPref] = useState<boolean | null>(null);
  const [volumePref, setVolumePref] = useState<number | null>(null);
  const ttsOn = ttsAvailable && (ttsPref ?? readTtsEnabled());
  const ttsVolume = volumePref ?? (hydrated ? readTtsVolume() : 1);
  const [agentSpeaking, setAgentSpeaking] = useState(false);
  const [callStartedAt, setCallStartedAt] = useState<number | null>(null);
  const [callEndedAt, setCallEndedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [sessionId, setSessionId] = useState("");
  const [flowTitle, setFlowTitle] = useState<string | undefined>();
  const [transcriptTurns, setTranscriptTurns] = useState<DemoTurnLog[]>([]);
  const [provider, setProvider] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);

  const listRef = useRef<HTMLDivElement>(null);
  const ttsOnRef = useRef(true);
  const ttsVolumeRef = useRef(1);
  const listeningRef = useRef(false);
  const sessionIdRef = useRef("");
  const sessionStartedAtRef = useRef("");
  const transcriptRef = useRef<DemoTurnLog[]>([]);
  /** Live call context for turns (refs so a scenario can send right after start) */
  const callRef = useRef({ flowId: "customer_service", nodeId: "", slots: {} as SlotMap, history: [] as HistoryTurn[], turnCount: 0, ended: true });
  const pendingRef = useRef(false);

  const scrollLog = () => {
    requestAnimationFrame(() => {
      if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
    });
  };

  const speakIfEnabled = useCallback((text: string) => {
    // Never talk over the caller (and never let the mic capture the agent's voice)
    if (!ttsOnRef.current || listeningRef.current || !speechSupported()) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(trimmed);
      utter.rate = 1;
      utter.pitch = 1;
      utter.volume = ttsVolumeRef.current;
      const voices = window.speechSynthesis.getVoices();
      const en = voices.find((v) => /^en(-|_)/i.test(v.lang)) ?? voices.find((v) => v.lang.startsWith("en"));
      if (en) utter.voice = en;
      utter.onstart = () => setAgentSpeaking(true);
      utter.onend = () => setAgentSpeaking(false);
      utter.onerror = () => setAgentSpeaking(false);
      window.speechSynthesis.speak(utter);
    } catch {
      setAgentSpeaking(false);
    }
  }, []);

  const stopAgentVoice = useCallback(() => {
    cancelSpeech();
    setAgentSpeaking(false);
  }, []);

  const persistTranscript = useCallback(
    (nextTurns: DemoTurnLog[], opts: { sessionId: string; startedAt: string; flowId: string; flowTitle?: string }) => {
      transcriptRef.current = nextTurns;
      setTranscriptTurns(nextTurns);
      upsertSessionInRing(buildSession({ ...opts, turns: nextTurns }));
      setSavedCount(loadSessionRing().length);
    },
    [],
  );

  // ---- turns ---------------------------------------------------------------------------
  const sendTurn = useCallback(
    async (text: string) => {
      const userText = text.trim();
      const ctx = callRef.current;
      if (!userText || pendingRef.current || ctx.ended) return;
      stopAgentVoice();
      pendingRef.current = true;
      setPending(true);
      setError(null);
      setInput("");
      const priorHistory = ctx.history;
      ctx.history = [...priorHistory, { role: "user", content: userText }];
      setHistory(ctx.history);
      scrollLog();
      const sid = sessionIdRef.current || newSessionId();
      try {
        const res = await fetch("/api/ikoagent/turn", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            flowId: ctx.flowId,
            nodeId: ctx.nodeId,
            slots: ctx.slots,
            history: priorHistory,
            userText,
            turnCount: ctx.turnCount,
            sessionId: sid,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setError(data.error || "Turn failed.");
          return;
        }
        ctx.nodeId = data.nodeId;
        ctx.slots = data.slots || {};
        ctx.history = [...ctx.history, { role: "agent", content: data.agentText }];
        ctx.turnCount += 1;
        setNodeId(data.nodeId);
        setHistory(ctx.history);
        setTurnCount(ctx.turnCount);
        setPath((p) => (p[p.length - 1] === data.nodeId ? p : [...p, data.nodeId]));
        const tools: DeskToolResult[] = Array.isArray(data.toolResults) ? data.toolResults : [];
        const newEvents = tools.map(toolEvent).filter((e): e is string => Boolean(e));
        setDesk((d) => ({
          nodeLabel: data.nodeLabel || data.nodeId,
          slots: data.slots || {},
          policyLine: data.desk?.policyLine ?? null,
          events: [...d.events, ...newEvents.filter((e) => !(e.endsWith("verified") && d.events.includes(e)))],
          exit: data.exit ?? null,
          llm: data.debug?.llm ?? null,
          mode: data.mode ?? null,
          offline: Boolean(data.debug?.offline),
          intent: data.debug?.matchedIntent ?? null,
        }));
        setOffline(Boolean(data.debug?.offline));
        if (data.exit) {
          setExit(data.exit);
          ctx.ended = true;
          setCallState("ended");
          setCallEndedAt(nowMs());
        }
        if (typeof data.flowTitle === "string") setFlowTitle(data.flowTitle);
        const nextProvider = typeof data.provider === "string" ? data.provider : provider;
        setProvider(nextProvider);
        const entry: DemoTurnLog = {
          ts: new Date().toISOString(),
          sessionId: sid,
          flowId: ctx.flowId,
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
          llm: data.debug?.llm,
        };
        persistTranscript([...transcriptRef.current, entry], {
          sessionId: sid,
          startedAt: sessionStartedAtRef.current || new Date().toISOString(),
          flowId: ctx.flowId,
          flowTitle: typeof data.flowTitle === "string" ? data.flowTitle : flowTitle,
        });
        speakIfEnabled(data.agentText);
        scrollLog();
      } catch {
        setError("Network error on this turn.");
      } finally {
        pendingRef.current = false;
        setPending(false);
      }
    },
    [flowTitle, persistTranscript, provider, speakIfEnabled, stopAgentVoice],
  );

  const startCall = useCallback(
    async (id: string, firstLine?: string) => {
      stopAgentVoice();
      pendingRef.current = true;
      setPending(true);
      setCallState("connecting");
      setFlowId(id);
      setError(null);
      setExit(null);
      setTurnCount(0);
      setInput("");
      setCopyStatus(null);
      setDesk(EMPTY_DESK);
      const sid = newSessionId();
      const startedAt = new Date().toISOString();
      sessionIdRef.current = sid;
      sessionStartedAtRef.current = startedAt;
      setSessionId(sid);
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
          setError(data.error || "Could not start the call.");
          setCallState("idle");
          return;
        }
        callRef.current = { flowId: id, nodeId: data.nodeId, slots: {}, history: [{ role: "agent", content: data.agentText }], turnCount: 0, ended: false };
        setNodeId(data.nodeId);
        setPath([data.nodeId]);
        setGraph(data.graph ?? null);
        setDesk({ ...EMPTY_DESK, nodeLabel: data.nodeLabel || data.nodeId, offline: Boolean(data.debug?.offline) });
        setFlowTitle(typeof data.flowTitle === "string" ? data.flowTitle : undefined);
        setHistory(callRef.current.history);
        setOffline(Boolean(data.debug?.offline));
        setProvider(typeof data.provider === "string" ? data.provider : null);
        setCallStartedAt(nowMs());
        setCallEndedAt(null);
        setCallState("live");
        persistTranscript(
          [
            {
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
            },
          ],
          { sessionId: sid, startedAt, flowId: id, flowTitle: typeof data.flowTitle === "string" ? data.flowTitle : undefined },
        );
        if (!firstLine) speakIfEnabled(data.agentText);
        scrollLog();
      } catch {
        setError("Network error starting the call.");
        setCallState("idle");
        return;
      } finally {
        pendingRef.current = false;
        setPending(false);
      }
      if (firstLine) await sendTurn(firstLine);
    },
    [persistTranscript, sendTurn, speakIfEnabled, stopAgentVoice],
  );

  function hangUp() {
    stopAgentVoice();
    speech.cancel();
    callRef.current.ended = true;
    setCallState("ended");
    setCallEndedAt(nowMs());
  }

  function newCall() {
    stopAgentVoice();
    speech.cancel();
    callRef.current = { ...callRef.current, ended: true };
    setCallState("idle");
    setHistory([]);
    setExit(null);
    setDesk(EMPTY_DESK);
    setPath([]);
    setInput("");
    setCallStartedAt(null);
    setCallEndedAt(null);
  }

  // ---- speech input (Web Speech API) -------------------------------------------------
  const speech = useSpeechInput({
    onBeforeStart: () => stopAgentVoice(),
    onInterim: (t) => setInput(t),
    onFinal: (t) => void sendTurn(t),
  });
  const mic = useMicLevel(speech.listening);

  // Keep the newest line in view
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [history.length, pending]);

  useEffect(() => {
    listeningRef.current = speech.listening;
  }, [speech.listening]);

  // Alt+M toggles the mic during a live call
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.key.toLowerCase() !== "m" || !speech.supported) return;
      if (callRef.current.ended || pendingRef.current) return;
      e.preventDefault();
      if (speech.listening) speech.stop();
      else speech.start();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [speech]);

  // ---- TTS prefs, flows, timer ---------------------------------------------------------
  useEffect(() => {
    ttsOnRef.current = ttsOn;
    ttsVolumeRef.current = ttsVolume;
  }, [ttsOn, ttsVolume]);

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
      } finally {
        setSavedCount(loadSessionRing().length);
      }
    })();
  }, []);

  useEffect(() => {
    if (!speechSupported()) return;
    try {
      if (window.localStorage.getItem(TTS_STORAGE_KEY) == null) {
        const legacy = window.localStorage.getItem(LEGACY_TTS_STORAGE_KEY);
        if (legacy === "0" || legacy === "1") window.localStorage.setItem(TTS_STORAGE_KEY, legacy);
      }
    } catch {
      /* private mode etc. */
    }
    const warm = () => void window.speechSynthesis.getVoices();
    warm();
    window.speechSynthesis.addEventListener("voiceschanged", warm);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", warm);
      cancelSpeech();
    };
  }, []);

  useEffect(() => {
    if (callState !== "live") return;
    const t = window.setInterval(() => setNow(nowMs()), 1000);
    return () => window.clearInterval(t);
  }, [callState]);

  function setTtsEnabled(next: boolean) {
    if (!next) stopAgentVoice();
    setTtsPref(next);
    ttsOnRef.current = next;
    try {
      window.localStorage.setItem(TTS_STORAGE_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  function setVolume(v: number) {
    setVolumePref(v);
    ttsVolumeRef.current = v;
    try {
      window.localStorage.setItem(TTS_VOLUME_KEY, String(v));
    } catch {
      /* ignore */
    }
  }

  // ---- transcript export ---------------------------------------------------------------
  function currentSession() {
    const sid = sessionIdRef.current || sessionId;
    if (!sid || transcriptRef.current.length < 1) return null;
    return buildSession({
      sessionId: sid,
      startedAt: sessionStartedAtRef.current || new Date().toISOString(),
      flowId: callRef.current.flowId,
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
    const session = loadSessionRing()[0];
    if (!session) return;
    const ok = await copyText(formatTranscriptPlain(session));
    setCopyStatus(ok ? `Copied saved session ${session.sessionId.slice(0, 8)}…` : "Copy failed");
    window.setTimeout(() => setCopyStatus(null), 3500);
  }

  const live = callState === "live";
  const ended = callState === "ended";
  const inCall = live || ended || callState === "connecting";
  const elapsed = callStartedAt ? (callEndedAt ?? now) - callStartedAt : 0;
  const canExport = transcriptTurns.length > 0;
  const scenarios = SCENARIOS[flowId] ?? [];
  const statusText =
    callState === "idle" ? "Ready" : callState === "connecting" ? "Connecting…" : live ? "Connected" : exit ? `Ended · ${exit.label}` : "Ended";

  return (
    <section className="card-surface neon-border mb-10 rounded-2xl p-4 md:p-6" aria-label="IkoAgent call-flow demo">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mb-1 font-mono text-xs text-accent">IkoAgent · live call · speech in, browser voice out · agent desk</p>
          <h2 className="text-xl font-semibold">Live call demo</h2>
          <p className="mt-1 max-w-2xl text-sm text-zinc-400">
            Pick a scenario, then talk or type as the caller. The graph owns every step and must-say line; the
            model handles intent, details and natural replies inside each step. The desk shows what the agent
            knows, what it cited and what the tools did. No live phone number.
          </p>
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
              onClick={() => {
                setFlowId(v.id);
                if (inCall) newCall();
              }}
              title={meta?.description || v.blurb}
              className={
                active
                  ? "rounded-full border border-accent bg-accent/15 px-3 py-1.5 text-left text-xs text-accent"
                  : "rounded-full border border-border px-3 py-1.5 text-left text-xs text-zinc-300 hover:border-accent/50"
              }
            >
              <span className="block font-semibold">{v.label}</span>
              <span className="block text-[10px] text-zinc-500">{v.blurb}</span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          {/* Call bar */}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/80 bg-black/40 px-3 py-2">
            <div className="flex items-center gap-2" role="status" aria-live="polite">
              <span
                className={`h-2.5 w-2.5 rounded-full ${live ? "bg-accent shadow-[0_0_10px_rgba(43,255,232,0.8)]" : ended ? "bg-zinc-500" : callState === "connecting" ? "animate-pulse bg-amber-300" : "bg-zinc-700"}`}
                aria-hidden
              />
              <span className="text-sm text-zinc-200">{statusText}</span>
              {inCall ? <span className="font-mono text-xs tabular-nums text-zinc-400" aria-label="Call time">{formatCallTime(elapsed)}</span> : null}
            </div>
            <div className="flex items-center gap-2">
              {agentSpeaking ? (
                <span className="flex items-center gap-1.5 font-mono text-[10px] text-accent" aria-live="polite">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent" />
                  </span>
                  Agent speaking
                </span>
              ) : null}
              {speech.listening ? (
                <span className="flex items-center gap-1.5 font-mono text-[10px] text-accent">
                  Listening
                  {mic.available ? (
                    <span className="flex h-3 items-end gap-0.5" aria-label={`Mic level ${Math.round(mic.level * 100)}%`} role="meter" aria-valuenow={Math.round(mic.level * 100)} aria-valuemin={0} aria-valuemax={100}>
                      {[0.15, 0.3, 0.45, 0.6, 0.75].map((th) => (
                        <span key={th} className={`w-1 rounded-sm ${mic.level >= th ? "bg-accent" : "bg-zinc-700"}`} style={{ height: `${4 + th * 10}px` }} />
                      ))}
                    </span>
                  ) : null}
                </span>
              ) : null}
              <span className="font-mono text-[10px] text-zinc-500">
                Turn {turnCount}/20{offline ? " · offline keywords" : provider ? ` · ${provider}` : ""}
              </span>
              {live ? (
                <button type="button" onClick={hangUp} className="rounded-lg border border-red-400/50 px-2.5 py-1 text-xs text-red-300 hover:bg-red-500/10">
                  End call
                </button>
              ) : null}
              {ended ? (
                <button type="button" onClick={newCall} className="rounded-lg border border-accent/60 px-2.5 py-1 text-xs text-accent hover:bg-accent/10">
                  New call
                </button>
              ) : null}
            </div>
          </div>

          {callState === "idle" ? (
            <ScenarioPicker scenarios={scenarios} disabled={pending} onPick={(s: Scenario) => void startCall(flowId, s.firstLine)} onBlank={() => void startCall(flowId)} />
          ) : (
            <div
              ref={listRef}
              className="mb-3 max-h-[24rem] min-h-[12rem] space-y-3 overflow-y-auto rounded-xl border border-border/80 bg-black/30 p-3"
              role="log"
              aria-live="polite"
              aria-relevant="additions"
              aria-label="Call transcript"
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
                  <p className="mb-1 font-mono text-[10px] uppercase tracking-wide text-zinc-500">{message.role === "user" ? "Caller" : "Agent"}</p>
                  <p className="whitespace-pre-wrap">{message.content}</p>
                </article>
              ))}
              {pending ? <p className="font-mono text-[10px] text-zinc-500">Agent is thinking…</p> : null}
            </div>
          )}

          {inCall ? (
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
                disabled={pending || !live || speech.listening}
                placeholder={!live ? "Call ended — start a new call" : speech.listening ? "Listening…" : "Type or hold the mic to talk as the caller…"}
                className={`min-w-0 flex-1 rounded-xl border bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none ring-accent focus:ring-1 ${speech.listening ? "border-accent/70 italic" : "border-border"}`}
                maxLength={800}
                autoComplete="off"
              />
              <div className="flex gap-2">
                <MicButton
                  supported={speech.supported}
                  listening={speech.listening}
                  disabled={pending || !live}
                  onStart={() => speech.start()}
                  onStop={() => speech.stop()}
                />
                <button
                  type="submit"
                  disabled={pending || !live || !input.trim() || speech.listening}
                  className="flex-1 rounded-xl border border-accent bg-accent/15 px-4 py-2 text-sm text-accent disabled:opacity-40 sm:flex-none"
                >
                  {pending ? "…" : "Send"}
                </button>
              </div>
            </form>
          ) : null}

          <p className="mt-2 font-mono text-[10px] text-zinc-600">
            {speech.supported === false
              ? "Speech input isn't supported in this browser (e.g. Firefox) — typing works everywhere."
              : "🔒 Mic: only text is sent to us; your browser does the speech-to-text (Chrome/Edge use the vendor's cloud for it)."}
          </p>
          {speech.error ? (
            <p className="mt-1 font-mono text-[11px] text-amber-300" role="alert">
              {speech.error}
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!ttsAvailable}
              aria-pressed={ttsOn}
              title={!ttsAvailable ? "Browser speechSynthesis not available" : ttsOn ? "Mute agent browser voice" : "Unmute agent browser voice"}
              onClick={() => setTtsEnabled(!ttsOn)}
              className={
                ttsOn && ttsAvailable
                  ? "rounded-xl border border-accent bg-accent/15 px-3 py-1.5 text-xs text-accent"
                  : "rounded-xl border border-border px-3 py-1.5 text-xs text-zinc-300 hover:border-accent/50 disabled:opacity-40"
              }
            >
              {!ttsAvailable ? "Voice unavailable" : ttsOn ? "🔊 Agent voice" : "🔇 Agent muted"}
            </button>
            {ttsAvailable ? (
              <label className="flex items-center gap-1.5 font-mono text-[10px] text-zinc-500">
                Vol
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.1}
                  value={ttsVolume}
                  disabled={!ttsOn}
                  onChange={(e) => setVolume(Number(e.target.value))}
                  aria-label="Agent voice volume"
                  className="h-1 w-20 accent-[var(--accent)]"
                />
              </label>
            ) : null}
            <span className="mx-1 hidden h-4 w-px bg-border sm:block" aria-hidden />
            <button type="button" disabled={!canExport} onClick={() => void handleCopyTranscript()} className="rounded-xl border border-border px-3 py-1.5 text-xs text-zinc-300 hover:border-accent/50 disabled:opacity-40" title="Copy a plain-text transcript">
              Copy transcript
            </button>
            <button type="button" disabled={!canExport} onClick={handleDownloadTranscript} className="rounded-xl border border-border px-3 py-1.5 text-xs text-zinc-300 hover:border-accent/50 disabled:opacity-40" title="Download this session as JSON">
              Download JSON
            </button>
            <button type="button" disabled={savedCount < 1} onClick={() => void handleCopyLastSaved()} className="rounded-xl border border-border px-3 py-1.5 text-xs text-zinc-300 hover:border-accent/50 disabled:opacity-40" title="Copy the most recent session saved in this browser (last 12)">
              Copy last saved ({savedCount})
            </button>
            {copyStatus ? (
              <span className="font-mono text-[10px] text-accent" role="status">
                {copyStatus}
              </span>
            ) : null}
          </div>

          {error ? (
            <p className="mt-2 font-mono text-xs text-amber-300" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <DeskPanel desk={desk} graph={graph} current={nodeId} path={path} />
      </div>

      <p className="mt-4 font-mono text-[10px] text-zinc-600">
        Tip: demo accounts <span className="text-zinc-400">1001</span>, <span className="text-zinc-400">2044</span>,{" "}
        <span className="text-zinc-400">3300</span>. Collections disclosure lines never paraphrase. Agent voice is free
        browser text-to-speech; speech input is the browser&apos;s Web Speech API (Chrome, Edge, Safari) — not a
        production contact-center voice stack. Transcripts stay in this browser (last 12 sessions).
      </p>
    </section>
  );
}
