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

# ---- builder: build the web app ----------------------------------------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* vars are inlined into the client bundle at build time, so the
# backend's public URL must be known here, not just at container run time.
ARG NEXT_PUBLIC_API_URL=http://localhost:7777/api
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN pnpm nx build web

# ---- runner: minimal production image -----------------------------------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# Next.js standalone output already contains a pruned node_modules; static
# assets and public files are excluded from it and must be copied separately.
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

USER nextjs
WORKDIR /app/apps/web
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
