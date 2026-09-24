import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About",
  description: "About Ikosagon \u2014 software that upgrades existing processes for a post-AGI future.",
};

const skills = [
  "Next.js",
  "TypeScript",
  "React",
  "Node.js",
  "PostgreSQL",
  "AI Integrations",
  "UI Systems",
  "API Architecture",
];

const timeline = [
  { year: "2026", note: "Shipping products and internal tools built for a post-AGI operating environment." },
  { year: "2025", note: "Focused on product engineering, design systems, and performance-first frontend builds." },
  { year: "2024", note: "Expanded into full-stack workflows and automation-heavy project delivery." },
];

export default function AboutPage() {
  return (
    <div className="container-shell section-block">
      <h1 className="mb-4 font-[var(--font-space-grotesk)] text-4xl font-bold">About</h1>
      <p className="max-w-3xl text-zinc-300">
        I build software that upgrades how people already work: fast iteration, clear user experience,
        and architecture that survives real usage \u2014 including AI-backed workflows.
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
