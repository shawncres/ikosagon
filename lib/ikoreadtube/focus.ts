/**
 * "Focus" = what the reader actually wants from a video (usually their YouTube search words).
 * A cheap rule-based rewrite turns search words into a question for the summary prompt (no extra LLM call).
 */

export const FOCUS_MAX = 80;
export const FOCUS_MIN = 2;

/** Control characters out, whitespace collapsed, quotes/brackets stripped (the text goes inside a prompt), capped. */
export function cleanFocus(raw: unknown): string {
  const t = String(raw ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/["`<>{}\\[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, FOCUS_MAX)
    .trim();
  return t.length >= FOCUS_MIN ? t : "";
}

/** Cache key part: the normalized focus ("" = general summary). */
export function focusKey(raw: unknown): string {
  return cleanFocus(raw).toLowerCase();
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Search words -> a focus question. First matching rule wins. */
export function focusQuestion(focusRaw: string): string {
  const f = cleanFocus(focusRaw);
  if (!f) return "";
  const low = f.toLowerCase();
  let m: RegExpExecArray | null;

  // Already a question: keep it.
  if (/\?$/.test(f) || /^(what|why|how|who|whom|whose|when|where|which|is|are|was|were|does|do|did|can|could|should|will|would)\b/.test(low)) {
    return cap(f.replace(/\?+$/, "")) + "?";
  }
  if ((m = /^(.+?)\s+(?:predictions?|forecasts?)$/.exec(f))) return `What predictions are made about ${m[1]}?`;
  if ((m = /^(.+?)\s+(?:picks|odds|bets|betting tips)$/.exec(f))) return `What picks and odds are given for ${m[1]}?`;
  if ((m = /^(.+?)\s+reviews?$/.exec(f))) return `What is the verdict on ${m[1]}, and what are its main pros and cons?`;
  if ((m = /^(.+?)\s+(?:vs\.?|versus)\s+(.+)$/i.exec(f))) return `How do ${m[1]} and ${m[2]} compare, and which one is recommended?`;
  if ((m = /^(?:best|top)\s+(.+)$/i.exec(f))) return `Which ${m[1]} are recommended as the best, and why?`;
  if ((m = /^(.+?)\s+(?:tutorial|guide|walkthrough|for beginners)$/i.exec(f))) return `What are the key steps to learn or do ${m[1]}?`;
  if ((m = /^(.+?)\s+(?:news|updates?|latest)$/i.exec(f)) || (m = /^(?:latest|news)\s+(.+)$/i.exec(f))) return `What are the latest developments about ${m[1]}?`;
  if ((m = /^(.+?)\s+(?:explained|explanation)$/i.exec(f))) return `What is ${m[1]} and how does it work?`;
  if ((m = /^(.+?)\s+(?:highlights|recap|results)$/i.exec(f))) return `What are the key moments and results for ${m[1]}?`;
  return `What does this video say about ${f}, and what are the key points?`;
}
