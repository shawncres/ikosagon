# IkoLine demo CRM (free tier)

## What it is

A small customer table for the IkoLine call-flow demo:

| Column | Notes |
|--------|--------|
| `account_id` | Text PK, seeded `1001` / `2044` / `3300`; new accounts start at `4001+` |
| `name` | Validated letters / spaces / hyphen / apostrophe only |
| `created_at` | Server timestamp |
| `notes` | JSONB (sanitized scalars only) |
| balance / status / … | Demo fields for collections/sales tools |

Schema + seed: `migrations/001_ikoline_customers.sql`.

## Backend choice (cost: free)

1. **Preferred:** Neon Postgres **Hobby free** linked to the Vercel project `ikosagon` (Marketplace / Storage). Env: `DATABASE_URL` or `POSTGRES_URL`.
2. **Until linked:** in-memory fallback (`crmBackend: "memory"`). Seeds still work; new customers persist only for the warm serverless instance.

Do **not** buy paid Neon/Blob plans for this demo.

## Security

- Tool layer (`lib/ikoline/tools.ts` + `lib/ikoline/crm/*`) is the **only** path to the DB.
- All SQL uses Neon tagged-template **parameterized** queries — never string-concat user text or LLM output into SQL.
- `sanitizeAccountId` / `sanitizeCustomerName` reject control chars, SQL-ish input, and prompt-injection phrases.
- LLM classify/speak never builds queries; create is rate-limited (`8` / hour / IP) separately from turn rate limits.
- Collections mini-Miranda / disclosure remain `allowParaphrase: false` (verbatim).

## Link Neon (Shawn approval)

1. Vercel → Project **ikosagon** → Storage → Create **Neon** (Hobby free) **or** Marketplace → Neon.
2. Confirm env `DATABASE_URL` / `POSTGRES_URL` on Production + Preview.
3. Redeploy. First request auto-runs `CREATE TABLE IF NOT EXISTS` + seed upserts.
4. Optional: run `migrations/001_ikoline_customers.sql` in the Neon SQL editor.

## Local check

```bash
npx tsx scripts/ikoline-lang-check.mjs
```
