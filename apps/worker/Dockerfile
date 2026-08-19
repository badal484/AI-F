# Build context must be the REPO ROOT, not apps/worker — this is an npm
# workspaces monorepo, so the worker's dependencies (@aif/db, @aif/queue,
# @aif/ai, @aif/whatsapp, @aif/automations) only resolve correctly when
# every workspace's package.json is present. Build from the repo root:
#
#   docker build -f apps/worker/Dockerfile -t aif-worker .
#
# Unverified — this development environment has no Docker available to
# actually run a build. Reviewed carefully and cross-checked against
# apps/worker/package.json's own "start" script, but validate with a real
# `docker build` before relying on this. See docs/DEPLOYMENT.md.
FROM node:24-alpine

WORKDIR /app

# Whole-repo copy, not a staged "package.json first" layer-cache trick —
# npm workspaces need every workspace's package.json to resolve the
# dependency graph, and hardcoding each current package's path here for
# better caching would silently go stale as packages are added. See
# .dockerignore for what's excluded (node_modules, .env*, .git, build
# output — critically, .env* keeps any local secrets from ever entering
# the image).
COPY . .

RUN npm ci

# apps/worker imports @aif/db, whose Prisma client is generated into
# packages/db/src/generated/ (gitignored, not shipped in source) — this
# must run before `tsx` can import it. Needs only prisma/schema.prisma,
# not a live database — verified throughout this repo's build history
# that this succeeds with no DATABASE_URL configured at all.
RUN npm run db:generate

ENV NODE_ENV=production
WORKDIR /app/apps/worker

# Runs "tsx src/index.ts" directly, no build/bundle step — apps/worker
# deliberately isn't bundled (see docs/ARCHITECTURE.md's tsup→tsx
# explanation from Phase 8: Prisma's runtime relies on dynamic require()
# that static bundlers can't handle).
CMD ["npm", "run", "start"]
