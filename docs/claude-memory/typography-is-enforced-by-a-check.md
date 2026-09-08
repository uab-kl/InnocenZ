---
name: typography-is-enforced-by-a-check
description: "STANDING RULE (owner, 8 Sep 2026) — run `pnpm check:type` on portal work; it is a ratchet over 1,004 known raw values, never re-baseline to hide a new breach"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 56e815c6-b57f-4a32-9edf-e106a56c93b6
  modified: 2026-09-08T05:12:03.158Z
---

Portal typography is enforced by a script, not by good intentions. Run it on any change touching
`apps/web/src/agency-portal/`, `routes/agency/` or `routes/outlet/`:

```bash
pnpm check:type          # fails on any NEW breach
pnpm check:type:update   # bank an improvement into the baseline
```

**Why:** the owner asked on 8 Sep 2026 that "the Font used and Font Styling and font size are
enforced for every new thing added into the code". A written rule already existed and had not held —
the portals reached 27 different font sizes and a `Sora` that was never loaded in any import, with
243 rules silently rendering Arial beside real Manrope. A rule nothing runs is a rule that erodes.

**How to apply.** `tools/scripts/check-portal-typography.mjs` checks four things: a `font-family`
that is not `var(--iz-font)`; a `font-size` that is not a `--iz-fs-*` step; a Tailwind class that
NAMES a font (`font-sora` / `font-manrope` / `font-display` / `font-mono`); and an arbitrary
`text-[13px]` **including its `!text-[13px]` twin** — a different class, and how 163 call sites once
escaped the ladder unseen.

⚠️ **It is a RATCHET, not a zero.** The 7 Sep pass put every RENDERED element on the ladder using
override layers, so the source still holds **1,004** raw values the cascade normalises. Those are
frozen per file+rule in `tools/scripts/portal-typography-baseline.json` (shape:
`{"<file>::<rule-id>": <count>}`), and the check fails only when a count GROWS. **Never re-baseline
to make a new breach go away** — `--update` is for banking a fix. A genuine exception goes in
`EXCEPT[]` in the script *with its reason* (today: the `.iz-pv-doc` printed voucher, and
container-query sizes), never by disabling the check.

⚠️ It reads the SOURCE, so it does not replace measuring the rendered page — the 7 Sep bugs were all
found with `getComputedStyle` in a live browser. See [[portal-clickthrough-30jul]] and
[[absent-evidence-is-about-the-instrument]].
