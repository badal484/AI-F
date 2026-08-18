# PHASE 0 — Initial Repository Audit

**Date:** 2026-08-19
**Auditor:** AI Coding Agent (per MASTER_INSTRUCTIONS.md)
**Scope:** Repository state, target architecture, database/multi-tenancy design, risk assessment.

---

## 1. Current Repository State

| Item | Finding |
|---|---|
| Directory | `/Users/badal11/Desktop/AIF` |
| Git repository | **No** — not initialized |
| Existing source code | **None** — directory is empty except this audit's own output |
| `package.json` | Not present |
| Framework/config files | None (no `next.config`, `tsconfig.json`, `.env`, etc.) |
| Lockfile | None |
| CI/CD config | None |

**Conclusion:** This is a **greenfield project**. There is no legacy code, schema, or configuration to reconcile. Phase 1 will be a clean scaffold, not a migration.

### 1.1 Local Toolchain Verified

| Tool | Version / Status |
|---|---|
| Node.js | v24.11.0 |
| npm | 11.6.1 |
| git | 2.50.1 (Apple Git) |
| psql (Postgres client) | present at `/opt/homebrew/bin/psql` |
| redis-cli | present at `/opt/homebrew/bin/redis-cli` |

No local Postgres/Redis *servers* were probed for a running instance (out of scope for a read-only audit) — Phase 1 will need to confirm whether local Postgres/Redis daemons are running, or whether we connect to hosted Supabase/Neon + a managed Redis (e.g. Upstash) instead. This is a **business/infra decision**, flagged in Section 5.

Not yet a git repository — Phase 1 will run `git init` and make the first commit only after this audit is approved, per the "commit only the approved phase" rule.

---

## 2. Target Architecture Plan

### 2.1 Repository Layout (Feature-Sliced Design)

```
/
├── MASTER_INSTRUCTIONS.md
├── docs/
│   ├── INITIAL_AUDIT.md          (this file)
│   ├── BUILD_PROGRESS.md         (created in Phase 1 — source of truth for phase status)
│   ├── ARCHITECTURE.md           (created in Phase 1)
│   └── DATABASE.md               (created in Phase 1)
├── .env.example
├── package.json                  (npm workspaces — monorepo)
├── apps/
│   ├── web/                      (Next.js App Router — serverless UI, deployed to Vercel)
│   │   ├── src/
│   │   │   ├── app/              (routes only — thin, delegates to domains/)
│   │   │   ├── domains/
│   │   │   │   ├── tenant/
│   │   │   │   ├── auth/
│   │   │   │   ├── business-core/    (locations, services, staff, hours)
│   │   │   │   ├── crm/              (customers, leads, tags, pipeline)
│   │   │   │   ├── inbox/            (chat UI, assignment, handoff)
│   │   │   │   ├── ai-agent/         (tool defs, prompts, streaming)
│   │   │   │   ├── booking/          (availability, timezones, conflicts)
│   │   │   │   ├── rag/              (embeddings, retrieval)
│   │   │   │   ├── whatsapp/         (webhook handlers, templates)
│   │   │   │   ├── billing/          (Stripe)
│   │   │   │   ├── platform-admin/
│   │   │   │   └── analytics/
│   │   │   ├── components/ui/    (shadcn/ui primitives only)
│   │   │   └── lib/              (db client, tenant middleware, ai-sdk wrapper)
│   │   └── ...
│   └── worker/                   (long-running Node process — Redis/BullMQ)
│       ├── src/
│       │   ├── queues/           (whatsapp, reminders, embeddings, webhooks)
│       │   └── jobs/
│       └── ...
├── packages/
│   ├── db/                       (Prisma schema + client extension for tenant isolation — shared by web & worker)
│   ├── shared/                   (Zod schemas, shared types, constants — shared by web & worker)
│   └── config/                   (eslint/tsconfig base)
└── prisma/
    └── schema.prisma
```

**Rationale:** `apps/web` and `apps/worker` are deployed independently (Vercel serverless vs. a long-running container/VM), matching the "Hybrid Deployment Ready" requirement. `packages/db` and `packages/shared` prevent divergence between the two runtimes — both must apply tenant isolation and Zod validation identically.

### 2.2 Core Stack Confirmation

Per Section 3 of MASTER_INSTRUCTIONS.md — no deviation:

- Next.js (App Router) + React + TypeScript + Tailwind
- shadcn/ui + Radix + Lucide
- Zustand + TanStack Query
- Prisma ORM + PostgreSQL
- Zod at every API boundary
- Redis + BullMQ for background/webhook work
- Vercel AI SDK for LLM orchestration
- S3-compatible storage

---

## 3. Database Architecture & Multi-Tenant Isolation Strategy

### 3.1 Provider Decision (flagged for approval — see Section 5)

Recommendation: **Supabase** for Phase 1, because it bundles Postgres + `pgvector` + Auth + Storage (S3-compatible) in one provisioned instance, reducing Phase 1 setup surface. Neon is a valid alternative if the business prefers decoupling Auth/Storage from the DB provider. This is an engineering-judgment default, not a locked decision — flagged for explicit confirmation.

### 3.2 Core Schema Shape (high level — full schema authored in Phase 1)

```
Agency (white-label owner)
  └─ Tenant (a Clinic, Salon, Real Estate office, etc.)
       ├─ User (staff, roles: OWNER | ADMIN | AGENT)
       ├─ Location
       ├─ Service
       ├─ StaffMember / Availability
       ├─ Customer / Lead
       ├─ Conversation → Message
       ├─ Appointment
       ├─ KnowledgeDocument → DocumentChunk (embedding vector)
       ├─ AutomationRule
       └─ Subscription (Stripe)
```

Every tenant-scoped table carries a non-nullable `tenantId` foreign key. `Agency` sits one level above `Tenant` for white-label reseller support (Phase 18) but is otherwise inert until that phase.

### 3.3 Zero-Trust Tenant Isolation — Enforcement Mechanism

**Principle:** Tenant isolation is enforced at the ORM layer, never trusted from the client, and never optional per-query.

**Mechanism (Prisma Client Extension):**

1. A single `getTenantDb(tenantId: string)` factory wraps the base `PrismaClient` with a **Prisma Client Extension** that intercepts every query (`findMany`, `findUnique`, `update`, `delete`, `create`, etc.) on every tenant-scoped model and automatically injects/verifies `tenantId` in the `where` clause (reads) and the data payload (writes).
2. Application code — API routes, Server Actions, and worker jobs — **never** imports the raw `PrismaClient`. They only ever obtain a request-scoped client via `getTenantDb(tenantId)`, where `tenantId` is derived **server-side** from the authenticated session (never from a request body, query param, or header supplied by the client).
3. `tenantId` resolution happens once, at the edge of each request (auth middleware for `apps/web`, job-payload validation for `apps/worker`), and is passed down through context — it is not re-derived or re-trusted at each call site.
4. A CI-enforced lint rule / code-review checklist item bans direct `import { PrismaClient } from '@prisma/client'` outside `packages/db`.
5. Cross-tenant admin operations (Platform Admin Dashboard, Phase 13) use an explicitly named `getPlatformDb()` client, distinct in name and import path from `getTenantDb()`, so cross-tenant access is always visually obvious in a diff/review.
6. `pgvector` similarity searches (Phase 6) go through the same extension — the `tenantId` filter is applied before the vector `ORDER BY <=>` comparison, so retrieval can never leak another tenant's embedded documents.

**Multi-table operations:** Any mutation touching more than one table (e.g., booking an appointment while updating lead status) is wrapped in `prisma.$transaction(...)` using the tenant-scoped client, so partial writes cannot occur and tenant isolation applies uniformly across every statement in the transaction.

**Idempotency:** Webhook tables (`WhatsappWebhookEvent`, `StripeWebhookEvent`) store the provider's event ID with a unique constraint; worker jobs upsert on that ID before processing, guaranteeing replayed webhooks are no-ops.

---

## 4. Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Tenant data leakage via a hand-written query that forgets `tenantId` | High | Prisma Client Extension makes omission structurally hard, not just a convention; code review checklist enforces it (Section 3.3) |
| AI hallucinating bookings/pricing not backed by real data | High | Tool-driven architecture only; AI response is never surfaced as a confirmation unless the tool call succeeded (per MASTER_INSTRUCTIONS §5) |
| Faked integrations (WhatsApp/Stripe) during early phases before credentials exist | Medium | Explicit `NOT CONFIGURED` logging path instead of simulated success, per §7 |
| Serverless (Vercel) + long-running worker split introduces deployment/env drift | Medium | Shared `packages/db` and `packages/shared` as single source of truth for schema/types across both runtimes |
| Vector search performance at 1,000+ tenants in a single `pgvector` table | Medium | Composite index on `(tenantId, embedding)`; revisit partitioning if/when a single tenant's document volume becomes a bottleneck — not a Phase 1 concern |
| No git history yet — first commits will be large scaffold commits | Low | Acceptable for greenfield init; subsequent phases follow small, reviewable commits per the phase-gated workflow |
| DB provider choice (Supabase vs Neon) not yet confirmed by product owner | Low/Process | Flagged explicitly in Section 5 for approval before Phase 1 begins |

---

## 5. Decisions Requiring Explicit Approval Before Phase 1

These are **business-level decisions** (per §9, "CONTINUE WORK" only asks when a decision is a business call) — engineering defaults are proposed, but confirmation is requested:

1. **DB/Auth/Storage provider:** Supabase (bundles Postgres + pgvector + Auth + S3-compatible Storage) vs. Neon (Postgres only, requiring separate Auth/Storage providers). *Recommendation: Supabase.*
2. **Redis provider for BullMQ:** local Redis for dev vs. a managed provider (e.g. Upstash) for the worker in production. *Recommendation: Upstash for parity with serverless-friendly hosting, local Redis for dev.*
3. **Repo structure:** npm workspaces monorepo (`apps/web` + `apps/worker` + `packages/*`) as proposed in Section 2.1 — confirm or request a single-app structure instead.
4. **Auth provider:** Supabase Auth vs. a dedicated library (e.g. Auth.js/NextAuth) — affects Phase 1 scaffolding directly. *Recommendation: Supabase Auth if Supabase is chosen as DB provider, for tightest integration with RLS-adjacent patterns (though our isolation model is ORM-level, not RLS-dependent).*

---

## Next Step

Per MASTER_INSTRUCTIONS.md §9, this completes **PHASE 0**. No application code has been written. Awaiting your explicit approval — and answers to Section 5 — before beginning **PHASE 1: Foundation**.
