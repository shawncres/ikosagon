import { prepare, testFor } from "@/lib/ikolearn/service";
import { reply, reqMeta, state } from "../_shared";

export const runtime = "nodejs";
export const maxDuration = 60;

/** POST { name, focus, trail?, material: [{ label, line }], cloud, parents } -> { ok, questions: [{ q, options, answer, topic }] } (one model call). */
export async function POST(request: Request) {
  const p = prepare({ rawBody: await request.text(), ...reqMeta(request), env: process.env, state, requireFocus: true });
  if (!p.ok) return reply(p.out);
  return reply(await testFor(p.input, process.env));
}
