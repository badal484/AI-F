# AI-F — Multi-Tenant AI Automation Platform

A multi-tenant SaaS + agency white-label platform that deploys AI assistants for local businesses (clinics, salons, real estate, etc.) to answer FAQs, capture and qualify leads, book/reschedule/cancel appointments, and communicate via WhatsApp and website chat — with deep customer context and seamless human escalation.

## Status

**All 18 phases of [MASTER_INSTRUCTIONS.md](./MASTER_INSTRUCTIONS.md)'s phase-gated build plan are complete.** See [docs/BUILD_PROGRESS.md](./docs/BUILD_PROGRESS.md) for the full per-phase build log, what's verified vs. NOT CONFIGURED, and every documented scope decision along the way.

- [PHASE 0 — Initial Audit](./docs/INITIAL_AUDIT.md) ✅
- PHASE 1 — Foundation ✅
- PHASE 2 — Business Core ✅
- PHASE 3 — CRM ✅
- PHASE 4 — Universal Inbox ✅
- PHASE 5 — AI Core ✅
- PHASE 6 — RAG & Knowledge ✅
- PHASE 7 — Booking Engine ✅
- PHASE 8 — WhatsApp Integration ✅
- PHASE 9 — Automations ✅
- PHASE 10 — Website Widget ✅
- PHASE 11 — Analytics & AI Evaluation ✅
- PHASE 12 — Billing ✅
- PHASE 13 — Platform Admin Dashboard ✅
- PHASE 14 — Security Hardening ✅
- PHASE 15 — Production Infrastructure & CI/CD ✅
- PHASE 16 — Advanced AI ✅
- PHASE 17 — Voice AI ✅
- PHASE 18 — White-Label / Reseller Architecture ✅

**None of this has been exercised against live infrastructure.** This environment has no configured Supabase/Postgres, Redis, Twilio, Stripe, WhatsApp, or AI provider credentials, and no Docker — every phase's real external-service behavior is implemented and reasoned through carefully (and, where possible, verified with standalone scripts against hand-crafted test cases) but not run end-to-end against the real thing. See each phase's entry in [docs/BUILD_PROGRESS.md](./docs/BUILD_PROGRESS.md) for exactly what was and wasn't verified, and [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) before deploying for real.

## Stack

Next.js (App Router) · TypeScript · Tailwind · shadcn/ui · Zustand · TanStack Query · Prisma · PostgreSQL (Supabase) + pgvector · Zod · Redis/BullMQ · Vercel AI SDK

## Documentation

- [MASTER_INSTRUCTIONS.md](./MASTER_INSTRUCTIONS.md) — architecture rules, phase plan, safeguards
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)
- [docs/DATABASE.md](./docs/DATABASE.md)
- [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) — Vercel/worker hosting, CI, local dev via Docker
- [docs/BUILD_PROGRESS.md](./docs/BUILD_PROGRESS.md)

## Local development

```bash
npm install
docker compose up -d          # local Postgres (pgvector) + Redis — optional, see docs/DEPLOYMENT.md
cp .env.example .env          # fill in what you have; everything else degrades to NOT CONFIGURED
npm run db:generate
npm run dev:web                # apps/web
npm run dev:worker             # apps/worker, separate terminal
```
