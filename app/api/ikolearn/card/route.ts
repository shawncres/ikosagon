import { cardFor, prepare } from "@/lib/ikolearn/service";
import { reply, reqMeta, state } from "../_shared";

export const runtime = "nodejs";
export const maxDuration = 60;

/** POST { name, focus, focusParent?, known?, messages?, cloud, parents } -> { ok, card: { title, body, topic, parent, path?, next? } }. */
export async function POST(request: Request) {
  const p = prepare({ rawBody: await request.text(), ...reqMeta(request), env: process.env, state, requireFocus: true });
  if (!p.ok) return reply(p.out);
  return reply(await cardFor({ ...p.input, mode: "chat" }, process.env));
}
