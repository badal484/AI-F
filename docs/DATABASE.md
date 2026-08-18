# Database

PostgreSQL via Supabase. Prisma ORM (v7, driver-adapter mode — see `docs/ARCHITECTURE.md` for why). Schema source of truth: `packages/db/prisma/schema.prisma`.

## Current schema (Phase 1 — Foundation)

```
Agency (1) ──< (N) Tenant (1) ──< (N) User
```

- **Agency** — a white-label reseller owner sitting above one or more Tenants. Inert until Phase 18; modeled now so `Tenant` doesn't need a breaking schema change later.
- **Tenant** — one deployed business (a clinic, salon, real estate office, etc.). The unit of isolation for every tenant-scoped model.
- **User** — a staff member of a Tenant, linked to Supabase Auth via `supabaseUserId` (unique). Has a `role`: `OWNER | ADMIN | AGENT`.

Later phases add tenant-scoped models under this same Tenant (Location, Service, StaffMember, Customer, Lead, Conversation, Message, Appointment, KnowledgeDocument, DocumentChunk, AutomationRule, Subscription, etc.) per the sketch in `docs/INITIAL_AUDIT.md` §3.2.

## Tenant isolation

Enforced at the ORM layer via a Prisma Client Extension (`packages/db/src/tenant.ts`), not by convention:

- `TENANT_SCOPED_MODELS` is the single source of truth for which models carry a `tenantId` column. **Every new tenant-scoped model added to `schema.prisma` must be added to this set**, or the extension silently won't protect it.
- `getTenantDb(tenantId)` returns a Prisma client with `tenantId` auto-injected into `where` (reads/updates/deletes) and `data` (creates) for every operation against a scoped model. The caller cannot omit or override it.
- Application code (`apps/web`, `apps/worker`) must never import `PrismaClient` directly — only `getTenantDb(tenantId)` or `getPlatformDb()`, both exported from `@aif/db`.
- `tenantId` must always be derived server-side from the authenticated session (`resolveTenantContext()` in `apps/web/src/domains/auth/session.ts`) or a verified job payload — never trusted from client input.
- `getPlatformDb()` bypasses tenant scoping entirely. It exists for exactly two legitimate uses: (1) resolving which tenant a bare Supabase session belongs to, before a `tenantId` exists to scope with, and (2) the Platform Admin Dashboard (Phase 13). Its name and import path are deliberately distinct from `getTenantDb()` so any cross-tenant access is visually obvious in a diff.

## Multi-table writes

Any mutation touching more than one table (e.g. tenant sign-up: creating a `Tenant` + its first `User` together) is wrapped in `prisma.$transaction(...)`, per MASTER_INSTRUCTIONS.md §4. See `apps/web/src/domains/auth/actions.ts` (`signUp`) for the reference implementation.

## Connecting

Single `DATABASE_URL` env var (see `.env.example`) — a direct/session Postgres connection string, not a pgbouncer transaction-pooler URL (Prisma 7's driver-adapter migrations need session-level features transaction pooling doesn't support).

```bash
npm run db:generate     # regenerate the Prisma client (no live DB needed)
npm run migrate:dev -w @aif/db   # apply schema changes locally (needs DATABASE_URL)
npm run studio -w @aif/db        # browse data
```

No migrations have been applied yet — Supabase credentials are **NOT CONFIGURED** in this environment (see `docs/BUILD_PROGRESS.md`). `prisma generate` works without a live connection (it only needs the schema) and has been verified; `prisma migrate dev` requires real Supabase credentials in `DATABASE_URL` before it can run.

## pgvector (Phase 6)

Not yet enabled. Phase 6 (RAG & Knowledge) will add the `pgvector` extension and tenant-scoped embedding tables, with the `tenantId` filter applied before the vector similarity comparison so retrieval can never leak another tenant's documents — see `docs/INITIAL_AUDIT.md` §3.3.
