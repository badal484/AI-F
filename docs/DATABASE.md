# Database

PostgreSQL via Supabase. Prisma ORM (v7, driver-adapter mode — see `docs/ARCHITECTURE.md` for why). Schema source of truth: `packages/db/prisma/schema.prisma`.

## Current schema (through Phase 7 — Booking Engine)

```
Agency (1) ──< (N) Tenant (1) ──< (N) User ──< (N) Lead (assignedTo)
                        │                  ├──< (N) Conversation (assignedTo)
                        │                  └──< (N) Message (sender, STAFF only)
                        ├──< (N) Location (1) ──< (N) LocationHours
                        │              └──< (N) Appointment
                        ├──< (N) Service ──< (N) Appointment
                        ├──< (N) StaffMember >── (0..1) Location
                        │              ├── (0..1) User
                        │              └──< (N) Appointment
                        ├──< (N) Customer (1) ──< (N) Lead, Conversation, Appointment
                        ├──< (N) Lead (1) ──< (N) Conversation
                        ├──< (N) Tag >──< (N) Customer, Lead  (implicit m2m)
                        ├──< (N) Conversation (1) ──< (N) Message, Appointment
                        ├──< (N) KnowledgeDocument (1) ──< (N) DocumentChunk
                        └──< (N) Appointment
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
- **KnowledgeDocument** — a source document for the AI's knowledge base (an FAQ, a policy, anything staff paste in at `/dashboard/knowledge`). `status` (`PENDING | READY | FAILED`) and `error` track how chunking+embedding went — see the pgvector section below.
- **DocumentChunk** — one embeddable slice of a KnowledgeDocument's `content` (plain fixed-size windowing with overlap, `packages/ai/src/rag/chunk.ts` — no LLM call needed for chunking itself). Its `embedding` column is a pgvector vector, which needs its own section below because Prisma can't represent it like a normal field.
- **Appointment** — a booked slot for a `Service` at a `Location`, optionally with a specific `StaffMember`, `Customer`, and/or `Conversation` (an AI- or staff-booked appointment made mid-chat). `startAt`/`endAt` are real UTC instants (`timestamptz`) — `Location.timezone` is only used to interpret `LocationHours`' wall-clock strings when *computing* availability (`packages/booking`), never stored on the Appointment itself. `customerName` is required directly on the row (mirroring `Lead`'s own name/email/phone fields) so every appointment identifies who it's for even without a linked `Customer`. `status`: `SCHEDULED | CONFIRMED | CANCELLED | COMPLETED | NO_SHOW`.

Later phases add further tenant-scoped models under this same Tenant (AutomationRule, Subscription, etc.) per the sketch in `docs/INITIAL_AUDIT.md` §3.2.

## Tenant isolation

Enforced at the ORM layer via a Prisma Client Extension (`packages/db/src/tenant.ts`), not by convention:

- `TENANT_SCOPED_MODELS` is the single source of truth for which models carry a `tenantId` column (`User`, `Location`, `LocationHours`, `Service`, `StaffMember`, `Customer`, `Lead`, `Tag`, `Conversation`, `Message`, `KnowledgeDocument`, `DocumentChunk`, `Appointment`). **Every new tenant-scoped model added to `schema.prisma` must be added to this set**, or the extension silently won't protect it.
- `getTenantDb(tenantId)` returns a Prisma client with `tenantId` auto-injected into `where` (reads/updates/deletes) and `data` (creates) for every operation against a scoped model. The caller cannot omit or override it. Call sites also pass `tenantId` explicitly in `create`/`upsert` `data` (TypeScript can't see the runtime injection, so the field is still required at compile time) — the extension's injection is what actually enforces it, the explicit value is defense-in-depth.
- `SELF_SCOPED_MODELS` handles the one model whose own `id` *is* the tenant boundary rather than a separate `tenantId` column: `Tenant` itself. Through `getTenantDb()`, reads/updates against `Tenant` are restricted to `where: { id: tenantId }` — used by the Settings page to read/update the current tenant's own profile without reaching for `getPlatformDb()`. `create`/`delete`/etc. on `Tenant` are deliberately unsupported through this path (tenant creation happens during sign-up, before a `tenantId` exists — see `getPlatformDb()` below).
- Application code (`apps/web`, `apps/worker`) must never import `PrismaClient` directly — only `getTenantDb(tenantId)` or `getPlatformDb()`, both exported from `@aif/db`.
- `tenantId` must always be derived server-side from the authenticated session (`resolveTenantContext()` / `requireTenantContext()` / `requireWriteAccess()` in `apps/web/src/domains/auth/`) or a verified job payload — never trusted from client input.
- `getPlatformDb()` bypasses tenant scoping entirely. It exists for exactly two legitimate uses: (1) resolving which tenant a bare Supabase session belongs to, before a `tenantId` exists to scope with, and (2) the Platform Admin Dashboard (Phase 13). Its name and import path are deliberately distinct from `getTenantDb()` so any cross-tenant access is visually obvious in a diff.
- Foreign keys that point *within* the same tenant (e.g. `StaffMember.locationId`, `Lead.customerId`/`assignedToId`, `Conversation.customerId`/`leadId`/`assignedToId`, or a many-to-many `tags: { connect/set: [...] }`) are **not** automatically validated as belonging to that tenant just because the extension scopes the top-level row's own operation — a nested relation write inside `data` is not re-scoped. Every call site accepting a foreign id from input must separately confirm it resolves through the same `getTenantDb(tenantId)` client before using it. Patterns: `assertLocationBelongsToTenant()` / `assertBelongsToTenant()` (single FK — `apps/web/src/domains/business-core/staff/actions.ts`, `apps/web/src/domains/crm/leads/actions.ts`, `apps/web/src/domains/inbox/conversations/actions.ts`) and `assertTagsBelongToTenant()` (id array for an m2m relation — `apps/web/src/domains/crm/shared.ts`).
- Write access is split into two tiers via `apps/web/src/domains/auth/guard.ts`: `requireWriteAccess()` (OWNER/ADMIN only) gates *business configuration* — Tenant profile, Locations, Services, Staff, Tags — while `requireTenantContext()` (any authenticated role) gates *day-to-day work* — Customers, Leads, everything in the Inbox, Knowledge documents, and Appointments. `AGENT` exists specifically for that day-to-day tier; an earlier pass of Phase 3/4 incorrectly gated Customer/Lead/Inbox mutations behind `requireWriteAccess()` and was corrected before commit — see `docs/BUILD_PROGRESS.md`'s Phase 4 entry. Phase 7 applied the lesson from the start.
- `DocumentChunk.embedding` is a **third** isolation path, alongside `TENANT_SCOPED_MODELS` and `SELF_SCOPED_MODELS` — see the pgvector section below. It's a pgvector column Prisma can't represent as a normal field, so it's completely invisible to `getTenantDb()`'s extension (which only wraps model methods, not raw SQL) and is isolated instead by `packages/db/src/vector.ts` requiring `tenantId` as a parameter on every function and baking `tenant_id = ...` into the raw SQL itself.

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

## pgvector

Enabled via `previewFeatures = ["postgresqlExtensions"]` (generator block) and `extensions = [vector]` (datasource block) in `schema.prisma`. Prisma has no native vector type, so `DocumentChunk.embedding` is declared `Unsupported("vector(1536)")` — 1536 dimensions to match the `text-embedding-3-small` model `packages/ai/src/rag/embed.ts` uses.

An `Unsupported` field is entirely invisible to Prisma Client's normal query API (no `select`, `where`, or `data` on it — ever, through any client, tenant-scoped or not). All reads and writes go through `packages/db/src/vector.ts`'s two functions instead:

- `setChunkEmbedding(tenantId, chunkId, embedding)` — raw `$executeRaw` `UPDATE ... WHERE id = ... AND tenant_id = ...`; throws if it affects 0 rows (wrong id or wrong tenant).
- `searchChunks(tenantId, queryEmbedding, limit)` — raw `$queryRaw` `SELECT ... WHERE tenant_id = ... ORDER BY embedding <=> ... LIMIT ...` (pgvector's cosine-distance operator; smaller = more similar). This is the "tenantId filter applied before the vector `ORDER BY <=>` comparison" design from `docs/INITIAL_AUDIT.md` §3.3.

Both require `tenantId` as a parameter and hard-code `tenant_id = ...` into the SQL themselves — that's what isolates this column, not the extension (which can't see raw SQL at all). Every call site still gets `tenantId` from `resolveTenantContext()`/`requireTenantContext()`, same as everywhere else.

**Known risk, unverified against a live database:** [prisma/prisma#28867](https://github.com/prisma/prisma/issues/28867) reports that `prisma migrate dev` produces a false schema-drift error specifically for `Unsupported("vector")` columns on Prisma 7.1.0 (filed 2025-12-05). This repo is on Prisma 7.9.1 — several minor versions later, possibly fixed, but not confirmed either way since there's no live database to run `migrate dev` against yet. `prisma generate` and `prisma validate` both succeed cleanly on this schema (verified). If `migrate dev` hits this when real Supabase credentials are configured, the documented mitigation is `prisma migrate dev --create-only` followed by manually reviewing/adjusting the generated SQL before applying it, rather than trusting the automatic diff for this column.

Ingestion (`packages/ai/src/rag/ingest.ts`) creates `DocumentChunk` rows via normal `getTenantDb()` (everything except `embedding`) inside a `$transaction`, then calls `setChunkEmbedding()` for each afterward — those calls are outside that transaction (they must be, since they use the raw-SQL path), so there's a brief window where a chunk row exists with a null embedding. `searchChunks()` filters `WHERE embedding IS NOT NULL`, so this is an eventual-consistency gap, not an isolation or correctness issue.

## Booking conflict prevention

`packages/booking/src/book.ts`'s `bookAppointment()` re-checks for a conflicting `Appointment` (same Location, and same StaffMember if one was requested) inside a `Serializable`-isolation `$transaction`, immediately before creating the row — the slot a caller saw from `computeAvailableSlots()` a moment earlier could have been taken by someone else since. `Serializable` makes Postgres itself reject a genuinely concurrent conflicting write with a `P2034` error (`Prisma.PrismaClientKnownRequestError`), which `bookAppointment()` catches and reports the same as an ordinary conflict.

This is real conflict prevention, not a guarantee of perfect atomicity under arbitrary load. The ideal fix is a Postgres `EXCLUDE` constraint (via the `btree_gist` extension) on `(locationId, staffMemberId, tstzrange(startAt, endAt))`, which Prisma's schema language can't express — it would need a raw-SQL migration, similar in spirit to how pgvector's `Unsupported` column is handled. Not built for Phase 7's baseline scope; revisit if this ever needs to hold up under real concurrent booking load. Unverified against a live database, like everything else DB-related in this environment — see `docs/BUILD_PROGRESS.md`'s Phase 7 entry.
