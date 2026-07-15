# syntax=docker/dockerfile:1
#
# Build from the repo ROOT, not this folder — it's a pnpm/Nx monorepo, so the
# build needs the root lockfile and workspace packages:
#   docker build -f apps/backend/Dockerfile -t innocenz-backend .

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.2.1 --activate
WORKDIR /app

# ---- deps: install workspace dependencies -----------------------------
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/backend/package.json apps/backend/package.json
COPY apps/mobile/package.json apps/mobile/package.json
COPY packages ./packages
COPY patches ./patches
RUN pnpm install --frozen-lockfile

# ---- builder: compile, then deploy a pruned, self-contained backend ------
# esbuild bundles first-party source but keeps npm packages external
# (--packages=external), so the runtime needs node_modules — including
# devDependencies, since main.ts spawns drizzle-kit (a devDependency) at
# boot to run migrations in production. `pnpm deploy` materializes just
# this app's own resolved dependency tree (not the whole workspace's
# combined node_modules) into an isolated directory.
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm --filter innocenz-backend run build
RUN pnpm --filter innocenz-backend deploy --legacy /deploy

# ---- runner: production image ---------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 backend

COPY --from=builder --chown=backend:nodejs /deploy .

USER backend
EXPOSE 7780
HEALTHCHECK --interval=30s --timeout=30s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 7780) + '/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
