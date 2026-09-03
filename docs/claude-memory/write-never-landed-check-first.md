---
name: write-never-landed-check-first
description: "31 Jul 2026: 'the PR added a receipt / raised a dispute and the agency cannot see it' — BOTH writes never reached the shared DB. Before debugging any PR→Agency visibility report, prove the row exists. Includes the live snapshot, the mobile API-URL resolution, and the two schema column names probes keep getting wrong"
metadata: 
  node_type: memory
  type: project
  originSessionId: 616eb9bd-5bd6-473d-a6c8-bd7e3849b0fd
  modified: 2026-07-31T03:59:58.931Z
---

**The rule: when a report is "role A did something and role B cannot see it", check that the write
LANDED before touching either feature.** Two features looked broken on 31 Jul 2026; the evidence says
neither had been exercised at all.

## What was reported vs what the database held

A coworker, testing on 31 Jul, reported **(1)** a receipt added in the PR app never appearing on the
agency side and **(2)** a dispute raised as a PR never appearing either. Two separate features, same
shape of failure — which is itself the clue: *one* cause upstream is likelier than two coincident
feature bugs.

Queried the shared DB (`103.224.93.109:6543/innocenz-test`) directly at **31 Jul 11:56**:

- newest receipt: **`RCP-000007`, created 30 Jul 02:51** — the previous day
- newest `payment_voucher_line`: **30 Jul 15:58**
- `payment_voucher.disputed_at` / `dispute_reason`: **NULL on all four vouchers — no dispute has ever
  been recorded on any of them**
- the `dispute` table: **1 row, from 30 June**

**Nothing from 31 Jul exists.** The agency cannot render a row that was never written, so the agency
side is not implicated by this report at all.

## The likely cause (NOT yet confirmed — pending the console check)

The PR app resolves its own base URL (`apps/mobile/src/lib/api.ts`):
`EXPO_PUBLIC_API_URL` if set, otherwise `http://<host>:${DEFAULT_BACKEND_PORT}/api` → `…:7777/api/v1`.

So a coworker with that env var set, or running their own backend against a **local** Postgres, writes
to a database this one cannot see. Same family as [[backend-port-7777]], where a port mismatch made
outlet Post Job silently write no row. **A silent no-write looks exactly like a broken reader.**

## The 30-second test to give them — do this before any code

Retry the action while watching the backend console:
- **no request line** → the app is not reaching that backend (check `EXPO_PUBLIC_API_URL`, the port)
- **request with 4xx/5xx** → a real API bug, now worth chasing
- **request with 200** → their backend is on a **different database**; confirm the `[db] PostgreSQL
  target:` line the backend prints at boot

## ⚠️ Two column names probes keep getting wrong

`payment_voucher_receipt.**voucher_id**` and `payment_voucher_line.**voucher_id**` — **not**
`payment_voucher_id`. Guessing it costs a failed query that reads like a missing table. Receipts also
carry `order_no` (what OCR read, e.g. `ORD0389`) separately from `receipt_no` (the generated
`RCP-000007`).

## How to apply

- **Do not fold this into the payroll work.** Nothing in the P0 money block
  ([[voucher-never-checked-against-source]]) would make a receipt or dispute disappear.
- If the writes turn out to be landing and the agency still cannot see them, that is a **genuinely new
  finding** and deserves its own investigation — start with which voucher the receipt is attached to,
  since receipts ride on `GET /payment-voucher/:id` and Victoria has **two vouchers for one week**.
- Related: [[backend-port-7777]] · [[demo-data-leaks-into-real-sessions]] · [[mobile-app-runs-on-web]]
