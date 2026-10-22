import { examplesFor } from "@/lib/ikolearn/service";
import { reply, state } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; /* never made at build time: the CDN caches the answer instead (see EXAMPLES_CACHE) */
export const maxDuration = 30;

/**
 * GET -> { ok: true, examples: string[] } (generic easy-click answers to the first question, the same for everyone;
 * cached for the day on this instance and on the CDN, so about one model call a day), or { ok: false, reason } (not cached).
 * Takes no input: nothing about the learner is sent or used.
 */
export async function GET() {
  return reply(await examplesFor(process.env, state));
}
