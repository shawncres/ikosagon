import { handleVideoSummary } from "@/lib/ikoreadtube/service";
import { blocked, clientIp, reply, state } from "../_shared";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET ?id=<11 char video id> -> { source: "gemini" | "description", levels: { less, standard, more }, ...meta }.
 * One Gemini call reads the YouTube URL and returns all three levels; cached by id (memory + long CDN s-maxage).
 */
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  return blocked(request) ?? reply(await handleVideoSummary({ id, ip: clientIp(request), env: process.env, state: state.summary }));
}
