# Deploy Ikosagon on Vercel + GoDaddy

## 1) Push project to GitHub

1. Create a new GitHub repository.
2. Push this project to `main`.

## 2) Create Vercel project

1. Go to [vercel.com/new](https://vercel.com/new).
2. Import your GitHub repo.
3. Framework preset: Next.js (auto-detected).
4. Add env vars from `.env.example` if you want contact form live immediately.
5. Click **Deploy**.

## 3) Add your custom domain in Vercel

1. Open the Vercel project.
2. Go to **Settings → Domains**.
3. Add `ikosagon.com`.
4. Add `www.ikosagon.com`.

## 4) Update GoDaddy DNS

Open GoDaddy DNS Management for `ikosagon.com` and set:

- `A` record:
  - Host: `@`
  - Points to: `76.76.21.21`
  - TTL: default
- `CNAME` record:
  - Host: `www`
  - Points to: `cname.vercel-dns.com`
  - TTL: default

Remove conflicting old `A`/`CNAME` records for `@` or `www`.

## 5) Verify

1. Return to Vercel Domains page.
2. Wait for DNS verification to pass.
3. Confirm:
   - `https://ikosagon.com`
   - `https://www.ikosagon.com`

Vercel issues SSL certificates automatically after DNS resolves.
