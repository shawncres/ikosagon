import type { Metadata } from "next";
import Link from "next/link";
import { INTRO_CALL_HREF, StartSmall } from "@/components/StartSmall";
import { WhatWeBuilt } from "@/components/WhatWeBuilt";

export const metadata: Metadata = {
  title: "Work with us",
  description:
    "Start small with a process check-in: we learn one workflow, show where time is lost and what we'd fix first. Fixed scope, quoted up front, for owner-led businesses of about 5 to 100 people.",
};

const STEPS = [
  { title: "A short intro call", body: "You tell us about your business and the workflow that bothers you most. No preparation needed." },
  { title: "A fixed-scope quote", body: "We send a clear scope for the check-in, quoted up front, so you know what you're getting." },
  { title: "The check-in", body: "We learn that one workflow closely, then show you where time is lost and what we'd fix first." },
  { title: "An optional pilot", body: "If it makes sense, we build a small pilot of the first fix. If not, you keep the findings." },
];

export default function WorkWithUsPage() {
  return (
    <div className="container-shell section-block space-y-12">
      <header>
        <h1 className="mb-4 font-[var(--font-space-grotesk)] text-4xl font-bold">Work with us</h1>
        <p className="max-w-3xl text-zinc-300">
          We at Ikosagon work with owner-led businesses of roughly 5 to 100 people, in any industry. The
          easiest way to start is small: one workflow, a short, focused engagement, and a clear picture
          of what to fix first.
        </p>
      </header>
      <StartSmall moreLink={false} />
      <section aria-labelledby="steps-title">
        <h2 id="steps-title" className="mb-6 text-3xl font-semibold">
          How it goes
        </h2>
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => (
            <li key={step.title} className="rounded-xl border border-border p-4">
              <p className="mb-1 font-mono text-sm text-accent">{String(i + 1).padStart(2, "0")}</p>
              <h3 className="mb-2 font-semibold text-zinc-100">{step.title}</h3>
              <p className="text-sm text-zinc-300">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>
      <WhatWeBuilt />
      <section className="card-surface rounded-2xl p-6 md:p-8">
        <h2 className="mb-3 text-2xl font-semibold">Ready when you are</h2>
        <p className="mb-5 max-w-3xl text-zinc-300">
          Tell us a little about your business and we&apos;ll suggest a time to talk.
        </p>
        <Link href={INTRO_CALL_HREF} className="rounded-xl bg-accent px-4 py-2 font-semibold text-black">
          Book a short intro call
        </Link>
      </section>
    </div>
  );
}
