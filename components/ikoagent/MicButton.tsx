"use client";

import { useRef } from "react";

const HOLD_MS = 350;

/**
 * Hold to talk (release sends), or tap to toggle (tap again / pause to send).
 * Keyboard: Enter/Space toggles; Alt+M is wired by the parent.
 */
export function MicButton({
  supported,
  listening,
  disabled,
  onStart,
  onStop,
}: {
  supported: boolean | null;
  listening: boolean;
  disabled: boolean;
  onStart: () => void;
  onStop: () => void;
}) {
  const downAt = useRef(0);
  const holding = useRef(false);

  if (supported === false) {
    return (
      <button
        type="button"
        disabled
        title="Speech input isn't supported in this browser (e.g. Firefox) — type instead"
        aria-label="Microphone unavailable in this browser"
        className="rounded-xl border border-dashed border-border px-3 py-2 text-xs text-zinc-600"
      >
        🎙 n/a
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled || supported === null}
      aria-pressed={listening}
      aria-label={listening ? "Stop listening and send" : "Hold to talk, or tap to start listening (Alt+M)"}
      title={listening ? "Listening — release or tap to send" : "Hold to talk · tap to toggle · Alt+M"}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        holding.current = true;
        downAt.current = Date.now();
        if (listening) {
          holding.current = false;
          onStop();
        } else {
          onStart();
        }
      }}
      onPointerUp={() => {
        if (holding.current && Date.now() - downAt.current > HOLD_MS) onStop();
        holding.current = false;
      }}
      onPointerCancel={() => {
        if (holding.current) onStop();
        holding.current = false;
      }}
      onClick={(e) => {
        // Keyboard activation (detail 0); pointer clicks are handled above
        if (e.detail !== 0) return;
        if (listening) onStop();
        else onStart();
      }}
      onContextMenu={(e) => e.preventDefault()}
      className={
        listening
          ? "relative select-none touch-none rounded-xl border border-accent bg-accent/25 px-4 py-2 text-sm text-accent shadow-[0_0_18px_rgba(43,255,232,0.45)]"
          : "relative select-none touch-none rounded-xl border border-border px-4 py-2 text-sm text-zinc-200 hover:border-accent/60 disabled:opacity-40"
      }
    >
      {listening ? (
        <span className="absolute -right-1 -top-1 h-2.5 w-2.5 animate-ping rounded-full bg-accent" aria-hidden />
      ) : null}
      {listening ? "● Listening" : "🎙 Hold to talk"}
    </button>
  );
}
