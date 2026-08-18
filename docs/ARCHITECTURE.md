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
  config/   Shared tsconfig/eslint base configs
```

`apps/web` and `apps/worker` are independently deployable: the UI runs serverless, the worker runs as a persistent process holding Redis/BullMQ connections. Both import `@aif/db` and `@aif/shared` as workspace packages so schema, types, and validation never drift between them.

Within `apps/web/src`, code is organized by domain rather than by route:

```
app/                    Next.js routes — thin, delegate to domains/
domains/
  auth/                 session resolution, sign in/up/out actions, guard.ts (role gating), auth UI
  business-core/         tenant profile, locations (+hours), services, staff — actions + UI, per entity
  (crm, inbox, ai-agent, booking, rag, whatsapp,
   billing, platform-admin, analytics — added as their phases land)
components/ui/          shadcn/ui primitives only
lib/                    supabase clients, env helpers, utils
```

## Server Actions as the data layer

CRUD domains (business-core, and later phases) skip a separate REST/route-handler layer: Server Actions (`"use server"` functions under each domain's `actions.ts`) are called directly as TanStack Query `queryFn`/`mutationFn`, since a Server Action is just an async function that already runs server-side regardless of whether it's invoked from a `<form action>` or a client component's `fetch`-free call. This keeps Zod validation and tenant-isolation logic in one place instead of duplicating it across an API route and an action. List pages use `useQuery` + `useMutation` with optimistic cache updates (`queryClient.setQueryData`) per MASTER_INSTRUCTIONS.md §6; single-record forms (e.g. Settings) use `useMutation` alone. Every mutating action is wrapped in `requireWriteAccess()` (OWNER/ADMIN only) and every read in `requireTenantContext()` (any authenticated role) — see `apps/web/src/domains/auth/guard.ts`.

## Multi-tenant isolation

See `MASTER_INSTRUCTIONS.md` §4 for the governing rule and `docs/DATABASE.md` §"Tenant isolation" for the implementation. In short: `packages/db/src/tenant.ts` exports `getTenantDb(tenantId)`, a Prisma Client Extension that injects `tenantId` into every query against a tenant-scoped model. Application code never imports `PrismaClient` directly — only `getTenantDb()` or the narrowly-scoped `getPlatformDb()`.

## Auth

Supabase Auth (session cookies via `@supabase/ssr`). `apps/web/src/proxy.ts` refreshes the session on every request and redirects unauthenticated users away from `/dashboard`. `apps/web/src/domains/auth/session.ts` resolves the full `TenantContext` (tenant + role) server-side from the session — this is the only place that reads through `getPlatformDb()` outside the future Platform Admin phase, because tenant identity isn't known yet at that point.

## Documented deviations from MASTER_INSTRUCTIONS.md §3

Approved exceptions to the exact stack named in MASTER_INSTRUCTIONS.md, each because the tool's current released behavior differs from what was specified:

- **Radix Primitives → Base UI.** The shadcn/ui CLI (v4.18, current as of this phase) now generates components on top of [Base UI](https://base-ui.com), Radix's own successor library (same maintainers), not `@radix-ui/react-*`. Approved by the product owner 2026-08-19 rather than pinning an older shadcn CLI version. Base UI's polymorphism API is a `render` prop (`<Button render={<Link href="/x" />}>`) instead of Radix/shadcn's older `asChild` + `Slot` pattern — use `render`, not `asChild`, in any new component built on these primitives.
- **Prisma 7 driver adapters.** Prisma 7 removed `url`/`directUrl` from the `datasource` block in `schema.prisma` entirely; connection configuration now lives in `packages/db/prisma.config.ts`, and `PrismaClient` is constructed with an explicit adapter (`@prisma/adapter-pg`, node-postgres) rather than the built-in Rust query engine. This is Prisma's current recommended setup, not a deviation from a documented stack choice, but is called out here because it changes how `DATABASE_URL` is wired: there's a single `DATABASE_URL` (no separate `DIRECT_URL`) and it should be a **direct/session** connection string, not a pgbouncer transaction-pooler URL — `prisma migrate` needs session-level features that transaction pooling doesn't support.
- **Next.js `middleware.ts` → `proxy.ts`.** Next.js 16 renamed the `middleware` file convention to `proxy` (same capability — session refresh, route protection — new name/export). `apps/web/src/proxy.ts` uses the current convention.

## Health check

`GET /api/health` reports whether Database, Supabase Auth, and Redis are configured (and whether the database is actually reachable), without ever faking success for an unconfigured integration — see MASTER_INSTRUCTIONS.md §7.
