/*
 * Freeze telemetry for the Infinite End dev page. The page posts small JSON reports (boot ping, heartbeat,
 * stall, error, hang). They are written to the runtime log as one line starting with IELOG. Nothing is stored.
 * No IP address or header is read or logged; "dev" is a coarse device class the page chose itself.
 */
export const dynamic = "force-dynamic";

const KEYS = ["k", "v", "sid", "dev", "t", "sys", "loc", "f", "hl", "foes", "pk", "draws", "hulls", "fps", "S", "px", "err", "slow", "in", "silent", "gap", "msg", "at"];

function clean(o: unknown) {
  const src = (o && typeof o === "object" ? o : {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of KEYS) {
    const v = src[k];
    if (typeof v === "string") out[k] = v.slice(0, 240);
    else if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (k === "slow" && Array.isArray(v)) out[k] = v.slice(0, 2).map((x) => (typeof x === "string" ? x.slice(0, 40) : Number(x) || 0));
  }
  if (Array.isArray(src.ring)) {
    out.ring = src.ring.slice(0, 100).map((r) => (Array.isArray(r) ? r.slice(0, 6).map((x) => Number(x) || 0) : []));
  }
  return out;
}

export async function POST(req: Request) {
  try {
    const text = (await req.text()).slice(0, 30000);
    console.log("IELOG", JSON.stringify(clean(JSON.parse(text))));
  } catch {
    console.log("IELOG", JSON.stringify({ k: "bad" }));
  }
  return new Response(null, { status: 204 });
}

export async function GET() {
  return new Response("ok", { status: 200, headers: { "Cache-Control": "no-store" } });
}
