import path from "node:path";
import { createRequire } from "node:module";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * On-demand enhance for one .ikolearn file. The body is the file. It is handled in memory and not logged or stored.
 * Lesson text is never written to a log. A bad file is a short JSON error: 400 when it is empty or malformed, 413 when
 * it is over the size cap. This route does not answer 500 for those cases.
 */
export const MAX_BYTES = 8_000_000;

type EnhanceOut = { ok: boolean; notice?: string; name?: string; text?: string; next?: string[] };

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

function loadEnhance(): { enhanceText: (text: string) => EnhanceOut } {
  const file = path.join(process.cwd(), "public/ikolearn/enhance.js");
  const require = createRequire(file);
  return require("./enhance.js");
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
  try {
    const out = loadEnhance().enhanceText(text);
    if (!out || !out.ok) return fail(400, "That file could not be read.");
    return Response.json({ ok: true, notice: out.notice, name: out.name, text: out.text, next: out.next });
  } catch {
    return fail(400, "That file could not be read.");
  }
}
