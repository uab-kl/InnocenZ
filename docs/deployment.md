# Deploying web + backend

Images are built on your machine, pushed to Docker Hub, and pulled by the
server — the server never needs a git checkout of this repo, only Docker.
A Caddy reverse proxy on the server terminates HTTPS and routes both the
frontend and backend hostnames to the right container. staging and
production are separate environments with their own image tags, remote
directory, and Docker network, so both can run on the same or different
servers without colliding.

## How it works

1. `pnpm deploy:staging` (or `pnpm deploy:production`) runs `tools/scripts/deploy.mjs <env>`, which:
   - `docker compose build`s `juneyou/innocenz-frontend:<env>` and `juneyou/innocenz-backend:<env>` (using the root `docker-compose.yml`)
   - `docker push`es both images to Docker Hub
   - generates a `Caddyfile` for `DEPLOY_DOMAIN` and `.env` (image tags), and `scp`s them plus the rest of `tools/deploy/` to the server
   - `ssh`'s in to create the `innocenz-<env>-network` Docker network (if missing) and run `deploy.sh`
2. `tools/deploy/deploy.sh` (on the server) stops the old containers, drops the old cached images, retries `docker compose pull` up to 5 times, then `docker compose up -d`.

**Note:** `pnpm deploy` (no suffix) does not work — `deploy` is a command
reserved by pnpm itself. Always use `pnpm deploy:staging` / `pnpm deploy:production`
(or `pnpm run deploy <env>` to bypass pnpm's built-in command).

## DNS (DuckDNS or otherwise)

- `DEPLOY_DOMAIN` → your server's public IP.
- `api.<DEPLOY_DOMAIN>` needs no separate entry if using DuckDNS — it automatically resolves any subdomain to the same IP as the base domain. Verify with `nslookup api.<your-domain>` before deploying. For other DNS providers, add that A record explicitly.
- If the server's IP isn't static, keep it updated with your DNS provider's own dynamic-DNS mechanism — this repo doesn't manage that.

## Local layout (this repo)

| Path | Purpose |
|---|---|
| `apps/web/Dockerfile`, `apps/backend/Dockerfile` | Multi-stage builds for each app |
| `docker-compose.yml` (root) | **Build-only.** Used by `docker compose build` to produce the two images, tagged for Docker Hub. Not sent to the server. |
| `tools/deploy/docker-compose.yml` | **Server-facing.** Caddy + frontend + backend, images pulled by tag — nothing is built here. |
| `tools/deploy/deploy.sh` | Runs on the server: down → prune old images → pull (retried) → up |
| `tools/deploy/.env.example`, `.env.frontend.example`, `.env.backend.example` | Committed templates for the files below |
| `tools/deploy/.env.frontend`, `.env.backend` (or `.env.frontend.<env>` / `.env.backend.<env>` to differ per environment) | **Git-ignored.** Real runtime values/secrets. `deploy.mjs` uses these if present, otherwise falls back to the `.example` files. |
| `.env.deploy.staging`, `.env.deploy.production` | **Git-ignored.** Per-environment `DEPLOY_HOST`/`DEPLOY_USER`/`DEPLOY_DOMAIN` etc. Copy from the matching `.example` file. |
| `tools/scripts/deploy.mjs` | The deploy script (`pnpm deploy:staging` / `pnpm deploy:production`) |

## What ends up on the server

Under `DEPLOY_REMOTE_DIR` (default `~/innocenz-<env>`, e.g. `~/innocenz-staging`):

```
~/innocenz-staging/
├── docker-compose.yml   # copied from tools/deploy/docker-compose.yml
├── Caddyfile             # generated each deploy from DEPLOY_DOMAIN
├── deploy.sh              # copied from tools/deploy/deploy.sh
├── .env                    # generated each deploy: FRONTEND_IMAGE, BACKEND_IMAGE
├── .env.frontend            # copied from tools/deploy/.env.frontend(.<env>) or its .example
└── .env.backend              # copied from tools/deploy/.env.backend(.<env>) or its .example
```

No image tarball is transferred — the server pulls images directly from Docker Hub.

## One-time setup

**On your PC:**

1. Docker Desktop installed and running.
2. `docker login` once, with push access to the `juneyou` Docker Hub namespace.
3. An SSH key already trusted by the server (`ssh-copy-id user@host`, or the public key already in the server's `~/.ssh/authorized_keys`).
4. Create `.env.deploy.staging` and/or `.env.deploy.production` at the repo root (copy from the matching `.example` file, git-ignored):
   ```
   DEPLOY_HOST=your.server.ip
   DEPLOY_USER=your-ssh-user
   DEPLOY_DOMAIN=innocenz.duckdns.org
   # DEPLOY_SSH_PORT=22
   # DEPLOY_REMOTE_DIR=~/innocenz-staging
   # FRONTEND_IMAGE=juneyou/innocenz-frontend:staging
   # BACKEND_IMAGE=juneyou/innocenz-backend:staging
   ```
5. If the backend needs runtime secrets (DB URL, JWT secret, etc.), copy `tools/deploy/.env.backend.example` → `tools/deploy/.env.backend` (or `.env.backend.staging` / `.env.backend.production` to differ per environment) and fill it in. Same for `.env.frontend` if the web app ever needs server-only runtime vars.

**On the server:**

- Docker + the Compose plugin installed.
- Ports 80 and 443 open (Caddy needs both for the HTTP→HTTPS redirect and the ACME challenge).
- `docker login` once with pull access to the `juneyou` namespace (only needed if the images are private).
- That's it — the target directory and the `innocenz-<env>-network` Docker network are both created automatically by the deploy script on first run.

## Deploying

```
pnpm deploy:staging
pnpm deploy:production
```

Every subsequent deploy to that environment is the same one command.

## Notes

- `NEXT_PUBLIC_API_URL` is inlined into the web app's client bundle **at build time** (Next.js behavior for any `NEXT_PUBLIC_*` var) — it defaults to `https://api.<DEPLOY_DOMAIN>/api` and must be correct when `pnpm deploy:<env>` builds the image. Changing it later requires rebuilding and redeploying, not just editing an env file on the server.
- Caddy issues and renews Let's Encrypt certificates automatically the first time each hostname is hit — no manual cert setup, but the DNS records must already resolve and ports 80/443 must be reachable from the internet.
- To check what's running on the server: `ssh user@host 'cd ~/innocenz-staging && docker compose ps'`
- To view logs: `ssh user@host 'cd ~/innocenz-staging && docker compose logs -f'`
- To re-run a deploy manually on the server without going through `pnpm deploy:<env>` (e.g. to just retry a flaky pull): `ssh user@host 'cd ~/innocenz-staging && ./deploy.sh'`
