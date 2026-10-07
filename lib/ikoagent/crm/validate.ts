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

/** Words that end a name ("this is Jordan and my login broke" → "Jordan") */
const NAME_STOP = new Set([
  "and", "but", "my", "with", "from", "about", "calling", "here", "again", "please", "account",
  "the", "a", "an", "on", "in", "at", "for", "to", "of", "so", "because", "who", "that", "which",
  "speaking", "is", "was", "and", "or", "i", "im", "i'm", "it", "its", "it's",
]);

/** First words that mean the phrase is not a name ("I'm new", "I'm frustrated", "no") */
const NOT_A_NAME = new Set([
  "new", "sorry", "having", "calling", "not", "just", "looking", "trying", "still", "really", "good",
  "fine", "ok", "okay", "here", "very", "so", "frustrated", "upset", "angry", "confused", "locked",
  "waiting", "wondering", "interested", "done", "ready", "back", "sure", "yes", "yeah", "no", "nope",
  "nah", "hi", "hello", "hey", "thanks", "thank", "i", "it", "was", "is", "the", "my", "a", "an",
  "this", "that", "what", "why", "how", "when", "where", "can", "could", "would", "will", "do",
  "does", "did", "don't", "dont", "have", "had", "need", "want", "got", "get", "charged", "billed",
  "never", "on", "in", "at", "for", "to", "of", "with", "about", "please", "help", "account",
  "been", "being", "going", "gone", "over", "tomorrow", "today", "tonight", "morning", "afternoon",
  "evening", "refund", "replacement", "both", "either", "sounds", "perfect", "great", "cool", "all",
  "nothing", "something", "maybe", "probably", "actually", "well", "um", "uh", "hmm", "great",
]);

/** Trim a captured phrase down to a plausible 1–3 word personal name, or null */
export function nameFromPhrase(phrase: string): string | null {
  const tokens = phrase
    .replace(/[.,!?;:]+.*$/, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!tokens.length || NOT_A_NAME.has(tokens[0].toLowerCase())) return null;
  const kept: string[] = [];
  for (const tok of tokens) {
    if (NAME_STOP.has(tok.toLowerCase())) break;
    if (!/^[A-Za-z][A-Za-z.'\-]*$/.test(tok)) break;
    kept.push(tok);
    if (kept.length === 3) break;
  }
  if (!kept.length) return null;
  const candidate = kept.join(" ");
  if (/\d/.test(candidate)) return null;
  if (/package|refund|account|help|late|order|billing|login|password|charge|ship|track/i.test(candidate)) {
    return null;
  }
  return sanitizeCustomerName(candidate);
}

export function extractCustomerName(
  text: string,
  opts: { allowBare?: boolean } = {},
): string | null {
  const t = text.trim();
  const intro = t.match(/\b(?:my name is|name's|i(?:'m| am)|this is|call me)\s+([A-Za-z][A-Za-z .,'\-]{1,58})/i);
  if (intro?.[1]) {
    const n = nameFromPhrase(intro[1]);
    if (n) return n;
  }
  // Bare reply like "Maya Chen" — only when we just asked for a name (caller decides)
  if (opts.allowBare !== false && /^[A-Za-z][A-Za-z .'\-]{1,40}$/.test(t) && t.split(/\s+/).length <= 3) {
    const n = nameFromPhrase(t);
    if (n && n.split(" ").length === t.replace(/[.!]+$/, "").split(/\s+/).length) return n;
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
