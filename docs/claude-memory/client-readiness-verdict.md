---
name: client-readiness-verdict
description: "30 Jul 2026 verdict on shipping to clients: NO for general use, YES for a supervised pilot with 4 named gates. Has the percentage model (55% now / 78% audit-done / 85% pilot), and the scope discovery that the audit is a wiring audit, NOT a launch checklist"
metadata: 
  node_type: memory
  type: project
  originSessionId: e6a0525f-ec3a-44a2-bf33-e24471117ad8
  modified: 2026-07-30T17:01:36.824Z
---

**Asked 30 Jul 2026: how finished is the app, give a percentage, and can clients use it. Answers
below. All of this is now also on the audit artifact under "Can clients use this yet?" — see
[[current-state-and-audit]] for the URL.**

## 31 Jul: asked FOUR TIMES whether it is "tested" — the user's BOSS wants a test run

That is why the question kept coming back in different words, and it is the context to answer in.
The audit now carries a dedicated section, *"Is it tested? Precisely what the evidence does and does
not support"*. **Do not soften this under repetition** — the answer did not change across four
askings and should not.

**What IS tested (say this first — it is a real result):** the API's read + permission layer, 28
endpoints × 4 roles on real logins. Scoping is enforced **server-side**: agency sees 4 PRs, outlet 3,
admin 6. Every write fired as the wrong role was refused. A tenant leak is the failure you cannot
apologise your way out of, and that part is sound.

**What is NOT:** the entire browser/UI half (0 of 31 runbook checks), **4 write flows out of dozens**
(`payment-voucher` alone has ~15 write routes), the full chain as one story, the Monday cron,
concurrency, error paths, volume, and **zero automated tests** — so every result is a one-afternoon
snapshot that decays on the next commit.

**A test run CAN cover:** 17 live accounts (agency 4 / PR 6 / outlet 5 / admin 2), 7 pinned venues,
18 shifts, 4 vouchers across signed/sent/pending_review, all three web portals + the PR app in a
browser. **It CANNOT:** anything by email (no mailer exists), PR self-sign-up (OTP deferred), camera
/ GPS / native pickers, disabling an agency or outlet account (no screen), week close on demand.

🔴 **The two warnings that matter more than the feature list:** the DB is **shared with jk** and
**voucher send / collections settle / dispute resolve have no undo** — avoid those three in a demo.
And **nobody has ever verified the money is correct**; one live voucher reads **RM678.78 for
"113.1h"**, which looks like the unbounded-overtime bug. **Do not demo to anyone whose pay depends on
the number on screen.**

**The one thing that would most move the verdict is NOT more endpoint testing — it is verifying one
PR's week of wages by hand.** If the money is right there is a supervisable pilot; if not, nothing
else matters. Offered 31 Jul, not yet done.

## The percentage model (not a vibe — a weighting)

| Dimension | Weight | Done today | After the whole audit |
|---|---|---|---|
| Feature surface built | 55% | ~85% | ~96% |
| Tests + runtime verification | 20% | ~10% | ~42% |
| Auth/ops hardening | 15% | ~20% | ~45% |
| Data & config readiness | 10% | ~25% | ~90% |
| **Total** | | **~55%** | **~78%** |

Pilot-readiness on the same basis: **85% today, ~97% audit-done.** Error bars ±10 and **asymmetric —
likelier to fall than rise**, because four defects of one class surfaced in two days by reading, all
in code already marked done, and there is no test suite to bound the guess.

## The verdict: no general use, yes a supervised pilot

**Why not general use.** The app tells people what they are owed and a PR *signs* a voucher. The
dominant defect mode here is a surface stating what its data cannot support — see
[[pv-detail-merge-convergent-fix]] for the rule. Those are not crashes. **A crash is safe because
everyone knows it failed;** these are confidently wrong and get discovered as a payment dispute.

**The asymmetry that settles it:** the parties most exposed are NOT the clients. Agencies and outlets
are customers and can complain; **PRs have their pay computed and have the least recourse.** "Early
access" is something a client accepts and an underpaid worker does not. (The fair counter — B2B ships
rougher than this all the time, high-touch relationships absorb it — is real, and loses only to that
asymmetry. The code is structurally good.)

**Four gates before even a pilot:** ① a mailer or an owned manual reset process (password reset only
logs the link — first lockout is permanent without hand-editing the DB); ② **verify the demo login is
dead in a production build** (`owner@atlas-agency.my` + `password` → fake-JWT session; UNCONFIRMED,
treat as a lead, but check before the first real credential exists); ③ a double-booking guard or a
weekly human check; ④ the audit's click-throughs.

**Pilot shape:** one agency, one or two PINNED venues, PRs reachable by phone, every voucher
reconciled by hand before anyone is paid, accounts provisioned manually. Collections issue/settle are
**forward-only with no undo**, so only run them on data worth keeping.

## The scope discovery — the important part

**The audit is a WIRING audit, not a launch checklist, and it had been quietly standing in for one.**
It answers "does this screen reach the database?" well. It was never built to track what has no
screen. **Completing every row on the page still leaves all of these open**, and none appeared in
"where I would go next" until 30 Jul:

- **Automated tests — zero**, while `vitest` sits configured. The ONLY item that changes the
  trajectory rather than the score: everything else fixes a known problem, this changes how unknown
  ones are found (currently: someone reading).
- **No mailer** · **no logout/token revocation** (cannot cut off a fired employee or a lost phone) ·
  **rate limiting only partial** (login lockout `b32df83` covers single-account stuffing, not endpoint
  abuse) · **no double-booking guard** · **no `agency_outlet` table** (client-supplied filter, so not
  enforced server-side) · **multi-agency PR identity** unresolved (decisions D1/D2).

These overlap [[app-foundation-gaps]] — that memory listed them first; this one records that the
audit omits them and that finishing the audit does not deliver them.

**How to apply:** when asked "are we ready", do not read completion off the audit's phase board.
Check this list separately. And if new operational gaps are found, add them to the audit's
"Not on this page" section so the page keeps being honest about its own scope.
