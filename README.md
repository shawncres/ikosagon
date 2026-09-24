# Ikosagon Portfolio Site

Dark, neon-accent portfolio built with Next.js App Router, TypeScript, Tailwind v4, and MDX project content.

## Requirements

- Node.js 20.9+ (Node 22 LTS recommended)
- npm 10+

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Content workflow

Add or edit project files in `content/projects/*.mdx`.

Frontmatter schema:

```mdx
---
title: "My App"
slug: "my-app"
summary: "One-line hook"
year: 2026
tags: ["Web", "AI", "Next.js"]
cover: "/projects/my-app/cover.png"
featured: true
repo: "https://github.com/you/my-app"
live: "https://my-app.com"
status: "Shipped"
---
```

Place project assets in `public/projects/<slug>/`.

## Scripts

- `npm run dev` - start dev server
- `npm run lint` - run ESLint
- `npm run build` - production build
- `npm run format` - format code with Prettier

## Contact form env vars

Copy `.env.example` to `.env.local` and set:

- `RESEND_API_KEY`
- `CONTACT_TO_EMAIL`
- `CONTACT_FROM_EMAIL`

## Deployment

Use Vercel for hosting and connect GoDaddy DNS. Full steps are in `DEPLOY.md`.
