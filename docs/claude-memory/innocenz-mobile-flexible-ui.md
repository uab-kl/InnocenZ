---
name: innocenz-mobile-flexible-ui
description: "standing rule — PR-app UI must flex to any phone; no fixed pixels for safe areas, sheet sizes, or widths"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 84a05eac-ab09-4bac-b6f1-09c714ba9be2
  modified: 2026-08-05T06:16:00.716Z
---

Owner's rule (5 Aug 2026, stated on a real device): **"makes all flexible"** — every PR-app
screen and sheet must fit any phone, and controls must never collide with the device's own
3-button / gesture navigation bar.

**Why:** a run of real-device bugs all had the same root — fixed constants that happened to fit
one screen: `maxWidth: 392` (the WEB phone-frame width) left dead margins on a 411dp handset;
`maxHeight: 420` on a scroll area overflowed short phones and wasted tall ones; a fixed 28px
bottom padding jammed the red Close button against the phone's nav bar, where a mis-tap exits
the app.

**How to apply:**
- Bottom padding of sheets/footers = `useSafeAreaInsets().bottom + small constant`, never a
  bare number. When the keyboard is open, `keyboardInset` wins (it already clears the nav bar).
- Sheet height: `maxHeight: '90%'` + inner list `flexShrink: 1` — proportions, not pixels.
- Sheet width: cap only for tablets (≈520), never at the web frame's 392.
- Never wrap a ScrollView in a `Pressable` ancestor (tap-guard steals the drag on Android —
  the intermittent "cannot scroll sometimes" bug). Dismiss targets are SIBLINGS above the
  sheet ([[innocenz-daily-test-tracker]]).
- Colour code for sheet actions: gold = act, red = Close/dismiss (mirror `dangerBtn`).

Related: six components still carry the Pressable-over-ScrollView trap and non-inset padding —
`PvDetailScreen`, `AgencySchedulePanel`, `HistDateTimeFilter`, `JobPostingsPanel` et al.;
recorded in TEST_SCRIPT §9 as one sweep.
