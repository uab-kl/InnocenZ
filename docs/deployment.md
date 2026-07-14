# Deploying web + backend

Images are built on your machine, pushed to Docker Hub, and pulled by the
server — the server never needs a git checkout of this repo, only Docker.
A Caddy reverse proxy on the server terminates HTTPS and routes both
`innocenz.duckdns.org` (frontend) and `api.innocenz.duckdns.org` (backend)
to the right container.

## How it works

1. `pnpm deploy` runs `tools/scripts/deploy.mjs`, which:
   - `docker compose build`s `juneyou/innocenz-frontend:latest` and `juneyou/innocenz-backend:latest` (using the root `docker-compose.yml`)
   - `docker push`es both images to Docker Hub
   - `scp`s the contents of `deploy/` to the server
   - `ssh`'s in to create the `innocenz-network` Docker network (if missing) and run `redeploy.sh`
2. `deploy/redeploy.sh` (on the server) stops the old containers, drops the old cached images, retries `docker compose pull` up to 5 times, then `docker compose up -d`.

## DNS (DuckDNS)

- `innocenz.duckdns.org` → your server's public IP (set this in the DuckDNS dashboard).
- `api.innocenz.duckdns.org` needs no separate DuckDNS entry — DuckDNS automatically resolves any subdomain of your domain (`*.innocenz.duckdns.org`) to the same IP. Verify with `nslookup api.innocenz.duckdns.org` before deploying.
- If the server's IP isn't static, set up DuckDNS's own update cron job on the server (see DuckDNS's install instructions) so the record stays current — this repo doesn't manage that.

## Local layout (this repo)

| Path | Purpose |
|---|---|
| `apps/web/Dockerfile`, `apps/backend/Dockerfile` | Multi-stage builds for each app |
| `docker-compose.yml` (root) | **Build-only.** Used by `docker compose build` to produce the two images, tagged for Docker Hub. Not sent to the server. |
| `deploy/docker-compose.yml` | **Server-facing.** Caddy + frontend + backend, images pulled by tag — nothing is built here. |
| `deploy/Caddyfile` | Reverse-proxy routes + automatic Let's Encrypt HTTPS for both hostnames |
| `deploy/redeploy.sh` | Runs on the server: down → prune old images → pull → up |
| `deploy/.env.example`, `deploy/.env.frontend.example`, `deploy/.env.backend.example` | Committed templates for the files below |
| `deploy/.env`, `deploy/.env.frontend`, `deploy/.env.backend` | **Git-ignored.** Real runtime values/secrets. `deploy.mjs` uses these if present, otherwise falls back to the `.example` files. |
| `tools/scripts/deploy.mjs` | The deploy script (`pnpm deploy`) |

## What ends up on the server

Under `DEPLOY_REMOTE_DIR` (default `~/innocenz`):

```
~/innocenz/
├── docker-compose.yml   # copied from deploy/docker-compose.yml
├── Caddyfile             # copied from deploy/Caddyfile
├── redeploy.sh           # copied from deploy/redeploy.sh
├── .env                  # generated each deploy: FRONTEND_IMAGE, BACKEND_IMAGE
├── .env.frontend          # copied from deploy/.env.frontend (or its .example)
└── .env.backend           # copied from deploy/.env.backend (or its .example)
```

No image tarball is transferred — the server pulls images directly from Docker Hub.

## One-time setup

**On your PC:**

1. Docker Desktop installed and running.
2. `docker login` once, with push access to the `juneyou` Docker Hub namespace.
3. An SSH key already trusted by the server (`ssh-copy-id user@host`, or the public key already in the server's `~/.ssh/authorized_keys`).
4. Create `.env.local` at the repo root (git-ignored):
   ```
   DEPLOY_HOST=your.server.ip
   DEPLOY_USER=your-ssh-user
   # DEPLOY_SSH_PORT=22
   # DEPLOY_REMOTE_DIR=~/innocenz
   # DEPLOY_DOMAIN=innocenz.duckdns.org   # only if different from the default
   ```
5. If the backend needs runtime secrets (DB URL, JWT secret, etc.), copy `deploy/.env.backend.example` → `deploy/.env.backend` and fill it in. Same for `deploy/.env.frontend` if the web app ever needs server-only runtime vars.

**On the server:**

- Docker + the Compose plugin installed.
- Ports 80 and 443 open (Caddy needs both for the HTTP→HTTPS redirect and the ACME challenge).
- `docker login` once with pull access to the `juneyou` namespace (only needed if the images are private).
- That's it — the target directory and the `innocenz-network` Docker network are both created automatically by the deploy script on first run.

## Deploying

```
pnpm deploy
```

Every subsequent deploy is the same one command.

## Notes

- `NEXT_PUBLIC_API_URL` is inlined into the web app's client bundle **at build time** (Next.js behavior for any `NEXT_PUBLIC_*` var) — it defaults to `https://api.<DEPLOY_DOMAIN>/api` and must be correct when `pnpm deploy` builds the image. Changing it later requires rebuilding and redeploying, not just editing an env file on the server.
- Caddy issues and renews Let's Encrypt certificates automatically the first time each hostname is hit — no manual cert setup, but the DNS records must already resolve and ports 80/443 must be reachable from the internet.
- To check what's running on the server: `ssh user@host 'cd ~/innocenz && docker compose ps'`
- To view logs: `ssh user@host 'cd ~/innocenz && docker compose logs -f'`
- To re-run a deploy manually on the server without going through `pnpm deploy` (e.g. to just retry a flaky pull): `ssh user@host 'cd ~/innocenz && ./redeploy.sh'`
