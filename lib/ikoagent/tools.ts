import {
  getCrmStore,
  sanitizeAccountId,
  sanitizeCustomerName,
  type CustomerRecord,
} from "@/lib/ikoagent/crm";
import type { SlotMap, ToolResult } from "./types";
import { planMaxMonths, promiseSummary } from "./domain";

export const TOOL_NAMES = [
  "lookupAccount",
  "createCustomer",
  "createCase",
  "scheduleCallback",
  "offerPaymentPlan",
  "checkBalance",
  "logDisposition",
  "recordPromiseToPay",
] as const;

/** Short numeric suffix for ids; callers without an account get no "unknown" in the id */
function idFor(prefix: string, accountId: string | null | undefined, digits: number): string {
  const tail = String(Date.now()).slice(-digits);
  return accountId ? `${prefix}-${accountId}-${tail}` : `${prefix}-${tail}`;
}

export type ToolName = (typeof TOOL_NAMES)[number];

function customerToToolShape(c: CustomerRecord) {
  return {
    accountId: c.accountId,
    name: c.name,
    balance: c.balance,
    currency: c.currency,
    status: c.status,
    planEligible: c.planEligible,
    lastPayment: c.lastPayment ?? null,
    productInterest: c.productInterest ?? [],
    createdAt: c.createdAt,
  };
}

async function resolveCustomer(slots: SlotMap): Promise<CustomerRecord | null> {
  const crm = getCrmStore();
  const id = sanitizeAccountId(slots.accountId || slots.last4 || "");
  if (!id) return null;
  return crm.getByAccountId(id);
}

/**
 * Tool layer is the ONLY place that touches CRM / SQL.
 * Never pass raw LLM output into queries — sanitize first.
 */
export async function runTool(
  name: string,
  slots: SlotMap,
  extra?: Record<string, unknown>,
): Promise<ToolResult> {
  const crm = getCrmStore();

  switch (name) {
    case "lookupAccount": {
      const account = await resolveCustomer(slots);
      if (!account) {
        return {
          name,
          ok: false,
          data: {
            error: "Account not found. You can use 1001, 2044, 3300, or set up a new demo account with your name.",
            verified: false,
          },
        };
      }
      return {
        name,
        ok: true,
        data: {
          ...customerToToolShape(account),
          verified: Boolean(sanitizeAccountId(slots.accountId || slots.last4 || "")),
        },
      };
    }
    case "createCustomer": {
      const customerName = sanitizeCustomerName(slots.customerName || slots.name || "");
      if (!customerName) {
        return {
          name,
          ok: false,
          data: { error: "A valid name is required to create an account (letters only, 2–60 chars)." },
        };
      }
      // If they already have an account id that exists, just return it
      const existingId = sanitizeAccountId(slots.accountId || "");
      if (existingId) {
        const existing = await crm.getByAccountId(existingId);
        if (existing) {
          return {
            name,
            ok: true,
            data: { ...customerToToolShape(existing), created: false },
          };
        }
      }
      try {
        await crm.ensureReady();
        const created = await crm.createCustomer({
          name: customerName,
          notes: {
            reason: typeof slots.reason === "string" ? slots.reason.slice(0, 80) : undefined,
            flow: "ikoagent",
          },
        });
        return {
          name,
          ok: true,
          data: { ...customerToToolShape(created), created: true },
        };
      } catch (err) {
        return {
          name,
          ok: false,
          data: {
            error: err instanceof Error ? err.message : "Could not create account.",
          },
        };
      }
    }
    case "checkBalance": {
      const account = await resolveCustomer(slots);
      if (!account) {
        return { name, ok: false, data: { error: "Account not found." } };
      }
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
    }
    case "offerPaymentPlan": {
      const account = await resolveCustomer(slots);
      if (!account) {
        return { name, ok: false, data: { error: "Account not found." } };
      }
      const balance = account.balance;
      const maxMonths = planMaxMonths(balance);
      const asked = Number(extra?.months ?? slots.planMonths ?? 0);
      const requested = Number.isFinite(asked) && asked > 0 ? Math.floor(asked) : 0;
      // Standard plans only (payment-plans policy); no request → the longest standard plan
      const months = requested || maxMonths || 3;
      const withinPolicy = account.planEligible && maxMonths > 0 && months <= maxMonths;
      const eligible = withinPolicy && balance > 0;
      const installment = Math.round((balance / Math.max(1, months)) * 100) / 100;
      return {
        name,
        ok: account.planEligible && balance > 0,
        data: {
          eligible,
          withinPolicy,
          months,
          maxMonths,
          installment: eligible ? installment : null,
          maxInstallment: maxMonths > 0 ? Math.round((balance / maxMonths) * 100) / 100 : null,
          currency: account.currency,
          total: balance,
        },
      };
    }
    case "recordPromiseToPay": {
      const account = await resolveCustomer(slots);
      const date = (slots.promiseDate || "").slice(0, 40);
      if (!account || !date) {
        return { name, ok: false, data: { error: !account ? "Account not found." : "A pay date is required." } };
      }
      const amount = Number(slots.payAmount || 0);
      const capped = amount > 0 ? Math.min(amount, account.balance) : null;
      // Deterministic id (same in the predicted and live pass): account + date
      const key = [...date.toLowerCase()].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 9000, 7) + 1000;
      return {
        name,
        ok: account.balance > 0,
        data: {
          ptpId: `PTP-${account.accountId}-${key}`,
          date,
          amount: capped,
          partial: capped != null && capped < account.balance,
          currency: account.currency,
          summary: promiseSummary(capped != null ? String(capped) : null, date, account.currency),
        },
      };
    }
    case "createCase": {
      const account = await resolveCustomer(slots);
      const accountId = account?.accountId ?? sanitizeAccountId(slots.accountId || "");
      return {
        name,
        ok: true,
        data: {
          caseId: idFor("CASE", accountId, 6),
          reason: slots.reason || String(extra?.reason ?? "general").slice(0, 80),
          priority: slots.priority || "normal",
          status: "open",
        },
      };
    }
    case "scheduleCallback": {
      const account = await resolveCustomer(slots);
      const accountId = account?.accountId ?? sanitizeAccountId(slots.accountId || "");
      return {
        name,
        ok: true,
        data: {
          callbackId: idFor("CB", accountId, 5),
          window: slots.callbackWindow || "next_business_day_afternoon",
          phone: slots.phone || "(demo) on file",
        },
      };
    }
    case "logDisposition": {
      const account = await resolveCustomer(slots);
      return {
        name,
        ok: true,
        data: {
          disposition: slots.disposition || String(extra?.disposition ?? "completed").slice(0, 80),
          accountId: account?.accountId ?? sanitizeAccountId(slots.accountId || "") ?? "unknown",
          notes: (slots.notes || "").slice(0, 200),
          loggedAt: new Date().toISOString(),
        },
      };
    }
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
    provide_name: ["createCustomer"],
    no_account: [],
    ask_balance: ["checkBalance"],
    arrange_payment: ["offerPaymentPlan", "checkBalance"],
    accept_plan: ["offerPaymentPlan"],
    promise_date: ["recordPromiseToPay"],
    partial_amount: ["recordPromiseToPay"],
    dispute: ["createCase"],
    already_paid: ["createCase"],
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

/** Apply tool side-effects into slots (accountId / customerName from CRM). */
export function applyToolSlots(slots: SlotMap, tools: ToolResult[]): SlotMap {
  const next: SlotMap = { ...slots };
  for (const tr of tools) {
    if (!tr.ok) continue;
    if (tr.name === "lookupAccount" || tr.name === "createCustomer") {
      const id = sanitizeAccountId(tr.data.accountId);
      if (id) next.accountId = id;
      // The name the caller gave wins. Demo accounts are shared (everyone can use 1001), and
      // reading the record's holder name back to a caller who said a different name both
      // mislabels them and discloses who owns the account. The record's name only fills in
      // when the caller hasn't said one.
      const nm = sanitizeCustomerName(tr.data.name);
      if (nm && !sanitizeCustomerName(next.customerName || "")) next.customerName = nm;
      if (tr.name === "createCustomer" && tr.data.created === true) {
        next.accountCreated = "true";
      }
    }
    // Plan policy facts → slots the scripts branch on (never set by the model)
    if (tr.name === "checkBalance" && typeof tr.data.balance === "number") {
      const max = planMaxMonths(tr.data.balance);
      if (max > 0) next.planMaxMonths = String(max);
    }
    if (tr.name === "offerPaymentPlan") {
      if (Number(tr.data.maxMonths) > 0) next.planMaxMonths = String(tr.data.maxMonths);
      if (tr.data.eligible) {
        next.planOk = "true";
        next.planMonths = String(tr.data.months);
        next.planInstallment = `${tr.data.currency ?? "USD"} ${Number(tr.data.installment).toFixed(2)}`;
        delete next.planOutOfPolicy;
      } else {
        delete next.planOk;
        if (tr.data.withinPolicy === false) next.planOutOfPolicy = "true";
        if (tr.data.maxInstallment != null) next.planMaxInstallment = `${tr.data.currency ?? "USD"} ${Number(tr.data.maxInstallment).toFixed(2)}`;
      }
    }
    if (tr.name === "recordPromiseToPay") {
      next.ptpId = String(tr.data.ptpId);
      next.promiseSummary = String(tr.data.summary);
    }
  }
  return next;
}
