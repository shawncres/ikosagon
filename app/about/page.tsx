import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About",
  description:
    "About Shawn Cooper and Ikosagon: applied AI engineering & QA, RAG, agentic systems, edge/IoT as a service, and production process upgrades.",
};

const skills = [
  "Next.js / TypeScript",
  "Python",
  "RAG & vector DBs",
  "LangChain agents",
  "Edge / IoT (service)",
  "ARM & ESP32 firmware",
  "CRM integrations",
  "QA automation",
  "Model APIs, including xAI · local models",
  "On-prem & cloud",
  "PWAs / remote desktop",
  "Contact-center NL flows",
];

const timeline = [
  {
    year: "2022–2025",
    note: "ATTAbotics. QA on the apps that manufacture, commission, and administer robotics systems. Selenium, pytest, Power BI, Kusto. High-velocity. The release did not wait.",
  },
  {
    year: "2020–2022",
    note: "Intact Financial. Business systems analyst. CRM and policy overhaul, telematics, provincial feeds, UAT. A bad calculation was an operations failure.",
  },
  {
    year: "2017–2020",
    note: "belairdirect. Licensed P&C. Where the regulated-rules habit started.",
  },
  {
    year: "2024–2026",
    note: "Ikosagon studio years: shipping agentic products, RAG knowledge systems, and edge-ready tooling — including IkoArtist and Ikosagon Learn — for lean production workflows.",
  },
];

export default function AboutPage() {
  return (
    <div className="container-shell section-block">
      <h1 className="mb-4 font-[var(--font-space-grotesk)] text-4xl font-bold">About</h1>
      <p className="font-mono text-sm text-accent">Shawn Cooper · Applied AI Engineer &amp; QA</p>
      <p className="mt-4 max-w-3xl text-zinc-300">
        Shawn Cooper builds and hardens AI systems that have to behave in production — retrieval that
        cites its sources, agents that refuse when the store is empty, and release discipline learned
        in high-velocity robotics QA and regulated insurance operations. Work-from-anywhere.
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
          Employer years first (not a full resume). Studio years follow.
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
