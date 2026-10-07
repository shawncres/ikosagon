"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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

export function IkoLineDemo() {
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
  const listRef = useRef<HTMLDivElement>(null);

  const scrollLog = () => {
    requestAnimationFrame(() => {
      if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
    });
  };

  const startFlow = useCallback(async (id: string) => {
    setPending(true);
    setError(null);
    setExit(null);
    setToolResults([]);
    setDebugIntent(null);
    setTurnCount(0);
    setSlots({});
    setInput("");
    try {
      const res = await fetch("/api/ikoline/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flowId: id, start: true }),
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
      setHistory([{ role: "agent", content: data.agentText }]);
      setMode(data.mode ?? "scripted");
      setOffline(Boolean(data.debug?.offline));
      scrollLog();
    } catch {
      setError("Network error starting the demo.");
    } finally {
      setPending(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/ikoline/turn");
        const data = await res.json();
        if (data.flows) setFlows(data.flows);
        setOffline(!data.provider);
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
    setPending(true);
    setError(null);
    setInput("");
    setHistory((h) => [...h, { role: "user", content: userText }]);
    try {
      const res = await fetch("/api/ikoline/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flowId,
          nodeId,
          slots,
          history,
          userText,
          turnCount,
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
    } catch {
      setError("Network error on this turn.");
    } finally {
      setPending(false);
    }
  }

  const slotEntries = Object.entries(slots).filter(([, v]) => v);

  return (
    <section
      className="card-surface neon-border mb-10 rounded-2xl p-5 md:p-6"
      aria-label="IkoLine call-flow demo"
    >
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mb-1 font-mono text-xs text-accent">
            IkoLine · shared call-flow skeleton · text-first
          </p>
          <h2 className="text-xl font-semibold">Live call demo</h2>
          <p className="mt-1 max-w-2xl text-sm text-zinc-400">
            Three vertical skins on one engine. The graph owns transitions and must-say lines; the
            model only helps inside the current node. No live phone number. Voice is phase 2.
          </p>
        </div>
        <div className="text-right font-mono text-[10px] text-zinc-500">
          <p>
            Turn {turnCount}/20
            {mode ? ` · ${mode}` : ""}
            {offline ? " · offline keywords" : ""}
          </p>
          {nodeLabel ? <p className="text-accent">Node: {nodeLabel}</p> : null}
          {debugIntent ? <p>Intent: {debugIntent}</p> : null}
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
        <label className="sr-only" htmlFor="ikoline-input">
          Caller reply
        </label>
        <input
          id="ikoline-input"
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
          {/* Phase 2 voice stubs */}
          <button
            type="button"
            disabled
            title="Voice is phase 2 — not wired yet"
            className="rounded-xl border border-dashed border-border px-3 py-2 text-xs text-zinc-600"
          >
            Push-to-talk (soon)
          </button>
          <button
            type="button"
            disabled
            title="TTS is phase 2 — not wired yet"
            className="rounded-xl border border-dashed border-border px-3 py-2 text-xs text-zinc-600"
          >
            Agent voice (soon)
          </button>
        </div>
      </form>

      {error ? (
        <p className="mt-2 font-mono text-xs text-amber-300" role="alert">
          {error}
        </p>
      ) : null}

      <p className="mt-3 font-mono text-[10px] text-zinc-600">
        Tip: try account <span className="text-zinc-400">1001</span>,{" "}
        <span className="text-zinc-400">2044</span>, or <span className="text-zinc-400">3300</span>.
        Collections disclosure nodes never paraphrase. Hobby deploy uses keyword matching when no
        model key is present.
      </p>
    </section>
  );
}
