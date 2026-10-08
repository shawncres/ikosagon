import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { ProjectMeta } from "@/lib/projects";

type ProjectCardProps = {
  project: ProjectMeta;
};

export function ProjectCard({ project }: ProjectCardProps) {
  const linkLabel = project.linkLabel ?? "View case study";

  return (
    <article className="card-surface group relative rounded-2xl p-5 transition hover:-translate-y-1 hover:border-accent/50">
      {project.cover ? (
        <div className="mb-4 overflow-hidden rounded-xl border border-border/80 bg-black/40">
          {/* eslint-disable-next-line @next/next/no-img-element -- SVG covers + static public assets */}
          <img
            src={project.cover}
            alt=""
            width={project.coverFit === "cover" ? 1600 : 800}
            height={project.coverFit === "cover" ? 840 : 480}
            className={`h-40 w-full transition group-hover:scale-[1.02] ${
              project.coverFit === "cover" ? "object-cover object-center" : "object-contain object-top"
            }`}
          />
        </div>
      ) : null}
      <div className="mb-3 flex items-center justify-between text-xs font-mono text-zinc-400">
        <span>{project.year}</span>
        <span>{project.status}</span>
      </div>
      <h3 className="mb-2 text-xl font-semibold">{project.title}</h3>
      <p className="mb-4 text-sm text-zinc-300">{project.summary}</p>
      <div className="mb-6 flex flex-wrap gap-2">
        {project.tags.map((tag) => (
          <span key={tag} className="rounded-full border border-border px-2 py-1 text-xs text-zinc-300">
            {tag}
          </span>
        ))}
      </div>
      <Link
        href={`/projects/${project.slug}`}
        className="inline-flex items-center gap-2 text-sm text-accent after:absolute after:inset-0 after:rounded-2xl after:content-['']"
        aria-label={`${linkLabel}: ${project.title}`}
      >
        <span className="relative z-10 inline-flex items-center gap-2">
          {linkLabel}
          <ArrowUpRight className="h-4 w-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </span>
      </Link>
    </article>
  );
}
