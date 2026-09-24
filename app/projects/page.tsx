import type { Metadata } from "next";
import { ProjectGrid } from "@/components/ProjectGrid";
import { getProjects } from "@/lib/projects";

export const metadata: Metadata = {
  title: "Projects",
  description: "Project archive of shipped software and in-progress builds.",
};

export default async function ProjectsPage() {
  const projects = await getProjects();

  return (
    <div className="container-shell section-block">
      <h1 className="mb-3 font-[var(--font-space-grotesk)] text-4xl font-bold">Projects</h1>
      <p className="max-w-3xl text-zinc-300">
        A growing library of software products, experiments, and client builds. Filter by tag or search by keyword.
      </p>
      <ProjectGrid projects={projects} />
    </div>
  );
}
