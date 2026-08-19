# Architecture

Living document — updated as each phase lands. See `docs/BUILD_PROGRESS.md` for phase status and `docs/DATABASE.md` for schema detail.

## Monorepo layout

npm workspaces, feature-sliced within each app.

```
apps/
  web/      Next.js (App Router) — serverless UI, deployed to Vercel
  worker/   Long-running Node process — Redis/BullMQ, deployed as a container/VM
packages/
  db/       Prisma schema, generated client, tenant-isolation extension
  shared/   Zod schemas, shared types, logger — used by both apps
  ai/       Vercel AI SDK provider abstraction, tool definitions, intent detection, reply drafting
  booking/  Availability computation, timezone math (Luxon), conflict-safe booking — used by both the dashboard UI and the AI's tools
  config/   Shared tsconfig/eslint base configs
```

`apps/web` and `apps/worker` are independently deployable: the UI runs serverless, the worker runs as a persistent process holding Redis/BullMQ connections. Both import `@aif/db`, `@aif/shared`, `@aif/ai`, and `@aif/booking` as workspace packages so schema, types, validation, and AI/booking logic never drift between them — each lives in its own package (not inside `apps/web`) specifically so `apps/worker` can call the same logic once Phase 8 (WhatsApp) needs it, without duplicating anything. `@aif/ai` depends on `@aif/booking` (for the `checkAvailability`/`bookAppointment` tools), not the other way around.

Within `apps/web/src`, code is organized by domain rather than by route:

```
app/                    Next.js routes — thin, delegate to domains/
domains/
  auth/                 session resolution, sign in/up/out actions, guard.ts (role gating), users.ts (list assignable staff — shared by crm and inbox), auth UI
  business-core/         tenant profile, locations (+hours), services, staff — actions + UI, per entity
  crm/                   customers, leads (+ pipeline stage), tags — actions + UI, per entity; shared.ts for cross-entity FK checks
  inbox/                 conversations (+ assignment/status), messages — actions + a two-pane chat UI
  ai-agent/               actions.ts wiring @aif/ai (intent detection, reply drafting) into the Inbox UI
  knowledge/              documents (chunk+embed on create) — actions + UI, including a test-search panel
  booking/                appointments — actions wiring @aif/booking + a find-a-time/confirm booking dialog
  (whatsapp, billing,
   platform-admin, analytics — added as their phases land)
components/ui/          shadcn/ui primitives only
lib/                    supabase clients, env helpers, utils
```

## Server Actions as the data layer

CRUD domains (business-core, crm, inbox, and later phases) skip a separate REST/route-handler layer: Server Actions (`"use server"` functions under each domain's `actions.ts`) are called directly as TanStack Query `queryFn`/`mutationFn`, since a Server Action is just an async function that already runs server-side regardless of whether it's invoked from a `<form action>` or a client component's `fetch`-free call. This keeps Zod validation and tenant-isolation logic in one place instead of duplicating it across an API route and an action. List pages use `useQuery` + `useMutation` with optimistic cache updates (`queryClient.setQueryData`) per MASTER_INSTRUCTIONS.md §6; single-record forms (e.g. Settings) use `useMutation` alone.

Every read is wrapped in `requireTenantContext()` (any authenticated role). Mutations split into two tiers — see `apps/web/src/domains/auth/guard.ts`: `requireWriteAccess()` (OWNER/ADMIN only) for *business configuration* (Tenant profile, Locations, Services, Staff, Tags), and plain `requireTenantContext()` for *day-to-day work* (Customers, Leads, everything in the Inbox, Knowledge documents, and Appointments) — `AGENT` exists specifically for that second tier, so gating it behind `requireWriteAccess()` would lock AGENT out of the job the role exists for. Reach for the right one deliberately when adding a new domain rather than defaulting to `requireWriteAccess()` for every mutation.

## Multi-tenant isolation

See `MASTER_INSTRUCTIONS.md` §4 for the governing rule and `docs/DATABASE.md` §"Tenant isolation" for the implementation. In short: `packages/db/src/tenant.ts` exports `getTenantDb(tenantId)`, a Prisma Client Extension that injects `tenantId` into every query against a tenant-scoped model. Application code never imports `PrismaClient` directly — only `getTenantDb()` or the narrowly-scoped `getPlatformDb()`.

## Auth

Supabase Auth (session cookies via `@supabase/ssr`). `apps/web/src/proxy.ts` refreshes the session on every request and redirects unauthenticated users away from `/dashboard`. `apps/web/src/domains/auth/session.ts` resolves the full `TenantContext` (tenant + role) server-side from the session — this is the only place that reads through `getPlatformDb()` outside the future Platform Admin phase, because tenant identity isn't known yet at that point.

## AI Core

`packages/ai` is the Vercel AI SDK integration (MASTER_INSTRUCTIONS.md §5), with the same "NOT CONFIGURED, not faked" discipline as every other integration:

- **Provider abstraction** (`src/provider.ts`) — `isAiConfigured()` / `missingAiEnvVars()` follow the same pattern as `apps/web/src/lib/env.ts`'s Supabase/DB checks. `getModel()` prefers Anthropic (`ANTHROPIC_API_KEY`, default model `claude-sonnet-5`, overridable via `AI_MODEL`) and falls back to OpenAI (`OPENAI_API_KEY`) if only that's set — `AI_MODEL` becomes *required* in that case rather than guessing an OpenAI model name. Every caller (`detectIntent`, `draftReply`) checks `isAiConfigured()` and throws a clear message rather than letting a missing key surface as an opaque provider error; the Server Actions that call them (`apps/web/src/domains/ai-agent/actions.ts`) check it again and return `{ error }` instead of ever calling into the SDK unconfigured.
- **Tools** (`src/tools/`) — each is a factory function closing over `tenantId` (and `conversationId` where relevant) so the AI can only ever act within the current tenant/conversation, using the exact same `getTenantDb()` isolation as every other domain — there is no separate "AI database access path." `getBusinessInfo` is read-only (Services/Locations/LocationHours, including their `id`s so later tool calls can reference them precisely); `captureLead`, `escalateToHuman`, and `bookAppointment` are real writes through the Phase 3/4 CRM/Conversation models and Phase 7's `@aif/booking`, wrapped in `$transaction` where they touch more than one table, per MASTER_INSTRUCTIONS.md §4.
- **`checkAvailability` / `bookAppointment`** — MASTER_INSTRUCTIONS.md §5's own example tools, built in Phase 7 once the `Appointment` model existed (they were deliberately deferred out of Phase 5 for this reason — see `docs/BUILD_PROGRESS.md`'s Phase 5 and 7 entries). Both call straight into `@aif/booking`, so the AI's booking path and the dashboard UI's booking path (`/dashboard/appointments`) are the *same* code, not two implementations that could drift — `bookAppointment` re-validates the slot inside a transaction rather than trusting whatever `checkAvailability` returned a moment earlier, and its tool wrapper reads the actual `{ booked: true | false }` result (not just "was the tool called") before reporting success back to `draftReply`'s caller, since a soft-fail here without that check would violate the "never fake actions" rule.
- **Intent detection** (`src/intent.ts`) — a `generateObject` call classifying a single message into `FAQ | BOOKING_REQUEST | LEAD_INTEREST | COMPLAINT | OTHER` plus a frustration flag, wired to a manual "Detect intent" button in the Inbox (not automatic-on-load, so an unconfigured AI doesn't produce an error toast just from opening a conversation).
- **Reply drafting** (`src/reply.ts`) — a tool-calling `generateText` loop (`stopWhen: stepCountIs(8)`, raised from 5 once booking added a longer typical tool chain: getBusinessInfo → checkAvailability → bookAppointment → text) that drafts a suggested reply into the compose box for a staff member to review and edit before sending — it never sends automatically and never creates a `Message` row itself. The system prompt includes today's date (for resolving "tomorrow"/"next Monday" before calling `checkAvailability`) and is explicit about prompt-injection defense (MASTER_INSTRUCTIONS.md §5): conversation history is treated as untrusted data, not instructions.

## RAG & Knowledge (Phase 6)

`packages/ai/src/rag/` — chunking, embedding, ingestion, and search, feeding a fourth tool (`searchKnowledgeBase`) into `reply.ts`'s tool set:

- **Chunking** (`chunk.ts`) — plain fixed-size character windowing with overlap, no LLM call.
- **Embeddings** (`embed.ts`) — always `OPENAI_API_KEY` + `text-embedding-3-small` (1536 dims), independent of whichever provider `getModel()` resolves for chat — Anthropic has no public embeddings API. Same `isEmbeddingConfigured()` / throw-with-clear-message pattern as `provider.ts`.
- **Storage** — `DocumentChunk.embedding` is a pgvector column, which Prisma can't represent as a normal field; see `docs/DATABASE.md`'s pgvector section for how it's isolated (a third, raw-SQL-based mechanism alongside `TENANT_SCOPED_MODELS` and `SELF_SCOPED_MODELS`).
- **Ingestion** (`ingest.ts`) — chunk → embed → store → set `KnowledgeDocument.status` to `READY` or `FAILED` (with a reason) — never left stuck at `PENDING`, never faked as successful if embeddings are unconfigured. Runs synchronously inside the `createDocument` Server Action; there's no background job queue wired up yet to move this off the request (that's Phase 8/9's worker infrastructure).
- **`searchKnowledgeBase` tool** — only added to `reply.ts`'s tool set when `isEmbeddingConfigured()` is true, so the AI never attempts a capability it doesn't have (same "don't offer what isn't configured" logic as Phase 4 not offering "AI" as a message sender).
- **UI** (`apps/web/src/domains/knowledge/`) — `/dashboard/knowledge`: add a document (title + pasted text, embedded synchronously on save), see its status/chunk count, and a "Test search" panel to see what the AI would retrieve for a given question, independent of an actual conversation.

## Booking Engine (Phase 7)

`packages/booking` — shared by the dashboard UI (`apps/web/src/domains/booking`) and the AI's `checkAvailability`/`bookAppointment` tools, so there's exactly one implementation of "what's actually bookable":

- **Availability** (`src/availability.ts`) — for a Service + Location + date (+ optional StaffMember), reads the Location's `LocationHours` for that weekday and its existing `Appointment`s, then generates candidate start times at a configurable interval (default 30 min) and filters out any that are in the past or overlap an existing appointment. All wall-clock math (interpreting `LocationHours`' `"HH:mm"` strings, generating candidate times) happens in the Location's own IANA timezone via [Luxon](https://moment.github.io/luxon/); results are converted to UTC only at the end. Runtime-verified directly against a known DST transition (`America/New_York`, 2026-11-01) and a busy-interval overlap case before wiring it into any UI — see `docs/BUILD_PROGRESS.md`'s Phase 7 entry.
- **Conflict scope, a deliberate scope decision:** if `staffMemberId` is given, only that person's own appointments block a slot. If omitted, *all* appointments at the Location block a slot — the Location is treated as having one concurrent booking at a time. Right for this platform's primary target (a single-practitioner local business); under-counts true parallel capacity for a Location with several independent staff, who should always be booked with an explicit `staffMemberId` to get accurate availability. A real multi-resource capacity model (e.g. "3 chairs, any of them") wasn't built — out of scope for Phase 7's baseline.
- **Booking** (`src/book.ts`) — `bookAppointment()` re-checks for a conflict inside a `Serializable`-isolation transaction immediately before creating the row (the slot the caller saw a moment earlier could be gone by now), and returns `{ booked: false, reason }` rather than throwing on a conflict — including a genuine Postgres serialization failure (`P2034`), which is caught and reported the same way. See `docs/DATABASE.md`'s "Booking conflict prevention" section for what this does and doesn't guarantee, and the ideal (unbuilt) fix.
- **UI** (`apps/web/src/domains/booking/`) — `/dashboard/appointments`: a "New appointment" dialog (pick service/location/staff/date → real available slots → confirm with customer details) and a list with an inline status control, following the same patterns as Leads/Conversations.

## Documented deviations from MASTER_INSTRUCTIONS.md §3

Approved exceptions to the exact stack named in MASTER_INSTRUCTIONS.md, each because the tool's current released behavior differs from what was specified:

- **Radix Primitives → Base UI.** The shadcn/ui CLI (v4.18, current as of this phase) now generates components on top of [Base UI](https://base-ui.com), Radix's own successor library (same maintainers), not `@radix-ui/react-*`. Approved by the product owner 2026-08-19 rather than pinning an older shadcn CLI version. Base UI's polymorphism API is a `render` prop (`<Button render={<Link href="/x" />}>`) instead of Radix/shadcn's older `asChild` + `Slot` pattern — use `render`, not `asChild`, in any new component built on these primitives.
- **Prisma 7 driver adapters.** Prisma 7 removed `url`/`directUrl` from the `datasource` block in `schema.prisma` entirely; connection configuration now lives in `packages/db/prisma.config.ts`, and `PrismaClient` is constructed with an explicit adapter (`@prisma/adapter-pg`, node-postgres) rather than the built-in Rust query engine. This is Prisma's current recommended setup, not a deviation from a documented stack choice, but is called out here because it changes how `DATABASE_URL` is wired: there's a single `DATABASE_URL` (no separate `DIRECT_URL`) and it should be a **direct/session** connection string, not a pgbouncer transaction-pooler URL — `prisma migrate` needs session-level features that transaction pooling doesn't support.
- **Next.js `middleware.ts` → `proxy.ts`.** Next.js 16 renamed the `middleware` file convention to `proxy` (same capability — session refresh, route protection — new name/export). `apps/web/src/proxy.ts` uses the current convention.

## Health check

`GET /api/health` reports whether Database, Supabase Auth, and Redis are configured (and whether the database is actually reachable), without ever faking success for an unconfigured integration — see MASTER_INSTRUCTIONS.md §7.
