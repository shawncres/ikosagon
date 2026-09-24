"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import WebGLFluidEnhanced from "webgl-fluid-enhanced";

/** Brand dyes from app/globals.css — raise opacity toward 0.32 or lower densityDissipation for stronger trails. */
const BRAND_PALETTE = ["#2bffe8", "#9ca3af", "#fafafa"] as const;

function subscribeReducedMotion(onChange: () => void) {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function getReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function canMountFluid() {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  if (window.innerWidth < 768) return false;
  if ((navigator.hardwareConcurrency ?? 0) > 0 && navigator.hardwareConcurrency <= 4) return false;
  return true;
}

export function FluidBackground() {
  const containerRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useSyncExternalStore(subscribeReducedMotion, getReducedMotion, () => true);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const sync = () => setEnabled(canMountFluid());
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);

  useEffect(() => {
    if (!enabled || prefersReducedMotion) return;
    const el = containerRef.current;
    if (!el) return;

    let fluid: WebGLFluidEnhanced | null = null;
    let lastX = 0;
    let lastY = 0;
    let hasLast = false;
    let pausedByVisibility = false;

    try {
      fluid = new WebGLFluidEnhanced(el);
      fluid.setConfig({
        simResolution: 128,
        dyeResolution: 512,
        densityDissipation: 2.0,
        velocityDissipation: 0.55,
        pressure: 0.2,
        pressureIterations: 16,
        curl: 6,
        splatRadius: 0.14,
        splatForce: 3200,
        shading: false,
        colorful: false,
        colorPalette: [...BRAND_PALETTE],
        hover: true,
        backgroundColor: "#000000",
        transparent: true,
        brightness: 0.25,
        bloom: false,
        sunrays: false,
      });
      fluid.start();

      // pointer-events:none on the layer; drive hover trails from window moves
      const onMove = (event: MouseEvent) => {
        if (!fluid) return;
        if (!hasLast) {
          lastX = event.clientX;
          lastY = event.clientY;
          hasLast = true;
          return;
        }
        const dx = (event.clientX - lastX) * 8;
        const dy = (event.clientY - lastY) * 8;
        lastX = event.clientX;
        lastY = event.clientY;
        fluid.splatAtLocation(event.clientX, event.clientY, dx, dy);
      };

      const onVisibility = () => {
        if (!fluid) return;
        const hidden = document.visibilityState === "hidden";
        if (hidden && !pausedByVisibility) {
          fluid.togglePause(false);
          pausedByVisibility = true;
        } else if (!hidden && pausedByVisibility) {
          fluid.togglePause(false);
          pausedByVisibility = false;
        }
      };

      window.addEventListener("mousemove", onMove, { passive: true });
      document.addEventListener("visibilitychange", onVisibility);

      return () => {
        window.removeEventListener("mousemove", onMove);
        document.removeEventListener("visibilitychange", onVisibility);
        try {
          fluid?.stop();
        } catch {
          // fail silent
        }
        fluid = null;
        el.replaceChildren();
      };
    } catch {
      el.replaceChildren();
      return;
    }
  }, [enabled, prefersReducedMotion]);

  if (!enabled || prefersReducedMotion) return null;

  return (
    <div
      ref={containerRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 h-[100vh] w-[100vw] opacity-25 mix-blend-screen"
    />
  );
}
