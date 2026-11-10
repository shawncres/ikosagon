import path from "node:path";
import { createRequire } from "node:module";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * On-demand enhance for one .ikolearn file. The body is the file. It is handled in memory and not logged or stored.
 * Lesson text is never written to a log. The response is the enhanced file plus a short notice.
 */
export async function POST(request: Request) {
  const text = await request.text();
  const require = createRequire(path.join(process.cwd(), "public/ikolearn/enhance.js"));
  const out = require("./enhance.js").enhanceText(text);
  if (!out.ok) return Response.json({ ok: false, notice: out.notice }, { status: 400 });
  return Response.json({ ok: true, notice: out.notice, name: out.name, text: out.text, next: out.next });
}
