import { createFor, prepare } from "@/lib/ikolearn/service";
import { reply, reqMeta, state } from "../_shared";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST { name, mode: "notice", kind: "start"|"more"|"next"|"bridge", repair? (bridge: the one-time re-ask), interests?, age?, region?, focus? (next), trail?, known?, favorites?, cloud, parents }
 * -> { ok, kind, items: [{ node: { name, chain }, card: { title, blurb, goal }, children: [{ name, order, score, why, role: "core"|"optional", after }], links? (bridge) }] } (one model call).
 */
export async function POST(request: Request) {
  const p = prepare({ rawBody: await request.text(), ...reqMeta(request), env: process.env, state });
  if (!p.ok) return reply(p.out);
  return reply(await createFor(p.input, process.env));
}
