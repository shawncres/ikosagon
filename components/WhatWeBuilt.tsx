import Link from "next/link";

/** Short stories from our own products and demos (not client work). Facts only from the project pages and repo. */
const STORIES = [
  {
    name: "IkoAgent",
    kind: "Our own demo",
    href: "/projects/ikoagent",
    problem: "Customer-service and call-center conversations drift: a required disclosure gets skipped, or a caller is sent the wrong way.",
    built: "A call agent that follows call flows we control, for customer service, collections and sales, backed by hundreds of automated conversation checks that run before every change.",
    shows: "We can put AI in front of your customers without losing control of what it says.",
  },
  {
    name: "IkoLearn",
    kind: "Our own product",
    href: "/projects/ikolearn",
    problem: "AI apps can feel slow, or get expensive as more people use them.",
    built: "A learning app that runs on a free AI tier, streams each lesson as it is written, and switches to a backup model when the main one is busy.",
    shows: "We build AI tools that stay quick and affordable, and keep working when a service has a bad day.",
  },
  {
    name: "IkoDesk",
    kind: "Our own sample desk",
    href: "/projects/ikodesk",
    problem: "Two staff members give two different answers about a refund or the hours, because the policy is buried in a file.",
    built: "A help desk that answers from a shop's own documents, shows the source, and says so when the documents don't cover the question.",
    shows: "We can turn the documents you already have into consistent answers for staff and customers.",
  },
];

export function WhatWeBuilt() {
  return (
    <section id="built" className="scroll-mt-24" aria-labelledby="built-title">
      <h2 id="built-title" className="mb-2 text-3xl font-semibold">
        What we&apos;ve built
      </h2>
      <p className="mb-6 max-w-3xl text-zinc-400">
        These are our own products and demos, not client work. Each one shows something we can do for
        your business.
      </p>
      <div className="grid gap-5 md:grid-cols-3">
        {STORIES.map((s) => (
          <article key={s.name} className="card-surface flex flex-col rounded-2xl p-6">
            <p className="mb-1 font-mono text-xs text-accent">{s.kind}</p>
            <h3 className="mb-3 text-2xl font-semibold">{s.name}</h3>
            <dl className="space-y-3 text-sm text-zinc-300">
              <div>
                <dt className="font-semibold text-zinc-100">The problem</dt>
                <dd>{s.problem}</dd>
              </div>
              <div>
                <dt className="font-semibold text-zinc-100">What we built</dt>
                <dd>{s.built}</dd>
              </div>
              <div>
                <dt className="font-semibold text-zinc-100">What it shows you</dt>
                <dd>{s.shows}</dd>
              </div>
            </dl>
            <Link href={s.href} className="mt-4 text-sm text-accent">
              See {s.name} →
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
