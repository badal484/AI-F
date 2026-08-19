# Build Progress

Source of truth for phase status. Updated at the end of every phase, per MASTER_INSTRUCTIONS.md §7.

## PHASE 0 — Repository Audit ✅ (2026-08-19)

See `docs/INITIAL_AUDIT.md`. Approved decisions: Supabase (DB+Auth+Storage), Upstash Redis (prod)/local Redis (dev), npm workspaces monorepo, Supabase Auth.

## PHASE 1 — Foundation ✅ (2026-08-19)

**Built:**
- npm workspaces monorepo: `apps/web` (Next.js 16, App Router, TS, Tailwind v4), `apps/worker` (Node, bundled with tsup — corrected to `tsx` in Phase 8, see that entry), `packages/db` (Prisma 7 + tenant-isolation extension), `packages/shared` (Zod schemas, types, logger), `packages/config` (shared tsconfig/eslint base).
- shadcn/ui installed (on Base UI, not Radix — approved deviation, see `docs/ARCHITECTURE.md`), Zustand, TanStack Query wired into the root layout.
- Prisma schema: `Agency`, `Tenant`, `User` (`Role`: OWNER/ADMIN/AGENT). See `docs/DATABASE.md`.
- Tenant isolation: `getTenantDb(tenantId)` / `getPlatformDb()` Prisma Client Extension in `packages/db/src/tenant.ts`.
- Supabase Auth wired end-to-end: `apps/web/src/proxy.ts` (session refresh + route protection), `domains/auth/session.ts` (`resolveTenantContext()`), `domains/auth/actions.ts` (`signUp`/`signIn`/`signOut` Server Actions, Zod-validated, tenant provisioning wrapped in a `$transaction`).
- UI: landing page, `/login`, `/signup` (react-hook-form + zodResolver + shadcn components), `/dashboard` (protected, shows resolved tenant context).
- Structured logging: `createLogger()` (pino) shared by web and worker; `logNotConfigured()` helper used everywhere an integration's env vars are missing, per MASTER_INSTRUCTIONS.md §7 — no faked external calls.
- `GET /api/health` — reports database/Supabase/Redis configuration + DB reachability without faking success.
- `apps/worker`: Redis connection module with NOT CONFIGURED handling, graceful startup/shutdown; no queues registered yet (correctly deferred to Phase 8/9).
- `.env.example` fully documented; `.gitignore` covers `node_modules`, build output, `.env*`, generated Prisma client.

**Verified (2026-08-19):**
- `npm run typecheck` — clean across all 4 workspaces.
- `npm run lint` — clean across all 4 workspaces.
- `npm run build` — clean across all 4 workspaces (`prisma generate`, `next build`, `tsup` — `apps/worker`'s bundling step was later removed in Phase 8).
- Smoke test: `next dev` — `/`, `/login`, `/signup` return 200; `/dashboard` redirects (307) when unauthenticated; `/api/health` correctly reports all three integrations as NOT CONFIGURED with status `ok` (nothing configured is nothing broken).
- `apps/worker`: verified both the NOT CONFIGURED path (no `REDIS_URL`) and the connected path (local `redis-server`) start cleanly and idle without crashing.

**NOT CONFIGURED (requires the product owner to supply real credentials before Phase 2+ can be used end-to-end):**
- `DATABASE_URL` — no live Supabase Postgres instance connected yet. `prisma generate` works without one; `prisma migrate dev` does not.
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — no Supabase project provisioned yet.
- `REDIS_URL` — no persistent Redis instance (Upstash for prod) provisioned yet; only verified locally against an ephemeral `redis-server`.

No migrations have been run against a real database. Once Supabase credentials exist, run `npm run migrate:dev -w @aif/db` to apply the initial migration.

## PHASE 2 — Business Core ✅ (2026-08-19)

**Built:**
- Schema: `Tenant` gains profile fields (`timezone`, `phone`, `website`, `description`); new tenant-scoped models `Location`, `LocationHours`, `Service`, `StaffMember` (see `docs/DATABASE.md` for the full shape and relations).
- Tenant isolation extended: all four new models added to `TENANT_SCOPED_MODELS`; a new `SELF_SCOPED_MODELS` mechanism added to `packages/db/src/tenant.ts` so `getTenantDb()` can read/update the `Tenant` row itself (scoped to `id = tenantId`) without reaching for `getPlatformDb()`.
- Role-gated writes: `apps/web/src/domains/auth/guard.ts` (`requireTenantContext()`, `requireWriteAccess()`) — business-core mutations require OWNER/ADMIN; reads require any authenticated role.
- Zod schemas for every entity (`packages/shared/src/schemas/business-core.ts`) plus a `nullifyEmptyStrings()` helper so blank optional form fields store `null`, not `""`.
- Server Actions per domain (`apps/web/src/domains/business-core/{profile,locations,services,staff}/actions.ts`) — list/create/update/delete, all Zod-validated, all tenant-isolated, cross-tenant FK references (e.g. a StaffMember's `locationId`) explicitly re-validated against the tenant.
- UI: `/dashboard/settings` (tenant profile), `/dashboard/locations` (CRUD + a weekly hours editor dialog), `/dashboard/services` (CRUD), `/dashboard/staff` (CRUD, with a location picker) — all using TanStack Query (`useQuery`/`useMutation`) with optimistic cache updates, per MASTER_INSTRUCTIONS.md §6. A shared `/dashboard` layout adds nav + sign-out for every sub-page.

**Verified (2026-08-19):**
- `npm run typecheck`, `npm run lint`, `npm run build` — clean across all 4 workspaces.
- Smoke test: `next dev` — all five `/dashboard/*` routes correctly 307-redirect to `/login` when unauthenticated (inherited from the shared dashboard layout guard); `/api/health` unaffected.
- Full CRUD flows (create/edit/delete a Location, Service, StaffMember; edit hours; edit tenant profile) have **not** been exercised against a live database — Supabase/Postgres credentials are still NOT CONFIGURED in this environment (unchanged from Phase 1). Once `DATABASE_URL` and Supabase Auth env vars are set and a migration is applied (`npm run migrate:dev -w @aif/db`), these flows should be manually verified end-to-end in a browser before Phase 3 relies on this data.

**Known, accepted limitations (documented, not blocking):**
- Deleting a `Location` that has `StaffMember`s pointing at it will fail on the FK constraint (no `onDelete` override was set — intentionally Restrict, not silently `SetNull`, so staff don't get silently detached). The UI surfaces this as a generic "Something went wrong" toast rather than a specific message; revisit if this proves confusing in practice.
- Services are USD-only for now (`currency` defaults to `"usd"` and isn't exposed in the form); multi-currency support isn't needed until a real multi-currency tenant exists.
- Country is a free-text field, not a validated country selector.

## PHASE 3 — CRM ✅ (2026-08-19)

**Engineering judgment call (documented per MASTER_INSTRUCTIONS.md §9):** MASTER_INSTRUCTIONS.md's Phase 3 line item is "Customers, Leads, Tags, Conversation pipeline." Read literally against the Phase 4 line item — "Universal Inbox (Chat UI, Message assignment, Human handoff)" — building chat `Conversation`/`Message` storage in *both* phases would be redundant scope. Interpreted "Conversation pipeline" as CRM terminology for a Lead's sales-pipeline stage (`LeadStage`: NEW → CONTACTED → QUALIFIED → WON/LOST) rather than literal chat message storage, and deferred `Conversation`/`Message` tables to Phase 4, which is what actually needs them for its Chat UI. See `docs/DATABASE.md`'s naming note.

**Built:**
- Schema: `Customer`, `Lead` (with `LeadStage`/`LeadSource` enums), `Tag` (implicit many-to-many with both Customer and Lead) — all tenant-scoped. `Lead` optionally links to a `Customer` and/or an `assignedTo` `User`.
- Tenant isolation extended: `Customer`, `Lead`, `Tag` added to `TENANT_SCOPED_MODELS`. Documented and applied the "nested relation writes aren't auto-scoped" invariant explicitly for tag-attachment (`assertTagsBelongToTenant`) and cross-entity FKs (`assertBelongsToTenant` for `customerId`/`assignedToId`) — see `docs/DATABASE.md`.
- Zod schemas (`packages/shared/src/schemas/crm.ts`) and Server Actions per entity (`apps/web/src/domains/crm/{customers,leads,tags}/actions.ts`), same role-gated-write pattern as Phase 2. A dedicated `updateLeadStage` action powers a lightweight pipeline-stage move separate from the full edit form.
- UI: `/dashboard/customers` (CRUD + tag picker), `/dashboard/leads` (CRUD + inline stage `Select` per row with optimistic update/rollback + tag picker + customer/assignee pickers), `/dashboard/tags` (create/delete, chip-style list). A reusable `TagPicker` component is shared between the Customer and Lead forms. Dashboard nav extended; moved to `app/dashboard/_components/` since it's cross-domain, not business-core-specific.

**Verified (2026-08-19):**
- `npm run typecheck`, `npm run lint`, `npm run build` — clean across all 4 workspaces.
- Smoke test: `next dev` — all three new `/dashboard/*` routes correctly 307-redirect to `/login` when unauthenticated; `/api/health` unaffected.
- As with Phase 2, full CRUD flows have **not** been exercised against a live database — Supabase/Postgres credentials remain NOT CONFIGURED (unchanged from Phase 1/2).

**Known, accepted limitations (documented, not blocking):**
- Leads UI is a sortable table with a stage-select column, not a drag-and-drop kanban board. Functionally complete for moving a lead through the pipeline; a kanban view is a polish-phase candidate, not a Definition-of-Done requirement.
- Deleting a `Tag` detaches it from every Customer/Lead it's attached to (Prisma's implicit m2m join rows are removed automatically) with no confirmation of *what* it's attached to beyond a generic warning in the delete dialog.

**Correction (2026-08-19, made during Phase 4 work, before either was pushed further):** Customer and Lead create/update/delete were originally gated behind `requireWriteAccess()` (OWNER/ADMIN only). That's wrong — Customers and Leads are exactly the day-to-day CRM work `AGENT` exists for, not business configuration. Caught while wiring the same mistake into Phase 4's Inbox actions and fixed in both places before this build reached the product owner: `apps/web/src/domains/crm/customers/actions.ts` and `apps/web/src/domains/crm/leads/actions.ts` now use `requireTenantContext()` (any authenticated role) for all mutations; only Tags remain OWNER/ADMIN-gated (a lower-frequency "define what exists" action, not "use what exists"). See `docs/DATABASE.md`'s Tenant isolation section for the corrected write-access model.

## PHASE 4 — Universal Inbox ✅ (2026-08-19)

**Built:**
- Schema: `Conversation` (one row per chat thread — `channel`, `status`, `assignedTo`, optionally linked to a `Customer`/`Lead`) and `Message` (`senderType`: `CUSTOMER | AI | STAFF`) — both tenant-scoped. New enums `ConversationChannel`, `ConversationStatus`, `MessageSender`. "Message assignment" is modeled as assigning the whole Conversation thread to a `User`; "Human handoff" is `ConversationStatus.HUMAN_REQUIRED`, settable manually since there's no AI yet to set it automatically (that's Phase 5).
- Tenant isolation extended: `Conversation`, `Message` added to `TENANT_SCOPED_MODELS`; cross-entity FK checks (`customerId`, `leadId`, `assignedToId`) follow the established `assertBelongsToTenant()` pattern.
- Zod schemas (`packages/shared/src/schemas/inbox.ts`) and Server Actions (`apps/web/src/domains/inbox/{conversations,messages}/actions.ts`). `createConversation` and `sendMessage` each wrap a multi-table write (Conversation + its first Message; Message + parent `Conversation.lastMessageAt`) in `$transaction`, per MASTER_INSTRUCTIONS.md §4.
- UI: `/dashboard/inbox` — a two-pane chat layout (`ConversationList` + `ConversationThread`, orchestrated by `InboxView`). Starting a new conversation requires an initial message (staff logging what a customer said, since there's no live channel yet — not fake data, just manual entry of a real interaction). The compose box lets staff choose "Reply as staff" or "Log customer message"; "AI" is not offered as a sender choice anywhere in the UI, since there is no AI in this phase and offering it would misrepresent who said what.
- Extracted `listAssignableUsers()` out of the CRM domain into `apps/web/src/domains/auth/users.ts`, since both CRM (Lead assignment) and Inbox (Conversation assignment) need it and neither domain should own it.

**Verified (2026-08-19):**
- `npm run typecheck`, `npm run lint`, `npm run build` — clean across all 4 workspaces.
- Smoke test: `next dev` — `/dashboard/inbox` correctly 307-redirects to `/login` when unauthenticated; `/api/health` unaffected.
- As with prior phases, full conversation/message flows have **not** been exercised against a live database — Supabase/Postgres credentials remain NOT CONFIGURED.

**Known, accepted limitations (documented, not blocking):**
- No real-time updates (polling/WebSocket/Supabase Realtime) — the inbox refreshes via TanStack Query's normal cache invalidation on mutation, not push. Justified: there's no live inbound channel yet (WhatsApp is Phase 8, the Website Widget is Phase 10) to make real-time meaningful; revisit when one of those lands.
- `MessageSender.AI` and `ConversationStatus.HUMAN_REQUIRED` being auto-set are both Phase 5 (AI Core) concerns — modeled now, not wired to anything yet.

## PHASE 5 — AI Core ✅ (2026-08-19)

**Engineering judgment call (documented per MASTER_INSTRUCTIONS.md §9):** MASTER_INSTRUCTIONS.md §5 names `checkAvailability`/`bookAppointment` as example tools, but both need the `Appointment` model, which doesn't exist until Phase 7 (Booking Engine) — MASTER_INSTRUCTIONS.md §9 requires executing phases "strictly in this order," so building Phase 7's schema now to support them isn't an option, and faking booking logic without real data is explicitly forbidden by §7. Built the three tools that ARE supportable against the current schema (`getBusinessInfo`, `captureLead`, `escalateToHuman`) and had the system prompt explicitly tell the AI booking isn't available yet, escalating instead. Revisit once Phase 7 lands — `checkAvailability`/`bookAppointment` belong there.

**Built:**
- New package `packages/ai` (`ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai`) — verified the actual installed API surface (`tool()`'s `inputSchema` field, `generateObject`'s `schema`, `generateText`'s `stopWhen: stepCountIs(n)` for multi-step tool loops) directly against the installed package's type definitions before writing any code, given this session's pattern of installed-version API drift from typical assumptions.
- `src/provider.ts` — `isAiConfigured()`/`missingAiEnvVars()`/`getModel()` abstraction; Anthropic default (`claude-sonnet-5`, overridable via `AI_MODEL`), OpenAI fallback requiring `AI_MODEL` explicitly rather than guessing a default model name for a provider this build doesn't have a confirmed current model ID for.
- Tools (`src/tools/`): `getBusinessInfo` (read-only, Services/Locations/Hours), `captureLead` (real CRM write, `$transaction`-wrapped with linking the Conversation), `escalateToHuman` (sets `ConversationStatus.HUMAN_REQUIRED` — MASTER_INSTRUCTIONS.md §5's Human Handoff, AI-triggered counterpart to Phase 4's manual status control). Each is a factory closing over `tenantId`/`conversationId` so the AI can only ever act within the current tenant via the same `getTenantDb()` isolation as everything else.
- `src/intent.ts` — `generateObject`-based classification into `FAQ | BOOKING_REQUEST | LEAD_INTEREST | COMPLAINT | OTHER` + a frustration flag.
- `src/reply.ts` — tool-calling `generateText` draft-reply loop with a system prompt covering: only state facts from `getBusinessInfo`, never claim a booking succeeded, escalate on frustration/unanswerable questions, capture leads on clear interest, and explicit prompt-injection defense (treat conversation history as untrusted data, not instructions) per MASTER_INSTRUCTIONS.md §5.
- Wired into `/dashboard/inbox`: a manual "Detect intent" button (shows intent + frustration badge for the last customer message) and "Draft AI reply" button (fills the compose box for staff to review/edit — never auto-sends, never creates a `Message` row itself) on `ConversationThread`. Both are manual, not automatic-on-load, so an unconfigured AI doesn't produce error toasts just from opening a conversation.
- `.env.example` documents `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `AI_MODEL`.

**Verified (2026-08-19):**
- `npm run typecheck`, `npm run lint`, `npm run build` — clean across all 5 workspaces (now including `@aif/ai`).
- Runtime-verified the NOT CONFIGURED path directly (not just via the build passing): with no API key set, `isAiConfigured()` returns `false`, `getModel()` throws the expected message, confirming `detectConversationIntent`/`generateDraftReply` will return `{ error }` without ever reaching the SDK, per MASTER_INSTRUCTIONS.md §7.
- Smoke test: `next dev` — `/dashboard/inbox` still redirects correctly when unauthenticated; `/api/health` unaffected; no import/build errors from the new package.
- As with prior phases, the actual AI calls (intent detection, reply drafting, tool execution against real tenant data) have **not** been exercised against a live database or a real Anthropic/OpenAI key — both are NOT CONFIGURED in this environment.

**Known, accepted limitations (documented, not blocking):**
- `checkAvailability`/`bookAppointment` tools deferred to Phase 7 — see the judgment call above.
- No streaming (`streamText`) — reply drafting is a single `generateText` call with a loading state, not token-by-token streaming. Justified for now: this is a staff-facing "draft for review" feature, not the customer-facing live chat MASTER_INSTRUCTIONS.md §6 asks to stream — that requirement is more relevant to Phase 10's Website Widget, where a customer is watching in real time.
- The exact Anthropic model ID (`claude-sonnet-5`) hasn't been verified against a live API call (no credentials configured); it's sourced from this environment's own model-ID reference, not independently confirmed.

## PHASE 6 — RAG & Knowledge ✅ (2026-08-19)

**Built:**
- Enabled pgvector: `previewFeatures = ["postgresqlExtensions"]` + `extensions = [vector]` in `schema.prisma`. New models `KnowledgeDocument` (`status`: `PENDING | READY | FAILED`, `error`) and `DocumentChunk` (`embedding Unsupported("vector(1536)")?`, since Prisma has no native vector type). Both added to `TENANT_SCOPED_MODELS`.
- `packages/db/src/vector.ts` — `setChunkEmbedding()`/`searchChunks()`, the only sanctioned access to the `embedding` column (raw SQL, since `Unsupported` fields are invisible to `getTenantDb()`'s extension). Both require `tenantId` as a parameter and bake `tenant_id = ...` into the SQL themselves — that's what isolates this column, documented as a third isolation mechanism alongside `TENANT_SCOPED_MODELS`/`SELF_SCOPED_MODELS` in `docs/DATABASE.md`.
- `packages/ai/src/rag/`: `chunk.ts` (fixed-size windowing with overlap, no LLM call — runtime-verified directly, not just via the build passing), `embed.ts` (`text-embedding-3-small`, always needs `OPENAI_API_KEY` specifically regardless of the chat provider), `ingest.ts` (chunk → embed → store → set document status, never leaves a document stuck at `PENDING` or fakes success if unconfigured), `search.ts` (`searchKnowledgeBase()`).
- A fourth AI tool, `searchKnowledgeBase` (`packages/ai/src/tools/search-knowledge-base.ts`), added to `reply.ts`'s tool set — but only when `isEmbeddingConfigured()` is true, so the AI never attempts a capability it doesn't have.
- UI: `/dashboard/knowledge` — add a document (title + pasted text, embedded synchronously on save since there's no background job queue yet), status/chunk-count list, delete, and a "Test search" panel showing what the AI would retrieve for a given question.
- `.env.example` updated: `OPENAI_API_KEY` is now documented as required for embeddings regardless of which provider is configured for chat.

**Research before writing schema (given this session's pattern of installed-version API drift):** searched for Prisma 7 + pgvector guidance before touching `schema.prisma`, since Prisma's own docs pages fetched didn't cover it. Found and want to flag: [prisma/prisma#28867](https://github.com/prisma/prisma/issues/28867) reports `prisma migrate dev` producing a false schema-drift error for `Unsupported("vector")` columns specifically on Prisma 7.1.0 (filed 2025-12-05). This repo is on 7.9.1 — possibly fixed since, not confirmed either way, since there's still no live database to run `migrate dev` against. `prisma generate`/`prisma validate` both succeed cleanly on the new schema. Documented the risk and a mitigation (`migrate dev --create-only` + manual SQL review) in `docs/DATABASE.md`'s pgvector section for whoever runs the first real migration.

**Verified (2026-08-19):**
- `npm run typecheck`, `npm run lint`, `npm run build` — clean across all 5 workspaces.
- Runtime-verified (not just build-verified): `chunkText()` produces correctly-overlapping windows for a 2500-character input (1000/1000/800 chars, confirmed the overlap math by hand); empty and whitespace-only input correctly return `[]`. `isEmbeddingConfigured()` returns `false` and `embedText()` throws the expected NOT CONFIGURED message with no `OPENAI_API_KEY` set.
- Smoke test: `next dev` — `/dashboard/knowledge` redirects correctly when unauthenticated; `/api/health` unaffected; no import/build errors from the new pgvector schema or `packages/ai/src/rag` additions.
- As with every prior phase, actual ingestion/search against a live database and a real `OPENAI_API_KEY` have **not** been exercised — both remain NOT CONFIGURED in this environment. The Prisma 7.1.0 migration-drift risk above specifically can't be verified without one.

**Known, accepted limitations (documented, not blocking):**
- Ingestion is synchronous within the `createDocument` Server Action — fine for the document sizes the UI accepts, but will need to move to `apps/worker`'s (still-unbuilt) BullMQ queue once large documents or bulk imports are supported.
- No file upload (PDF, DOCX, etc.) — paste-only. File upload needs S3-compatible Storage, which isn't wired up yet; add when it is.
- A brief eventual-consistency window exists between a `DocumentChunk` row being created and its embedding being set (they can't be in the same transaction — one uses `getTenantDb()`, the other raw SQL). `searchChunks()` filters `WHERE embedding IS NOT NULL`, so this never surfaces as incorrect results, just a chunk that isn't searchable for a moment.

## PHASE 7 — Booking Engine ✅ (2026-08-19)

**Built:**
- Schema: `Appointment` (`AppointmentStatus`: `SCHEDULED | CONFIRMED | CANCELLED | COMPLETED | NO_SHOW`), linking `Service` + `Location` + optional `StaffMember`/`Customer`/`Conversation`. `customerName` is required directly on the row (mirrors `Lead`'s own name/email/phone fields) so every appointment identifies who it's for even without a linked `Customer`. Added to `TENANT_SCOPED_MODELS`.
- New package `packages/booking` (adds Luxon for timezone math), shared by the dashboard UI and the AI's tools so there's one implementation of "what's bookable," not two that could drift:
  - `availability.ts` — real slots from `LocationHours` + existing `Appointment`s, all wall-clock math in the Location's own IANA timezone, converted to UTC only at the end.
  - `book.ts` — re-checks for a conflict inside a `Serializable`-isolation transaction immediately before creating the row, catching both an application-level conflict and a genuine Postgres `P2034` serialization failure, returning `{ booked: false, reason }` for either rather than throwing.
- `packages/db`: added a value export of `Prisma` (was previously type-only) so `Prisma.TransactionIsolationLevel.Serializable` and `Prisma.PrismaClientKnownRequestError` are usable outside `packages/db` itself.
- Two AI tools finally built, closing the gap flagged in Phase 5's judgment call: `checkAvailability` and `bookAppointment` (`packages/ai/src/tools/`), both calling straight into `@aif/booking`. `getBusinessInfo` updated to return service/location `id`s (previously display-only) so the AI has something to pass these new tools. `reply.ts`'s system prompt now includes today's date (to resolve "tomorrow"/"next Monday") and its `stopWhen` raised from `stepCountIs(5)` to `stepCountIs(8)` for the longer typical chain (getBusinessInfo → checkAvailability → bookAppointment → text). `bookAppointment`'s tool wrapper reads the actual `{ booked: true|false }` result — not just whether the tool was *called* — before `draftReply` reports a booking back to its caller, since `bookAppointment` can soft-fail without throwing and treating "called" as "succeeded" would violate MASTER_INSTRUCTIONS.md §7.
- Zod schemas (`packages/shared/src/schemas/booking.ts`) and Server Actions (`apps/web/src/domains/booking/appointments/actions.ts`) — `requireTenantContext()` (not `requireWriteAccess()`) for all of them, applying the Phase 3/4 permission lesson from the start this time rather than needing a later correction.
- UI: `/dashboard/appointments` — a "New appointment" dialog (service/location/staff/date → real slots from `checkAvailability` → confirm with customer details) and a list with an inline status `Select`, optimistic like Leads'.

**Verified before writing any UI code:** wrote a standalone script exercising the exact date/timezone/overlap logic `availability.ts` uses — confirmed weekday-numbering conversion (Luxon's 1=Mon..7=Sun → this schema's 0=Sun..6=Sat) against known dates, confirmed correct UTC-offset math either side of a real DST transition (`America/New_York`, 2026-11-01: 9am → 13:00 UTC before, 14:00 UTC after), and confirmed slot/overlap filtering excludes exactly the slots that should overlap a busy window and nothing else. This is the same "verify before trusting" discipline used for chunking in Phase 6, applied here because timezone math is exactly the kind of code that looks right and silently isn't.

**Verified (2026-08-19):**
- `npm run typecheck`, `npm run lint`, `npm run build` — clean across all 6 workspaces (now including `@aif/booking`).
- Smoke test: `next dev` — `/dashboard/appointments` redirects correctly when unauthenticated; `/api/health` unaffected; no import/build errors from the new package or schema.
- As with every prior phase, actual booking flows (through the UI or the AI) have **not** been exercised against a live database — remains NOT CONFIGURED in this environment. This also means the `Serializable`-transaction conflict handling and the pgvector migration-drift risk flagged in Phase 6 are both still unverified against a real Postgres instance.

**Known, accepted limitations (documented, not blocking):**
- Conflict prevention is application-level (re-check-then-insert inside a `Serializable` transaction), not a database-level `EXCLUDE` constraint — the ideal fix needs `btree_gist` and a raw-SQL migration Prisma's schema can't express. See `docs/DATABASE.md`'s "Booking conflict prevention" section.
- No true multi-resource capacity model — a Location without an explicit `staffMemberId` on the booking request is treated as having one concurrent booking at a time, which under-counts a Location with several independently-bookable staff. See `docs/ARCHITECTURE.md`'s Booking Engine section.
- The AI's booking tools can't reschedule or cancel an existing appointment — only create new ones. The reply-drafting system prompt tells the AI to escalate those requests to a human; staff can reschedule/cancel manually via the dashboard's status control. Revisit if this becomes a common request once real conversations exist.
- No calendar/day-view UI — appointments are a flat, most-recent-first table, matching every other list in this dashboard. A calendar view is a polish-phase candidate, not a Definition-of-Done requirement.

## PHASE 8 — WhatsApp Integration ✅ (2026-08-19)

**Built:**
- Schema: `Message.externalId` (`@@unique([tenantId, externalId])`, for idempotency), `Tenant.whatsappPhoneNumberId` (globally `@unique`, maps an inbound webhook's `phone_number_id` back to a tenant), new model `WhatsAppTemplate`.
- New package `packages/queue` — moved the Redis connection factory out of `apps/worker` (previously private to it) since `apps/web` now needs it too, to enqueue jobs. `QUEUE_NAMES`, Zod-validated job payloads, and `enqueueWhatsAppInbound()`/`enqueueWhatsAppOutbound()`. Job ids are the WhatsApp message id (inbound) / our own Message id (outbound) — BullMQ's own id-based dedupe is the first idempotency layer, before the DB constraint.
- New package `packages/whatsapp` — Meta Graph API client (`sendTextMessage`, `sendTemplateMessage`), webhook signature verification (`verifyWebhookSignature`, HMAC-SHA256 over the raw body, constant-time compare) and the GET verification handshake (`verifyWebhookHandshake`), and a defensive payload parser (`parseInboundWebhook`, text messages only). Verified the exact current payload/request shapes and Graph API version (`v25.0`) by fetching Meta's own docs directly rather than assuming a remembered shape — an older SDK's docs, fetched during the same research, referenced `v16.0`, confirming this does drift.
- `apps/worker/src/queues/whatsapp-inbound.ts` and `whatsapp-outbound.ts` — the first real BullMQ `Worker` instances in this repo (Phase 1 through 7 only ever had the connection scaffolding). Inbound: find/create Customer+Conversation, idempotently record the Message, then `draftReply()` (Phase 5) and either enqueue the AI's reply or leave the conversation for a human if it escalated or was already `HUMAN_REQUIRED`. Outbound: the single place that actually calls `sendTextMessage()` — both staff replies and AI auto-replies enqueue here rather than calling the API themselves.
- `apps/web`: `/api/webhooks/whatsapp` (GET handshake, POST verify+parse+enqueue, no AI/DB work inline — acks fast per MASTER_INSTRUCTIONS.md's hybrid deployment architecture), `sendMessage` (inbox) now also enqueues an outbound send for `WHATSAPP`-channel conversations, new `domains/whatsapp` (template CRUD, config-tier; `sendWhatsAppTemplateToConversation`, day-to-day-tier, called directly rather than via the queue — a documented, deliberate exception for this low-frequency manual action). Settings gained a `whatsappPhoneNumberId` field; fixed via `nullifyEmptyStrings` before save, since that field is `@unique` and a stray `""` (instead of `null`) would collide the moment a second tenant also left it blank.

**A real bug found and fixed mid-phase — not just a doc update:** `apps/worker` had been bundled into a single `dist/index.js` via `tsup`/esbuild since Phase 1, which worked because nothing in `apps/worker` had imported `@aif/db` before. The first WhatsApp processor to do so broke at runtime — Prisma's generated client (and `pg`, `@prisma/adapter-pg`'s driver) rely on dynamic `require()` internally, the same problem class `pino` hit in Phase 1. Unlike `pino`, adding more packages to tsup's `external` list didn't fix it — each fix uncovered another dynamic `require()` deeper in Prisma's own runtime (`pg` → then `@prisma/client/runtime/client.js` itself). Concluded this wasn't a one-off and switched `apps/worker` to run via `tsx src/index.ts` in production too (same tool already used for `dev`), removing the bundling step entirely — `tsx` transpiles per-file through Node's normal module resolution instead of statically inlining the whole dependency graph, which sidesteps this entire bug class rather than chasing it further. Removed `tsup` as a dependency. **Verified the fix, not just the build passing:** `node dist/index.js` (the old path) crashed immediately with `Dynamic require of "path" is not supported`; `tsx src/index.ts` (the new path) started cleanly, connected to a local Redis, and registered both BullMQ workers.

**Verified (2026-08-19):**
- `npm run typecheck`, `npm run lint` — clean across all 8 workspaces (now including `@aif/queue` and `@aif/whatsapp`). `npm run build` — clean (worker now has no build script; skipped gracefully via `--if-present`, by design).
- Runtime-verified directly, not just via the build passing: `verifyWebhookSignature`/`verifyWebhookHandshake` against 7 hand-constructed cases (valid/invalid/tampered/missing signature, correct/wrong token/mode) — all passed; `parseInboundWebhook` against Meta's exact documented payload shape, a non-text message (correctly skipped), and malformed/null input (correctly returns `[]`) — all passed.
- Smoke test: `next dev` — `/dashboard/whatsapp-templates` redirects correctly when unauthenticated; the webhook route's GET handshake correctly 403s with a wrong token and 200-echoes the challenge with a correct one; POST correctly 401s with no valid signature; `/api/health` unaffected.
- The worker's dual startup paths (Redis NOT CONFIGURED → idles cleanly; Redis configured → connects and registers both workers) were re-verified after the tsup→tsx fix.
- As with every prior phase, nothing here has been exercised against real external services — no live Postgres, no live Meta WhatsApp Business Account, no live Redis beyond local ad hoc smoke tests. `WHATSAPP_ACCESS_TOKEN`/`WHATSAPP_APP_SECRET`/`WHATSAPP_VERIFY_TOKEN` are NOT CONFIGURED in this environment; a real end-to-end message (Meta → webhook → worker → AI → reply → Meta) has not happened.

**Known, accepted limitations (documented, not blocking):**
- Text messages only — no media/attachments (images, documents, location, etc.), which would need S3-compatible Storage that isn't wired up yet (same gap noted in Phase 6 for knowledge-base file upload).
- No delivery/read-receipt status tracking — Meta sends these as separate webhook events, not handled.
- Customer phone matching for inbound messages is an exact string match on `Customer.phone` — no E.164 normalization, so a Customer entered with different formatting than WhatsApp's own `from` field (digits only, country code, no separators) won't be matched and a duplicate Customer gets created instead.
- The outbound worker doesn't detect a closed 24-hour window and auto-switch to a template — without live credentials to see Meta's actual rejection error shape, adding that special-case handling would be guessing. Staff send a template explicitly via the Inbox instead.
- `WhatsAppTemplate` is a local registry, not synced from Meta — staff must enter the name/language/body exactly as approved; nothing here validates that against Meta's own records.
- Conflict prevention / idempotency here (like Phase 7's booking conflict prevention) is unverified against real concurrent load or an actual Meta webhook redelivery — the two-layer design (BullMQ job-id dedupe + DB unique constraint) is standard practice but hasn't been exercised for real.

## PHASE 9 — Automations ✅ (2026-08-19)

MASTER_INSTRUCTIONS.md names this phase tersely ("Triggers, Delays, Reminders") with no further spec — an engineering-judgment call, per §9's "use your expert judgment and document it." Interpreted as: a tenant-configurable rule engine ("when X happens, wait N minutes, do Y") covering the three real, already-existing write paths that make sense as triggers today (an appointment gets booked, a lead gets created, a lead's stage changes), two real actions (send a WhatsApp template, create a staff-facing reminder), scheduled via delayed BullMQ jobs rather than a poll/cron.

**Built:**
- Schema: `AutomationRule` (trigger/triggerStage/delayMinutes/actionType/whatsappTemplateId/reminderTitle/isEnabled), `AutomationRun` (one scheduled/completed firing per rule+entity, `@@unique([ruleId, entityId])`), `Reminder` (staff-facing to-do, optionally linked to a Lead/Customer).
- New package `packages/automations` — `scheduleAutomationRuns(event)` (finds matching enabled rules, computes each one's fire time, upserts an `AutomationRun`, enqueues a delayed BullMQ job) and `cancelAutomationRunsForEntity()` (flips still-`PENDING` runs to `CANCELLED`). Delay semantics deliberately differ by trigger: `APPOINTMENT_CREATED` counts backward from the appointment's `startAt` (a reminder before it starts); `LEAD_CREATED`/`LEAD_STAGE_CHANGED` count forward from the trigger moment (a follow-up after) — documented at length in `docs/ARCHITECTURE.md`'s new "Automations (Phase 9)" section, since getting this backwards would silently invert every rule's meaning.
- `packages/queue`: new `automation-run` queue, `enqueueAutomationRun(payload, delayMs)` — first use of BullMQ's `delay` job option in this repo (Phase 8's queues were all immediate).
- Trigger wiring at four call sites, chosen to be the shared implementation each entity type actually goes through rather than duplicating scheduling logic at every UI-facing action: `packages/booking`'s `bookAppointment()` (covers both the dashboard's "New appointment" dialog and the AI's `bookAppointment` tool for free, same reasoning Phase 7 already established for "one booking implementation"), `apps/web`'s `createLead`/`updateLeadStage`, and `packages/ai`'s `captureLead` tool (leads captured by the AI don't go through the dashboard action, so this needed its own call site). Cancellation wired into `updateAppointmentStatus` when status becomes `CANCELLED`.
- `apps/worker/src/queues/automation-run.ts` — third BullMQ `Worker` in this repo. Re-fetches the run+rule fresh at fire time (never trusts the job payload beyond `tenantId`/`runId`), checks `status === PENDING` (the cancellation mechanism — see below) and `rule.isEnabled`, resolves the target entity (Appointment or Lead) to a phone/customer/lead, then executes the action. Action failures are re-thrown so BullMQ's configured retries get a chance at transient errors (same pattern as `whatsapp-outbound.ts`); `AutomationRun.status` only becomes `FAILED` once retries are exhausted, via a `worker.on("failed", ...)` listener checking `job.attemptsMade` against `job.opts.attempts` — verified this distinction matters by reading BullMQ's own `Worker` type doc comments (`'failed' event... triggered when a job has thrown an exception`, i.e. on *every* attempt, not just the final one) rather than assuming.
- UI: `/dashboard/automations` (rule CRUD with conditional fields based on trigger/action — config-tier, `requireWriteAccess`) and `/dashboard/reminders` (flat list of open reminders with "mark done" — day-to-day tier, `requireTenantContext`), plus nav links.

**A design decision worth flagging:** cancellation doesn't reach into BullMQ to remove a specific delayed job — `cancelAutomationRunsForEntity()` only updates Postgres, and the worker's `status === PENDING` check at fire time is what actually makes cancellation effective. Simpler and cheaper than tracking job ids for removal, at the cost of a cancelled job still sitting in Redis until its original delay elapses (then becoming a no-op). Same reasoning extends to rule deletion (cascades `AutomationRun` via `onDelete: Cascade`, so the worker's "run not found" path — already needed for other reasons — handles it).

**Verified (2026-08-19):**
- `npm run typecheck`, `npm run lint` — clean across all 10 workspaces (now including `@aif/automations`). `npm run build` — clean.
- The scheduling math (backward-from-start for appointments, forward-from-now for leads, past-target → SKIPPED, delay clamped to ≥0) was verified with a standalone script against hand-computed expected timestamps before trusting it — same discipline as Phase 7's availability math and Phase 8's signature verification — then deleted.
- `apps/worker` startup re-verified with all three workers now registered (`whatsapp-inbound`, `whatsapp-outbound`, `automation-run`) against a local Redis, and the no-Redis idle path re-verified unaffected.
- Smoke test: `next dev` — `/dashboard/automations` and `/dashboard/reminders` both correctly 307-redirect when unauthenticated, matching every other protected route; `/api/health` unaffected.
- As with every prior phase, nothing here has been exercised against a live Postgres or a real end-to-end fire (schedule → wait → worker executes → WhatsApp send/Reminder created) — `DATABASE_URL` is NOT CONFIGURED in this environment, so `AutomationRule`/`AutomationRun` queries, the `upsert`'s idempotency behavior, and the worker's `worker.on("failed", ...)` terminal-failure path are all unverified against real data, only reasoned about from BullMQ's/Prisma's documented behavior.

**Known, accepted limitations (documented, not blocking):**
- Automation-sent WhatsApp messages are **not** logged as a `Message`/`Conversation` in the Inbox — the audit trail is the `AutomationRun` row's `status`/`error` instead. Considered logging into a Conversation (mirroring Phase 8's inbound/outbound pattern) but that requires resolving/creating a Conversation for two different entity shapes (Appointment vs Lead) plus a new `MessageSender` enum value — judged as scope creep for this phase's actual deliverable (the rule engine), not as a shortcut; revisit if staff need automation sends visible in-thread.
- No dynamic `{{n}}` template variable substitution for automation-triggered `SEND_WHATSAPP_TEMPLATE` sends (`bodyParams` is always `[]`) — a template with placeholders will send them un-filled. Use a placeholder-free template for automations, or send manually via the Inbox for anything needing per-customer variables.
- A rule fires **at most once** per (rule, entity) pair, ever — a Lead re-entering the same stage a second time won't re-trigger a `LEAD_STAGE_CHANGED` rule that already fired for it once. Deliberate (avoids spamming a flapping lead far more than it under-delivers a reminder), not an oversight.
- No reminder history view — `/dashboard/reminders` only shows open (`isCompleted: false`) reminders; completed ones aren't listed anywhere in the UI (they still exist in the DB).
- Same multi-resource-capacity and no-E.164-phone-normalization scope limits already documented in Phases 7/8 apply here too, since automation targets resolve through the same Appointment/Lead phone fields.

## PHASE 10 — Website Widget ✅ (2026-08-19)

MASTER_INSTRUCTIONS.md names this phase as "Embeddable chat, origin validation" — interpreted as: a script-tag embed (not an iframe — see the design reasoning in `docs/ARCHITECTURE.md`'s "Website Widget" section) that runs in the host page's own origin, so its requests to our API carry a real, browser-enforced `Origin` header, making per-tenant origin validation an actual security boundary rather than a self-reported value we'd have to trust.

**Built:**
- Schema: `Tenant.widgetEnabled` (kill switch, defaults off), `Tenant.widgetAllowedOrigins` (`String[]`, native Postgres array — first use of one in this schema), `Conversation.widgetVisitorId` (correlates an anonymous website visitor's repeat messages to one thread, since there's no phone/login to key off like WhatsApp/dashboard channels).
- `apps/web/public/widget.js` — a plain, dependency-free (no React/Next build step) embeddable script. Renders a floating chat bubble + panel inside a Shadow DOM (full style isolation from the host page in both directions), persists a visitor id in the host page's own `localStorage` (deliberately not a cookie — a cookie set by our API's response would be a third-party cookie in the host page's context, increasingly blocked by browsers), and is fully keyboard-operable and screen-reader-friendly (`role="dialog"`/`aria-modal`, `role="log"`/`aria-live="polite"`, Escape-to-close with focus return, Enter-to-send via a real `<form>`) — MASTER_INSTRUCTIONS.md's "Mobile-First Accessibility" section names the Web Widget explicitly, so this wasn't optional polish.
- `apps/web/src/app/api/widget/[tenantId]/message/route.ts` — `POST` (receive a message, reply synchronously) and `OPTIONS` (CORS preflight) handlers. **`tenantId` in the URL path is a deliberate, load-bearing choice, not styling:** a CORS preflight request carries no body, so per-tenant origin validation during preflight needs the tenantId available some other way — the path is that way. Both handlers independently call `resolveAllowedOrigin()` (checks `widgetEnabled` + an exact match against `widgetAllowedOrigins`, via `getPlatformDb()` — documented as the platform-db pattern's fourth sanctioned use) and never trust that a browser actually honored its own preflight result.
- Reply flow, synchronous (no queue, unlike WhatsApp's webhook pattern — there's no third-party redelivery to guard against, and the visitor's browser is waiting on the response): find/create a `WEBSITE`-channel `Conversation` keyed by `widgetVisitorId`, log the `Message`, call the same `draftReply()` Phase 5/8 already use, return the reply text directly. Escalation and AI-NOT-CONFIGURED both return a real, not-invented fallback string — the visitor's message is still genuinely saved either way.
- Settings: `widgetEnabled`/`widgetAllowedOrigins` added to the existing `/dashboard/settings` page (same place `whatsappPhoneNumberId` already lives — one tenant-config surface, not a new page per integration), plus a copy-pasteable embed snippet computed from the actual incoming request's `host`/`x-forwarded-proto` headers rather than a hardcoded `NEXT_PUBLIC_APP_URL`, so it's correct in dev/staging/prod alike.
- `packages/db/src/tenant.ts`'s `getPlatformDb()` doc comment updated to enumerate all four sanctioned uses (was three as of Phase 8).

**Verified (2026-08-19):**
- `npm run typecheck`, `npm run lint`, `npm run build` — clean across all 10 workspaces. Hit the same "Zod `.default()` field becomes required in the inferred type" issue already documented in memory from earlier phases (adding `widgetEnabled`/`widgetAllowedOrigins` with `.default()` to `tenantProfileSchema` broke `settings-form.tsx`'s explicit `useForm<TenantProfileInput>()` typing) — fixed the same documented way, letting `useForm` infer from the resolver instead of typing it explicitly.
- The origin-validation regex (scheme + host [+ port], no path/query/fragment) was checked against 8 hand-picked cases (valid https/http/subdomain origins; rejected path/query/non-http-scheme/bare-host variants) before trusting it.
- Smoke test: `next dev` — `GET /widget.js` serves with the correct `Content-Type: application/javascript`; `/dashboard/settings` still redirects (307) when unauthenticated; `OPTIONS /api/widget/{tenantId}/message` correctly 403s with no `Origin` header (rejected before any DB call); with an `Origin` header but no live database, correctly surfaces the same `DatabaseDoesNotExist` failure the WhatsApp webhook route already produces in this same environment (an expected, not a new, failure mode) — see `docs/DATABASE.md`'s new origin-validation section for what is and isn't covered by this design.
- **Not verified:** an actual cross-origin browser request (only same-origin `curl` was possible without a second real hostname available in this environment), the Shadow DOM rendering/focus-management behavior in a real browser, and anything requiring a live database (Conversation/Message writes, the full draftReply round trip).

**Known, accepted limitations (documented, not blocking):**
- No rate limiting or anti-abuse beyond basic input-length validation. Origin validation stops a real browser from using the widget off an unauthorized site, but can't stop a direct scripted `POST` with a forged `Origin` header — only a real browser's own CORS enforcement makes that header trustworthy. Genuine abuse protection (per-tenant/per-visitor rate limits, a widget-specific key, a CAPTCHA) is Phase 14 (Security Hardening) scope; building it piecemeal now would preempt that phase's own design, per the same strict-phase-order reasoning used to defer `checkAvailability`/`bookAppointment` out of Phase 5.
- Exact-origin match only — no wildcard/subdomain support (`https://example.com` and `https://www.example.com` must both be listed separately if both are used in production).
- Widget UI is English-only, left-to-right — no i18n/RTL support.
- Same E.164-style identity-matching gap already documented for WhatsApp doesn't apply here (website visitors have no phone number), but the analogous gap exists for `captureLead`-created Leads from the widget: no fuzzy matching against an existing Customer by name/email.

## PHASE 11 — Analytics & AI Evaluation ✅ (2026-08-19)

MASTER_INSTRUCTIONS.md names this phase "Usage tracking, failure rates" — built entirely on data the app already produces as a byproduct of real work, not a new tracking pipeline.

**Built:**
- Schema: `AiInteractionLog` — one row per `draftReply()` call (`escalated`, `leadCaptured`, `bookingAttempted`, `booked`, `toolCallCount`, `durationMs`, `error`).
- `packages/ai/src/reply.ts`: `draftReply()` now writes its own `AiInteractionLog` row (success or failure) after every call — written by `draftReply()` itself, not its callers, so the Inbox's manual draft button (Phase 5), the WhatsApp inbound worker (Phase 8), and the website widget (Phase 10) are all captured automatically without any of those three files changing. Added `bookingAttempted` to `DraftReplyResult`, distinct from `booked`, specifically so "never attempted a booking" and "attempted and failed" don't collapse into the same `false` — needed for a booking *success rate* (a fraction of attempts) to mean anything. On a thrown error from `generateText()`, still logs (with `error` set) and re-throws unchanged — draftReply()'s existing contract for its three callers is untouched, this is purely additive.
- `apps/web/src/domains/analytics/actions.ts`'s `getAnalyticsSummary()` — one aggregate read: Conversations grouped by channel, Leads by pipeline stage, Appointments by status (Prisma `groupBy`, still tenant-scoped through `getTenantDb()`), plus AI evaluation numbers computed from `AiInteractionLog`. `zeroFillCounts()` merges against `@aif/shared`'s existing `LEAD_STAGES`/`CONVERSATION_CHANNELS`/`APPOINTMENT_STATUSES` constants so a stage/channel/status with zero rows still renders as a zero bar.
- UI: `/dashboard/analytics` — stat cards (total AI replies, escalation rate, lead-capture rate, booking success rate among attempts, failure rate, avg. response time) and three CSS-bar breakdowns (no charting library added — not worth a new dependency for one dashboard). Read-only, day-to-day tier (`requireTenantContext`).

**Verified (2026-08-19):**
- `npm run typecheck`, `npm run lint`, `npm run build` — clean across all 10 workspaces on the first pass (no new gotchas hit this phase).
- The zero-fill merge and percent-formatting math (missing-key defaulting to 0, division-by-zero → `"—"`, rounding) were checked against 5 hand-picked cases before trusting them.
- Smoke test: `next dev` — `/dashboard/analytics` correctly 307-redirects when unauthenticated, matching every other protected route; `/api/health` unaffected.
- **Not verified:** the actual `groupBy`/`AiInteractionLog` queries against real data — `DATABASE_URL` is NOT CONFIGURED in this environment, so the dashboard has only ever rendered its `isLoading` state, never real numbers or the "no AI replies yet" empty state's actual query path.

**Known, accepted limitations (documented, not blocking):**
- No time-series/trend view — every relevant row already has `createdAt`, so this is addable later without a schema change, just not built now (today's dashboard is all-time totals only).
- No per-conversation or per-staff-member breakdown.
- No cost/token tracking — the AI SDK's `usage` field (tokens in/out) wasn't captured alongside the rest of `AiInteractionLog`; deferred since no billing feature depends on it yet (Phase 12).
- "AI is NOT CONFIGURED" is deliberately *not* logged to `AiInteractionLog` — every caller already logs that separately via `logNotConfigured()` before ever reaching `draftReply()`, and folding it in would conflate a deployment/config gap with an actual runtime failure of a real AI call.

## PHASE 12 — Billing ✅ (2026-08-19)

MASTER_INSTRUCTIONS.md names this phase "Stripe SaaS architecture" — built as: Stripe Checkout to subscribe, the Stripe-hosted Customer Portal for everything else (payment methods, invoices, self-service cancellation), a webhook keeping our own `Subscription` record in sync, and a `/dashboard/billing` page showing real (never hardcoded) plan pricing fetched live from Stripe.

**Built:**
- New package `@aif/billing` (stripe@22.5.0 SDK): `client.ts` (NOT CONFIGURED discipline + a lazily-constructed singleton client, API version pinned and verified against the SDK's own type defs — see below), `plans.ts` (static tier list `FREE/STARTER/PRO`, price-id↔tier mapping via env vars, `listPlanPricing()` fetching each paid tier's *real* Stripe Price), `checkout.ts` (`getOrCreateStripeCustomer` + `createCheckoutSession`), `portal.ts` (`createPortalSession`), `webhook.ts` (`verifyAndParseWebhookEvent`, Stripe's signature-check-and-parse in one step), `status.ts` (`mapStripeSubscriptionStatus`, a 1:1 — not lossy — mapping to our enum).
- Schema: `Tenant.stripeCustomerId` (set synchronously by the Subscribe action, before Checkout — see below), `Subscription` (one per tenant, written only by the webhook), `PlanTier`/`SubscriptionStatus` enums (the latter mirrors Stripe's own 8 status values exactly).
- **A real bug caught by checking the SDK's own types instead of assuming:** `Stripe.Subscription` no longer carries a top-level `current_period_end` in the pinned API version (`2026-07-29.dahlia`) — it moved to `subscription.items.data[].current_period_end`. Read directly from `node_modules/stripe/esm/resources/Subscriptions.d.ts` before writing the webhook handler; would have been a silent wrong-value bug (both old and new locations type as `number`, so nothing would have caught it at compile time) if written from memory.
- `apps/web/src/app/api/webhooks/stripe/route.ts` — verifies signature, upserts `Subscription` on `checkout.session.completed` (fetching the full Subscription from Stripe, since the Checkout Session event itself doesn't carry it) and `customer.subscription.updated`/`.deleted` (using the event's own Subscription object directly). Idempotent by construction (upsert keyed on `tenantId`, not a `create`) — no processed-event-id table needed, unlike WhatsApp's Message-creation webhook; see `docs/DATABASE.md`'s new "Stripe webhook idempotency" section for the full reasoning.
- `apps/web/src/domains/billing/actions.ts` — `getBillingStatus()`, `startCheckout(tier)` (creates/reuses the Stripe Customer and saves `stripeCustomerId` *before* redirecting — closes a webhook-ordering gap, see Architecture doc), `openBillingPortal()`. All `requireWriteAccess()` — billing is treated as sensitive business configuration, reads included, not day-to-day work.
- UI: `/dashboard/billing` — current plan/status, a "Manage billing" button (Stripe Portal redirect) once subscribed, and Subscribe buttons for each paid tier showing that tier's real live price (or "Not configured" if its price env var isn't set — never a guessed number).

**Verified (2026-08-19):**
- `npm run typecheck`, `npm run lint`, `npm run build` — clean across all 11 workspaces.
- Webhook signature verification checked against 4 hand-crafted cases (valid, tampered payload, wrong secret, missing header) using Stripe's own `generateTestHeaderString()` test helper — no real Stripe account or network call needed for this, same standalone-script discipline as Phase 7/8's tricky-logic verification.
- Smoke test: `next dev` — `/dashboard/billing` correctly 307-redirects when unauthenticated; `POST /api/webhooks/stripe` with no signature correctly 401s; `/api/health` unaffected.
- **Not verified:** an actual Stripe Checkout flow, a real webhook delivery from Stripe, or anything needing a live database — `DATABASE_URL`/`STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`/`STRIPE_PRICE_STARTER`/`STRIPE_PRICE_PRO` are all NOT CONFIGURED in this environment.

**Known, accepted limitations (documented, not blocking):**
- No feature gating tied to plan or subscription status — `Subscription.status` is tracked and shown but nothing currently restricts access based on it (e.g. a `PAST_DUE` tenant loses nothing). MASTER_INSTRUCTIONS.md's terse phase description doesn't specify what should be restricted and when; guessing that policy felt like fabricating a product decision rather than building what was actually specified.
- No usage-based/metered billing, no multiple-simultaneous-subscriptions support (one `Subscription` per tenant, by schema design), no annual billing toggle, no in-app invoice history (all handled by the Stripe Portal instead).
- Plan feature lists (what Starter/Pro actually include) aren't shown anywhere in the UI — only tier name and real price — since nothing is enforced yet, listing feature claims that aren't backed by real enforcement would itself be a fabricated fact.

## PHASE 13 — Platform Admin Dashboard ✅ (2026-08-19)

The first genuinely cross-tenant surface in this app — everywhere else "tenant" is the unit of isolation; here, seeing across all of them at once is the point.

**Built:**
- Schema: `PlatformAdmin` (a new, standalone identity — not a `User.role` value, since `User` is inherently scoped to one `tenantId` and a platform admin oversees all of them; linked to Supabase Auth the same way `User` is, no separate login flow). `Tenant.isSuspended`/`suspendedAt` — a real kill switch, not cosmetic (see below).
- `packages/db/src/tenant.ts`: `getTenantDb()` now **throws** for any model that's neither tenant-scoped nor self-scoped, instead of silently passing the query through unscoped — a defensive tightening made *because of* `PlatformAdmin` being the first genuinely tenant-less model in the schema (the still-inert `Agency` was the only other one, and had never actually been queried). Before this, the gap was latent but unreachable; without the throw, `getTenantDb(anyTenantId).platformAdmin.findMany()` would have silently returned every platform admin, unscoped — closed before it could ever be hit by a real typo.
- `apps/web/src/domains/platform-admin/guard.ts`'s `requirePlatformAdmin()` — an entirely separate check from `requireTenantContext()`/`requireWriteAccess()`, since a platform admin has no `Role` within any tenant. **No self-serve or in-app way to create a `PlatformAdmin` row** — deliberate: exposing one would be a privilege-escalation path (anyone who could reach it could grant themselves cross-tenant access to every business on the platform). Provisioning the first one requires direct DB access, documented in `docs/ARCHITECTURE.md`, same bootstrapping problem every real platform has for its first admin account.
- `apps/web/src/domains/platform-admin/actions.ts` — `listTenants()`, `getPlatformStats()` (total/suspended tenant counts, tenants by plan — FREE backed out of the total since it has no `Subscription` row of its own), `setTenantSuspended()`. All via `getPlatformDb()`, never `getTenantDb()` — this domain's entire point is cross-tenant access.
- **Suspension is real enforcement, applied at every entry point that already resolves a Tenant row, not a cosmetic flag:** `resolveTenantContext()` (blocks the whole dashboard), the WhatsApp webhook route (drops inbound messages, same as an unmapped phone number), and the website widget's origin resolution (stops accepting messages, same path as a disabled widget). `resolveTenantContext()` returns a real context with `isSuspended: true` rather than `null` for a suspended tenant specifically so `/dashboard` can show a real "workspace suspended" message instead of a confusing silent redirect to `/login`; `requireTenantContext()` throws a clear `UnauthorizedError` for every other action, which already flows through the same `{ error }` pattern every action uses.
- UI: a new `/platform-admin` route group (own layout, own nav-free header, gated by `requirePlatformAdmin()` — not nested under `/dashboard`, which is tenant-scoped) — stat cards + a tenant table with inline Suspend/Reactivate actions (Suspend behind a confirmation dialog, matching Automations' delete-confirmation pattern).

**Verified (2026-08-19):**
- `npm run typecheck`, `npm run lint`, `npm run build` — clean across all 11 workspaces.
- Smoke test: `next dev` — `/platform-admin` and `/dashboard` both correctly 307-redirect when unauthenticated; `/api/health` unaffected.
- The `getTenantDb()` defensive-throw change was verified by typecheck/lint/build plus code review (traced every existing call site against `TENANT_SCOPED_MODELS`/`SELF_SCOPED_MODELS` to confirm nothing currently-working would newly throw) rather than a standalone runtime script — lower-risk, simple control-flow addition, not the kind of crypto/date-math logic this repo's standalone-script discipline is reserved for.
- **Not verified:** an actual `PlatformAdmin` row/login (none exists — bootstrapping one requires direct DB access this environment doesn't have either, same `DATABASE_URL` NOT CONFIGURED gap as every other phase), the suspended-tenant UI states, or the WhatsApp/widget suspension-drop paths against real traffic.

**Known, accepted limitations (documented, not blocking):**
- An authenticated-but-not-platform-admin visitor to `/platform-admin` sees the plain login form again rather than a distinct "access denied" page — `requirePlatformAdmin()` is still the actual gate either way, just not the most polished UX for that specific case.
- No audit log of suspend/reactivate actions beyond `Tenant.suspendedAt` (who suspended it, and why, aren't recorded).
- No UI/flow for creating an Agency or attaching Tenants to one — `Agency` stays inert until Phase 18, per MASTER_INSTRUCTIONS.md's own phase ordering.

## PHASE 14 — Security Hardening ✅ (2026-08-19)

MASTER_INSTRUCTIONS.md names this phase with no further detail — interpreted as: close the concrete gaps already flagged as deferred-to-Phase-14 in earlier phases' own docs (a real, specific to-do list this repo had been keeping), plus actually investigate (not just re-note) the one standing `npm audit` finding, rather than a generic, unscoped security checklist.

**Built:**
- `packages/queue/src/rate-limit.ts`'s `checkRateLimit()` — Redis `INCR`+`EXPIRE` fixed-window rate limiter, NOT-CONFIGURED-degrades-to-unenforced like every other integration in this app. Wired into `POST /api/widget/[tenantId]/message` — the exact gap Phase 10's own docs flagged (origin validation stops an unauthorized browser origin, but not unlimited volume from a technically-legitimate one, and this endpoint does real, cost-incurring work on every accepted request). Two limits: per-visitor (10/min) and per-tenant (100/min).
- `apps/web/next.config.ts`'s `headers()` — `Content-Security-Policy` (Next's documented no-nonce baseline; a nonce-based CSP was considered and deliberately not built, see below), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` denying camera/mic/geolocation. Also fixed `transpilePackages` missing `@aif/automations`/`@aif/billing` (an unrelated but trivial correctness fix noticed while already editing this exact file).
- **`npm audit`'s `deepmerge-ts` finding, actually investigated, not re-deferred a third time** (first seen Phase 9, silently accepted again in Phase 12 without digging in). Confirmed dev-only exposure concretely: `prisma` is an optional `peerDependency` of `@prisma/client`, lives in `packages/db`'s `devDependencies` only; grepped the generated Prisma client source AND the actual `apps/web` production build output (`.next/`) for any reference to `"prisma"`/`"@prisma/config"`/`deepmerge-ts` — none found. This vulnerability's code genuinely never ships in what's deployed. `npm audit fix --force` would downgrade to `prisma@6.12.0`, conflicting with this repo's Prisma 7 driver-adapter architecture — not worth it for zero actual production exposure. Documented in `docs/ARCHITECTURE.md`'s new "Security Hardening" section with the exact verification commands, so this doesn't need re-investigating from scratch next time it comes up.
- Swept for `dangerouslySetInnerHTML`, `eval()`/`new Function()`, and stray `console.log`/`console.error` of sensitive data across the whole codebase — none found.
- Ran a security-focused review of this phase's own diff (via the `security-review` skill's methodology) before committing — no HIGH/MEDIUM findings; the diff is purely additive hardening (rate limiting, response headers) with no new data flow into auth/session/query-construction logic. (Along the way, fixed `git remote set-head origin main` — the local clone had no `origin/HEAD` symbolic ref set, which the review tooling's diff-range detection needed; a one-time local git metadata fix, not a code change.)

**Verified (2026-08-19):**
- `npm run typecheck`, `npm run lint`, `npm run build` — clean across all 11 workspaces.
- `checkRateLimit()` verified against a real local Redis instance: allow-up-to-limit, reject-beyond-limit, remaining-count accuracy, window-expiry reset, and independent counters per key — 6 cases, all passing — before wiring it into the route.
- Smoke test: `next dev` — confirmed all 5 security headers are actually present on a real response (`curl -D -`), `/widget.js` and `/login` still serve correctly (CSP didn't break anything observable without a full browser), `/api/health` unaffected.
- **Not verified:** the CSP's effect on a real, fully-rendered authenticated dashboard page in an actual browser (no live Supabase session in this environment to reach one) — this is the specific, disclosed reason a stricter nonce-based CSP wasn't attempted either. The rate limiter's behavior under real concurrent widget traffic (only exercised standalone, not through a live end-to-end widget conversation, since there's no live database in this environment).

**Known, accepted limitations (documented, not blocking):**
- CSP uses `'unsafe-inline'` for both `script-src` and `style-src` rather than nonces — a disclosed, reasoned tradeoff (see `docs/ARCHITECTURE.md`), not an oversight. Revisit once this can be verified against a real browser session.
- No rate limiting on the Stripe/WhatsApp webhook routes — signature verification is a cheap, sufficient first gate for those (a forged request is rejected before any real work), a materially different risk profile than the widget endpoint.
- No CI-level `npm audit`/dependency-scanning gate — that's Phase 15 (Production Infrastructure & CI/CD) scope.
- No distinct-origin (X-Forwarded-For-based) component to the rate limiter — it keys on `tenantId`/`visitorId` only, not source IP, since IP headers aren't reliably trustworthy behind an unknown proxy setup without more infra context than this phase has.

## PHASE 15 — Production Infrastructure & CI/CD ✅ (2026-08-19)

MASTER_INSTRUCTIONS.md names this phase with no further detail — interpreted as: build the actual deployable artifacts for the "hybrid deployment" split this architecture has assumed since Phase 1 (§4), plus a CI pipeline automating the exact verification loop every phase has been doing by hand. Full detail in the new `docs/DEPLOYMENT.md`.

**Built:**
- `.github/workflows/ci.yml` — install → generate Prisma client → typecheck → lint → build, on push to `main` and every PR. Zero secrets required (every integration degrades to NOT CONFIGURED cleanly). `.nvmrc` (`24`) added alongside it, matching the Node version this whole build has actually run on.
- `apps/worker/Dockerfile` + `.dockerignore` (repo root — critically excludes `.env*`/`node_modules`/`.git` from ever entering an image built via this Dockerfile's whole-repo `COPY . .`). Runs `npm run start` (`tsx src/index.ts`, no bundle step, consistent with Phase 8's tsup→tsx correction).
- `docker-compose.yml` — local Postgres (`pgvector/pgvector:pg17` image, confirmed via Docker Hub rather than assumed — a plain `postgres` image lacks the `vector` extension binary) + Redis, for local development.
- `docs/DEPLOYMENT.md` — Vercel setup for `apps/web` (Root Directory = `apps/web`, required env vars), worker hosting (any always-on host, not serverless — Dockerfile build command with the repo-root-context gotcha called out), local dev via `docker compose`, and what's deliberately not built (see below).
- `.env.example` and `README.md` updated with the local-Docker-Postgres alternative and a "Local development" quickstart.

**Verified (2026-08-19):**
- **The CI workflow's exact command sequence was actually run locally, not just checked for valid YAML** — deleted `packages/db/src/generated/` (simulating a fresh checkout, since it's gitignored and every prior phase's `db:generate` calls had already populated it), then ran `npm ci` → `npm run db:generate` → `npm run typecheck` → `npm run lint` → `npm run build` in that exact order: all clean. This is the closest this environment can get to actually validating the GitHub Actions run without GitHub Actions itself.
- `ci.yml` and `docker-compose.yml` both parsed as valid YAML.
- Re-smoke-tested `next dev` after the full clean-reinstall cycle above — `/api/health` and `/login` both still respond correctly.
- **Not verified, and disclosed as such rather than silently assumed working:** `apps/worker/Dockerfile` and `docker-compose.yml` — this environment has no Docker installed, so neither `docker build` nor `docker compose up` could actually be run. Both were written carefully (the Dockerfile's `COPY . .`-from-repo-root requirement was reasoned through explicitly because of the npm-workspaces dependency graph; the pgvector image tag was confirmed via a real Docker Hub lookup, not guessed) but are genuinely unverified — flag this before relying on either in a real deployment.

**Known, accepted limitations (documented, not blocking):**
- No CD (deploy) workflow — needs real hosting credentials this environment doesn't have; see `docs/DEPLOYMENT.md` for why building one with placeholder secrets would violate the "no fake implementations" rule, and what the actual path is (Vercel's own GitHub integration, no workflow file needed) once real credentials exist.
- No health-check endpoint for `apps/worker` (unlike `apps/web`'s `/api/health`) — most container hosts want one for liveness probes; not built, flag if the chosen host requires it.
- No CI-level dependency/container vulnerability scanning gate — Phase 14 investigated this repo's one standing `npm audit` finding but didn't automate a policy for future ones; no established severity threshold to gate on yet.
- No layer-cache optimization in the Dockerfile (whole-repo `COPY . .` before `npm ci`, rather than a staged "package.json files first" pattern) — a deliberate simplicity-over-cache-efficiency tradeoff given this couldn't be validated with real Docker either way; revisit once it's actually been built somewhere with Docker available.

## PHASE 16 — Advanced AI ✅ (2026-08-19)

MASTER_INSTRUCTIONS.md names this phase "Multilingual, Sentiment analysis" — both built on infrastructure that already existed (Phase 5's `draftReply()`/`detectIntent()`, Phase 11's `AiInteractionLog`/Analytics) rather than starting fresh.

**Built:**
- `packages/ai/src/analyze.ts`'s `analyzeMessage()` — a small, fast `generateObject` classification (sentiment + ISO 639-1 language code) for a single message, separate from `detectIntent()`'s existing manual/on-demand classification.
- Schema: `Sentiment` enum, `Message.sentiment`/`languageCode` (both nullable — `senderType = CUSTOMER` only, null means "not analyzed," never a default value).
- `draftReply()` (`packages/ai/src/reply.ts`) now accepts an optional `latestCustomerMessageId` and, when given, fires `analyzeMessage()` *in parallel* with the main tool-calling reply generation (no added latency) and persists the result to that `Message` row once both settle — decoupled from whether the reply itself succeeds (still runs and persists even if `generateText` throws). All three real callers (WhatsApp inbound worker, website widget route, Inbox's manual "Draft AI reply" action) needed only a one-line addition each — same "instrument the one shared implementation" pattern as `AiInteractionLog` (Phase 11).
- System prompt updated: explicitly instructs the AI to reply in the customer's own language (previously undefined behavior, not deliberately English-only — LLMs are natively multilingual, the prompt just never said to do this).
- UI: the Inbox shows a small sentiment badge + non-English language badge next to each analyzed customer message. `/dashboard/analytics` gained a fourth breakdown card ("Customer sentiment"), reusing Phase 11's exact `BarBreakdown`/`zeroFillCounts` pattern — counts only messages that were actually analyzed, not a misleading "everything un-analyzed = neutral" default.

**Verified (2026-08-19):**
- `npm run typecheck`, `npm run lint`, `npm run build` — clean across all 11 workspaces.
- The "extract the latest customer message from history" logic (central to which message actually gets analyzed) checked against 4 hand-picked cases (last-not-first selection, no-user-message-yet, empty history, single message) before trusting it.
- Smoke test: `next dev` — `/dashboard/inbox` and `/dashboard/analytics` both correctly 307-redirect when unauthenticated; `/api/health` unaffected.
- **Not verified end-to-end:** the actual `analyzeMessage()` AI call, or the Inbox/Analytics UI rendering real sentiment/language data — no `ANTHROPIC_API_KEY`/`OPENAI_API_KEY`/`DATABASE_URL` configured in this environment, same standing gap as every AI-dependent feature in every prior phase.

**Known, accepted limitations (documented, not blocking):**
- No automatic escalation from a negative sentiment score — the existing `escalateToHuman` tool call already has full conversational context to make that judgment within the same reply-generation pass; a second, independent hard-coded rule risks conflicting with it rather than improving on it, and wasn't actually asked for.
- "Multilingual" here means the AI assistant's own conversational ability, not dashboard/widget UI localization (translated interface strings, RTL) — that's a materially larger, separate undertaking, already flagged as a known limitation in Phase 10's docs and not revisited here.
- No retroactive analysis of messages sent before this phase — `sentiment`/`languageCode` are set going forward only; existing `Message` rows stay `null` (correctly reflecting "not analyzed," not reprocessed).

## PHASE 17 — Voice AI ✅ (2026-08-19)

MASTER_INSTRUCTIONS.md names this phase with just two words, "Voice AI" — and unlike every prior phase, voice isn't foreshadowed anywhere in §2's business vision (only WhatsApp and Website Chat are named there). Interpreted as: phone calls become a third real-time channel feeding the same `draftReply()` engine WhatsApp and the website widget already use, via Twilio Voice's built-in speech-to-text/text-to-speech (`<Gather input="speech">`/`<Say>`) rather than a media-streams architecture — the simpler choice, deliberately, both because it fits this app's existing serverless route-handler model with zero new persistent infrastructure and because it's the more honest thing to ship unverified in an environment with no way to place a real call either way.

**Built:**
- New package `@aif/voice` (twilio@6.1.0 SDK): `client.ts` (NOT CONFIGURED discipline), `signature.ts` (`verifyTwilioSignature`, wrapping the SDK's own `validateRequest` rather than reimplementing Twilio's HMAC scheme), `twiml.ts` (`buildGatherResponse`/`buildHangupResponse`, built with the SDK's `twiml.VoiceResponse` class specifically for its XML escaping — hand-rolled string templates would have been a real TwiML-injection risk, since `sayText` ultimately comes from an AI reply and, indirectly, from what a caller said).
- Schema: `ConversationChannel` gained `VOICE`; `Tenant.voicePhoneNumber` (E.164, globally unique — maps an inbound call's dialed number to a tenant, same role `whatsappPhoneNumberId` plays); `Conversation.voiceCallSid` (correlates one call's multiple synchronous webhook round-trips to one thread, same role `widgetVisitorId` plays for an anonymous website visitor).
- `apps/web/src/app/api/webhooks/voice/incoming` — Twilio's "a call comes in" webhook: verifies signature, resolves tenant by the dialed number (`getPlatformDb()`, a sixth sanctioned use), creates/finds the Customer + a new `Conversation`, greets the caller, starts listening.
- `apps/web/src/app/api/webhooks/voice/gather` — one call per turn of the conversation. Verifies signature; resolves the conversation's tenant from `conversationId` (trusted because it lives in a URL Twilio's own signature already covers — same reasoning the widget route's docs give for `tenantId` in *its* URL, applied here) with a cheap CallSid cross-check as extra defense-in-depth; synthesizes an idempotency key (`voice:{CallSid}:{turn}`) reusing `Message.externalId`'s existing unique constraint rather than new schema; calls `draftReply()` with the same `latestCustomerMessageId` wiring Phase 16 already established (so sentiment/language analysis "just works" for voice too, with no extra code); on escalation, ends the call with an honest "someone will follow up" message rather than pretending to transfer to a human that isn't actually there; caps at 15 turns (a phone call has real per-minute cost on both Twilio's and the AI provider's side, unlike the free widget, so a simple hard cap was judged proportionate over porting Phase 14's full rate limiter).
- Settings: `Tenant.voicePhoneNumber` field added to the existing tenant profile form (same precedent as `whatsappPhoneNumberId`).
- `.env.example` updated with `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN` and the webhook-URL configuration note (no separate env var for the webhook URL itself — it's the same app domain everything else runs on).

**Verified (2026-08-19):**
- `npm run typecheck`, `npm run lint`, `npm run build` — clean across all 12 workspaces (first pass, no new gotchas).
- Twilio signature verification checked against 6 hand-crafted cases (valid, wrong signature, missing signature, tampered params, tampered URL, NOT CONFIGURED) using the SDK's own internal `getExpectedTwilioSignature` test helper — same discipline as Phase 8/12's webhook signature checks.
- TwiML output verified well-formed and properly escaped: parsed with a real XML parser, including a case with `&`/`<`/`>`/quotes in the spoken text, confirming the injection risk named above is actually mitigated, not just asserted.
- Smoke test: `next dev` — both voice webhook routes correctly 401 with no/invalid signature; `/dashboard/settings` still redirects; `/api/health` unaffected.
- **Not verified end-to-end:** an actual Twilio phone call, the full incoming→gather→draftReply→TwiML round trip against real speech, or the idempotency guard against a genuine Twilio retry — no `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`/`DATABASE_URL`/AI credentials configured in this environment, and no way to place a real call from here regardless.

**Known, accepted limitations (documented, not blocking):**
- No voice-specific system-prompt tuning — `draftReply()`'s prompt is shared, unmodified, across all four channels now. A reply that reads fine as chat text (e.g. a numbered list) may read awkwardly spoken aloud. Threading a channel parameter through to fork the prompt felt like a real feature addition beyond what "Voice AI" specifically asked for, and a further thing to get subtly wrong without a way to actually hear it.
- No live call transfer to a human — `escalateToHuman` ends the call with a callback promise instead, since there's no telephony infrastructure here to bridge to a staff member's phone.
- No outbound calling (the AI placing calls, e.g. for appointment reminders) — this phase is inbound-only, mirroring how WhatsApp/widget are both purely reactive-to-inbound too.
- No Redis-backed rate limiting for voice (unlike the widget) — a flat 15-turn cap per call was judged sufficient given a phone call's inherent per-minute cost friction.
- Same exact-phone-match (no E.164 normalization/fuzzy matching) limitation already documented for WhatsApp applies here too, for the same reason (both key off `Customer.phone`).

## PHASE 18 — White-Label / Reseller Architecture ✅ (2026-08-19)

The final phase in MASTER_INSTRUCTIONS.md's list — and the most heavily foreshadowed one. §2 opens by naming this "a Multi-Tenant SaaS + **Agency White-Label** AI Automation Platform," §4 states the tenancy model as "Agency -> Tenant A, Tenant B, Tenant C," and `Agency` has sat inert in the schema since Phase 1's own doc comment said exactly this: "Inert until Phase 18... but modeled now so Tenant does not need a breaking schema change later." This phase activates it.

**Built:**
- Schema: `Agency` gained white-label branding fields (`logoUrl`, `primaryColor`, `supportEmail`, all optional); new `AgencyAdmin` model — deliberately built to the exact same shape and bootstrapping rule as Phase 13's `PlatformAdmin` (a `User` is inherently scoped to one Tenant, so an agency-spanning admin can't be one either; same "no self-serve or in-app way to create one" rule, applied uniformly to both identity types rather than building a UI shortcut for just the newer one).
- `apps/web/src/domains/agency-admin` (new domain) — `requireAgencyAdmin()`, and `listAgencyTenants()`/`getAgencyStats()`/`setAgencyTenantSuspended()`, all via `getPlatformDb()` **manually** filtered by `agencyId` at every call site — there is no Prisma Client Extension enforcing agency-scoping the way `getTenantDb()` enforces tenant-scoping. `setAgencyTenantSuspended()` uses `updateMany({ where: { id, agencyId } })` specifically so a mismatched tenantId matches zero rows rather than ever being touched — documented at length (`docs/DATABASE.md`'s new "Agency isolation" section) as a real, disclosed sharp edge, not glossed over.
- New `/agency-admin` route group (own layout, gated separately) — an agency's own scoped view of its Tenants, its own invite link, suspend/reactivate.
- `apps/web/src/domains/platform-admin` extended: `listAgencies()`, `createAgency()` (a platform-admin action — creating an Agency is judged lower-trust than creating a cross-tenant *identity*, which stays DB-only), `setTenantAgency()`; the tenant table gained an Agency column with an inline reassignment `Select`.
- Reseller-driven signup: `signUpSchema` gained an optional `agencyId`, read from a `?agency=<id>` query param on a link an Agency shares with its own prospective clients (not a code typed in — a raw id isn't guessable, and it needed no new human-facing UI step). `signUp()` validates the id resolves to a real Agency and silently proceeds without one if it doesn't, rather than blocking signup over a stale/mistyped link. Reused `packages/shared/src/schemas/tenant.ts`'s `createTenantSchema`/`agencyId` field shape, which had sat unused since Phase 1 waiting for exactly this.
- White-label branding shown in the authenticated dashboard header (`resolveTenantContext()` now also resolves the tenant's Agency, if any) — logo alongside (not replacing) the tenant's own name, which stays primary since it's still that tenant's own workspace. Deliberately **not** applied to the public login/signup pages — see "Known, accepted limitations" below.

**Verified (2026-08-19):**
- `npm run typecheck`, `npm run lint`, `npm run build` — clean across all 12 workspaces.
- Smoke test: `next dev` — `/agency-admin` and `/platform-admin` both correctly 307-redirect when unauthenticated; `/signup` and `/signup?agency=<id>` both correctly render 200 (confirms the new `useSearchParams()`/`Suspense` wiring doesn't break the page, same pattern already proven in Phase 12's billing page); `/dashboard` still redirects; `/api/health` unaffected.
- **Not verified end-to-end:** actual Agency/AgencyAdmin rows, a real reseller signup flow through a `?agency=` link, or the dashboard branding rendering with real data — no `DATABASE_URL` configured in this environment, the same standing gap as every DB-dependent feature across all 18 phases.

**Known, accepted limitations (documented, not blocking):**
- White-label branding is dashboard-only — the public login/signup pages always show default branding. Showing agency branding *before* authentication would need the login page to already know which agency's branding to show, which needs a per-agency custom domain or subdomain resolved before the request even reaches this app's routing — real DNS/deployment infrastructure Phase 15 already flagged this environment can't set up or verify.
- No agency-level billing (an agency paying for/marking up its tenants' subscriptions) — Phase 12's Billing stays entirely per-Tenant; each Tenant subscribes individually regardless of Agency membership. MASTER_INSTRUCTIONS.md doesn't specify a reseller billing model, and guessing one (revenue share? flat reseller fee? agency-paid seats?) felt like fabricating a business decision rather than building what was asked for.
- No agency-admin-triggered tenant creation (an agency onboarding a client directly from its own dashboard, without the client going through the public signup form) — would need either a Supabase Admin API integration (inviting a user without their own password-setting flow) or a magic-link mechanism, either a genuinely new, unverified integration surface this repo hasn't used anywhere else; the `?agency=` invite-link approach was judged the safer, equally real alternative for this phase.
- Same manual-agencyId-filtering sharp edge already called out in `docs/DATABASE.md`'s "Agency isolation" section — a future agency-admin action that forgets to filter by `agencyId` has no automatic extension to catch the mistake.

---

**All 18 phases in MASTER_INSTRUCTIONS.md's plan are now complete.** This file's job as a live phase tracker is done; ongoing work from here (bug fixes, real infrastructure hookup, product refinements) belongs in regular commits and, where it's genuinely new-phase-shaped work, a new entry appended below this line — not a rewrite of what's above it.
