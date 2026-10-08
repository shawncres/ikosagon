/** Pure helpers for the agent desk panel (client-safe, no secrets). */

export type DeskToolResult = { name: string; ok: boolean; data: Record<string, unknown> };

/** Public demo accounts are shown as-is; any other account is masked to its last 2 digits */
export const DEMO_ACCOUNTS = new Set(["1001", "2044", "3300"]);

export function maskAccount(id: string | undefined | null): string {
  const digits = String(id ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (DEMO_ACCOUNTS.has(digits)) return `${digits} (demo)`;
  return `${"*".repeat(Math.max(2, digits.length - 2))}${digits.slice(-2)}`;
}

function humanWindow(w: unknown): string {
  return String(w ?? "").replace(/_/g, " ").trim();
}

/** Mask any account number embedded in an id like CASE-4006-123456 */
function maskInId(id: unknown): string {
  return String(id ?? "").replace(/-(\d{4,6})-/, (_m, acct: string) => `-${DEMO_ACCOUNTS.has(acct) ? acct : `**${acct.slice(-2)}`}-`);
}

/** One short line per tool result for the desk's event list */
export function toolEvent(t: DeskToolResult): string | null {
  const d = t.data ?? {};
  switch (t.name) {
    case "createCustomer":
      return t.ok && d.created === true ? `Account ${maskAccount(String(d.accountId ?? ""))} created` : t.ok ? null : "Account create failed";
    case "lookupAccount":
      return t.ok ? `Account ${maskAccount(String(d.accountId ?? ""))} verified` : "Account not found";
    case "createCase":
      return t.ok ? `Case ${maskInId(d.caseId)} opened` : "Case failed";
    case "scheduleCallback":
      return t.ok ? `Callback ${maskInId(d.callbackId)} · ${humanWindow(d.window)}` : "Callback failed";
    case "logDisposition":
      return t.ok ? "Disposition logged" : null;
    case "checkBalance":
      return t.ok ? "Balance checked" : null;
    case "offerPaymentPlan":
      return t.ok ? (d.eligible ? `Plan offered · ${String(d.months ?? "")} mo` : "Plan not eligible") : null;
    default:
      return null;
  }
}

/** Caller-facing slot rows for the desk (internal flags hidden, account masked) */
export function deskSlots(slots: Record<string, string>): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  if (slots.customerName) rows.push({ label: "Name", value: slots.customerName });
  if (slots.accountId) rows.push({ label: "Account", value: maskAccount(slots.accountId) });
  else if (slots.needsAccount === "true") rows.push({ label: "Account", value: "new customer" });
  if (slots.reason) rows.push({ label: "Issue", value: slots.reason });
  if (slots.need) rows.push({ label: "Need", value: slots.need });
  if (slots.offer) rows.push({ label: "Offer", value: slots.offer.replace(/_/g, " ") });
  if (slots.amount) rows.push({ label: "Amount", value: slots.amount });
  if (slots.planMonths) rows.push({ label: "Plan", value: `${slots.planMonths} months` });
  if (slots.callbackWindow) rows.push({ label: "Callback", value: humanWindow(slots.callbackWindow) });
  return rows;
}

/** "m:ss" call timer */
export function formatCallTime(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
