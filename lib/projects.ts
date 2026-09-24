import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";

const projectsDir = path.join(process.cwd(), "content", "projects");

export type ProjectMeta = {
  title: string;
  slug: string;
  summary: string;
  year: number;
  tags: string[];
  cover: string;
  featured: boolean;
  repo?: string;
  live?: string;
  status: string;
};

export type Project = ProjectMeta & {
  content: string;
};

export async function getProjects(): Promise<Project[]> {
  const entries = await fs.readdir(projectsDir, { withFileTypes: true });
  const mdxFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".mdx"));

  const projects = await Promise.all(
    mdxFiles.map(async (file) => {
      const filePath = path.join(projectsDir, file.name);
      const source = await fs.readFile(filePath, "utf8");
      const { data, content } = matter(source);

      return {
        title: String(data.title),
        slug: String(data.slug),
        summary: String(data.summary),
        year: Number(data.year),
        tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
        cover: String(data.cover),
        featured: Boolean(data.featured),
        repo: data.repo ? String(data.repo) : undefined,
        live: data.live ? String(data.live) : undefined,
        status: String(data.status ?? "In progress"),
        content,
      } satisfies Project;
    }),
  );

  return projects.sort((a, b) => b.year - a.year);
}

export async function getProjectBySlug(slug: string) {
  const projects = await getProjects();
  return projects.find((project) => project.slug === slug) ?? null;
}

export async function getFeaturedProjects() {
  const projects = await getProjects();
  const featured = projects.filter((project) => project.featured);
  const lead = "ikosagon-learn";
  return featured.sort((a, b) => {
    if (a.slug === lead && b.slug !== lead) return -1;
    if (b.slug === lead && a.slug !== lead) return 1;
    return b.year - a.year;
  });
}
