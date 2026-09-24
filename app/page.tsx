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
            <h2 className="mb-3 text-3xl font-semibold">Ikosagon Learn</h2>
            <p className="mb-4 max-w-3xl text-zinc-300">
              An AI inquiry agent for homeschool families: talk with kids to find strengths, adapt
              curriculum overnight to their interests while covering real standards, and keep parents
              in the loop by phone or web.
            </p>
            <Link href="/projects/ikosagon-learn" className="rounded-xl bg-accent px-4 py-2 font-semibold text-black">
              View the product brief
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
      <section className="section-block">
        <div className="container-shell grid gap-6 md:grid-cols-2">
          <article className="card-surface rounded-2xl p-6">
            <h3 className="mb-3 text-2xl font-semibold">Services</h3>
            <p className="mb-2 text-zinc-300">Product engineering, MVP builds, frontend systems, and AI integrations.</p>
            <p className="text-zinc-300">From idea to launch with clear communication and production-level delivery.</p>
          </article>
          <article className="card-surface rounded-2xl p-6">
            <h3 className="mb-3 text-2xl font-semibold">Open for Work</h3>
            <p className="mb-4 text-zinc-300">Available for freelance projects, contracts, and selected full-time opportunities.</p>
            <Link href="/contact" className="rounded-xl bg-accent px-4 py-2 font-semibold text-black">
              Start a project
            </Link>
          </article>
        </div>
      </section>
    </>
  );
}
