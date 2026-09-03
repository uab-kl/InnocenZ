---
name: backend-port-7777
description: Backend runs on 7777 (BACKEND_PORT); frontend VITE_API_URL must be http://localhost:7777/api. Port mismatch was why outlet Post Job wrote no DB row
metadata: 
  node_type: memory
  type: project
  originSessionId: d7c27bdc-1edb-44f4-bcd9-ca4aa5735901
  modified: 2026-07-23T01:40:19.201Z
---

Fixed 2026-07-23 (branch SL, commit 85da1ed). The shared/canonical local backend port is **7777**.

**Root cause of "Post Job / writes don't hit the DB":** three ports disagreed — frontend `apps/web/.env` `VITE_API_URL=http://localhost:4000/api` (axios calls :4000 directly, bypassing the vite proxy), backend read `env.PORT` (default 3000), and `.env`/`.env.example` used the unread `BACKEND_PORT=7777` (vite proxy target is also 7777). So the frontend fired createShift at a dead port and the request silently failed → no `main.shift` row.

**Fix applied:**
- `apps/backend/src/env.ts`: added `BACKEND_PORT` (default 7777), made `PORT` optional.
- `apps/backend/src/main.ts`: `const PORT = env.PORT ?? env.BACKEND_PORT` (platform PORT wins for cloud/Docker; else BACKEND_PORT=7777).
- `apps/web/.env` (gitignored, local only): `VITE_API_URL=http://localhost:7777/api`, `VITE_GRAPHQL_ENDPOINT=http://localhost:7777/graphql`.
- Left the Dockerfile alone (deploy uses EXPOSE 7780 + platform-injected PORT; the `env.PORT ?? BACKEND_PORT` order keeps that working).

**Proven working:** live round-trip on 7777 — login 200, POST /api/v1/shift 201, `main.shift` count 9→10 for Velvet (owner@velvet23.my / Password123!). The backend create path + outlet scoping (auto-routes agency via outlet.onboarded_by_agency_id) is correct. See [[outlet-post-job-next]].

**After pulling this:** restart the backend (`npm run dev` → now 7777) AND restart the web dev server (vite only reads .env at startup, so VITE_API_URL=7777 needs a fresh start). Frontend `backed` flag also needs a resolvable outlet_user membership — Velvet's 3 accounts have one. See [[role-plus-membership-both-required]].
