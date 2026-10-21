import { eventStream, lessonEvents, NO_STORE, prepare } from "@/lib/ikolearn/service";
import { reply, reqMeta, state } from "../_shared";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST { name, focus, trail?, known?, wantPath?, cloud, parents } -> NDJSON stream (one Gemini call):
 * {t:"start"} {t:"delta",text}... [{t:"path",steps,next}] {t:"done"}  or  {t:"error",reason}.
 */
export async function POST(request: Request) {
  const p = prepare({ rawBody: await request.text(), ...reqMeta(request), env: process.env, state, requireFocus: true });
  if (!p.ok) return reply(p.out);
  return new Response(eventStream(lessonEvents(p.input, process.env)), {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "X-Accel-Buffering": "no", ...NO_STORE },
  });
}
