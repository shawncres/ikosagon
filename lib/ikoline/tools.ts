import type { SlotMap, ToolResult } from "./types";

/** Deterministic demo accounts for mock CRM tools */
const DEMO_ACCOUNTS: Record<
  string,
  {
    accountId: string;
    name: string;
    balance: number;
    currency: string;
    status: string;
    planEligible: boolean;
    lastPayment?: string;
    productInterest?: string[];
  }
> = {
  "1001": {
    accountId: "1001",
    name: "Alex Rivera",
    balance: 248.5,
    currency: "USD",
    status: "active",
    planEligible: true,
    lastPayment: "2026-08-12",
    productInterest: ["pro", "support_plus"],
  },
  "2044": {
    accountId: "2044",
    name: "Jordan Lee",
    balance: 912.0,
    currency: "USD",
    status: "past_due",
    planEligible: true,
    lastPayment: "2026-05-01",
    productInterest: ["basic"],
  },
  "3300": {
    accountId: "3300",
    name: "Sam Okonkwo",
    balance: 0,
    currency: "USD",
    status: "active",
    planEligible: false,
    lastPayment: "2026-09-28",
    productInterest: ["enterprise"],
  },
};

function pickAccount(slots: SlotMap) {
  const id = (slots.accountId || "1001").replace(/\D/g, "") || "1001";
  return DEMO_ACCOUNTS[id] ?? {
    ...DEMO_ACCOUNTS["1001"],
    accountId: id,
    name: "Demo Customer",
  };
}

export const TOOL_NAMES = [
  "lookupAccount",
  "createCase",
  "scheduleCallback",
  "offerPaymentPlan",
  "checkBalance",
  "logDisposition",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export function runTool(name: string, slots: SlotMap, extra?: Record<string, unknown>): ToolResult {
  const account = pickAccount(slots);

  switch (name) {
    case "lookupAccount":
      return {
        name,
        ok: true,
        data: {
          accountId: account.accountId,
          name: account.name,
          status: account.status,
          verified: Boolean(slots.accountId || slots.last4),
        },
      };
    case "checkBalance":
      return {
        name,
        ok: true,
        data: {
          accountId: account.accountId,
          balance: account.balance,
          currency: account.currency,
          pastDue: account.status === "past_due",
          lastPayment: account.lastPayment ?? null,
        },
      };
    case "offerPaymentPlan": {
      const balance = account.balance;
      const months = Number(extra?.months ?? slots.planMonths ?? 3);
      const installment = Math.round((balance / Math.max(1, months)) * 100) / 100;
      return {
        name,
        ok: account.planEligible && balance > 0,
        data: {
          eligible: account.planEligible && balance > 0,
          months,
          installment,
          currency: account.currency,
          total: balance,
        },
      };
    }
    case "createCase":
      return {
        name,
        ok: true,
        data: {
          caseId: `CASE-${account.accountId}-${String(Date.now()).slice(-6)}`,
          reason: slots.reason || String(extra?.reason ?? "general"),
          priority: slots.priority || "normal",
          status: "open",
        },
      };
    case "scheduleCallback":
      return {
        name,
        ok: true,
        data: {
          callbackId: `CB-${account.accountId}-${String(Date.now()).slice(-5)}`,
          window: slots.callbackWindow || "next_business_day_afternoon",
          phone: slots.phone || "(demo) on file",
        },
      };
    case "logDisposition":
      return {
        name,
        ok: true,
        data: {
          disposition: slots.disposition || String(extra?.disposition ?? "completed"),
          accountId: account.accountId,
          notes: slots.notes || "",
          loggedAt: new Date().toISOString(),
        },
      };
    default:
      return { name, ok: false, data: { error: `Unknown tool: ${name}` } };
  }
}

/** Heuristic: which tools to fire for a given intent at a node */
export function toolsForIntent(
  intent: string | null,
  allowed: string[] | undefined,
  flowTools: string[],
): string[] {
  const pool = new Set([...(allowed ?? []), ...flowTools]);
  const map: Record<string, string[]> = {
    verify_identity: ["lookupAccount"],
    provide_account: ["lookupAccount"],
    ask_balance: ["checkBalance"],
    arrange_payment: ["offerPaymentPlan", "checkBalance"],
    accept_plan: ["offerPaymentPlan", "logDisposition"],
    create_ticket: ["createCase"],
    request_callback: ["scheduleCallback"],
    escalate: ["createCase", "logDisposition"],
    resolve: ["logDisposition"],
    close_won: ["logDisposition"],
    objection: [],
  };
  if (!intent) return [];
  return (map[intent] ?? []).filter((t) => pool.has(t));
}
