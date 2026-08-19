# Database

PostgreSQL via Supabase. Prisma ORM (v7, driver-adapter mode — see `docs/ARCHITECTURE.md` for why). Schema source of truth: `packages/db/prisma/schema.prisma`.

## Current schema (through Phase 4 — Universal Inbox)

```
Agency (1) ──< (N) Tenant (1) ──< (N) User ──< (N) Lead (assignedTo)
                        │                  ├──< (N) Conversation (assignedTo)
                        │                  └──< (N) Message (sender, STAFF only)
                        ├──< (N) Location (1) ──< (N) LocationHours
                        ├──< (N) Service
                        ├──< (N) StaffMember >── (0..1) Location
                        │              └── (0..1) User
                        ├──< (N) Customer (1) ──< (N) Lead, Conversation
                        ├──< (N) Lead (1) ──< (N) Conversation
                        ├──< (N) Tag >──< (N) Customer, Lead  (implicit m2m)
                        └──< (N) Conversation (1) ──< (N) Message
```

- **Agency** — a white-label reseller owner sitting above one or more Tenants. Inert until Phase 18; modeled now so `Tenant` doesn't need a breaking schema change later.
- **Tenant** — one deployed business (a clinic, salon, real estate office, etc.). The unit of isolation for every tenant-scoped model. Carries its own profile fields (`timezone`, `phone`, `website`, `description`) editable at `/dashboard/settings`.
- **User** — a *dashboard login* belonging to a Tenant, linked to Supabase Auth via `supabaseUserId` (unique). Has a `role`: `OWNER | ADMIN | AGENT`. Distinct from StaffMember — see below.
- **Location** — a physical location the Tenant operates from (address, phone, timezone, `isPrimary`).
- **LocationHours** — a Location's regular weekly operating hours, one row per `(locationId, dayOfWeek)` (0=Sunday..6=Saturday), `openTime`/`closeTime` as `"HH:mm"` strings, `isClosed` to override a day.
- **Service** — a bookable service the Tenant offers (`durationMinutes`, `priceCents`, `currency`, `isActive`). Phase 7's Booking Engine books Appointments against these.
- **StaffMember** — a bookable resource (stylist, doctor, agent) who provides Services. Optionally linked to a `User` (`userId`, unique) if they also have dashboard login access — most won't, since being bookable doesn't require a login. Optionally linked to a `Location`.
- **Customer** — an identified end-customer of the Tenant. A `Lead` converts into a Customer once qualified/won (`Lead.customerId`).
- **Lead** — a prospect moving through `LeadStage` (`NEW → CONTACTED → QUALIFIED → WON/LOST`) — this enum **is** Phase 3's "Conversation pipeline." Optionally linked to a `Customer` and/or `assignedTo` (a `User`). `source` records where it came from (`WEBSITE | WHATSAPP | MANUAL | REFERRAL | OTHER`).
- **Tag** — a tenant-defined label, many-to-many with both `Customer` and `Lead` via Prisma's implicit relation tables (no explicit join model needed — see the isolation note below on why that's still safe).

> **Naming note:** "Conversation pipeline" in the Phase 3 spec (MASTER_INSTRUCTIONS.md) refers to a Lead's position in the sales pipeline (`LeadStage`), not chat message storage — see `docs/BUILD_PROGRESS.md`'s Phase 3 entry for the full reasoning. The actual chat `Conversation`/`Message` tables described here are Phase 4's.

- **Conversation** — one chat thread with a Customer/Lead over some `ConversationChannel` (`WEBSITE | WHATSAPP | MANUAL`). This is the Universal Inbox's core entity — one row per *thread*, not per message. "Message assignment" (MASTER_INSTRUCTIONS.md Phase 4) is modeled as assigning the whole Conversation to a `User` (`assignedTo`), matching how helpdesk inboxes assign a thread to an agent, not each message individually. `status` (`OPEN | HUMAN_REQUIRED | CLOSED`) is MASTER_INSTRUCTIONS.md §5's "Human Handoff" — `HUMAN_REQUIRED` is what Phase 5's AI will set when it hands off; Phase 4 has no AI, so it's also settable manually via the inbox UI's status control.
- **Message** — a single message within a Conversation. `senderType` is `CUSTOMER | AI | STAFF`; only `CUSTOMER` (staff manually logging what a customer said) and `STAFF` (an actual reply) are reachable through Phase 4's UI — `AI` exists for Phase 5 forward-compatibility but nothing sets it yet, consistent with MASTER_INSTRUCTIONS.md §7 ("never fake actions").

Later phases add further tenant-scoped models under this same Tenant (Appointment, KnowledgeDocument, DocumentChunk, AutomationRule, Subscription, etc.) per the sketch in `docs/INITIAL_AUDIT.md` §3.2.

## Tenant isolation

Enforced at the ORM layer via a Prisma Client Extension (`packages/db/src/tenant.ts`), not by convention:

- `TENANT_SCOPED_MODELS` is the single source of truth for which models carry a `tenantId` column (`User`, `Location`, `LocationHours`, `Service`, `StaffMember`, `Customer`, `Lead`, `Tag`, `Conversation`, `Message`). **Every new tenant-scoped model added to `schema.prisma` must be added to this set**, or the extension silently won't protect it.
- `getTenantDb(tenantId)` returns a Prisma client with `tenantId` auto-injected into `where` (reads/updates/deletes) and `data` (creates) for every operation against a scoped model. The caller cannot omit or override it. Call sites also pass `tenantId` explicitly in `create`/`upsert` `data` (TypeScript can't see the runtime injection, so the field is still required at compile time) — the extension's injection is what actually enforces it, the explicit value is defense-in-depth.
- `SELF_SCOPED_MODELS` handles the one model whose own `id` *is* the tenant boundary rather than a separate `tenantId` column: `Tenant` itself. Through `getTenantDb()`, reads/updates against `Tenant` are restricted to `where: { id: tenantId }` — used by the Settings page to read/update the current tenant's own profile without reaching for `getPlatformDb()`. `create`/`delete`/etc. on `Tenant` are deliberately unsupported through this path (tenant creation happens during sign-up, before a `tenantId` exists — see `getPlatformDb()` below).
- Application code (`apps/web`, `apps/worker`) must never import `PrismaClient` directly — only `getTenantDb(tenantId)` or `getPlatformDb()`, both exported from `@aif/db`.
- `tenantId` must always be derived server-side from the authenticated session (`resolveTenantContext()` / `requireTenantContext()` / `requireWriteAccess()` in `apps/web/src/domains/auth/`) or a verified job payload — never trusted from client input.
- `getPlatformDb()` bypasses tenant scoping entirely. It exists for exactly two legitimate uses: (1) resolving which tenant a bare Supabase session belongs to, before a `tenantId` exists to scope with, and (2) the Platform Admin Dashboard (Phase 13). Its name and import path are deliberately distinct from `getTenantDb()` so any cross-tenant access is visually obvious in a diff.
- Foreign keys that point *within* the same tenant (e.g. `StaffMember.locationId`, `Lead.customerId`/`assignedToId`, `Conversation.customerId`/`leadId`/`assignedToId`, or a many-to-many `tags: { connect/set: [...] }`) are **not** automatically validated as belonging to that tenant just because the extension scopes the top-level row's own operation — a nested relation write inside `data` is not re-scoped. Every call site accepting a foreign id from input must separately confirm it resolves through the same `getTenantDb(tenantId)` client before using it. Patterns: `assertLocationBelongsToTenant()` / `assertBelongsToTenant()` (single FK — `apps/web/src/domains/business-core/staff/actions.ts`, `apps/web/src/domains/crm/leads/actions.ts`, `apps/web/src/domains/inbox/conversations/actions.ts`) and `assertTagsBelongToTenant()` (id array for an m2m relation — `apps/web/src/domains/crm/shared.ts`).
- Write access is split into two tiers via `apps/web/src/domains/auth/guard.ts`: `requireWriteAccess()` (OWNER/ADMIN only) gates *business configuration* — Tenant profile, Locations, Services, Staff, Tags — while `requireTenantContext()` (any authenticated role) gates *day-to-day work* — Customers, Leads, and everything in the Inbox (conversations, messages, assignment, status). `AGENT` exists specifically for that day-to-day tier; an earlier pass of Phase 3/4 incorrectly gated Customer/Lead/Inbox mutations behind `requireWriteAccess()` and was corrected before commit — see `docs/BUILD_PROGRESS.md`'s Phase 4 entry.

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
