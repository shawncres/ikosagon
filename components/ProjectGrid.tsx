"use client";

import { useMemo, useState } from "react";
import { ProjectCard } from "@/components/ProjectCard";
import type { ProjectMeta } from "@/lib/projects";

type ProjectGridProps = {
  projects: ProjectMeta[];
};

export function ProjectGrid({ projects }: ProjectGridProps) {
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState("All");

  const tags = useMemo(
    () => ["All", ...Array.from(new Set(projects.flatMap((project) => project.tags))).sort()],
    [projects],
  );

  const visible = useMemo(() => {
    return projects
      .filter((project) => activeTag === "All" || project.tags.includes(activeTag))
      .filter((project) => {
        const needle = query.trim().toLowerCase();
        if (!needle) return true;
        return `${project.title} ${project.summary} ${project.tags.join(" ")}`.toLowerCase().includes(needle);
      });
  }, [activeTag, projects, query]);

  return (
    <section className="section-block">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search projects..."
          className="w-full max-w-sm rounded-xl border border-border bg-surface px-4 py-2 outline-none ring-0 transition focus:border-accent"
        />
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <button
              key={tag}
              onClick={() => setActiveTag(tag)}
              className={`rounded-full px-3 py-1 text-xs transition ${
                activeTag === tag ? "bg-accent/15 text-accent neon-border" : "border border-border text-zinc-300"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {visible.map((project) => (
          <ProjectCard key={project.slug} project={project} />
        ))}
      </div>
    </section>
  );
}
