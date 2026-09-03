---
name: confirm-before-asserting
description: "Four over-calls in one session, all the same error — a count, a truncated page, or a read taken seconds after a write is not evidence yet"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 779ace3d-7868-4560-9546-13e3b2f1dc5c
  modified: 2026-08-04T01:35:10.917Z
---

On 3–4 Aug 2026 I reported **four** findings that were wrong, and retracted each. All four were
the same mistake: asserting from a partial, premature, or second-hand read.

1. **"TOTAL PR 0 / TOTAL OUTLETS 0"** — called it a P1. I had read the DOM before React Query
   resolved. Real values: 3 and 4.
2. **"Post Job is broken, no POST fired"** — I queried the DB in the same breath as the click,
   before the mutation landed. It worked fine. **The owner caught this one**, saying they had
   just done it in the browser and it worked normally.
3. **"The roster grid shows 2 of 4 assignments"** — the counter counts SHIFTS, not assignments,
   and the rows I thought were missing were below my 1,400-char output truncation.
4. **"The PR self-log is Monday-anchored, fix the anchor"** — I had a fix half-written. The code
   was already Sunday-anchored everywhere; a **stale running process** was executing pre-merge
   code. See [[voucher-duplicate-guard-overlap]].

**Why:** each wasted the owner's time, and #4 would have put a wrong edit into correct
money-handling code. Two of the four *looked* like serious defects, which is exactly why they
were reported fast and wrong. Being early with a bad finding is worse than being slow, because
the owner then has to disprove it.

**How to apply:**
- **A count, a truncated page, or a read taken seconds after a write is not evidence yet.**
  Re-read after the write settles; raise the char limit before concluding rows are missing.
- **When live data contradicts the source, check what is actually RUNNING before editing the
  source.** In this repo that means the `tsx watch` staleness trap — see
  [[green-signals-that-lie]].
- Prefer "X, and here is the evidence" over "X is broken". State the observation and the read
  that produced it, so a wrong inference is visible as an inference.
- If the owner pushes back on a finding, **check before defending it** — they were right both
  times they did.
