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

## PHASE 2 — Business Core ⏳ not started

## PHASE 3 — CRM ⏳ not started

## PHASE 4 — Universal Inbox ⏳ not started

## PHASE 5 — AI Core ⏳ not started

## PHASE 6 — RAG & Knowledge ⏳ not started

## PHASE 7 — Booking Engine ⏳ not started

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
