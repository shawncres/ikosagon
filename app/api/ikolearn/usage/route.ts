import { Resend } from "resend";
import { clientIp } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST { sessions, lessons_completed, cards_earned, subjects_added, level_chosen, iko_opened, exports, generation_retries }
 * -> 204. Emails the anonymous IkoLearn usage counts (numbers only, plus the lesson level word) to Ikosagon.
 * Unknown fields are dropped; nothing about the learner (no IP, name, topic or text) is put in the email or kept.
 */
const NUMS = ["sessions", "lessons_completed", "cards_earned", "subjects_added", "iko_opened", "exports", "generation_retries"] as const;
const LEVELS = ["simple", "standard", "deeper"];
const TO = "shawn@ikosagon.com";

/* a few sends per IP per hour, in memory only, so a script can't flood the inbox */
const seen = new Map<string, number[]>();
function limited(ip: string): boolean {
  const now = Date.now(), recent = (seen.get(ip) || []).filter((t) => now - t < 3600_000);
  recent.push(now); seen.set(ip, recent);
  if (seen.size > 5000) seen.clear();
  return recent.length > 5;
}

function count(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.min(1_000_000, Math.floor(n)) : 0;
}

function usageText(raw: Record<string, unknown>, now = new Date()): string {
  const lvl = typeof raw.level_chosen === "string" && LEVELS.includes(raw.level_chosen) ? raw.level_chosen : "(not chosen)";
  const hour = now.toISOString().slice(0, 13) + ":00 UTC";
  return ["IkoLearn anonymous usage (this browser, all time)", `Reported: ${hour}`, "", ...NUMS.map((k) => `${k}: ${count(raw[k])}`), `level_chosen: ${lvl}`].join("\n");
}

export async function POST(request: Request) {
  const quiet = new Response(null, { status: 204 });
  try {
    if (limited(clientIp(request))) return quiet;
    const raw = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!raw || typeof raw !== "object") return quiet;
    const key = process.env.RESEND_API_KEY, from = process.env.CONTACT_FROM_EMAIL;
    if (!key || !from) return quiet;
    await new Resend(key).emails.send({ to: TO, from, subject: "IkoLearn anonymous usage", text: usageText(raw) });
  } catch {
    /* silent: the learner never sees a usage failure */
  }
  return quiet;
}
