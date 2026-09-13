---
name: innocenz-the-fix-rules
description: "Owner's standing checklist for EVERY change on InnocenZ, on every device and every session — database first, UI+DB together, all pages, say what is left, all 11 lanes, then continue."
metadata:
  node_type: memory
  type: feedback
---

**The owner's standing instruction, 13 Sep 2026** — *"everytime in different device or
different session when other people touch this innocenz repo folder project, do anything or
function, or fixing, remember the below"*. Also written at the TOP of `CLAUDE.md`, because
that file is auto-loaded on every device and this memory is not.

## The seven

1. **Remember the rules in this InnocenZ.** The database rules, RBAC from the database, the
   status colours, no demo data on a real session, the typography ladder. A fix that breaks a
   rule is not a fix.
2. **Check the DATABASE first.** Before believing any claim about behaviour, read the rows.
   Several "bugs" here were settled by one read-only query and turned out to be the data, not
   the code.
3. **Does it work with the UI *and* the database?** A green typecheck is not the product
   working.
4. **Do the functions and modules work on ALL pages — can the user SEE it and USE it?**
5. **After fixing, say what is LEFT.** What is solved, what still stands, what else surfaced.
6. **Check EVERY member, account, role and organisation** — outlet, PR agency, PR, admin, on
   WEB and in the APP. `_probe-mint-session.ts` mints a read-only session for each of the 11
   lanes.
7. **Then CONTINUE, still remembering 1-6.** One fix is not the job; `TEST_SCRIPT.md` section
   9 is.

## Why each one exists

Rule 2 is the one that has paid for itself most often. In a single session it refuted two
reported "money bugs": a drink supposedly mis-bucketed (the venue had tagged it a *service*,
and "fixing" it would have cut RM 50-100 per unit from a PR's pay) and a dual-org scope bug
that returned 200 on every route once an account existed to test it with. See
[[write-time-guards-are-not-retrospective]] and [[audit-entries-are-leads]].

Rule 6 is why `_probe-mint-session.ts` exists: a fix verified as the owner is verified for one
lane of eleven, and the lanes genuinely differ — the guarantor holds `settings:update` but is
refused the payment method, and the agency Director had a whole Approvals queue that could
never hold a row.

## Two rules that override any instinct to "just try it"

- **NEVER probe a write gate with a write.** A previous session destroyed two venues' entire
  rate cards that way. Read the code, read the rows, unit-test the parse.
  See [[innocenz-database-rules]].
- **A zero result is evidence about the INSTRUMENT, not about the codebase** — no grep hits, a
  SKIP, a clean run. See [[absent-evidence-is-about-the-instrument]].

Related: [[verify-against-test-script]], [[innocenz-confirm-every-action]],
[[demo-data-leaks-into-real-sessions]].
