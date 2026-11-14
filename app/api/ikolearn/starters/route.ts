export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET -> { ok: true, topics: string[] }. A short list of broad starter subjects.
 * The country comes only from the request's coarse geo header (x-vercel-ip-country). It is not stored,
 * not logged, and not returned. With no country, or one we do not know, the default list is used.
 * No model call: this stays on the free tier.
 */
const DEFAULT_TOPICS = ["Science", "Music", "Artificial Intelligence"];

const BY_COUNTRY: Record<string, string[]> = {
  US: ["Science", "Music", "Space"],
  CA: ["Science", "Music", "Nature"],
  GB: ["Science", "Music", "History"],
  IE: ["Science", "Music", "History"],
  AU: ["Science", "Music", "Oceans"],
  NZ: ["Science", "Music", "Oceans"],
  JP: ["Science", "Music", "Earthquakes"],
  KR: ["Science", "Music", "Technology"],
  IN: ["Science", "Music", "Space"],
  BR: ["Science", "Music", "Rainforests"],
  MX: ["Science", "Music", "History"],
  FR: ["Science", "Music", "Art"],
  DE: ["Science", "Music", "Engineering"],
  IT: ["Science", "Music", "Art"],
  ES: ["Science", "Music", "History"],
  NL: ["Science", "Music", "Engineering"],
  SE: ["Science", "Music", "Nature"],
  NO: ["Science", "Music", "Nature"],
  ZA: ["Science", "Music", "Nature"],
  NG: ["Science", "Music", "History"],
  EG: ["Science", "Music", "History"],
};

export function starterTopics(country: string | null | undefined): string[] {
  const code = String(country || "").trim().toUpperCase();
  const list = /^[A-Z]{2}$/.test(code) ? BY_COUNTRY[code] : undefined;
  return (list || DEFAULT_TOPICS).slice();
}

export async function GET(request: Request) {
  const topics = starterTopics(request.headers.get("x-vercel-ip-country"));
  return Response.json({ ok: true, topics }, { headers: { "Cache-Control": "private, no-store" } });
}
