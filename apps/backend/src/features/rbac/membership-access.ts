/**
 * WHAT A MEMBERSHIP CHANGE MUST ALSO CHANGE — the account's portal roles, and
 * any invitation still waiting for that person at that organisation.
 *
 * Owner, 28 Sep 2026: "Fix all the other things found in 'Fix First'". This is
 * the finding "demoting a member doesn't reduce what the server lets them do".
 *
 * ⚠️ WHY A RECOMPUTE, NOT A PRUNE. `user_role` is the DOOR — may this account
 * open the agency or outlet console at all — and it carries no organisation.
 * Authority belongs to the membership lane (`agency_user.sub_role` /
 * `outlet_user.sub_role`). A lane change used to ADD the new title's role and
 * prune the old ones ONLY when this was the person's single active membership
 * of that kind, so anybody who staffed two agencies (or two venues) kept every
 * title they had ever held, for ever. That stale row was honoured by
 * `requireRole`, `requirePortal`, the lane guards' door check, the old
 * all-roles fallback in `requirePermission` and `/auth/me`'s `roles`.
 *
 * So after every change the account's roles ON THAT PORTAL are recomputed from
 * scratch: exactly one role per distinct lane among their ACTIVE memberships of
 * that kind — nothing more, nothing less. No active membership means no role on
 * that portal, which is the old "revoke on the last membership" rule falling
 * out of the same arithmetic instead of living in a second copy.
 *
 * ⚠️ ONLY THAT PORTAL'S ROLES ARE EVER READ OR WRITTEN. `admin` (admin portal)
 * and `pr` (no portal) are outside the query that loads what the account holds,
 * so a recompute cannot touch them — an admin who also staffs a venue, or a PR
 * who also staffs an agency, keeps that role whatever happens here.
 */
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { AgencyUserTable } from '@/features/agency/agency.model';
import { OutletUserTable } from '@/features/outlet/outlet.model';
import { OrgMemberInviteTable } from '@/features/org-member-invite/org-member-invite.model';
import { portalRoleNameForSubRole } from '@/features/rbac/portal-role-map';
import { PortalTable } from '@/features/rbac/portal/portal.model';
import { RoleTable } from '@/features/rbac/role/role.model';
import { UserRoleTable } from '@/features/rbac/user-role/user-role.model';
import { UserRoleRepositoryClass } from '@/features/rbac/user-role/user-role.repository';
import type { DbTransaction } from '@/types/db-transaction';

export type OrgKind = 'agency' | 'outlet';

/** One role row, by id and by the name the seeds and the lane map speak. */
export type PortalRoleRef = { roleId: string; roleName: string };

export type PortalRolePlan = {
  /** Roles the account must be given. */
  grant: PortalRoleRef[];
  /** Roles the account must lose. */
  revoke: PortalRoleRef[];
  /**
   * Role NAMES a lane maps to that this portal does not define. Non-empty means
   * the plan cannot be carried out — the caller must refuse, never half-apply.
   */
  missing: string[];
};

/**
 * THE ARITHMETIC, with no database — so it can be proved lane by lane.
 *
 * `held` must be the account's roles on THIS portal only (the store's query
 * guarantees it). `defined` is every role this portal has, so a lane can be
 * turned into a role id. Names compare case-insensitively because that is how
 * the unique index on `role` compares them (`lower(role_name)` + portal).
 */
export function planPortalRoleSync(input: {
  org: OrgKind;
  activeLanes: readonly string[];
  held: readonly PortalRoleRef[];
  defined: readonly PortalRoleRef[];
}): PortalRolePlan {
  const key = (name: string) => name.trim().toLowerCase();
  const definedByName = new Map(input.defined.map((r) => [key(r.roleName), r]));

  // One role per DISTINCT lane: three venues on the Finance lane need one row.
  const wantedNames = [
    ...new Set(
      input.activeLanes.map((lane) => portalRoleNameForSubRole(input.org, lane)),
    ),
  ];
  const missing = wantedNames.filter((n) => !definedByName.has(key(n)));
  const wanted = wantedNames.flatMap((n) => {
    const role = definedByName.get(key(n));
    return role ? [role] : [];
  });

  const wantedIds = new Set(wanted.map((r) => r.roleId));
  const heldIds = new Set(input.held.map((r) => r.roleId));
  return {
    grant: wanted.filter((r) => !heldIds.has(r.roleId)),
    revoke: input.held.filter((r) => !wantedIds.has(r.roleId)),
    missing,
  };
}

/** A lane maps to a role this portal was never seeded with. */
export class PortalRoleNotSeededError extends Error {
  constructor(
    readonly org: OrgKind,
    readonly roleNames: readonly string[],
  ) {
    super(`Role '${roleNames.join("', '")}' is not seeded on the ${org} portal`);
    this.name = 'PortalRoleNotSeededError';
  }
}

/**
 * A membership write that came back empty. The member repositories catch a
 * failed UPDATE and answer null; inside a transaction that null is the only
 * sign the statement failed, so it is turned into a throw — which rolls every
 * write of the change back — rather than a "Member updated" over nothing.
 */
export class MembershipChangeNotSavedError extends Error {
  constructor() {
    super('The membership change could not be saved');
    this.name = 'MembershipChangeNotSavedError';
  }
}

/** The sentence a caller answers with when either error above aborts a change. */
export const MEMBERSHIP_CHANGE_NOT_SAVED =
  'The change could not be saved — nothing was changed. Please try again.';

/** Everything `syncPortalRoles` reads and writes, so the rule is testable without a database. */
export interface PortalRoleStore {
  /** Serialise every recompute for this account until the transaction ends. */
  lockAccount(userId: string): Promise<void>;
  /** `sub_role` of each ACTIVE membership this account holds of this kind. */
  activeLanes(userId: string, org: OrgKind): Promise<string[]>;
  /** Every role the portal defines. */
  definedRoles(org: OrgKind): Promise<PortalRoleRef[]>;
  /** The account's roles on this portal — and ONLY this portal. */
  heldRoles(userId: string, org: OrgKind): Promise<PortalRoleRef[]>;
  grant(userId: string, roleId: string, actor: string): Promise<void>;
  revoke(userId: string, roleId: string): Promise<void>;
}

/**
 * Make the account's roles on `org`'s portal equal what its active lanes imply.
 *
 * Run it INSIDE the transaction that changed the membership, after the change:
 * it reads the lanes back through that transaction, so it sees the new title
 * and the new status, and a failure here rolls the membership write back with
 * it. A person is therefore never left demoted-with-the-old-role, nor
 * promoted-with-no-role.
 *
 * GRANT BEFORE REVOKE, the reconcile script's rule: the wrong row is sometimes
 * the only row, and inside one transaction the order is invisible to everybody
 * else anyway — it only matters to whoever reads this later.
 */
export async function syncPortalRoles(
  store: PortalRoleStore,
  input: { userId: string; org: OrgKind; actor: string },
): Promise<{ granted: string[]; revoked: string[] }> {
  const { userId, org, actor } = input;
  await store.lockAccount(userId);
  const activeLanes = await store.activeLanes(userId, org);
  const defined = await store.definedRoles(org);
  const held = await store.heldRoles(userId, org);

  const plan = planPortalRoleSync({ org, activeLanes, held, defined });
  if (plan.missing.length > 0) {
    throw new PortalRoleNotSeededError(org, plan.missing);
  }
  for (const role of plan.grant) await store.grant(userId, role.roleId, actor);
  for (const role of plan.revoke) await store.revoke(userId, role.roleId);
  return {
    granted: plan.grant.map((r) => r.roleName),
    revoked: plan.revoke.map((r) => r.roleName),
  };
}

// Stateless, so a local instance is safe — and importing the composition root
// here would close a cycle through the controllers that call this.
const userRoles = new UserRoleRepositoryClass();

/** The real store, bound to one transaction. */
export function portalRoleStore(tx: DbTransaction): PortalRoleStore {
  return {
    async lockAccount(userId) {
      /*
       * Two owners changing the same person at two organisations at once would
       * each read the other's membership as it was BEFORE, and whichever
       * committed last would write a role set built on a stale half. A
       * transaction-scoped advisory lock keyed on the account makes the second
       * recompute wait and then read the first one's committed rows. It locks
       * no table row, so nothing else that touches the account is slowed.
       */
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`portal-roles:${userId}`}, 0))`,
      );
    },

    async activeLanes(userId, org) {
      if (org === 'agency') {
        const rows = await tx
          .select({ subRole: AgencyUserTable.subRole })
          .from(AgencyUserTable)
          .where(
            and(
              eq(AgencyUserTable.userId, userId),
              eq(AgencyUserTable.status, 'active'),
            ),
          );
        return rows.map((r) => r.subRole);
      }
      const rows = await tx
        .select({ subRole: OutletUserTable.subRole })
        .from(OutletUserTable)
        .where(
          and(
            eq(OutletUserTable.userId, userId),
            eq(OutletUserTable.status, 'active'),
          ),
        );
      return rows.map((r) => r.subRole);
    },

    async definedRoles(org) {
      return tx
        .select({ roleId: RoleTable.id, roleName: RoleTable.roleName })
        .from(RoleTable)
        .innerJoin(PortalTable, eq(PortalTable.id, RoleTable.portalId))
        .where(eq(PortalTable.code, org));
    },

    async heldRoles(userId, org) {
      // The inner join on the portal code is the whole guarantee that admin
      // (admin portal) and pr (no portal) can never appear here.
      return tx
        .select({ roleId: RoleTable.id, roleName: RoleTable.roleName })
        .from(UserRoleTable)
        .innerJoin(RoleTable, eq(RoleTable.id, UserRoleTable.roleId))
        .innerJoin(PortalTable, eq(PortalTable.id, RoleTable.portalId))
        .where(and(eq(UserRoleTable.userId, userId), eq(PortalTable.code, org)));
    },

    async grant(userId, roleId, actor) {
      await userRoles.assignRoleToUser(
        { userId, roleId, createdBy: actor, updatedBy: actor },
        tx,
      );
    },

    async revoke(userId, roleId) {
      // `removeRoleFromUser` answers false instead of throwing, and inside a
      // transaction a swallowed failure would let the rest carry on against an
      // aborted transaction. A revoke that did not happen must stop the change.
      if (!(await userRoles.removeRoleFromUser(userId, roleId, tx))) {
        throw new MembershipChangeNotSavedError();
      }
    },
  };
}

/**
 * Does this change to a membership withdraw invitations still pending for that
 * person at that organisation? `next` omitted means a removal (DELETE).
 *
 * An invitation is an offer made under the old arrangement. Once the owner has
 * re-decided this person's place — a different title, or off the team — it must
 * not survive to override that decision: accepting an old invitation re-activates
 * a removed member WITH THE INVITATION'S LANE (`acceptAgency` / `acceptOutlet`),
 * so a Finance invite sent before a demotion to Director was a way back up.
 *
 * Re-naming the SAME title on reinstatement changes nothing, so it withdraws
 * nothing.
 */
export function changeWithdrawsInvites(
  current: { subRole: string },
  next?: { subRole?: string; status?: string },
): boolean {
  if (!next) return true;
  const laneChanges = next.subRole != null && next.subRole !== current.subRole;
  const leavesTeam = next.status != null && next.status !== 'active';
  return laneChanges || leavesTeam;
}

/**
 * Cancel every PENDING invitation to `email` at this organisation, in the
 * caller's transaction. Uses the table's own `cancelled` status — the rows stay
 * as the record of what was offered, and `accept` already refuses anything that
 * is not `pending` ("This invitation is no longer valid").
 *
 * The address is compared the way the invite repository stores and finds it
 * (`normalizeInviteEmail`: trimmed, lower-case). Returns how many were withdrawn.
 */
export async function withdrawPendingInvites(
  tx: DbTransaction,
  input: { org: OrgKind; orgId: string; email: string; actor: string },
): Promise<number> {
  const email = input.email.trim().toLowerCase();
  if (!email) return 0;
  const orgColumn =
    input.org === 'agency'
      ? OrgMemberInviteTable.agencyId
      : OrgMemberInviteTable.outletId;
  const rows = await tx
    .update(OrgMemberInviteTable)
    .set({ status: 'cancelled', updatedAt: new Date(), updatedBy: input.actor })
    .where(
      and(
        eq(orgColumn, input.orgId),
        eq(OrgMemberInviteTable.email, email),
        eq(OrgMemberInviteTable.status, 'pending'),
      ),
    )
    .returning({ id: OrgMemberInviteTable.id });
  return rows.length;
}

/**
 * ONE TRANSACTION for a membership change and everything it implies — the
 * membership row, the account's portal roles, and the invitations it retires.
 *
 * These used to be separate autocommitted statements, and the member
 * repositories answer null on a failed UPDATE. `updateMember` ignored that null,
 * pruned the roles anyway and replied 200 "Member updated": a demotion that had
 * NOT been written was reported as done, with the old title still deciding what
 * the person could do. Now a falsy write throws, and any throw — that one, a
 * role that is not seeded, a database error — rolls all of it back, so the
 * caller can truthfully say nothing changed.
 *
 * `write` must use `tx`; it answers the written row (or `true`), falsy on failure.
 */
export async function commitMembershipChange<T>(input: {
  org: OrgKind;
  orgId: string;
  userId: string;
  actor: string;
  /** The address whose pending invitations here are withdrawn; null leaves them. */
  withdrawInvitesFor: string | null;
  write: (tx: DbTransaction) => Promise<T | null | false>;
}): Promise<T> {
  return db.transaction(async (tx) => {
    const written = await input.write(tx);
    if (!written) throw new MembershipChangeNotSavedError();
    await syncPortalRoles(portalRoleStore(tx), {
      userId: input.userId,
      org: input.org,
      actor: input.actor,
    });
    if (input.withdrawInvitesFor) {
      await withdrawPendingInvites(tx, {
        org: input.org,
        orgId: input.orgId,
        email: input.withdrawInvitesFor,
        actor: input.actor,
      });
    }
    return written;
  });
}

/**
 * The recompute on its own, in its own transaction — for a path whose
 * membership write cannot join one (invite acceptance activates through
 * `activateOrgMembership`, which writes on its own connection).
 */
export async function resyncPortalRoles(input: {
  userId: string;
  org: OrgKind;
  actor: string;
}): Promise<{ granted: string[]; revoked: string[] }> {
  return db.transaction((tx) => syncPortalRoles(portalRoleStore(tx), input));
}
