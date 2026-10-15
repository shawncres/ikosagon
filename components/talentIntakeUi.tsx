"use client";

import { SkipForward } from "lucide-react";

export function Chip({
  label,
  sub,
  active,
  onClick,
}: {
  label: string;
  sub?: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-left text-sm transition ${
        active
          ? "border-accent/60 bg-accent/15 text-accent"
          : "border-border text-zinc-300 hover:border-accent/40"
      }`}
    >
      {label}
      {sub ? <span className="block font-mono text-[10px] text-zinc-500">{sub}</span> : null}
    </button>
  );
}

export function SkipButton({ onClick, disabled, label = "Skip" }: { onClick: () => void; disabled?: boolean; label?: string }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-xl border border-border px-4 py-2 text-sm text-zinc-300 hover:border-accent/40 disabled:opacity-50"
    >
      <SkipForward className="h-4 w-4" /> {label}
    </button>
  );
}

export const btn = "rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-black disabled:opacity-50";
export const btnGhost =
  "rounded-xl border border-border px-4 py-2 text-sm text-zinc-300 hover:border-accent/40 disabled:opacity-50";
