/**
 * Features built and then deliberately switched off until a later phase.
 *
 * These are NOT permissions. A phase flag says "the product is not offering this
 * yet"; a `*Can()` check says "this role may not do it". Keeping them separate
 * matters for what the user gets told — conflating the two produces an access
 * error for someone whose role is perfectly fine, which sends them off to ask for
 * a role change that would not help.
 *
 * Flip a flag to true to restore the feature. Every gate for it reads from here,
 * so there is one place to change.
 */

/**
 * Outlet "Services" — the agency add-on ordering flow (`special_service`).
 *
 * Deferred to phase 2. Gates the Services tab on outlet Post Job, the
 * `?tab=services` search param, the services form, and the
 * `/outlet/special-service` entry point. The backend routes stay live and gated;
 * only the outlet's way in is closed.
 */
export const OUTLET_SERVICES_ENABLED = false;

/**
 * The AGENCY half of the same feature — `/agency/special-service`, where an
 * agency reads and prices the service orders venues raise.
 *
 * ⚠️ It was already off, but off by ACCIDENT: no nav item points at it, so the
 * only way in is to type the URL. An unreachable route is not the same as a
 * deferred one — the first is a page nobody maintains and nobody can find, the
 * second says what it is. It is the same phase as `OUTLET_SERVICES_ENABLED`:
 * there is nothing for an agency to price while venues cannot order.
 *
 * Flip BOTH to restore the flow; either alone is half a conversation.
 */
export const AGENCY_SERVICES_ENABLED = false;
