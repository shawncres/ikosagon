import {
  getCrmStore,
  sanitizeAccountId,
  sanitizeCustomerName,
  type CustomerRecord,
} from "@/lib/ikoline/crm";
import type { SlotMap, ToolResult } from "./types";

export const TOOL_NAMES = [
  "lookupAccount",
  "createCustomer",
  "createCase",
  "scheduleCallback",
  "offerPaymentPlan",
  "checkBalance",
  "logDisposition",
] as const;

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
            flow: "ikoline",
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
      const months = Number(extra?.months ?? slots.planMonths ?? 3);
      const safeMonths = Number.isFinite(months) ? Math.min(24, Math.max(1, Math.floor(months))) : 3;
      const installment = Math.round((balance / Math.max(1, safeMonths)) * 100) / 100;
      return {
        name,
        ok: account.planEligible && balance > 0,
        data: {
          eligible: account.planEligible && balance > 0,
          months: safeMonths,
          installment,
          currency: account.currency,
          total: balance,
        },
      };
    }
    case "createCase": {
      const account = await resolveCustomer(slots);
      const accountId = account?.accountId ?? sanitizeAccountId(slots.accountId || "") ?? "unknown";
      return {
        name,
        ok: true,
        data: {
          caseId: `CASE-${accountId}-${String(Date.now()).slice(-6)}`,
          reason: slots.reason || String(extra?.reason ?? "general").slice(0, 80),
          priority: slots.priority || "normal",
          status: "open",
        },
      };
    }
    case "scheduleCallback": {
      const account = await resolveCustomer(slots);
      const accountId = account?.accountId ?? sanitizeAccountId(slots.accountId || "") ?? "unknown";
      return {
        name,
        ok: true,
        data: {
          callbackId: `CB-${accountId}-${String(Date.now()).slice(-5)}`,
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

/** Apply tool side-effects into slots (accountId / customerName from CRM). */
export function applyToolSlots(slots: SlotMap, tools: ToolResult[]): SlotMap {
  const next: SlotMap = { ...slots };
  for (const tr of tools) {
    if (!tr.ok) continue;
    if (tr.name === "lookupAccount" || tr.name === "createCustomer") {
      const id = sanitizeAccountId(tr.data.accountId);
      if (id) next.accountId = id;
      const nm = sanitizeCustomerName(tr.data.name);
      if (nm) next.customerName = nm;
      if (tr.name === "createCustomer" && tr.data.created === true) {
        next.accountCreated = "true";
      }
    }
  }
  return next;
}
