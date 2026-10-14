/**
 * Deterministic domain helpers for the collections / sales / CS skins: dates,
 * amounts, plan policy, sales needs and plan fit. Pure functions — no I/O, no model.
 * Everything here mirrors an authored corpus line, so spoken facts stay grounded.
 */
import type { SlotMap } from "./types";

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

/** Standard plan policy (corpus: collections/payment-plans.md). 0 = specialist only. */
export function planMaxMonths(balance: number): number {
  if (!(balance > 0)) return 0;
  if (balance < 500) return 3;
  if (balance <= 1500) return 6;
  return 0;
}

const WEEKDAY = "(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)";
const MONTH =
  "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const DATE_PATTERNS: RegExp[] = [
  new RegExp(`\\b(?:this |next |on )?${WEEKDAY}\\b`, "i"),
  new RegExp(`\\b${MONTH}\\.? \\d{1,2}(?:st|nd|rd|th)?\\b`, "i"),
  /\b(?:on )?the \d{1,2}(?:st|nd|rd|th)\b/i,
  /\b\d{1,2}\/\d{1,2}\b/,
  /\b(?:today|tomorrow|tonight)\b/i,
  /\b(?:next week|end of (?:the )?month|end of (?:the )?week|my next payday|next payday|payday|first of (?:the )?month)\b/i,
];

/** A spoken pay date ("Friday", "next Friday", "Oct 20", "the 15th", "payday"), or null */
export function extractPromiseDate(text: string): string | null {
  for (const re of DATE_PATTERNS) {
    const m = text.match(re);
    if (m) {
      const v = m[0].replace(/^on\s+/i, "").trim().toLowerCase();
      return v.replace(new RegExp(`\\b${WEEKDAY}\\b`, "i"), (d) => d[0].toUpperCase() + d.slice(1));
    }
  }
  return null;
}

/** "$100", "100 dollars", "50 bucks" → "100.00"; never account numbers or month counts */
export function extractPayAmount(text: string): string | null {
  const m = text.match(/\$\s?(\d{1,5}(?:[.,]\d{2})?)\b|\b(\d{1,5}(?:\.\d{2})?)\s*(?:dollars|bucks|usd)\b/i);
  const raw = m?.[1] ?? m?.[2];
  if (!raw) return null;
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n.toFixed(2) : null;
}

/** Hardship kind for the case note (corpus: hardship-assistance.md) */
export function hardshipKind(text: string): string | null {
  const t = text.toLowerCase();
  if (/\b(lost (?:my )?job|laid off|unemployed|out of work|fired|hours (?:got )?cut)\b/.test(t)) return "job loss";
  if (/\b(medical|hospital|surgery|illness|sick|cancer|injur(?:y|ed))\b/.test(t)) return "medical";
  if (/\b(fire|flood|hurricane|storm|disaster|earthquake)\b/.test(t)) return "disaster";
  if (/\b(divorce|death|passed away|funeral|bereavement)\b/.test(t)) return "family emergency";
  return null;
}

/** Sentence for a recorded promise-to-pay */
export function promiseSummary(amount: string | null | undefined, date: string, currency = "USD"): string {
  const a = amount && Number(amount) > 0 ? `${currency} ${Number(amount).toFixed(2)}` : "a payment";
  return `${a} on ${date}`;
}

// ---------------------------------------------------------------------------
// Sales
// ---------------------------------------------------------------------------

const NEEDS: [RegExp, string][] = [
  [/\bsso\b|single sign[- ]?on|\bsaml\b|\bokta\b/i, "SSO"],
  [/security review|security questionnaire|compliance|soc ?2|\bhipaa\b|vendor review/i, "a security review"],
  [/phone support|call support|talk to (?:a )?(?:person|human)/i, "phone support"],
  [/better support|faster support|priority support|support plus/i, "better support"],
  [/analytics|reporting|dashboards?|insights/i, "analytics"],
  [/cheaper|lower[- ]cost|less expensive|save money|cut costs|budget/i, "a lower-cost plan"],
  [/more seats|growing team|add (?:more )?(?:users|people|seats)|team plan|for my team|scale up|upgrade/i, "room for a growing team"],
  [/\bintegrations?\b|\bapi\b|connect (?:to|with)/i, "integrations"],
  [/\btrial\b/i, "a trial"],
];

/** Short, speakable need from discovery talk ("we need SSO" → "SSO"), or "" */
export function needFromText(text: string): string {
  for (const [re, need] of NEEDS) if (re.test(text)) return need;
  return "";
}

const NUMBER_WORDS: Record<string, number> = {
  two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11,
  twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, hundred: 100,
};

/** "about ten seats", "team of 8", "12 people" → "10" / "8" / "12" */
export function teamSizeFromText(text: string): string | null {
  const m = text.match(/\b(\d{1,4}|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|hundred)\s*(?:\+\s*)?(?:seats?|users?|people|employees|agents|person team|-person|reps?)\b|\bteam of (?:about |around |roughly |maybe )?(\d{1,4}|[a-z]+)\b/i);
  const raw = (m?.[1] ?? m?.[2])?.toLowerCase();
  if (!raw) return null;
  const n = /^\d+$/.test(raw) ? Number(raw) : NUMBER_WORDS[raw];
  return n && n > 0 && n < 100000 ? String(n) : null;
}

/** Plan facts — the same words as the caller lines in corpus/sales/plan-comparison.md */
export const PLAN_FACTS = {
  basic: "Basic includes email support, 3 seats, and core analytics.",
  pro: "Pro adds priority chat and phone support, 15 seats, and an optional SSO add-on.",
  enterprise: "Enterprise adds a custom security review, dedicated success support, and unlimited seats.",
} as const;

/** Best-fit plan from need / team size / stated offer (deterministic, corpus-backed) */
export function recommendPlan(slots: SlotMap): { plan: "Basic" | "Pro" | "Enterprise"; why: string } | null {
  const need = (slots.need ?? "").toLowerCase();
  const seats = Number(slots.teamSize) || 0;
  if (!need && !seats) return null;
  if (need.includes("security review") || seats > 15) {
    return { plan: "Enterprise", why: PLAN_FACTS.enterprise };
  }
  if (need === "sso" || need.includes("phone support") || need.includes("better support") || seats > 3 || need.includes("growing team")) {
    return { plan: "Pro", why: PLAN_FACTS.pro };
  }
  return { plan: "Basic", why: PLAN_FACTS.basic };
}

/** Honest, no-pressure upgrade note when the chosen plan misses a stated need */
export function upsellNote(slots: SlotMap): string {
  const offer = (slots.offer ?? "").toLowerCase();
  const need = (slots.need ?? "").toLowerCase();
  const seats = Number(slots.teamSize) || 0;
  if (offer === "basic") {
    if (need === "sso") return "SSO isn't part of Basic — it's an add-on with Pro, so you can move up if it becomes a must-have.";
    if (need.includes("phone support")) return "phone support comes with Pro, so that's the upgrade path if email support isn't enough.";
    if (seats > 3) return "Basic covers 3 seats, so Pro is the fit once the team grows past that.";
  }
  if (offer === "pro" && (need.includes("security review") || seats > 15)) {
    return "a custom security review and more than 15 seats are Enterprise features, so we can bring in an account executive when you're ready.";
  }
  return "";
}

/** objection_price → "price" etc. */
export function objectionType(intent: string | null): string | null {
  const m = intent?.match(/^objection_(price|timing|competitor|authority)$/);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------------
// Customer service
// ---------------------------------------------------------------------------

export function looksLikeCancel(text: string): boolean {
  return /\b(cancel(?:l?ing|led|lation)?|close my account|end my (?:subscription|membership|plan)|unsubscribe)\b/i.test(text);
}

export function looksLikeRepeatCaller(text: string): boolean {
  return /\b(?:(?:second|third|fourth|fifth|\d+(?:st|nd|rd|th)) time (?:i'?m |i am |i've |i have )?(?:call|calling|called)|already called|called (?:before|already|yesterday|last week)|keep (?:having to )?call(?:ing)?|nobody (?:fixed|helped|called me back)|no one (?:fixed|helped|called me back)|still not fixed)\b/i.test(
    text,
  );
}

export function looksLikeAddressChange(text: string): boolean {
  return /\b(?:change|update|new)\b[^.?!]{0,20}\baddress\b|\bi(?:'ve| have)? moved\b/i.test(text);
}

/** Street address or Canadian postal code — its digits are never an account number */
export function looksLikeStreetAddress(text: string): boolean {
  return (
    /\b\d{1,6}\s+[A-Za-z][A-Za-z.' ]{1,40}\b(?:st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|way|ct|court|pl|place|cres|crescent)\b/i.test(text) ||
    /\b[A-Z]\d[A-Z][ -]?\d[A-Z]\d\b/i.test(text)
  );
}

/** A plausible street address or postal / ZIP code in caller text (demo: never stored) */
export function hasAddress(text: string): boolean {
  return looksLikeStreetAddress(text) || /\b\d{5}(?:-\d{4})?\b/.test(text);
}
