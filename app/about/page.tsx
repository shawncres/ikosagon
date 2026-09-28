import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About",
  description:
    "About Shawn Cooper and Ikosagon: applied AI engineering & QA, RAG, agentic systems, edge/IoT as a service, and production process upgrades.",
};

const skills = [
  "QA automation",
  "Black-box LLM testing",
  "Next.js / TypeScript",
  "Python",
  "RAG & vector DBs",
  "LangChain agents",
  "Edge / IoT (service)",
  "ARM & ESP32 firmware",
  "CRM integrations",
  "Model APIs, including xAI · local models",
  "On-prem & cloud",
  "PWAs / remote desktop",
  "Contact-center NL flows",
];

const timeline = [
  {
    year: "Jul 2025–Present",
    note: "Ikosagon. Founder. Applied AI Engineer & QA. Grounded RAG, tool-calling agents, eval suites, Next.js / Vercel / Resend.",
  },
  {
    year: "Mar 2022–Jun 2025",
    note: "ATTAbotics. QA Analyst. Selenium, pytest, Power BI, Kusto. High-velocity robotics software. The release did not wait.",
  },
  {
    year: "Apr 2020–Feb 2022",
    note: "Intact Financial. Business Systems Analyst. CRM and policy overhaul, telematics, provincial feeds, UAT. A bad calculation was an operations failure.",
  },
  {
    year: "Dec 2017–Apr 2020",
    note: "belairdirect. Licensed P&C. Where the regulated-rules habit started.",
  },
];

export default function AboutPage() {
  return (
    <div className="container-shell section-block">
      <h1 className="mb-4 font-[var(--font-space-grotesk)] text-4xl font-bold">About</h1>
      <p className="font-mono text-sm text-accent">
        Shawn Cooper · Applied AI Engineer &amp; QA · work-from-anywhere
      </p>
      <p className="mt-4 max-w-3xl text-zinc-300">
        Shawn Cooper builds and hardens AI systems that have to behave in production — retrieval that
        cites its sources, agents that refuse when the store is empty, and release discipline from
        Intact Financial and ATTAbotics. Formal QA starts at Intact in 2020; the regulated-rules habit
        started earlier in P&amp;C. Work-from-anywhere.
      </p>
      <p className="mt-4 max-w-3xl text-zinc-300">
        Employers and clients have been in QA and professional services / SMB contexts: robotics
        software release trains, P&amp;C carriers and direct writers, and operators who need CRM and
        policy systems that survive UAT. Through Ikosagon, Shawn ships grounded RAG, regression-minded
        CRM integrations, and edge/IoT as a service — not an Orin-first identity — for teams upgrading
        processes they already run.
      </p>
      <p className="mt-4 max-w-3xl text-zinc-300">
        Specialty areas include chunked retrieval over vector databases (e.g. Chroma), reliable tool
        calling even on small or low-parameter models, and contact-center–style natural-language
        flows. LangChain is in the stack; ElevenLabs and Suno have been evaluated for voice and media
        fits — they are not claimed as live production dependencies on this site. Model APIs
        (including xAI) and local models are both in play; no auto-spend on generation APIs for
        visitor demos. Agile continuous improvement so chatbots and agents get better reactively over
        time.
      </p>

      <section className="mt-10">
        <h2 className="mb-4 text-2xl font-semibold">How a bot earns production</h2>
        <ul className="max-w-3xl space-y-3 text-zinc-300">
          <li>
            <span className="font-semibold text-zinc-100">Source adherence.</span> The answer comes
            from the Chroma chunks, or it fails.
          </li>
          <li>
            <span className="font-semibold text-zinc-100">Refusal.</span> If the store has no support,
            the agent does not invent one.
          </li>
          <li>
            <span className="font-semibold text-zinc-100">Misuse.</span> Injection and off-policy
            answers are cases, not surprises. A failed run becomes the next regression case.
          </li>
          <li>
            <span className="font-semibold text-zinc-100">Token budget.</span> Local models, tight
            context, tool calls only when retrieval is not enough. No auto-spend on generation APIs.
          </li>
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="mb-4 text-2xl font-semibold">Skills</h2>
        <div className="flex flex-wrap gap-3">
          {skills.map((skill) => (
            <span key={skill} className="rounded-full border border-border px-3 py-1 text-sm text-zinc-200">
              {skill}
            </span>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="mb-4 text-2xl font-semibold">Timeline</h2>
        <p className="mb-4 max-w-3xl text-sm text-zinc-400">
          Ikosagon first, then employers (not a full resume). No studio-years blob after 2017.
        </p>
        <div className="space-y-3">
          {timeline.map((item) => (
            <article key={item.year} className="card-surface rounded-xl p-4">
              <p className="font-mono text-sm text-accent">{item.year}</p>
              <p className="text-zinc-300">{item.note}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
