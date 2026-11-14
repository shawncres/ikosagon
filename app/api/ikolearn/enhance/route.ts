import path from "node:path";
import { createRequire } from "node:module";
import { generateJson, llmReady } from "@/lib/ikolearn/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * On-demand enhance for one .ikolearn file. The body is the file. It is handled in memory and not logged or stored.
 * Lesson text is never written to a log. A bad file is a short JSON error: 400 when it is empty or malformed, 413 when
 * it is over the size cap. This route does not answer 500 for those cases.
 */
export const MAX_BYTES = 8_000_000;

type EnhanceOut = { ok: boolean; notice?: string; name?: string; text?: string; next?: string[]; outlineOf?: (text: string) => { id: string; t: string; p: string }[] | null; enhanceText: (text: string, advice?: { moves: { id: string; parent: string }[] } | null) => { ok: boolean; notice?: string; name?: string; text?: string; next?: string[] } };
type Move = { id: string; parent: string };

const MOVE_SCHEMA = {
  type: "object",
  properties: {
    moves: {
      type: "array",
      items: {
        type: "object",
        properties: { id: { type: "string" }, parent: { type: "string" } },
        required: ["id", "parent"],
      },
    },
  },
  required: ["moves"],
};

function fail(status: 400 | 413, error: string) {
  return Response.json({ ok: false, error }, { status });
}

/** Read at most MAX_BYTES. A declared or actual overflow stops without keeping the rest. */
async function readBody(request: Request): Promise<{ text: string } | { status: 400 | 413; error: string }> {
  const declared = request.headers.get("content-length");
  if (declared != null && declared !== "") {
    const n = Number(declared);
    if (!Number.isFinite(n) || n < 0) return { status: 400, error: "That file could not be read." };
    if (n > MAX_BYTES) return { status: 413, error: "That file is too large." };
  }
  if (!request.body) return { text: "" };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || !value.byteLength) continue;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        try { await reader.cancel(); } catch { /* the caller already has the status */ }
        return { status: 413, error: "That file is too large." };
      }
      chunks.push(value);
    }
  } catch {
    return { status: 400, error: "That file could not be read." };
  }
  const buf = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) { buf.set(chunk, at); at += chunk.byteLength; }
  return { text: new TextDecoder().decode(buf) };
}

/** A usable file has a data.cloud object. Anything else is refused before the enhancer runs. */
function fileShape(text: string): boolean {
  if (!text.trim()) return false;
  try {
    const raw = JSON.parse(text) as { data?: { cloud?: unknown } } | null;
    return Boolean(raw && typeof raw === "object" && !Array.isArray(raw) && raw.data && typeof raw.data === "object" && raw.data.cloud && typeof raw.data.cloud === "object");
  } catch {
    return false;
  }
}

function loadEnhance(): EnhanceOut {
  const file = path.join(process.cwd(), "public/ikolearn/enhance.js");
  const require = createRequire(file);
  return require("./enhance.js");
}

/** One structured pass over the names already on the cloud. A miss returns null and the local pass runs instead. */
async function askMoves(text: string): Promise<{ moves: Move[] } | null> {
  if (!llmReady(process.env)) return null;
  const outline = loadEnhance().outlineOf?.(text) || null;
  if (!outline || outline.length < 2) return null;
  const allowed = new Set(outline.map((n) => n.id));
  const system = "You tidy a learner's topic map. Reply with JSON only: {\"moves\":[{\"id\":\"n1\",\"parent\":\"n2\"}]}. Use only the given ids. Leave a node where it is when the parent is already right. Never put a topic under itself. Do not invent nodes. Do not include lesson text.";
  const user = "Re-parent a topic only when it clearly belongs somewhere else. Nodes: " + JSON.stringify(outline);
  const r = await generateJson<{ moves: Move[] }>(system, user, MOVE_SCHEMA, (raw) => {
    try {
      const parsed = JSON.parse(raw) as { moves?: { id?: unknown; parent?: unknown }[] };
      if (!parsed || !Array.isArray(parsed.moves)) return null;
      const moves: Move[] = [];
      for (const m of parsed.moves) {
        if (!m || typeof m.id !== "string" || typeof m.parent !== "string") continue;
        if (!allowed.has(m.id) || !allowed.has(m.parent) || m.id === m.parent) continue;
        moves.push({ id: m.id, parent: m.parent });
        if (moves.length >= 40) break;
      }
      return { moves };
    } catch {
      return null;
    }
  }, process.env, fetch, { route: "enhance", timeoutMs: 12000 });
  return r.ok ? r.value : null;
}

export async function POST(request: Request) {
  let text = "";
  try {
    const body = await readBody(request);
    if ("status" in body) return fail(body.status, body.error);
    text = body.text;
  } catch {
    return fail(400, "That file could not be read.");
  }
  if (!text.trim()) return fail(400, "That file is empty.");
  if (text.length > MAX_BYTES) return fail(413, "That file is too large.");
  if (!fileShape(text)) return fail(400, "That file could not be read.");
  let advice: { moves: Move[] } | null = null;
  let fallback = !llmReady(process.env);
  if (!fallback) {
    try {
      advice = await askMoves(text);
      if (!advice) fallback = true;
    } catch {
      advice = null;
      fallback = true;
    }
  }
  try {
    const out = loadEnhance().enhanceText(text, advice);
    if (!out || !out.ok) return fail(400, "That file could not be read.");
    return Response.json({ ok: true, notice: out.notice, name: out.name, text: out.text, next: out.next, fallback });
  } catch {
    return fail(400, "That file could not be read.");
  }
}
