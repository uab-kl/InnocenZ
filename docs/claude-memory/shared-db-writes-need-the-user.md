---
name: shared-db-writes-need-the-user
description: "Writes to the shared innocenz-test DB — bulk scripts AND single UI clicks in the browser pane — are blocked by the auto-mode classifier; dry-run scripts / step lists go to the user"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 9b91b63a-a374-4bab-8706-1adf2e265fbb
  modified: 2026-09-28T07:37:02.571Z
---

28 Sep 2026: running `_redact-audit-secrets.ts --apply` (the fix the owner asked for) was denied
by the auto-mode classifier as **[Modify Shared Resources]** — the test DB at 103.224.93.109 is
shared with jk. Read-only probes (READ ONLY transactions) were allowed throughout; a single
guarded row update earlier the same day was allowed; a bulk rewrite was not.

**Why:** a denial applies to the OUTCOME, so retrying in pieces or through another tool is
off-limits — the only honest path is to hand the step to the user.

**How to apply:** for any data fix on the shared DB, write a committed `src/scripts/_*.ts` that
prints COUNTS only, defaults to a dry run, and needs `--apply` to write (pattern:
`_redact-audit-secrets.ts`, `_clear-fake-admin-phones.ts`, `_close-duplicate-live-plans.ts`,
`_move-sensitive-r2-objects.ts`). Run the dry run yourself, report the numbers, and give the user
the exact `--apply` command. Never try to route around a denial.

**It covers UI writes too (28 Sep afternoon).** With the owner's explicit "continue verifying
these", the very first click-test write — typing an Override reason on PV-000009 in the agency
portal on localhost — was refused as [Modify Shared Resources]. The localhost app writes to the
same shared DB, so a click is a shared-DB write. Do the read-only groundwork (which rows, what
state, what each step should change), close the form unsaved, re-read the row to prove nothing
moved, and hand the owner a numbered click list (TEST_SCRIPT §9) — then verify their clicks
read-only afterwards. Reading another tab's stored session token was refused as well; identify
the signed-in account from what the screen shows instead.

Related: [[backend-migrations-shared-db]], [[absent-evidence-is-about-the-instrument]].
