import { describeFor, prepare } from "@/lib/ikolearn/service";
import { reply, reqMeta, state } from "../_shared";

export const runtime = "nodejs";
export const maxDuration = 60;

/** POST { name, focus, material: [{ label, line }] (up to 8, line = its trail) } -> { ok, items: [{ name, blurb }] } (the backfill). */
export async function POST(request: Request) {
  const p = prepare({ rawBody: await request.text(), ...reqMeta(request), env: process.env, state, requireFocus: true });
  if (!p.ok) return reply(p.out);
  return reply(await describeFor(p.input, process.env));
}
