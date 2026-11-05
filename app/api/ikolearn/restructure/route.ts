import { prepare, restructureFor } from "@/lib/ikolearn/service";
import { reply, reqMeta, state } from "../_shared";

export const runtime = "nodejs";
export const maxDuration = 60;

/** POST { name, focus, tree: [{ id, t, p, e }] } -> { ok, proposal: { groups, moves } } (PR 119: tidy the cloud). */
export async function POST(request: Request) {
  const p = prepare({ rawBody: await request.text(), ...reqMeta(request), env: process.env, state, requireFocus: true });
  if (!p.ok) return reply(p.out);
  return reply(await restructureFor(p.input, process.env));
}
