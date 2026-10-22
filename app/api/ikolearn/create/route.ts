import { budgetSpend, createCheck, createEvents, createFor, eventStream, NO_STORE, prepare } from "@/lib/ikolearn/service";
import { reply, reqMeta, state } from "../_shared";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST { name, mode: "notice", kind: "start"|"more"|"next"|"bridge", repair? (bridge: the one-time re-ask), interests?, about? (start/more: the learner's own words; required unless interests are given), focus? (next), trail?, known?, favorites?, cloud, parents, stream? }
 * -> { ok, kind, items: [{ node: { name, chain, needs?, motif? }, card: { title, blurb, goal }, children: [{ name, order, score, why, role: "core"|"optional", after, needs?, motif? }], links? (bridge) }] } (one model call).
 * With stream: true (start and more): an NDJSON stream instead, {t:"item",item}... then {t:"done",kind,items} or {t:"error",reason},
 * so the first parents can show while the rest is written.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  const p = prepare({ rawBody: raw, ...reqMeta(request), env: process.env, state });
  if (!p.ok) return reply(p.out);
  if (wantsStream(raw) && (p.input.kind === "start" || p.input.kind === "more")) {
    const bad = createCheck(p.input);
    if (bad) return reply(bad);
    return new Response(eventStream(createEvents(p.input, process.env, fetch, { spend: budgetSpend(state, process.env) })), {
      headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "X-Accel-Buffering": "no", ...NO_STORE },
    });
  }
  return reply(await createFor(p.input, process.env));
}

function wantsStream(raw: string): boolean {
  try {
    return JSON.parse(raw)?.stream === true;
  } catch {
    return false;
  }
}
