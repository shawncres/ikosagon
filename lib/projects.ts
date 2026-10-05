import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";

const projectsDir = path.join(process.cwd(), "content", "projects");

/** Lead product slug pinned first in featured homepage cards. */
export const FEATURED_LEAD_SLUG = "ikoagent";

export type ProjectTrack = {
  title: string;
  src: string;
  note?: string;
};

export type ProjectMeta = {
  title: string;
  slug: string;
  summary: string;
  year: number;
  /** ISO timestamp used for homepage / archive ordering (frontmatter or file mtime). */
  updated: string;
  tags: string[];
  cover: string;
  featured: boolean;
  repo?: string;
  live?: string;
  status: string;
  /** Optional ProjectCard CTA label (defaults to "View case study"). */
  linkLabel?: string;
  tracks?: ProjectTrack[];
};

export type Project = ProjectMeta & {
  content: string;
};

function parseTracks(raw: unknown): ProjectTrack[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const tracks: ProjectTrack[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const title = record.title ? String(record.title) : "";
    const src = record.src ? String(record.src) : "";
    if (!title || !src) continue;
    const track: ProjectTrack = { title, src };
    if (record.note) track.note = String(record.note);
    tracks.push(track);
  }
  return tracks.length ? tracks : undefined;
}

/** Prefer frontmatter `updated`; otherwise use file mtime. Falls back to year Jan 1. */
function resolveUpdated(raw: unknown, mtimeMs: number, year: number): string {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw.toISOString();
  }
  if (typeof raw === "string" && raw.trim()) {
    const parsed = new Date(raw.trim());
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  if (Number.isFinite(mtimeMs) && mtimeMs > 0) {
    return new Date(mtimeMs).toISOString();
  }
  return new Date(Date.UTC(year || 1970, 0, 1)).toISOString();
}

function byUpdatedDesc(a: ProjectMeta, b: ProjectMeta) {
  const diff = Date.parse(b.updated) - Date.parse(a.updated);
  if (diff !== 0) return diff;
  return b.year - a.year;
}

export async function getProjects(): Promise<Project[]> {
  const entries = await fs.readdir(projectsDir, { withFileTypes: true });
  const mdxFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".mdx"));

  const projects = await Promise.all(
    mdxFiles.map(async (file) => {
      const filePath = path.join(projectsDir, file.name);
      const [source, stat] = await Promise.all([fs.readFile(filePath, "utf8"), fs.stat(filePath)]);
      const { data, content } = matter(source);
      const year = Number(data.year);

      return {
        title: String(data.title),
        slug: String(data.slug),
        summary: String(data.summary),
        year,
        updated: resolveUpdated(data.updated, stat.mtimeMs, year),
        tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
        cover: String(data.cover),
        featured: Boolean(data.featured),
        repo: data.repo ? String(data.repo) : undefined,
        live: data.live ? String(data.live) : undefined,
        status: String(data.status ?? "In progress"),
        linkLabel: data.linkLabel ? String(data.linkLabel) : undefined,
        tracks: parseTracks(data.tracks),
        content,
      } satisfies Project;
    }),
  );

  return projects.sort(byUpdatedDesc);
}

export async function getProjectBySlug(slug: string) {
  const projects = await getProjects();
  return projects.find((project) => project.slug === slug) ?? null;
}

/**
 * Featured cards for the homepage.
 * IkoAgent stays pinned first (lead slot); remaining featured projects sort by `updated` desc.
 */
export async function getFeaturedProjects() {
  const projects = await getProjects();
  const featured = projects.filter((project) => project.featured);
  const lead = FEATURED_LEAD_SLUG;
  return featured.sort((a, b) => {
    if (a.slug === lead && b.slug !== lead) return -1;
    if (b.slug === lead && a.slug !== lead) return 1;
    return byUpdatedDesc(a, b);
  });
}
