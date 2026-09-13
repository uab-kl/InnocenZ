import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { AgencyTable, AgencyUserTable } from '@/features/agency/agency.model.js';
import { OutletTable, OutletUserTable } from '@/features/outlet/outlet.model.js';

/**
 * ORGANISATIONS THIS ACCOUNT IS THE LAST ACTIVE OWNER OF.
 *
 * 🔴 An organisation with no active owner is STRANDED, not merely inconvenienced.
 * By the product's own rules only the owner may approve a new member, replace
 * the payment method, or pay via FPX. So the moment the last owner's account is
 * switched off there is nobody who can admit a replacement and nobody who can
 * settle the bill — and no endpoint left that the organisation itself can reach
 * to repair it.
 *
 * ⚠️ It is not an edge case. When this was written EVERY organisation in the
 * database had exactly one active owner: 5 agencies and 8 outlets, 13 of 13.
 * Each was one disabled account away from that state.
 *
 * A LEAF MODULE on purpose. `require-sub-role.ts` holds the other org-scope
 * helpers, and it imports `composition-root.js`; a controller that imports it
 * closes a cycle that binds `orgScopeDeps` to `undefined` SILENTLY — no throw,
 * just guards that stop guarding. This file imports models and `db` and nothing
 * else, so it cannot take part in that.
 *
 * Returns the ORGANISATION NAMES, because a refusal has to say which venue or
 * agency is the problem — "you are the last owner somewhere" is not something a
 * person can act on.
 */
export async function orgsLosingTheirLastOwner(
  userId: string,
): Promise<string[]> {
  const [agencies, outlets] = await Promise.all([
    db
      .select({ name: AgencyTable.name })
      .from(AgencyUserTable)
      .innerJoin(AgencyTable, eq(AgencyTable.id, AgencyUserTable.agencyId))
      .where(
        and(
          eq(AgencyUserTable.userId, userId),
          eq(AgencyUserTable.subRole, 'owner'),
          eq(AgencyUserTable.status, 'active'),
          // Nobody ELSE at this agency is an active owner.
          sql`not exists (
            select 1 from ${AgencyUserTable} other
            where other.agency_id = ${AgencyUserTable.agencyId}
              and other.user_id <> ${userId}
              and other.sub_role = 'owner'
              and other.status = 'active'
          )`,
        ),
      ),
    db
      .select({ name: OutletTable.name })
      .from(OutletUserTable)
      .innerJoin(OutletTable, eq(OutletTable.id, OutletUserTable.outletId))
      .where(
        and(
          eq(OutletUserTable.userId, userId),
          eq(OutletUserTable.subRole, 'owner'),
          eq(OutletUserTable.status, 'active'),
          sql`not exists (
            select 1 from ${OutletUserTable} other
            where other.outlet_id = ${OutletUserTable.outletId}
              and other.user_id <> ${userId}
              and other.sub_role = 'owner'
              and other.status = 'active'
          )`,
        ),
      ),
  ]);

  return [...agencies, ...outlets].map((r) => r.name).filter(Boolean);
}

/**
 * The refusal sentence, or null when the account may be switched off.
 *
 * One wording for both callers — an admin disabling somebody else, and a person
 * deleting their own account — because it is one rule. The `self` flag only
 * changes who is being addressed.
 */
export async function refuseIfLastOrgOwner(
  userId: string,
  self: boolean,
): Promise<string | null> {
  const orgs = await orgsLosingTheirLastOwner(userId);
  if (orgs.length === 0) return null;
  const list = orgs.join(', ');
  return self
    ? `You are the only owner of ${list}. Make someone else an owner there first — otherwise nobody can approve members or pay that organisation's bills.`
    : `That account is the only owner of ${list}. Give someone else the owner role there first — otherwise nobody can approve members or pay that organisation's bills.`;
}
