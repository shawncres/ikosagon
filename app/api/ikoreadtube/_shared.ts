import type { Out } from "@/lib/ikoreadtube/service";
import { createFeedState, createSearchState, createSummaryState, sameSiteOk, type FeedState, type SearchState, type SummaryState } from "@/lib/ikoreadtube/service";

type G = typeof globalThis & { __ikoRT?: { feed: FeedState; search: SearchState; summary: SummaryState } };
const g = globalThis as G;
export const state = (g.__ikoRT ??= { feed: createFeedState(), search: createSearchState(), summary: createSummaryState() });

export function clientIp(request: Request): string {
  return (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
}

export function blocked(request: Request): Response | null {
  const ok = sameSiteOk(request.headers.get("origin"), request.headers.get("x-forwarded-host") || request.headers.get("host"), process.env);
  return ok ? null : new Response(JSON.stringify({ error: "origin" }), { status: 403, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

export function reply(out: Out): Response {
  return new Response(JSON.stringify(out.body), { status: out.status, headers: { "Content-Type": "application/json; charset=utf-8", Vary: "Origin", ...out.headers } });
}
