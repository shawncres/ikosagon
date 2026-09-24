import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import { getProjectBySlug, getProjects } from "@/lib/projects";

type Params = { slug: string };

export async function generateStaticParams() {
  const projects = await getProjects();
  return projects.map((project) => ({ slug: project.slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const project = await getProjectBySlug(slug);
  if (!project) return {};
  return {
    title: project.title,
    description: project.summary,
  };
}

export default async function ProjectDetailPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const projects = await getProjects();
  const project = projects.find((entry) => entry.slug === slug);
  if (!project) notFound();

  const index = projects.findIndex((entry) => entry.slug === slug);
  const prev = index > 0 ? projects[index - 1] : null;
  const next = index < projects.length - 1 ? projects[index + 1] : null;

  return (
    <article className="container-shell section-block">
      <header className="mb-8 border-b border-border/80 pb-6">
        <p className="mb-2 font-mono text-sm text-accent">{project.year}</p>
        <h1 className="mb-3 font-[var(--font-space-grotesk)] text-4xl font-bold">{project.title}</h1>
        <p className="max-w-3xl text-zinc-300">{project.summary}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {project.tags.map((tag) => (
            <span key={tag} className="rounded-full border border-border px-3 py-1 text-xs text-zinc-300">
              {tag}
            </span>
          ))}
        </div>
      </header>

      <div className="prose-project max-w-none">
        <MDXRemote source={project.content} />
      </div>

      <footer className="mt-10 flex flex-wrap items-center gap-5 border-t border-border/80 pt-6">
        {project.repo ? (
          <a href={project.repo} target="_blank" rel="noreferrer" className="text-accent">
            Repository
          </a>
        ) : null}
        {project.live ? (
          <a href={project.live} target="_blank" rel="noreferrer" className="text-accent">
            Live Site
          </a>
        ) : null}
      </footer>

      <nav className="mt-10 grid gap-3 border-t border-border/80 pt-6 md:grid-cols-2">
        <div>{prev ? <Link href={`/projects/${prev.slug}`}>← {prev.title}</Link> : null}</div>
        <div className="text-left md:text-right">{next ? <Link href={`/projects/${next.slug}`}>{next.title} →</Link> : null}</div>
      </nav>
    </article>
  );
}
