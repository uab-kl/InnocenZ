import { and, eq } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { AgencyTable, AgencyUserTable } from '@/features/agency/agency.model.js';
import { OutletTable, OutletUserTable } from '@/features/outlet/outlet.model.js';

/**
 * Organisation statuses that deny sign-in entirely.
 *
 * **`inactive` only.** `pending_review` and `suspended` may still authenticate;
 * the portal then limits them to profile/settings (client RBAC). Treating
 * `pending_review` as a denial would lock out every organisation that has never
 * been through a review. Treating `suspended` as a denial was the old X55
 * behaviour; product now wants suspended orgs to keep a profile-only session
 * (red status) so owners can still update contact details and see why access
 * is limited.
 */
const DENIED_ORG_STATUSES = new Set(['inactive']);

/** One organisation a user belongs to, with the organisation's own status. */
type Membership = { kind: 'agency' | 'outlet'; name: string | null; status: string };

/**
 * Does an inactive organisation block this account?
 *
 * Returns a reason to refuse with, or `null` to allow.
 *
 * Three rules, and each exists because the obvious version is wrong:
 *
 *  1. **No memberships means no opinion.** Platform admins and PRs hold no
 *     `agency_user`/`outlet_user` row, so an "is your org active?" test would
 *     refuse everyone who has no organisation at all. Absence of a membership
 *     is not a denied membership.
 *  2. **One live organisation is enough.** A user who belongs to an inactive
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

  // Every organisation this account belongs to is inactive. Name the
  // organisation and its state: it is the user's OWN organisation, so this
  // discloses nothing they cannot already see, and a bare "invalid credentials"
  // would send someone to reset a password that was never the problem.
  const worst = memberships[0];
  const label = worst.name ? `${worst.kind} "${worst.name}"` : `your ${worst.kind}`;
  return `Your ${label} is ${worst.status}. Contact InnocenZ to restore access.`;
}
