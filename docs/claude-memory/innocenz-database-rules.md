---
name: innocenz-database-rules
description: "Standing InnocenZ database rules — reuse tables, full audit columns, FK-only references, id-first PKs, UI writes must persist and be called by primary id"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 4aa4a5ea-6778-4671-add3-d3da9d125db4
  modified: 2026-07-30T02:44:39.000Z
---

Standing rules the user restates on nearly every DB-touching request (verbatim spirit):

1. **If there is an existing table, use it — don't create a new one.** New columns/tables only when truly needed; think logically where they belong.
2. **Audit columns travel together:** if a table has any of `created_at`, `updated_at`, `created_by`, `updated_by`, it must have all four.
3. **Use foreign keys to call data from other tables — never copy fields like `name`** (stale `pr.name` copies caused real bugs; reads must join through FKs).
4. **Every table leads with its `id` primary key**, and anything the web UI creates must be stored in the DB and later referenced by that primary id.
5. No duplicated/same data anywhere; success UI may only show after the row is truly committed (server-confirmed).
6. Migrations: never reuse an existing migration number — modify existing files in place when repairing; add new numbers only when really needed.

**Why:** the user checks tables directly in pgAdmin 4 and treats it as ground truth; copies and unlinked data read as bugs to them.

**How to apply:** before any schema/write change, restate which existing table is reused, which FKs resolve names, and confirm audit columns; verify results in the live DB after. Related: [[pr-mobile-backend-wiring]].
