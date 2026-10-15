"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { EXTRA_MAX, sanitizeFreeText } from "@/lib/music/taste/sanitize";
import type { ExtraKey } from "@/lib/music/taste/types";

/**
 * Optional, collapsed-by-default free text for one step. Short, plain text only (links, emails and phone
 * numbers are stripped), never required, and never a wall of text.
 */
export function AddYourOwn({
  stepKey,
  value,
  onChange,
  label = "Add your own",
  placeholder = "A few words, optional",
}: {
  stepKey: ExtraKey;
  value: string;
  onChange: (key: ExtraKey, text: string) => void;
  label?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(Boolean(value));
  const max = EXTRA_MAX[stepKey];
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 font-mono text-[11px] text-zinc-400 hover:text-accent"
      >
        <Plus className="h-3 w-3" /> {label} <span className="text-zinc-600">(optional)</span>
      </button>
    );
  }
  return (
    <label className="block text-xs">
      <span className="mb-1 block font-mono text-[11px] text-zinc-400">
        {label} <span className="text-zinc-600">· optional · up to {max} characters · no links or contact info</span>
      </span>
      <input
        type="text"
        value={value}
        maxLength={max}
        placeholder={placeholder}
        onChange={(e) => onChange(stepKey, e.target.value)}
        onBlur={(e) => onChange(stepKey, sanitizeFreeText(e.target.value, max))}
        className="w-full rounded-xl border border-border bg-black/40 px-3 py-2 text-sm outline-none focus:border-accent"
      />
    </label>
  );
}
