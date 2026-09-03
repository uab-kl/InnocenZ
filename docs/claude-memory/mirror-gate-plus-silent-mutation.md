---
name: mirror-gate-plus-silent-mutation
description: A dead button = a client gate missing a server term AND a mutate() that swallows the refusal. Check both; neither alone explains "nothing happens".
metadata:
  type: feedback
---

"I click and nothing happens" on an action the server guards is almost never ONE bug. On
3 Sep 2026 the agency could not send PV-000009 and the screen said nothing at all, because
two faults stacked:

1. **The client mirror of the server gate was missing a term.** `buildSendGate` weighed
   pending receipts; the server's `voucherSendGate()` also refuses undecided OVERTIME. The
   voucher had 2 pending claims, so the button rendered **enabled** for a send guaranteed
   to 409. The hook's own comment admitted the gap ("this hook has no overtime data… the
   button being enabled is an offer, not a promise") — **a comment confessing a gap is a
   bug report, not a design note.**
2. **The mutation swallowed the refusal.** `patch()` was `mutate`, not `mutateAsync`, with
   only `onSuccess`. React Query has no default error UI and this app installs no
   `MutationCache` handler, so a 409 went nowhere. SIX actions rode that one mutation —
   send, re-send, resolve-dispute, override, mark-paid, dispute line edit — all silent.

**How to apply:** when a guarded action does nothing, check the network tab FIRST — a
request that fired and 409'd is fault 2, no request at all is fault 1. Then fix both: a
mirror must carry every term the server weighs (feed it the SAME query the tab you point
the user to reads, so the caption cannot name a row that tab does not show), and the
mutation must surface the SERVER's message, never a generic one — those refusals name the
dates and the day to come back on, which is the only part that says what to do next.

**Why:** a mirror is a courtesy, the server is the authority — but a mirror missing a term
does not merely under-report, it advertises an action that cannot work. Fail such a mirror
OPEN when its data source may 403 for a role; failing closed bricks the button for someone
who cannot see why.

Verified by [[prove-guards-live-without-writing]] — a refusal writes nothing, so forcing
the click is safe on the shared DB; both vouchers re-probed as `pending_review` after.
Prove the new test can fail first ([[ci-instruments-that-passed-unconditionally]]).
Related: [[green-signals-that-lie]], [[write-never-landed-check-first]].
