/** Strict validators for CRM writes — never trust LLM or raw caller text. */

const ACCOUNT_RE = /^\d{3,8}$/;
const NAME_RE = /^[A-Za-z][A-Za-z .'\-]{1,58}[A-Za-z.]$/;

export function sanitizeAccountId(raw: unknown): string | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const digits = String(raw).replace(/\D/g, "");
  if (!ACCOUNT_RE.test(digits)) return null;
  return digits;
}

export function sanitizeCustomerName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let name = raw
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  // Strip prompt-injection-ish fragments before validation
  name = name
    .replace(/ignore\s+(all|any|previous)\s+instructions/gi, "")
    .replace(/system\s+prompt/gi, "")
    .replace(/[{}`$]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (name.length < 2 || name.length > 60) return null;
  if (!NAME_RE.test(name)) return null;
  // Title-case lightly for display
  return name
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Only plain JSON-safe scalars/objects for notes — drop functions/prototypes */
export function sanitizeNotes(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (k.length > 40 || k.startsWith("__")) continue;
    if (typeof v === "string") out[k] = v.slice(0, 200);
    else if (typeof v === "number" || typeof v === "boolean" || v === null) out[k] = v;
  }
  return out;
}

export function extractCustomerName(text: string): string | null {
  const t = text.trim();
  const patterns = [
    /\b(?:my name is|i(?:'m| am)|this is|call me)\s+([A-Za-z][A-Za-z .'\-]{1,58})/i,
    /^([A-Za-z][A-Za-z .'\-]{1,40})$/,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (!m?.[1]) continue;
    // Avoid treating account digits / issue phrases as names
    const candidate = m[1].replace(/[.,!?]+$/, "").trim();
    if (/\d/.test(candidate)) continue;
    if (/package|refund|account|help|late|order|billing|login/i.test(candidate)) continue;
    const clean = sanitizeCustomerName(candidate);
    if (clean) return clean;
  }
  return null;
}

export function looksLikeNoAccount(text: string): boolean {
  const t = text.toLowerCase();
  return (
    /\b(don'?t|do not|dont)\s+have\s+(an?\s+)?account\b/.test(t) ||
    /\bno\s+account\b/.test(t) ||
    /\bnew\s+customer\b/.test(t) ||
    /\bset\s+(one|an account)\s+up\b/.test(t) ||
    /\bcreate\s+(an?\s+)?account\b/.test(t) ||
    /\bi(?:'m| am)\s+new\b/.test(t)
  );
}
