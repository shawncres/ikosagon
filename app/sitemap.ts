import type { MetadataRoute } from "next";
import { getProjects } from "@/lib/projects";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const projects = await getProjects();
  const staticRoutes = ["", "/projects", "/about", "/contact"].map((route) => ({
    url: `https://www.ikosagon.com${route}`,
    lastModified: new Date(),
  }));

  const projectRoutes = projects.map((project) => ({
    url: `https://www.ikosagon.com/projects/${project.slug}`,
    lastModified: new Date(),
  }));

  return [...staticRoutes, ...projectRoutes];
}
