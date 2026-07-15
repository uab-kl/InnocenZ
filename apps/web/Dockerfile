# syntax=docker/dockerfile:1
#
# Build from the repo ROOT, not this folder — it's a pnpm/Nx monorepo, so the
# build needs the root lockfile and workspace packages:
#   docker build -f apps/web/Dockerfile -t innocenz-web .

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

# ---- builder: build, then deploy a pruned, self-contained web app --------
# `pnpm deploy` materializes just this app's own resolved production
# dependency tree (not the whole workspace's combined node_modules) into an
# isolated directory.
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# VITE_* vars are inlined into the client bundle at build time, so the
# backend's public URL must be known here, not just at container run time.
ARG VITE_API_URL
ARG VITE_GRAPHQL_ENDPOINT
ARG VITE_OUTLET_ROLE_ID
ARG VITE_AGENCY_ROLE_ID
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_GRAPHQL_ENDPOINT=$VITE_GRAPHQL_ENDPOINT
ENV VITE_OUTLET_ROLE_ID=$VITE_OUTLET_ROLE_ID
ENV VITE_AGENCY_ROLE_ID=$VITE_AGENCY_ROLE_ID
RUN pnpm --filter innocenz-admin run build
RUN pnpm --filter innocenz-admin deploy --prod --legacy /deploy

# ---- runner: production image ---------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 web

COPY --from=builder --chown=web:nodejs /deploy .

USER web
EXPOSE 3001
CMD ["node", ".output/server/index.mjs"]
