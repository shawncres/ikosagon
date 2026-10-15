import { handleFeed } from "@/lib/ikoreadtube/service";
import { blocked, reply, state } from "../_shared";

export const runtime = "nodejs";
export const maxDuration = 30;

/** GET -> { source: "youtube", videos: [{ id, title, channel, published, duration }] } (YouTube Data API v3, edge cached 15 min). */
export async function GET(request: Request) {
  return blocked(request) ?? reply(await handleFeed({ env: process.env, state: state.feed }));
}
