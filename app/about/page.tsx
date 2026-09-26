import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About",
  description:
    "About Ikosagon and Shawn Cooper: edge AI, embedded IoT, RAG, CRM integrations, and agentic systems for lean production workflows.",
};

const skills = [
  "Next.js / TypeScript",
  "Python",
  "RAG & vector DBs",
  "LangChain agents",
  "NVIDIA Orin / edge",
  "ARM & ESP32 firmware",
  "CRM integrations",
  "QA automation",
  "xAI ecosystem",
  "On-prem & cloud",
  "PWAs / remote desktop",
  "Contact-center NL flows",
];

const timeline = [
  {
    year: "2026",
    note: "Shipping agentic products, RAG knowledge systems, and edge-ready tooling under Ikosagon — including Ikosagon Learn and AI Recording Artist.",
  },
  {
    year: "2025",
    note: "Deepened product engineering across AI integrations, custom CRM workflows with strong QA, and cost-sensitive on-prem/cloud deployments.",
  },
  {
    year: "2024",
    note: "Expanded full-stack delivery into automation-heavy systems, microcontroller/IoT firmware (ARM, ESP32), and production web platforms.",
  },
];

export default function AboutPage() {
  return (
    <div className="container-shell section-block">
      <h1 className="mb-4 font-[var(--font-space-grotesk)] text-4xl font-bold">About</h1>
      <p className="max-w-3xl text-zinc-300">
        Ikosagon is Shawn Cooper&apos;s Toronto studio for software that upgrades processes people
        already run. The work spans edge devices (NVIDIA Orin series), microcontroller firmware for
        IoT, RAG applications with open-source models, custom CRM integrations with a QA-first
        mindset, and AI-integrated remote-desktop PWAs — designed lean for high-volume, cost-sensitive
        environments on-prem or in the cloud.
      </p>
      <p className="mt-4 max-w-3xl text-zinc-300">
        Specialty areas include chunked retrieval over vector databases (e.g. Chroma), reliable tool
        calling even on small or low-parameter models, natural-language contact-center–style flows
        (LangChain, ElevenLabs, Suno), and agile continuous improvement so chatbots and agents get
        better reactively over time. xAI ecosystem adoption is a common path from SMB through
        enterprise-shaped scopes.
      </p>

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
