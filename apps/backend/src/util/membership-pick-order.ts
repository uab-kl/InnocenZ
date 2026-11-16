import { asc, desc, sql, type Column, type SQL } from 'drizzle-orm';

/**
 * WHICH ROW "THIS PERSON AT THIS ORGANISATION" MEANS, when there is more than one.
 *
 * `agency_user` / `outlet_user` are unique per (org, user) only while
 * `status = 'active'` (0160, deliberately partial: removal is a soft delete,
 * and a declined request is kept beside a new one). So one person may hold an
 * active row plus older inactive or rejected rows, and `requestJoin` inserts a
 * fresh pending row beside a rejected one on purpose.
 *
 * `getByAgencyAndUser` / `getByOutletAndUser` used to read `limit(1)` with no
 * ORDER BY, which is "whichever row Postgres emits". After a decline and a
 * second request, an invite-accept could read the REJECTED row, reactivate it
 * over the decliner's `updated_by`, and leave the newer pending row beside an
 * active one — whose later approval then died on the active-membership index.
 *
 * The order is the question every caller is really asking:
 *   active    — are they already on the team?
 *   pending   — is there an open request to answer?
 *   inactive  — a former member, whose REAL member id must be reused
 *   rejected  — a decline, which is a record and never a row to revive
 * then the most recently touched, then `id`, so the answer is TOTAL and cannot
 * change between two reads of the same rows.
 */
export const MEMBERSHIP_PICK_ORDER = ['active', 'pending', 'inactive', 'rejected'] as const;

export function membershipPickOrder(columns: {
  status: Column;
  updatedAt: Column;
  id: Column;
}): SQL[] {
  // `sql.raw` only ever sees the constant above — never a caller's value — so
  // the ranks are written into the SQL rather than bound as untyped params.
  const ranks = MEMBERSHIP_PICK_ORDER.map((status, rank) => `when '${status}' then ${rank}`);
  return [
    sql`case ${columns.status} ${sql.raw(ranks.join(' '))} else ${sql.raw(String(MEMBERSHIP_PICK_ORDER.length))} end`,
    desc(columns.updatedAt),
    asc(columns.id),
  ];
}
