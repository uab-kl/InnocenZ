---
name: model-column-without-migration-breaks-login
description: "Adding a column to a Drizzle model without running its migration breaks EVERY query on that table — on `user` that means all four roles cannot log in"
metadata: 
  node_type: memory
  type: project
  originSessionId: 9a888b4a-70b7-4c0f-95d1-874db2eb8358
  modified: 2026-08-17T03:33:07.107Z
---

Adding a field to a Drizzle model is **not** additive at runtime. Drizzle enumerates every
declared column in the SQL it generates, so the moment the model declares a column the live DB
does not have, **every query touching that table throws** — not just the ones that read the new
field.

On 17 Aug 2026 I added `preferredLocale` to `apps/backend/src/features/user/user.model.ts`
(migration 0122, `user.preferred_locale`) and wrote the `.sql` + journal entry, but did not run
`pnpm migrate:deploy`. Result: **nobody could log into any account** — admin, agency, outlet and
PR all at once — because the login path's user-lookup SELECT asked Postgres for a column that
did not exist.

**Why it was invisible:** `npx tsc --noEmit` passed clean on both apps. Types come from the
model, so the model and the code agreed perfectly with each other and disagreed only with the
database. Neither `tsc` nor `drizzle-kit generate` ever opens a connection — see
[[green-signals-that-lie]]. `pnpm check:drift` did **not** catch it either: it compares against
`0070_snapshot.json`, an old snapshot, and reported its usual 5 pre-existing problems
(`pr` table, `agency_pr.pr_id`, the two `sub_role` columns, `outlet_penalty_rule`) while saying
nothing about `user`. (That was the 17 Aug instrument. `check-schema-drift.ts` now reads every
`*.model.ts` and compares it with the LIVE database, so this exact mistake would now fail it —
see [[ci-instruments-that-passed-unconditionally]]. Still not a reason to skip the migrate.)

**How to apply:** the model edit and `pnpm migrate:deploy` (from the repo ROOT — never
`pnpm migrate`) are ONE step, not two. Never leave a session with a model column whose migration
has not been applied, and never judge it done on a green `tsc`.

**The 15-second check that settles it** — a wrong-password login probe. It needs no real
credentials and distinguishes the two failures cleanly. It is **not** write-free (see the warning
below), so aim it at an address that has NO account — never at `uab.innocenz@gmail.com`, which is
the real admin (`DEFAULT_ADMIN_EMAIL`):

```
curl -s -w "\nHTTP %{http_code}\n" -X POST http://localhost:7777/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"<an address with no account>","password":"deliberately-wrong-password"}'
```

`{"success":false,"message":"Wrong email or password"}` + **401** = the user SELECT ran, schema is
fine (a phone sign-in answers `Wrong phone number or password`). A **500** = the SELECT itself
blew up, so a declared column is missing — the lookup is called with `rethrow: true`, so a failed
read is a 500 and never reads as "no account". Getting past the SELECT at all is the evidence.
(Since 30 Sep 2026 an address with NO account gets the same 401 after the same SELECT — see
[[no-account-existence-leaks]] — which is what makes the no-account address usable. Before that a
real account answered `Wrong password` and an unknown one `This account is not registered yet.`,
so an old transcript quoting `Wrong password` is not a different failure.)

⚠️ **It is NOT write-free.** Every `POST /auth/login` writes an `audit_logs` row
(`platformAuditMiddleware`, mounted on the v1 router above `/auth`; a refusal is logged as
`CREATE_FAILED`), and a wrong password on a REAL account also bumps its
`failed_login_attempts` and can lock it (5 strikes, 15 minutes). An address with no account only
touches an in-memory per-process counter, which is why it is the one to use. Prefer reading
`information_schema.columns` (below); fire the login only when the owner is fine with an audit
row, and never at a real account. See [[confirm-before-asserting]] and
[[prove-guards-live-without-writing]].

To prove a specific column really landed, query `information_schema.columns` directly rather
than trusting `drizzle-kit`'s "migrations applied successfully!" — it prints that even when it
had nothing to do. Related: [[backend-migrations-shared-db]], [[migration-journal-corrupt]].
