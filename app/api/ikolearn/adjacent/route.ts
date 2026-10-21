import { adjacentFor, prepare } from "@/lib/ikolearn/service";
import { reply, reqMeta, state } from "../_shared";

export const runtime = "nodejs";
export const maxDuration = 60;

/** POST { name, focus, focusParent?, cloud, parents } -> { ok, ghosts: [{ name, parent }] } (related unexplored topics). */
export async function POST(request: Request) {
  const p = prepare({ rawBody: await request.text(), ...reqMeta(request), env: process.env, state, requireFocus: true });
  if (!p.ok) return reply(p.out);
  return reply(await adjacentFor(p.input, process.env));
}
