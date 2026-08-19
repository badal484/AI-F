# Build Progress

Source of truth for phase status. Updated at the end of every phase, per MASTER_INSTRUCTIONS.md §7.

## PHASE 0 — Repository Audit ✅ (2026-08-19)

See `docs/INITIAL_AUDIT.md`. Approved decisions: Supabase (DB+Auth+Storage), Upstash Redis (prod)/local Redis (dev), npm workspaces monorepo, Supabase Auth.

## PHASE 1 — Foundation ✅ (2026-08-19)

**Built:**
- npm workspaces monorepo: `apps/web` (Next.js 16, App Router, TS, Tailwind v4), `apps/worker` (Node, bundled with tsup), `packages/db` (Prisma 7 + tenant-isolation extension), `packages/shared` (Zod schemas, types, logger), `packages/config` (shared tsconfig/eslint base).
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
- `npm run build` — clean across all 4 workspaces (`prisma generate`, `next build`, `tsup`).
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

## PHASE 8 — WhatsApp Integration ⏳ not started

## PHASE 9 — Automations ⏳ not started

## PHASE 10 — Website Widget ⏳ not started

## PHASE 11 — Analytics & AI Evaluation ⏳ not started

## PHASE 12 — Billing ⏳ not started

## PHASE 13 — Platform Admin Dashboard ⏳ not started

## PHASE 14 — Security Hardening ⏳ not started

## PHASE 15 — Production Infrastructure & CI/CD ⏳ not started

## PHASE 16 — Advanced AI ⏳ not started

## PHASE 17 — Voice AI ⏳ not started

## PHASE 18 — White-Label / Reseller Architecture ⏳ not started
