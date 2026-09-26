"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { RingGlow } from "@/components/RingGlow";

export function Hero() {
  return (
    <section className="section-block relative overflow-x-clip overflow-y-visible">
      <div className="container-shell grid items-center gap-10 md:grid-cols-[1.2fr_1fr]">
        <div className="space-y-6">
          <p className="font-mono text-sm text-accent">
            Edge · embedded · RAG · agentic systems · education product
          </p>
          <h1 className="font-[var(--font-space-grotesk)] text-5xl leading-tight font-bold md:text-6xl">
            Production AI and systems engineering for lean, high-volume workflows.
          </h1>
          <p className="max-w-xl text-zinc-300">
            Ikosagon ships grounded RAG, reliable tool-calling agents, CRM-grade integrations, and
            edge/IoT software — on-prem or cloud — so teams upgrade processes without inventing
            vanity metrics.
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
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          className="mx-auto flex min-h-[260px] min-w-[260px] items-center justify-center overflow-visible"
        >
          <RingGlow size={220} />
        </motion.div>
      </div>
    </section>
  );
}
