import { Resend } from "resend";
import { clientIp } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST anonymous usage counts, plus a coarse picture of this visit (no learner name, lesson text, chat, or identifier).
 * -> 204. Unknown fields are dropped. The country and IP are never written into the email.
 */
const NUMS = ["sessions", "lessons_completed", "cards_earned", "subjects_added", "iko_opened", "exports", "generation_retries"] as const;
const LEVELS = ["simple", "standard", "deeper"];
const LENGTHS: Record<string, string> = {
  short: "under a minute",
  few: "a few minutes",
  ten: "about 10 minutes",
  half: "about half an hour",
  hour: "about an hour",
  long: "over an hour",
};
const WIDTHS = ["under 400", "400 to 800", "over 800"];
const TO = "shawn@ikosagon.com";

function names(v: unknown, n = 8): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    if (typeof item !== "string") continue;
    const s = item.replace(/[\r\n<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, 40);
    if (s.length < 2 || out.length >= n) continue;
    if (/@|https?:|\bname\b|\bid\b/i.test(s)) continue;
    out.push(s);
  }
  return out;
}

function when(now: Date): { utc: string; toronto: string } {
  const utc = now.toISOString().replace("T", " ").slice(0, 16) + " UTC";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  return { utc, toronto: `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")} America/Toronto` };
}

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

export function usageText(raw: Record<string, unknown>, now = new Date()): string {
  const lvl = typeof raw.level_chosen === "string" && LEVELS.includes(raw.level_chosen) ? raw.level_chosen : "(not chosen)";
  const stamp = when(now);
  const length = typeof raw.session_length === "string" && LENGTHS[raw.session_length] ? LENGTHS[raw.session_length] : "unknown";
  const device = raw.device === "mobile" || raw.device === "desktop" ? raw.device : "unknown";
  const width = typeof raw.width_bucket === "string" && WIDTHS.includes(raw.width_bucket) ? raw.width_bucket : "unknown";
  const subjects = names(raw.subjects);
  const top = names(raw.top_subjects, 3);
  const returning = raw.returning === 1 || raw.returning === true;
  const topics = count(raw.topic_count);
  const low = raw.low_activity === 1 || raw.low_activity === true;
  const lines = [
    "IkoLearn anonymous usage",
    "",
    `When: ${stamp.utc}`,
    `      ${stamp.toronto}`,
    `Session: ${length}`,
    `Device: ${device}, viewport ${width}`,
    `Subjects added: ${subjects.length ? subjects.join(", ") : "none"}`,
    returning ? `Cloud: returning, ${topics} topics` : "Cloud: new",
  ];
  if (low) lines.push("Activity: low-activity / possible test");
  if (top.length) lines.push(`Top subjects: ${top.join(", ")}`);
  lines.push("", "All-time counts (this browser)", ...NUMS.map((k) => `${k}: ${count(raw[k])}`), `level_chosen: ${lvl}`);
  return lines.join("\n");
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
