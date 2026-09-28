import Link from "next/link";
import { Hero } from "@/components/Hero";
import { ProjectCard } from "@/components/ProjectCard";
import { getFeaturedProjects } from "@/lib/projects";

export default async function Home() {
  const featured = await getFeaturedProjects();

  return (
    <>
      <Hero />
      <section className="section-block border-y border-border/80 py-10 md:py-12">
        <div className="container-shell">
          <article className="card-surface neon-border rounded-2xl p-6 md:p-8">
            <p className="mb-2 font-mono text-sm text-accent">Lead product</p>
            <h2 className="mb-3 text-3xl font-semibold">IkoArtist</h2>
            <p className="mb-4 max-w-3xl text-zinc-300">
              Discover tastes and songs you might like — answer as many questions as you want. The
              agentic Ikosagon engine produces the hit; tracks compete on a view-ranked leaderboard.
              Anonymous is fine; email only for opportunities.
            </p>
            <p className="mb-4 max-w-3xl text-sm text-zinc-400">
              Intake, leans, and anonymous finish are on the page. Generation runs in the pipeline, not
              as a live spend.
            </p>
            <Link href="/projects/ikoartist" className="rounded-xl bg-accent px-4 py-2 font-semibold text-black">
              Open IkoArtist
            </Link>
          </article>
        </div>
      </section>
      <section className="section-block border-y border-border/80">
        <div className="container-shell">
          <h2 className="mb-6 text-3xl font-semibold">Featured Projects</h2>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {featured.slice(0, 6).map((project) => (
              <ProjectCard key={project.slug} project={project} />
            ))}
          </div>
          <div className="mt-8">
            <Link href="/projects" className="text-accent">
              See all projects →
            </Link>
          </div>
        </div>
      </section>
      <section className="section-block border-b border-border/80">
        <div className="container-shell">
          <article className="card-surface rounded-2xl p-6 md:p-8">
            <h2 className="mb-4 text-3xl font-semibold">How a bot earns production</h2>
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
          </article>
        </div>
      </section>
      <section className="section-block">
        <div className="container-shell grid gap-6 md:grid-cols-2">
          <article className="card-surface rounded-2xl p-6">
            <h3 className="mb-3 text-2xl font-semibold">Services</h3>
            <p className="mb-2 text-zinc-300">
              We at Ikosagon do product engineering, RAG and agentic systems, CRM integrations with
              regression-minded QA, and edge/IoT as a service (Orin-class, ARM, ESP32) — plus
              contact-center–style natural-language flows where they earn their keep.
            </p>
            <p className="text-zinc-300">
              Lean builds for on-prem or cloud: grounded retrieval, reliable tool calling on small
              models, and continuous improvement so bots harden in production.
            </p>
          </article>
          <article className="card-surface rounded-2xl p-6">
            <h3 className="mb-3 text-2xl font-semibold">Open for work</h3>
            <p className="mb-4 text-zinc-300">
              Available for freelance, contract, and selected full-time roles — remote /
              work-from-anywhere — spanning AI systems, applied QA on agentic stacks, embedded/edge
              software, and production process upgrades for SMB through enterprise.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/contact#build" className="rounded-xl bg-accent px-4 py-2 font-semibold text-black">
                Build with us
              </Link>
              <Link href="/contact#hiring" className="rounded-xl border border-border px-4 py-2 transition hover:border-accent">
                Hiring door
              </Link>
            </div>
          </article>
        </div>
      </section>
    </>
  );
}
