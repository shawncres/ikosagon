"use client";

import type { Scenario } from "@/lib/ikoagent/scenarios";

/** Cards that start a call and send the scenario's first caller line */
export function ScenarioPicker({
  scenarios,
  disabled,
  onPick,
  onBlank,
}: {
  scenarios: Scenario[];
  disabled: boolean;
  onPick: (s: Scenario) => void;
  onBlank: () => void;
}) {
  return (
    <div aria-label="Pick a scenario">
      <p className="mb-2 font-mono text-[10px] uppercase tracking-wide text-zinc-500">Pick a scenario to start a call</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {scenarios.map((s) => (
          <button
            key={s.id}
            type="button"
            disabled={disabled}
            onClick={() => onPick(s)}
            className="group rounded-xl border border-border bg-black/40 p-3 text-left transition hover:border-accent/60 hover:bg-accent/5 focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent disabled:opacity-40"
          >
            <span className="flex items-center justify-between">
              <span className="text-sm font-semibold text-zinc-100 group-hover:text-accent">{s.label}</span>
              <span className="font-mono text-[10px] text-accent opacity-70 group-hover:opacity-100">Call ›</span>
            </span>
            <span className="mt-0.5 block text-[11px] text-zinc-500">{s.blurb}</span>
            <span className="mt-2 block font-mono text-[11px] italic text-zinc-400">“{s.firstLine}”</span>
          </button>
        ))}
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={onBlank}
        className="mt-2 rounded-xl border border-dashed border-border px-3 py-2 text-xs text-zinc-400 hover:border-accent/50 disabled:opacity-40"
      >
        Start a blank call
      </button>
    </div>
  );
}
