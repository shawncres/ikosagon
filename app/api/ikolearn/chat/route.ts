import { chatEvents, eventStream, NO_STORE, prepare } from "@/lib/ikolearn/service";
import { reply, reqMeta, state } from "../_shared";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST { mode: "chat" | "notice", name, focus?, focusParent?, messages, cloud, parents } -> NDJSON stream:
 * {t:"start"} {t:"delta",text}... {t:"cloud",topics,ghosts} {t:"done"}  or  {t:"error",reason}.
 */
export async function POST(request: Request) {
  const p = prepare({ rawBody: await request.text(), ...reqMeta(request), env: process.env, state });
  if (!p.ok) return reply(p.out);
  return new Response(eventStream(chatEvents(p.input, process.env)), {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "X-Accel-Buffering": "no", ...NO_STORE },
  });
}
