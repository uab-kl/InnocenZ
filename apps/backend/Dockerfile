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
COPY packages ./packages
RUN pnpm install --frozen-lockfile

# ---- builder: build + prune to a self-contained, deployable dist folder --
# `prune` (apps/backend/package.json) depends on `build`, then produces
# dist/main.js + a pruned package.json/lockfile/workspace_modules so the
# runtime stage can install only what this app actually needs.
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm nx run @org/backend:prune

# ---- runner: minimal production image -----------------------------------
FROM node:22-alpine AS runner
RUN corepack enable && corepack prepare pnpm@10.2.1 --activate
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nestjs

COPY --from=builder /app/apps/backend/dist .
RUN pnpm install --prod --frozen-lockfile

USER nestjs
EXPOSE 7777
ENV PORT=7777
CMD ["node", "main.js"]
