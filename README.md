# AI-F — Multi-Tenant AI Automation Platform

A multi-tenant SaaS + agency white-label platform that deploys AI assistants for local businesses (clinics, salons, real estate, etc.) to answer FAQs, capture and qualify leads, book/reschedule/cancel appointments, and communicate via WhatsApp and website chat — with deep customer context and seamless human escalation.

## Status

Under active development, following the phase-gated workflow defined in [MASTER_INSTRUCTIONS.md](./MASTER_INSTRUCTIONS.md).

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
- PHASE 11 — Analytics & AI Evaluation ✅ (see [docs/BUILD_PROGRESS.md](./docs/BUILD_PROGRESS.md) for details and what's still NOT CONFIGURED)
- PHASE 12 — Billing ⏳ next

## Stack

Next.js (App Router) · TypeScript · Tailwind · shadcn/ui · Zustand · TanStack Query · Prisma · PostgreSQL (Supabase) + pgvector · Zod · Redis/BullMQ · Vercel AI SDK

## Documentation

- [MASTER_INSTRUCTIONS.md](./MASTER_INSTRUCTIONS.md) — architecture rules, phase plan, safeguards
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)
- [docs/DATABASE.md](./docs/DATABASE.md)
- [docs/BUILD_PROGRESS.md](./docs/BUILD_PROGRESS.md)
