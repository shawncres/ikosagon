"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function getSnapshot() {
  return window.matchMedia(QUERY).matches;
}

/** The server can't see the visitor's motion setting, so it renders the full-motion UI. */
function getServerSnapshot() {
  return false;
}

/**
 * Hydration-safe "prefers reduced motion".
 *
 * framer-motion's useReducedMotion() reads matchMedia during the first client render, so for
 * reduced-motion visitors the client tree differs from the server HTML and React throws #418.
 * useSyncExternalStore renders with the server snapshot while hydrating, then re-renders with
 * the real value, so the first client render always matches the HTML.
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
