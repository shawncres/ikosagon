import { prepare, checkFor } from "@/lib/ikolearn/service";
import { reply, reqMeta, state } from "../_shared";

export const runtime = "nodejs";
export const maxDuration = 60;

/** PR 118: POST { name, focus, lesson (the lesson text) } -> { ok, questions, retry, key } (one model call, one stricter retry). */
export async function POST(request: Request) {
  const p = prepare({ rawBody: await request.text(), ...reqMeta(request), env: process.env, state, requireFocus: true });
  if (!p.ok) return reply(p.out);
  return reply(await checkFor(p.input, process.env));
}
