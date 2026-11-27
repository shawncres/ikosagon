import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { gunzipSync, gzipSync } from "node:zlib";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/*
 Infinite End flight collection, development builds only.
 Each flight names its pilot: 'human' for a person, 'ai' for a machine flight. Both are kept and streamed.
 POST  body {z:0,f:<flight>} or {z:1,d:<base64 gzip of the flight JSON>}  stores one finished flight
 GET   list of stored flights, newest first (metadata only)
 GET   ?id=<id>   one flight, as the plain flight JSON
 No IP address is read or stored. A flight carries a random device id made by the game, nothing else about a person.
*/

const MAX_RAW = 1_500_000;
const MAX_ZIP = 260_000;
const PER_DEV_DAY = 60;
const PER_DAY = 1500;
const KEEP = 4000;
const DEV_PATH = /\/(infiniteenddev|infiniteendtest)(\/|$)/;

let sqlFn: NeonQueryFunction<false, false> | null = null;
let ready: Promise<void> | null = null;

function db(): NeonQueryFunction<false, false> | null {
  if (sqlFn) return sqlFn;
  const url =
    process.env.DATABASE_URL?.trim() ||
    process.env.POSTGRES_URL?.trim() ||
    process.env.POSTGRES_PRISMA_URL?.trim();
  if (!url) return null;
  sqlFn = neon(url);
  return sqlFn;
}

function init(sql: NeonQueryFunction<false, false>) {
  if (!ready) {
    ready = (async () => {
      await sql`CREATE TABLE IF NOT EXISTS ie_flights (
        id text PRIMARY KEY,
        created timestamptz NOT NULL DEFAULT now(),
        dev text NOT NULL,
        build text NOT NULL,
        dur integer NOT NULL,
        sys text NOT NULL,
        pilot text NOT NULL DEFAULT 'human',
        sg text NOT NULL DEFAULT '',
        n integer NOT NULL,
        raw integer NOT NULL,
        data text NOT NULL
      )`;
      await sql`ALTER TABLE ie_flights ADD COLUMN IF NOT EXISTS pilot text NOT NULL DEFAULT 'human'`;
      await sql`ALTER TABLE ie_flights ADD COLUMN IF NOT EXISTS sg text NOT NULL DEFAULT ''`;
      await sql`CREATE INDEX IF NOT EXISTS ie_flights_created ON ie_flights (created DESC)`;
    })().catch((e) => {
      ready = null;
      throw e;
    });
  }
  return ready;
}

/* the song runs of a flight (which track played when), kept beside it so a song montage can be planned from the list alone */
function segInfo(f: Record<string, unknown>) {
  try {
    const g = Array.isArray(f.sg) ? (f.sg as unknown[]).slice(0, 12) : [];
    const t = JSON.stringify({ g, e: typeof f.en === "number" ? f.en : 0.3 });
    return t.length < 3500 ? t : "";
  } catch {
    return "";
  }
}

const clean = (s: unknown, n: number) => String(s ?? "").replace(/[^\w .:+\-]/g, "").slice(0, n);

function fromDevPage(req: Request) {
  const ref = req.headers.get("referer") || req.headers.get("origin") || "";
  let path = ref;
  try {
    path = new URL(ref).pathname;
  } catch {}
  return DEV_PATH.test(path);
}

export async function POST(req: Request) {
  if (!fromDevPage(req)) return Response.json({ ok: false, e: "dev builds only" }, { status: 403 });
  const sql = db();
  if (!sql) return Response.json({ ok: false, e: "no storage" }, { status: 503 });
  let txt = "";
  try {
    txt = await req.text();
  } catch {
    return Response.json({ ok: false, e: "read" }, { status: 400 });
  }
  if (txt.length > MAX_ZIP * 1.5) return Response.json({ ok: false, e: "too big" }, { status: 413 });
  let raw: string;
  try {
    const b = JSON.parse(txt);
    if (b && b.z === 1 && typeof b.d === "string") raw = gunzipSync(Buffer.from(b.d, "base64"), { maxOutputLength: MAX_RAW }).toString("utf8");
    else raw = JSON.stringify(b && b.f);
  } catch {
    return Response.json({ ok: false, e: "format" }, { status: 400 });
  }
  if (raw.length > MAX_RAW) return Response.json({ ok: false, e: "too big" }, { status: 413 });
  let f: Record<string, unknown>;
  try {
    f = JSON.parse(raw);
  } catch {
    return Response.json({ ok: false, e: "json" }, { status: 400 });
  }
  if (!f || f.v !== 1 || !Array.isArray(f.s) || !Array.isArray(f.e) || typeof f.dur !== "number" || f.dur < 5)
    return Response.json({ ok: false, e: "schema" }, { status: 400 });
  const id = clean(f.id, 24) || Math.random().toString(36).slice(2, 12);
  const dev = clean(f.dev, 24) || "x";
  const zip = gzipSync(Buffer.from(raw, "utf8"), { level: 9 });
  if (zip.length > MAX_ZIP) return Response.json({ ok: false, e: "too big" }, { status: 413 });
  try {
    await init(sql);
    const c = (await sql`SELECT
      (SELECT count(*) FROM ie_flights WHERE dev = ${dev} AND created > now() - interval '1 day')::int AS d,
      (SELECT count(*) FROM ie_flights WHERE created > now() - interval '1 day')::int AS a`) as { d: number; a: number }[];
    if (c[0].d >= PER_DEV_DAY || c[0].a >= PER_DAY) return Response.json({ ok: false, e: "rate" }, { status: 429 });
    await sql`INSERT INTO ie_flights (id, dev, build, dur, sys, pilot, sg, n, raw, data)
      VALUES (${id}, ${dev}, ${clean(f.b, 12)}, ${Math.round(f.dur as number)}, ${clean(f.sysN || f.sys, 40)}, ${clean(f.pilot, 12) || "human"}, ${segInfo(f)}, ${(f.s as unknown[]).length}, ${raw.length}, ${zip.toString("base64")})
      ON CONFLICT (id) DO NOTHING`;
    await sql`DELETE FROM ie_flights WHERE id IN (SELECT id FROM ie_flights ORDER BY created DESC OFFSET ${KEEP})`;
    return Response.json({ ok: true, id, bytes: zip.length });
  } catch {
    return Response.json({ ok: false, e: "store" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const sql = db();
  if (!sql) return Response.json([], { status: 503 });
  try {
    await init(sql);
    const id = new URL(req.url).searchParams.get("id");
    if (id) {
      const r = (await sql`SELECT data FROM ie_flights WHERE id = ${clean(id, 24)}`) as { data: string }[];
      if (!r.length) return Response.json({ ok: false }, { status: 404 });
      return new Response(gunzipSync(Buffer.from(r[0].data, "base64")), {
        headers: { "content-type": "application/json", "cache-control": "no-store" },
      });
    }
    const r = (await sql`SELECT id, extract(epoch FROM created)::bigint * 1000 AS t, build AS b, dur, sys, pilot, sg, n, length(data) AS z
      FROM ie_flights ORDER BY created DESC LIMIT 300`) as Record<string, unknown>[];
    return Response.json(r.map((x) => { let sg = null; try { sg = x.sg ? JSON.parse(String(x.sg)) : null; } catch {} return { ...x, t: Number(x.t), sg }; }), { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json([], { status: 500 });
  }
}
