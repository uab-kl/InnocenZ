---
name: pr-cannot-accept-decline
description: Domain rule — PRs never accept/decline shift assignments; they can only cancel per cancellation rules
metadata: 
  node_type: memory
  type: project
  originSessionId: 6e471702-f8f3-448f-9373-cf7e7cf9f305
---

App logic (stated by the user 2026-07-19): a PR does **not** get to accept or decline a shift they're assigned to. Once the agency assigns them, they're on it; their only exit is to **cancel**, governed by the cancellation rules. So there is no PR-side accept/decline feature to build.

**Why:** clarifies the assignment lifecycle — assignment is agency-driven and effectively confirmed on creation; the "pending/awaiting PR" framing from the demo doesn't reflect this product.

**How to apply:** don't build a PR accept/decline flow. In the roster read path ([[roster-backend-wiring]]), a backend `shift_assignment` with status `assigned` is effectively scheduled, not "awaiting PR acceptance" — treat/label accordingly. Cancellation (agency cancel, or PR cancel per rules → status `cancelled`) is the real lifecycle branch worth wiring.
