import { handleAsk } from "@/lib/ikoreadtube/service";
import { blocked, clientIp, reply, state } from "../_shared";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST { id, q, history?: [{ q, a }] } -> { ok, answered, answer, timestamps } (answer extracted from the video by Gemini).
 * Nothing is stored beyond a short in-memory cache; the conversation lives in the browser only.
 */
export async function POST(request: Request) {
  const denied = blocked(request);
  if (denied) return denied;
  let body: { id?: unknown; q?: unknown; history?: unknown } = {};
  try {
    const raw = await request.text();
    if (raw.length > 6_000) return reply({ status: 413, body: { error: "too_large" }, headers: { "Cache-Control": "no-store" } });
    body = JSON.parse(raw);
  } catch {
    return reply({ status: 400, body: { error: "bad_json" }, headers: { "Cache-Control": "no-store" } });
  }
  if (!body || typeof body !== "object") return reply({ status: 400, body: { error: "bad_json" }, headers: { "Cache-Control": "no-store" } });
  return reply(await handleAsk({ id: body.id, question: body.q, history: body.history, ip: clientIp(request), env: process.env, state: state.summary }));
}
