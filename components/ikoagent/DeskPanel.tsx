"use client";

import { useState } from "react";
import type { FlowGraph } from "@/lib/ikoagent/flowGraph";
import { deskSlots } from "@/lib/ikoagent/desk";
import { FlowMap } from "./FlowMap";

export type DeskState = {
  nodeLabel: string;
  slots: Record<string, string>;
  policyLine: string | null;
  events: string[];
  exit: { type: string; label: string } | null;
  llm: { call?: string; reply?: string } | null;
  mode: "scripted" | "llm" | null;
  offline: boolean;
  intent: string | null;
};

function modelBadge(llm: DeskState["llm"], mode: DeskState["mode"], offline: boolean): { text: string; title: string } {
  if (offline) return { text: "keywords", title: "No model key on this deploy — keyword matching + scripted lines" };
  if (!llm?.call) return { text: mode ?? "—", title: "Waiting for the first turn" };
  return {
    text: `${llm.call}${llm.reply ? ` · ${llm.reply}` : ""}`,
    title: "Model request status · how its draft reply was used (debug.llm)",
  };
}

/** Agent desk: current step, collected facts, cited policy line, tool events, outcome, flow map */
export function DeskPanel({
  desk,
  graph,
  current,
  path,
}: {
  desk: DeskState;
  graph: FlowGraph | null;
  current: string;
  path: string[];
}) {
  const [open, setOpen] = useState(false);
  const rows = deskSlots(desk.slots);
  const badge = modelBadge(desk.llm, desk.mode, desk.offline);

  return (
    <aside className="rounded-xl border border-border/80 bg-black/30 p-3" aria-label="Agent desk">
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[10px] uppercase tracking-wide text-accent">Agent desk</p>
        <span
          className="rounded-full border border-border px-2 py-0.5 font-mono text-[9px] text-zinc-500"
          title={badge.title}
          data-testid="model-badge"
        >
          model: {badge.text}
        </span>
        <button
          type="button"
          className="rounded-lg border border-border px-2 py-0.5 text-[10px] text-zinc-400 lg:hidden"
          aria-expanded={open}
          aria-controls="ikoagent-desk-body"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? "Hide" : "Show"}
        </button>
      </div>

      <div id="ikoagent-desk-body" className={`${open ? "block" : "hidden"} mt-3 space-y-3 lg:block`}>
        <section aria-label="Current step">
          <p className="font-mono text-[10px] text-zinc-500">Current step</p>
          <p className="text-sm text-zinc-100">
            {desk.nodeLabel || "—"}
            {desk.intent ? <span className="ml-2 font-mono text-[10px] text-zinc-500">intent: {desk.intent}</span> : null}
          </p>
        </section>

        <section aria-label="Collected details">
          <p className="mb-1 font-mono text-[10px] text-zinc-500">Collected</p>
          {rows.length ? (
            <dl className="grid grid-cols-[5rem_1fr] gap-x-2 gap-y-0.5 text-xs">
              {rows.map((r) => (
                <div key={r.label} className="contents">
                  <dt className="text-zinc-500">{r.label}</dt>
                  <dd className="truncate text-zinc-200">{r.value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-xs text-zinc-600">Nothing yet</p>
          )}
        </section>

        {desk.policyLine ? (
          <section aria-label="Policy cited">
            <p className="mb-1 font-mono text-[10px] text-zinc-500">Policy cited</p>
            <blockquote className="border-l-2 border-accent/60 pl-2 text-xs text-zinc-300">{desk.policyLine}</blockquote>
          </section>
        ) : null}

        <section aria-label="Tool events">
          <p className="mb-1 font-mono text-[10px] text-zinc-500">Tool events</p>
          {desk.events.length ? (
            <ul className="space-y-0.5 font-mono text-[11px] text-zinc-300">
              {desk.events.map((e, i) => (
                <li key={`${i}-${e}`}>
                  <span className="text-accent">›</span> {e}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-zinc-600">None yet</p>
          )}
        </section>

        <section aria-label="Call outcome">
          <p className="mb-1 font-mono text-[10px] text-zinc-500">Outcome</p>
          <p className={desk.exit ? "text-xs text-accent" : "text-xs text-zinc-600"}>
            {desk.exit ? desk.exit.label : "In progress"}
          </p>
        </section>

        {graph ? (
          <section aria-label="Live flow map">
            <p className="mb-1 font-mono text-[10px] text-zinc-500">
              Flow map <span className="text-zinc-600">· lit = current · traced = visited · amber = verbatim</span>
            </p>
            <FlowMap graph={graph} current={current} path={path} ended={Boolean(desk.exit)} />
          </section>
        ) : null}
      </div>
    </aside>
  );
}
