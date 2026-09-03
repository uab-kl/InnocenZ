---
name: phase-flags-vs-permissions
description: A phase flag means the product is not offering this yet; a *Can() check means this role may not do it. Conflating them tells someone their role is broken when it is fine. lib/phase-flags.ts is the one home
metadata: 
  node_type: memory
  type: project
  originSessionId: c8d8947f-3a09-4756-9fc7-2fb0c514a0e5
  modified: 2026-07-30T06:24:19.734Z
---

**The rule:** a **phase flag** says *the product is not offering this yet*. A **`*Can()` permission
check** says *this role may not do it*. Conflating them produces an access error for someone whose
role is perfectly fine, and sends them to ask for a role change that cannot help.

**Check the phase BEFORE the role.** Telling someone their role is wrong is only honest once the
feature exists to be denied.

## The bug that taught it (`caeee07`, 30 Jul 2026)

`/outlet/special-service` redirected to `/outlet/bookings?tab=services` — a tab phase 2 had switched
off. Traced for **outlet finance**:

1. the route's guard passes, because finance **holds** `orderSpecialService`
2. redirect to `?tab=services`
3. Post Job resolves `canOrderServices=false` and `canPostShifts=false` for that role
4. → *"Your outlet role cannot post shifts or order services."*

The one role whose permissions are exactly right is told its role is the problem. Owner and ops never
saw it — they hold `postJob`, so they land on the shifts tab.

**Root cause was a flag with no home.** `bookings.tsx` held `const canOrderServices = false` locally,
under a comment promising "everything downstream is gated on this one flag, so nothing else needs
touching" — while `special-service.tsx`, which is downstream, could not read it.

## Where it lives now

`apps/web/src/agency-portal/lib/phase-flags.ts` → **`OUTLET_SERVICES_ENABLED`** (currently `false`).
Gates the Services tab, the `?tab=services` search param, the services form, and the
`/outlet/special-service` entry point. **Read the flag from there; do not re-hardcode it.**

Backend `special-service` routes stay live and gated — only the outlet's way in is closed.

Two smaller things done with it:
- The role check is kept **live alongside** the flag (`OUTLET_SERVICES_ENABLED && outletCan(...)`)
  rather than commented out, so flipping the flag restores the feature already correctly scoped.
- The `tab` fallback no longer returns `"services"` while services is off — that could only select a
  tab with no form behind it.

Related: the agency "Job Posting" nav entry is commented out for phase 2 the same way, but has no flag
— its route stays reachable by URL.
