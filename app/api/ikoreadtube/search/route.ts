import { handleSearch } from "@/lib/ikoreadtube/service";
import { blocked, clientIp, reply, state } from "../_shared";

export const runtime = "nodejs";
export const maxDuration = 30;

/** GET ?q= -> YouTube search results (search.list = 100 units each, capped at 30/day with a graceful "limit" answer). */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q");
  return blocked(request) ?? reply(await handleSearch({ q, ip: clientIp(request), env: process.env, state: state.search }));
}
