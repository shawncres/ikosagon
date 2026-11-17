import { getProjectBySlug } from "@/lib/projects";

export const revalidate = 300;

const ORIGIN = "https://ikosagon.com";

export async function GET() {
  const project = await getProjectBySlug("ikoartist");
  const tracks = (project?.tracks ?? []).map((t) => ({
    title: t.title,
    url: t.src.startsWith("http") ? t.src : `${ORIGIN}${t.src}`,
  }));
  return Response.json(tracks, {
    headers: { "Access-Control-Allow-Origin": ORIGIN },
  });
}
