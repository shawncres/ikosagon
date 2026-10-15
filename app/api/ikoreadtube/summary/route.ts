import { handleVideoSummary } from "@/lib/ikoreadtube/service";
import { blocked, clientIp, reply, state } from "../_shared";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET ?id=<11 char video id>[&focus=<search words>] -> { source: "gemini" | "description", levels: { less, standard, more }, ...meta }.
 * One Gemini call reads the YouTube URL and returns all three levels; cached by id (memory + long CDN s-maxage).
 */
export async function GET(request: Request) {
  const denied = blocked(request);
  if (denied) return denied;
  const params = new URL(request.url).searchParams;
  return reply(await handleVideoSummary({ id: params.get("id"), focus: params.get("focus"), ip: clientIp(request), env: process.env, state: state.summary }));
}
