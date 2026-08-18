# Database

PostgreSQL via Supabase. Prisma ORM (v7, driver-adapter mode — see `docs/ARCHITECTURE.md` for why). Schema source of truth: `packages/db/prisma/schema.prisma`.

## Current schema (through Phase 2 — Business Core)

```
Agency (1) ──< (N) Tenant (1) ──< (N) User
                        │
                        ├──< (N) Location (1) ──< (N) LocationHours
                        ├──< (N) Service
                        └──< (N) StaffMember >── (0..1) Location
                                       └── (0..1) User
```

- **Agency** — a white-label reseller owner sitting above one or more Tenants. Inert until Phase 18; modeled now so `Tenant` doesn't need a breaking schema change later.
- **Tenant** — one deployed business (a clinic, salon, real estate office, etc.). The unit of isolation for every tenant-scoped model. Carries its own profile fields (`timezone`, `phone`, `website`, `description`) editable at `/dashboard/settings`.
- **User** — a *dashboard login* belonging to a Tenant, linked to Supabase Auth via `supabaseUserId` (unique). Has a `role`: `OWNER | ADMIN | AGENT`. Distinct from StaffMember — see below.
- **Location** — a physical location the Tenant operates from (address, phone, timezone, `isPrimary`).
- **LocationHours** — a Location's regular weekly operating hours, one row per `(locationId, dayOfWeek)` (0=Sunday..6=Saturday), `openTime`/`closeTime` as `"HH:mm"` strings, `isClosed` to override a day.
- **Service** — a bookable service the Tenant offers (`durationMinutes`, `priceCents`, `currency`, `isActive`). Phase 7's Booking Engine books Appointments against these.
- **StaffMember** — a bookable resource (stylist, doctor, agent) who provides Services. Optionally linked to a `User` (`userId`, unique) if they also have dashboard login access — most won't, since being bookable doesn't require a login. Optionally linked to a `Location`.

Later phases add further tenant-scoped models under this same Tenant (Customer, Lead, Conversation, Message, Appointment, KnowledgeDocument, DocumentChunk, AutomationRule, Subscription, etc.) per the sketch in `docs/INITIAL_AUDIT.md` §3.2.

## Tenant isolation

Enforced at the ORM layer via a Prisma Client Extension (`packages/db/src/tenant.ts`), not by convention:

- `TENANT_SCOPED_MODELS` is the single source of truth for which models carry a `tenantId` column (`User`, `Location`, `LocationHours`, `Service`, `StaffMember`). **Every new tenant-scoped model added to `schema.prisma` must be added to this set**, or the extension silently won't protect it.
- `getTenantDb(tenantId)` returns a Prisma client with `tenantId` auto-injected into `where` (reads/updates/deletes) and `data` (creates) for every operation against a scoped model. The caller cannot omit or override it. Call sites also pass `tenantId` explicitly in `create`/`upsert` `data` (TypeScript can't see the runtime injection, so the field is still required at compile time) — the extension's injection is what actually enforces it, the explicit value is defense-in-depth.
- `SELF_SCOPED_MODELS` handles the one model whose own `id` *is* the tenant boundary rather than a separate `tenantId` column: `Tenant` itself. Through `getTenantDb()`, reads/updates against `Tenant` are restricted to `where: { id: tenantId }` — used by the Settings page to read/update the current tenant's own profile without reaching for `getPlatformDb()`. `create`/`delete`/etc. on `Tenant` are deliberately unsupported through this path (tenant creation happens during sign-up, before a `tenantId` exists — see `getPlatformDb()` below).
- Application code (`apps/web`, `apps/worker`) must never import `PrismaClient` directly — only `getTenantDb(tenantId)` or `getPlatformDb()`, both exported from `@aif/db`.
- `tenantId` must always be derived server-side from the authenticated session (`resolveTenantContext()` / `requireTenantContext()` / `requireWriteAccess()` in `apps/web/src/domains/auth/`) or a verified job payload — never trusted from client input.
- `getPlatformDb()` bypasses tenant scoping entirely. It exists for exactly two legitimate uses: (1) resolving which tenant a bare Supabase session belongs to, before a `tenantId` exists to scope with, and (2) the Platform Admin Dashboard (Phase 13). Its name and import path are deliberately distinct from `getTenantDb()` so any cross-tenant access is visually obvious in a diff.
- Foreign keys that point *within* the same tenant (e.g. `StaffMember.locationId`) are not automatically validated as belonging to that tenant just because the extension scopes the `StaffMember` row itself — a call site must separately confirm the referenced `Location` resolves through `getTenantDb(tenantId)` before writing the FK. See `assertLocationBelongsToTenant()` in `apps/web/src/domains/business-core/staff/actions.ts` and the equivalent check in `updateLocationHours`.
- Write access to business-core data (Tenant profile, Locations, Services, Staff) is further restricted to the `OWNER`/`ADMIN` roles via `requireWriteAccess()` (`apps/web/src/domains/auth/guard.ts`) — `AGENT` is a lower-privilege role for day-to-day conversation/booking handling, not business configuration.

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
