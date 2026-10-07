-- IkoLine demo CRM (Neon Postgres Hobby free)
-- Run once after linking Neon to the Vercel project (DATABASE_URL / POSTGRES_URL).

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
);

CREATE INDEX IF NOT EXISTS ikoline_customers_created_at_idx
  ON ikoline_customers (created_at DESC);

-- Seed demo accounts (idempotent)
INSERT INTO ikoline_customers (
  account_id, name, balance, currency, status, plan_eligible, last_payment, product_interest, notes
) VALUES
  ('1001', 'Alex Rivera', 248.50, 'USD', 'active', TRUE, '2026-08-12', '["pro","support_plus"]'::jsonb, '{"seed":true}'::jsonb),
  ('2044', 'Jordan Lee', 912.00, 'USD', 'past_due', TRUE, '2026-05-01', '["basic"]'::jsonb, '{"seed":true}'::jsonb),
  ('3300', 'Sam Okonkwo', 0, 'USD', 'active', FALSE, '2026-09-28', '["enterprise"]'::jsonb, '{"seed":true}'::jsonb)
ON CONFLICT (account_id) DO NOTHING;
