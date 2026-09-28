"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { RingGlow } from "@/components/RingGlow";

const H1_LINES = [
  "Upgrade your existing processes for a post-AGI future.",
  "Hireable AI systems, edge software, and production process upgrades.",
  "Grounded RAG, reliable agents, and edge/IoT that hold up in production.",
  "Post-AGI workflows: lean builds for high-volume systems engineering.",
] as const;

const ROTATE_MS = 6500;

export function Hero() {
  const prefersReducedMotion = useReducedMotion();
  const [index, setIndex] = useState(0);

  const go = useCallback((delta: number) => {
    setIndex((current) => (current + delta + H1_LINES.length) % H1_LINES.length);
  }, []);

  useEffect(() => {
    if (prefersReducedMotion) return;
    const id = window.setInterval(() => {
      setIndex((current) => (current + 1) % H1_LINES.length);
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, [prefersReducedMotion]);

  const activeLine = prefersReducedMotion ? H1_LINES[0] : H1_LINES[index];

  return (
    <section className="section-block relative overflow-x-clip overflow-y-visible">
      <div className="container-shell grid items-center gap-10 md:grid-cols-[1.2fr_1fr]">
        <div className="space-y-6">
          <p className="font-mono text-sm text-accent">
            Edge · embedded · RAG · agentic systems · IkoArtist
          </p>
          <div className="relative min-h-[7.5rem] md:min-h-[8.5rem]" aria-live="polite" aria-atomic="true">
            <AnimatePresence mode="wait" initial={false}>
              <motion.h1
                key={prefersReducedMotion ? "static" : index}
                initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={prefersReducedMotion ? undefined : { opacity: 0, y: -10 }}
                transition={{ duration: prefersReducedMotion ? 0 : 0.35 }}
                className="font-[var(--font-space-grotesk)] text-5xl leading-tight font-bold md:text-6xl"
              >
                {activeLine}
              </motion.h1>
            </AnimatePresence>
          </div>
          {!prefersReducedMotion ? (
            <div className="flex flex-wrap items-center gap-3" aria-label="Headline rotation controls">
              <button
                type="button"
                onClick={() => go(-1)}
                className="rounded-lg border border-border px-3 py-1 text-xs text-zinc-300 transition hover:border-accent"
              >
                Previous
              </button>
              <div className="flex gap-1.5" role="tablist" aria-label="Headline slides">
                {H1_LINES.map((line, i) => (
                  <button
                    key={line}
                    type="button"
                    role="tab"
                    aria-selected={i === index}
                    aria-label={`Show headline ${i + 1}`}
                    onClick={() => setIndex(i)}
                    className={
                      i === index
                        ? "h-2 w-6 rounded-full bg-accent"
                        : "h-2 w-2 rounded-full bg-border transition hover:bg-accent/50"
                    }
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => go(1)}
                className="rounded-lg border border-border px-3 py-1 text-xs text-zinc-300 transition hover:border-accent"
              >
                Next
              </button>
            </div>
          ) : null}
          <p className="max-w-xl text-zinc-300">
            We at Ikosagon ship grounded RAG, reliable tool-calling agents, CRM-grade integrations, and
            edge/IoT software — on-prem or cloud — so teams upgrade processes without inventing
            vanity metrics.
          </p>
          <p className="max-w-xl font-mono text-sm text-zinc-400">
            The model is a black box. Retrieved chunks are the spec. A wrong or unsourced answer is a
            defect.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/projects" className="rounded-xl bg-accent px-5 py-2 font-semibold text-black transition hover:opacity-90">
              View Projects
            </Link>
            <Link href="/contact" className="rounded-xl border border-border px-5 py-2 transition hover:border-accent">
              Start a project
            </Link>
          </div>
        </div>
        <motion.div
          animate={prefersReducedMotion ? undefined : { y: [0, -10, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          className="mx-auto flex min-h-[260px] min-w-[260px] items-center justify-center overflow-visible"
        >
          <RingGlow size={220} />
        </motion.div>
      </div>
    </section>
  );
}
