import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import type { CreateCustomerInput, CustomerRecord } from "./types";
import { sanitizeAccountId, sanitizeCustomerName, sanitizeNotes } from "./validate";

const SEED: CustomerRecord[] = [
  {
    accountId: "1001",
    name: "Alex Rivera",
    createdAt: "2026-01-01T00:00:00.000Z",
    notes: { seed: true },
    balance: 248.5,
    currency: "USD",
    status: "active",
    planEligible: true,
    lastPayment: "2026-08-12",
    productInterest: ["pro", "support_plus"],
  },
  {
    accountId: "2044",
    name: "Jordan Lee",
    createdAt: "2026-01-01T00:00:00.000Z",
    notes: { seed: true },
    balance: 912.0,
    currency: "USD",
    status: "past_due",
    planEligible: true,
    lastPayment: "2026-05-01",
    productInterest: ["basic"],
  },
  {
    accountId: "3300",
    name: "Sam Okonkwo",
    createdAt: "2026-01-01T00:00:00.000Z",
    notes: { seed: true },
    balance: 0,
    currency: "USD",
    status: "active",
    planEligible: false,
    lastPayment: "2026-09-28",
    productInterest: ["enterprise"],
  },
];

export type CrmBackend = "neon" | "memory";

export type CrmStore = {
  backend: CrmBackend;
  ensureReady(): Promise<void>;
  getByAccountId(accountId: string): Promise<CustomerRecord | null>;
  createCustomer(input: CreateCustomerInput): Promise<CustomerRecord>;
  listRecent(limit?: number): Promise<CustomerRecord[]>;
};

function databaseUrl(): string | null {
  const url =
    process.env.DATABASE_URL?.trim() ||
    process.env.POSTGRES_URL?.trim() ||
    process.env.POSTGRES_PRISMA_URL?.trim() ||
    "";
  return url || null;
}

function rowToCustomer(row: Record<string, unknown>): CustomerRecord {
  const interest = row.product_interest;
  return {
    accountId: String(row.account_id),
    name: String(row.name),
    createdAt: new Date(String(row.created_at)).toISOString(),
    notes:
      row.notes && typeof row.notes === "object" && !Array.isArray(row.notes)
        ? (row.notes as Record<string, unknown>)
        : {},
    balance: Number(row.balance ?? 0),
    currency: String(row.currency ?? "USD"),
    status: String(row.status ?? "active"),
    planEligible: Boolean(row.plan_eligible),
    lastPayment: row.last_payment ? String(row.last_payment).slice(0, 10) : null,
    productInterest: Array.isArray(interest) ? interest.map(String) : [],
  };
}

/** In-memory fallback when Neon is not linked (warm instance only). */
function createMemoryStore(): CrmStore {
  const map = new Map<string, CustomerRecord>();
  for (const s of SEED) map.set(s.accountId, { ...s, notes: { ...s.notes } });
  let nextId = 4001;

  return {
    backend: "memory",
    async ensureReady() {
      /* seeded above */
    },
    async getByAccountId(accountId: string) {
      const id = sanitizeAccountId(accountId);
      if (!id) return null;
      return map.get(id) ?? null;
    },
    async createCustomer(input: CreateCustomerInput) {
      const name = sanitizeCustomerName(input.name);
      if (!name) throw new Error("Invalid customer name.");
      const notes = sanitizeNotes(input.notes);
      // Find next free id
      while (map.has(String(nextId))) nextId += 1;
      const accountId = String(nextId);
      nextId += 1;
      const record: CustomerRecord = {
        accountId,
        name,
        createdAt: new Date().toISOString(),
        notes: { ...notes, source: "ikoline_demo" },
        balance: 0,
        currency: "USD",
        status: "active",
        planEligible: true,
        lastPayment: null,
        productInterest: [],
      };
      map.set(accountId, record);
      return record;
    },
    async listRecent(limit = 20) {
      return [...map.values()]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, Math.min(50, Math.max(1, limit)));
    },
  };
}

function createNeonStore(url: string): CrmStore {
  const sql: NeonQueryFunction<false, false> = neon(url);
  let ready: Promise<void> | null = null;

  async function migrateAndSeed() {
    // DDL + seed via parameterized-safe static SQL only (no user input).
    await sql`
      CREATE TABLE IF NOT EXISTS ikoline_customers (
        account_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        notes JSONB NOT NULL DEFAULT '{}'::jsonb,
        balance NUMERIC(12, 2) NOT NULL DEFAULT 0,
        currency TEXT NOT NULL DEFAULT 'USD',
        status TEXT NOT NULL DEFAULT 'active',
        plan_eligible BOOLEAN NOT NULL DEFAULT TRUE,
        last_payment DATE,
        product_interest JSONB NOT NULL DEFAULT '[]'::jsonb
      )
    `;
    for (const s of SEED) {
      await sql`
        INSERT INTO ikoline_customers (
          account_id, name, balance, currency, status, plan_eligible,
          last_payment, product_interest, notes
        ) VALUES (
          ${s.accountId},
          ${s.name},
          ${s.balance},
          ${s.currency},
          ${s.status},
          ${s.planEligible},
          ${s.lastPayment ?? null},
          ${JSON.stringify(s.productInterest ?? [])}::jsonb,
          ${JSON.stringify(s.notes)}::jsonb
        )
        ON CONFLICT (account_id) DO NOTHING
      `;
    }
  }

  return {
    backend: "neon",
    ensureReady() {
      if (!ready) ready = migrateAndSeed().catch((err) => {
        ready = null;
        throw err;
      });
      return ready;
    },
    async getByAccountId(accountId: string) {
      const id = sanitizeAccountId(accountId);
      if (!id) return null;
      await this.ensureReady();
      const rows = await sql`
        SELECT account_id, name, created_at, notes, balance, currency, status,
               plan_eligible, last_payment, product_interest
        FROM ikoline_customers
        WHERE account_id = ${id}
        LIMIT 1
      `;
      const row = rows[0] as Record<string, unknown> | undefined;
      return row ? rowToCustomer(row) : null;
    },
    async createCustomer(input: CreateCustomerInput) {
      const name = sanitizeCustomerName(input.name);
      if (!name) throw new Error("Invalid customer name.");
      const notes = sanitizeNotes({ ...input.notes, source: "ikoline_demo" });
      await this.ensureReady();

      // Next id: max numeric account_id >= 4000, else 4001 — computed in SQL, not from LLM.
      const maxRows = await sql`
        SELECT COALESCE(
          MAX(CASE WHEN account_id ~ '^[0-9]+$' AND account_id::int >= 4000
                   THEN account_id::int END),
          4000
        ) AS max_id
        FROM ikoline_customers
      `;
      const maxId = Number((maxRows[0] as { max_id?: number })?.max_id ?? 4000);
      const accountId = String(maxId + 1);

      const rows = await sql`
        INSERT INTO ikoline_customers (
          account_id, name, notes, balance, currency, status, plan_eligible, product_interest
        ) VALUES (
          ${accountId},
          ${name},
          ${JSON.stringify(notes)}::jsonb,
          0,
          'USD',
          'active',
          TRUE,
          '[]'::jsonb
        )
        RETURNING account_id, name, created_at, notes, balance, currency, status,
                  plan_eligible, last_payment, product_interest
      `;
      const row = rows[0] as Record<string, unknown>;
      return rowToCustomer(row);
    },
    async listRecent(limit = 20) {
      await this.ensureReady();
      const safeLimit = Math.min(50, Math.max(1, Math.floor(limit)));
      const rows = await sql`
        SELECT account_id, name, created_at, notes, balance, currency, status,
               plan_eligible, last_payment, product_interest
        FROM ikoline_customers
        ORDER BY created_at DESC
        LIMIT ${safeLimit}
      `;
      return (rows as Record<string, unknown>[]).map(rowToCustomer);
    },
  };
}

let singleton: CrmStore | null = null;

export function getCrmStore(): CrmStore {
  if (singleton) return singleton;
  const url = databaseUrl();
  singleton = url ? createNeonStore(url) : createMemoryStore();
  return singleton;
}

/** Test helper — reset singleton between checks */
export function resetCrmStoreForTests() {
  singleton = null;
}

export function getSeedAccounts(): CustomerRecord[] {
  return SEED.map((s) => ({ ...s, notes: { ...s.notes } }));
}
