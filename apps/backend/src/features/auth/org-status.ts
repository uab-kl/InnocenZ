import { and, eq } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { AgencyTable, AgencyUserTable } from '@/features/agency/agency.model.js';
import { OutletTable, OutletUserTable } from '@/features/outlet/outlet.model.js';

/**
 * Organisation statuses that deny access to the people inside them.
 *
 * `suspended` and `inactive` only — **`pending_review` is deliberately NOT
 * here**, and that carve-out is the whole design of this file. `pending_review`
 * is the column DEFAULT for both `agency` and `outlet`, so treating it as a
 * denial would lock out every organisation that has never been through a review
 * nobody has yet built a screen for. Blocking a not-yet-approved venue is a
 * different product decision from blocking a suspended one, and only the second
 * was asked for.
 */
const DENIED_ORG_STATUSES = new Set(['suspended', 'inactive']);

/** One organisation a user belongs to, with the organisation's own status. */
type Membership = { kind: 'agency' | 'outlet'; name: string | null; status: string };

/**
 * Does a suspended organisation block this account?
 *
 * Returns a reason to refuse with, or `null` to allow.
 *
 * Three rules, and each exists because the obvious version is wrong:
 *
 *  1. **No memberships means no opinion.** Platform admins and PRs hold no
 *     `agency_user`/`outlet_user` row, so an "is your org active?" test would
 *     refuse everyone who has no organisation at all. Absence of a membership
 *     is not a suspended membership.
 *  2. **One live organisation is enough.** A user who belongs to a suspended
 *     agency AND an active one still has somewhere legitimate to work; refusing
 *     the whole account would punish them for the other organisation's status.
 *  3. **The membership row's own `status` is filtered first.** `agency_user`
 *     carries a status independent of the agency's, so a revoked membership
 *     must not keep an account alive on the strength of an organisation it no
 *     longer really belongs to.
 */
export async function suspendedOrgBlock(userId: string): Promise<string | null> {
  const [agencies, outlets] = await Promise.all([
    db
      .select({ name: AgencyTable.name, status: AgencyTable.status })
      .from(AgencyUserTable)
      .innerJoin(AgencyTable, eq(AgencyUserTable.agencyId, AgencyTable.id))
      .where(and(eq(AgencyUserTable.userId, userId), eq(AgencyUserTable.status, 'active'))),
    db
      .select({ name: OutletTable.name, status: OutletTable.status })
      .from(OutletUserTable)
      .innerJoin(OutletTable, eq(OutletUserTable.outletId, OutletTable.id))
      .where(and(eq(OutletUserTable.userId, userId), eq(OutletUserTable.status, 'active'))),
  ]);

  const memberships: Membership[] = [
    ...agencies.map((a) => ({ kind: 'agency' as const, name: a.name, status: a.status })),
    ...outlets.map((o) => ({ kind: 'outlet' as const, name: o.name, status: o.status })),
  ];

  // Rule 1 — not an organisation account at all.
  if (memberships.length === 0) return null;
  // Rule 2 — at least one organisation is not denied, so let them in.
  if (memberships.some((m) => !DENIED_ORG_STATUSES.has(m.status))) return null;

  // Every organisation this account belongs to is suspended or inactive. Name
  // the organisation and its state: it is the user's OWN organisation, so this
  // discloses nothing they cannot already see, and a bare "invalid credentials"
  // would send someone to reset a password that was never the problem.
  const worst = memberships[0];
  const label = worst.name ? `${worst.kind} "${worst.name}"` : `your ${worst.kind}`;
  return `Your ${label} is ${worst.status}. Contact InnocenZ to restore access.`;
}
