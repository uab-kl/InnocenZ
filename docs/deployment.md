# Deploying web + backend

Images are built (on your machine **or** by GitHub Actions), pushed to Docker
Hub, and pulled by the server — the server never needs a git checkout of this repo, only Docker.
A Caddy reverse proxy on the server terminates HTTPS and routes both the
frontend and backend hostnames to the right container. staging and
production are separate environments with their own image tags, remote
directory, and Docker network, so both can run on the same or different
servers without colliding.

## How it works

1. `pnpm deploy:staging` (or `pnpm deploy:production`) runs `tools/scripts/deploy.mjs <env>`, which:
   - `docker compose build`s `juneyou/innocenz-frontend:<env>` and `juneyou/innocenz-backend:<env>` (using the root `docker-compose.yml`)
   - `docker push`es both images to Docker Hub
   - generates a `Caddyfile` for `DEPLOY_DOMAIN` and `.env` (image tags + `DEPLOY_ENV`), and `scp`s them plus the rest of `tools/deploy/` to the server
   - uploads **`.env.backend.<env>` / `.env.frontend.<env>` only if those real files exist** — never the empty `.example` (so a deploy cannot wipe staging DB/R2 with a blank template)
   - `ssh`'s in to create the `innocenz-<env>-network` Docker network (if missing) and run `deploy.sh`
2. `tools/deploy/deploy.sh` (on the server) stops the old containers, drops the old cached images, retries `docker compose pull` up to 5 times, then `docker compose up -d`.

**Note:** `pnpm deploy` (no suffix) does not work — `deploy` is a command
reserved by pnpm itself. Always use `pnpm deploy:staging` / `pnpm deploy:production`
(or `pnpm run deploy <env>` to bypass pnpm's built-in command).

## Deploying from GitHub (no PC build)

`.github/workflows/deploy.yml` does the whole thing: it builds and pushes both
images, then SSHes to the server and runs the **same `deploy.sh`** a PC deploy
runs. Actions → Deploy → Run workflow → pick the environment → Run. Untick
**Roll out to the server after building** to build images only.

It needs four secrets **per environment**, named by the environment in caps —
`STAGING_*` for staging, `PRODUCTION_*` for production. The job picks them by
name, so a staging rollout never has the production key in its environment at
all:

| Secret | Value |
|---|---|
| `<ENV>_SERVER_IP` | the server's public IP (`DEPLOY_HOST` in `.env.deploy.<env>`) |
| `<ENV>_SERVER_USER` | the deploy user, e.g. `devops` |
| `<ENV>_SERVER_PORT` | SSH port — optional, defaults to `22` |
| `<ENV>_SECRET_KEY` | private half of a key whose public half is in that user's `~/.ssh/authorized_keys` |

A secret that does not exist resolves to an **empty string, not an error**, so a
typo'd name would surface much later as an unreadable `ssh` usage error. The job
therefore checks the three required ones up front and names whichever are
missing.

Plus the `VITE_*` build secrets. **Anything not set is baked into the web image as
an empty string** — a missing `VITE_R2_PUBLIC_URL_<ENV>` ships a frontend that
cannot resolve a single uploaded file, and nothing in the build fails to say so.

The rollout **copies nothing to the server.** The box owns its own runtime
layout, and this repo's copies have been shown to disagree with it — the staging
server runs no Caddy service, binds its ports to `127.0.0.1`, and declares no
external network, none of which matches `tools/deploy/docker-compose.yml`. So
the job only:

1. finds the deployment directory — the `<ENV>_REMOTE_DIR` variable if set,
   otherwise `~/innocenz-<env>` then `~/innocenz`, printing whichever it used;
2. rewrites **only** the `FRONTEND_IMAGE` / `BACKEND_IMAGE` lines in that
   directory's `.env`, pinned to the immutable `<env>-<sha>` tag — every other
   key, including the container names its compose interpolates, survives;
3. runs the server's own `./deploy.sh`.

`.env.backend`, `.env.frontend`, `docker-compose.yml` and any reverse-proxy
config are never read or written by CI.

⚠️ **`pnpm deploy:<env>` is NOT safe against a server whose layout has diverged.**
Unlike the rollout above, `tools/scripts/deploy.mjs` scp's this repo's
`docker-compose.yml`, a generated `Caddyfile` and `deploy.sh` over whatever is
already there. Against the current staging box that would replace a working
stack with one demanding Caddy and a network it does not have. Use the GitHub
rollout for that server, or reconcile the two layouts first.

**Rollback:** because the rollout pins `<env>-<sha>` rather than the floating
`<env>` tag, rolling back is editing those two `*_IMAGE` lines in the server's
`.env` to an earlier sha and re-running `./deploy.sh`.

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
| `tools/deploy/.env.example`, `.env.frontend.example`, `.env.backend.example`, `.env.backend.staging.example` | Committed templates |
| `tools/deploy/.env.backend.staging` / `.env.backend.production` (git-ignored) | **Real** runtime secrets. Prefer per-env names so staging cannot get production DB/R2. |
| `.env.deploy.staging`, `.env.deploy.production` | **Git-ignored.** Per-environment `DEPLOY_HOST`/`DEPLOY_USER`/`DEPLOY_DOMAIN` + optional `VITE_*` bake-ins. |
| `tools/scripts/deploy.mjs` | The deploy script (`pnpm deploy:staging` / `pnpm deploy:production`) |

## What ends up on the server

Under `DEPLOY_REMOTE_DIR` (default `~/innocenz-<env>`, e.g. `~/innocenz-staging`):

```
~/innocenz-staging/
├── docker-compose.yml   # copied from tools/deploy/docker-compose.yml
├── Caddyfile             # generated each deploy from DEPLOY_DOMAIN
├── deploy.sh              # copied from tools/deploy/deploy.sh
├── .env                    # generated each deploy: DEPLOY_ENV, image tags, container names
├── .env.frontend            # only if you have tools/deploy/.env.frontend(.staging)
└── .env.backend              # only if you have tools/deploy/.env.backend(.staging) — otherwise kept as-is on the server
```

No image tarball is transferred — the server pulls images directly from Docker Hub.

## One-time setup

**On your PC:**

1. Docker Desktop installed and running.
2. `docker login` once, with push access to the `juneyou` Docker Hub namespace.
3. An SSH key already trusted by the server.
4. Create `.env.deploy.staging` (copy from `.env.deploy.staging.example`).
5. **Backend secrets (DB + R2)** — pick one:
   - **Managed from PC (recommended):** copy `tools/deploy/.env.backend.staging.example` → `tools/deploy/.env.backend.staging`, fill **staging** `DATABASE_URL` / `R2_*`, then every `pnpm deploy:staging` uploads that file.
   - **Managed only on the server:** keep `~/innocenz-staging/.env.backend` filled by hand. As long as you do **not** create a local `.env.backend.staging`, deploy will **leave the server file alone** (it no longer uploads the empty `.example`).

**On the server:**

- Docker + Compose plugin; ports 80/443 open; `docker login` if images are private.

## Deploying

```
pnpm deploy:staging
pnpm deploy:production
```

After deploy, `deploy.sh` prints the backend's `DATABASE_URL` / `R2_BUCKET_NAME` / `R2_PUBLIC_URL` (password redacted) so you can confirm staging ≠ production.

## Notes

- `VITE_*` is baked into the web image at **build** time. Staging must use staging API + R2 public URL (`.env.deploy.staging` or GitHub `*_STAGING` secrets). Never bake `*_PROD` into a staging image.
- Root `.env` is **dockerignored** — laptop production DB/R2 cannot be copied into the image.
- Verify on server: `cd ~/innocenz-staging && docker compose exec backend printenv DATABASE_URL R2_BUCKET_NAME R2_PUBLIC_URL`
- Manual retry on server: `cd ~/innocenz-staging && ./deploy.sh`
