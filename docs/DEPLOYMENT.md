# Deployment

Phase 15 — Production Infrastructure & CI/CD. This app is built for the "hybrid deployment" split MASTER_INSTRUCTIONS.md names from the start (§4): `apps/web` on a serverless platform, `apps/worker` as a persistent process. Nothing in this document has been exercised against a real deployment — this environment has no Docker, no Vercel account, and no hosting credentials to actually run any of it. Everything below is written to be precise and correct, not to be taken as "verified working."

## `apps/web` — Vercel (or any Next.js-compatible serverless host)

This is an npm workspaces monorepo, so the one setting that matters beyond the defaults: **Root Directory = `apps/web`** in the Vercel project's settings. Vercel's own npm-workspaces monorepo support then handles installing from the repo root and building `apps/web` with its workspace packages (`@aif/db`, `@aif/shared`, `@aif/ai`, `@aif/booking`, `@aif/queue`, `@aif/whatsapp`, `@aif/automations`, `@aif/billing`) resolved correctly — no `vercel.json` is committed here, since hand-writing one risks fighting Vercel's own monorepo auto-detection rather than helping it, and this environment has no way to verify a custom one actually works.

Build command: the default (`npm run build` from `apps/web`'s own `package.json`, i.e. `next build`) is correct — but note the *root* `npm run build` (the one CI runs) additionally runs `prisma generate` first; Vercel's monorepo build for a workspace `Root Directory` runs `npm install` at the repo root before building, which is enough for `next build` to work as long as `prisma generate` has also run. If Vercel's build doesn't already trigger it via a `postinstall` hook, add one explicitly (`"postinstall": "npm run generate -w @aif/db"` in the root `package.json`) — not added here since it wasn't possible to confirm whether Vercel's default flow already covers it without a real deployment to test against.

Required env vars (see `.env.example` for the full, current list with explanations) — at minimum for a working deployment: `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Everything else (Redis, AI, WhatsApp, Stripe) is genuinely optional at the infrastructure level — every integration in this app degrades to a logged NOT CONFIGURED state rather than failing to build or serve, verified repeatedly throughout this repo's build history. Add them incrementally as each integration is actually wired up.

## `apps/worker` — a persistent process, not serverless

`apps/worker` holds long-lived Redis/BullMQ connections and must run as an always-on process — a container on Railway/Fly.io/Render/ECS/a plain VM, anything that isn't a serverless function. `apps/worker/Dockerfile` builds it; **the build context must be the repo root**, not `apps/worker` (see the Dockerfile's own comment for why — npm workspaces need every workspace's `package.json` to resolve):

```bash
docker build -f apps/worker/Dockerfile -t aif-worker .
docker run --env-file .env aif-worker
```

The worker needs the same `DATABASE_URL` as `apps/web` plus `REDIS_URL` to do anything (it idles cleanly, verified, if `REDIS_URL` isn't set — see `docs/BUILD_PROGRESS.md`'s Phase 1 entry) — and `WHATSAPP_*`/`ANTHROPIC_API_KEY`/`OPENAI_API_KEY` for the queues that actually need them. It does **not** need `NEXT_PUBLIC_*` or Stripe env vars — it never touches billing.

No health-check endpoint exists for the worker itself (unlike `apps/web`'s `/api/health`) — most container hosts want one for liveness probes. Not built this phase; would need a minimal HTTP listener added to `apps/worker/src/index.ts` purely for that purpose, which felt like scope creep for "wire up the deployment artifacts" versus "add a new capability to the worker." Flag this if deploying to a host that requires one.

## Local development infrastructure

`docker-compose.yml` (repo root) starts a local Postgres — using the `pgvector/pgvector` image specifically, not plain `postgres`, since a vanilla Postgres image lacks the `vector` extension's binary entirely and `CREATE EXTENSION vector` would fail against it — and Redis:

```bash
docker compose up -d
# DATABASE_URL="postgresql://aif:aif@localhost:5432/aif"
# REDIS_URL="redis://localhost:6379"
npm run migrate:dev -w @aif/db
```

This is the first time in this repo's build history that a real local Postgres has been an option — every prior phase's "unverified against a live database" caveat exists because this development environment specifically has neither Docker nor a live Postgres reachable from it. If you have Docker available where you're reading this, `docker compose up -d` plus a real migration is the fastest way to close that gap for local testing; it doesn't change anything about the production target, which stays Supabase-managed Postgres.

## CI (`.github/workflows/ci.yml`)

Runs on every push to `main` and every pull request: install, generate the Prisma client (schema-only — no `DATABASE_URL` needed, same as every `npm run build` this repo has ever run), typecheck, lint, build. Intentionally passes **zero secrets** — every integration's NOT CONFIGURED path is exactly what CI exercises, matching how this repo has been built and verified throughout. This is verification, not deployment: nothing in this workflow pushes to Vercel or restarts the worker.

**Not built — deliberately, not an oversight:** an actual CD (continuous deployment) job. Wiring up real deployment (a Vercel deploy hook/token, a worker-host redeploy trigger) needs real hosting accounts and credentials that don't exist in this environment — fabricating a deploy workflow with placeholder secrets that has never actually deployed anything would be exactly the kind of faked implementation MASTER_INSTRUCTIONS.md §7 forbids. Vercel's own GitHub integration (connect the repo, it deploys `apps/web` on every push to `main` automatically, no workflow file needed) is the standard, lowest-effort path once a real Vercel project exists — set it up directly in the Vercel dashboard rather than through a committed workflow. The worker's redeploy mechanism depends entirely on which host is chosen and isn't decided yet.

**Also not built:** a dependency-vulnerability scanning gate (`npm audit` or similar) in CI — Phase 14 investigated and documented the one standing finding this repo already had, but didn't add an automated gate; add one once there's an established policy for what severity should actually block a merge, which wasn't specified. Container image scanning for the worker's Dockerfile, for the same reason.
