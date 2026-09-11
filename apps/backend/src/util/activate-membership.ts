/**
 * PUTTING SOMEBODY ON A TEAM — the one place it happens.
 *
 * Owner, 11 Sep 2026: "fix the bugs".
 *
 * ⚠️ WHY THIS EXISTS. Becoming active is not one write, it is three that must
 * happen together:
 *
 *   1. the membership row goes `active`
 *   2. the organisation's real member id is minted, IF the row still carries
 *      the `INNPND` placeholder (0161 — a real id is issued on approval, never
 *      on request)
 *   3. `first_activated_at` is stamped, if it has never been stamped before
 *      (0163 — the fact that tells a declined applicant from a deactivated
 *      colleague when they are later removed)
 *
 * Those three were spread across FIVE call sites, each expected to remember all
 * of them, and one had already forgotten: invite-accept flipped a reused row to
 * `active` with a plain update, so somebody invited after an earlier request
 * became a full member permanently stamped `INNPND0007` — the code that exists
 * precisely to mean "no id was ever issued" — with nothing mirrored onto their
 * account either. It would never self-correct, because an id is only ever
 * issued once.
 *
 * A sixth path would have forgotten too. So the three steps stop being a
 * convention a caller has to follow and become one operation that cannot be
 * half-done. Same shape as the `INNPND` column DEFAULT, which migration 0161
 * chose for exactly this reason: put the rule where every write must pass
 * through it.
 *
 * ⚠️ `add()` is NOT a caller. Inserting a row that is born active is a
 * different operation — there is no existing row to read, so it mints inline
 * and stamps on the way in. This function is for a row that ALREADY EXISTS and
 * is being switched on.
 */
import { eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { AgencyUserTable } from '@/features/agency/agency.model';
import { OutletUserTable } from '@/features/outlet/outlet.model';
import {
  ensureAccountCodeFromMembership,
  isPendingOrgCode,
  issueOrgMemberCode,
  type MemberCodeOrgKind,
} from '@/util/member-code';
import { logger } from '@/util/logger';

export type ActivateMembershipInput = {
  kind: MemberCodeOrgKind;
  /** The agency or outlet this membership belongs to — needed to number the id. */
  orgId: string;
  /** The membership row's own id. */
  membershipId: string;
  /** The account, so the id can be mirrored onto `user.member_code`. */
  userId: string;
  /** The title they are being activated INTO. Omitted leaves it unchanged. */
  subRole?: string;
  /** Who did it — the audit quartet's `updated_by`. */
  actor: string;
  /**
   * The row as it stands now. Passed in rather than re-read so the caller's
   * own guards (last-owner, self-removal, role grants) decide against the same
   * snapshot this does.
   */
  current: {
    memberCode: string | null;
    firstActivatedAt: Date | string | null;
  };
};

export async function activateOrgMembership({
  kind,
  orgId,
  membershipId,
  userId,
  subRole,
  actor,
  current,
}: ActivateMembershipInput): Promise<void> {
  const table = kind === 'agency' ? AgencyUserTable : OutletUserTable;

  /*
   * STEP 1 and STEP 3 together, because they are one row. `first_activated_at`
   * is written ONLY when it is still null: a second activation is a RE-join,
   * and the first one is the fact that answers "were they ever a member".
   */
  await db
    .update(table)
    .set({
      status: 'active',
      ...(subRole ? { subRole } : {}),
      ...(current.firstActivatedAt ? {} : { firstActivatedAt: new Date() }),
      updatedAt: new Date(),
      updatedBy: actor,
    })
    .where(eq(table.id, membershipId));

  /*
   * STEP 2 — the real id, and ONLY over a placeholder.
   *
   * A returning former member keeps the id they were always known by: "an id
   * that can change is not an id", and theirs may already sit on a payment
   * voucher or in an email.
   *
   * `issueOrgMemberCode` rather than a bare `nextOrgMemberCode`, because the
   * number comes from a read-then-write: two owners approving at the same
   * instant would compute the same one, the unique index refuses the second,
   * and this retries it. Reading more carefully cannot make a read-then-write
   * safe.
   */
  if (isPendingOrgCode(current.memberCode)) {
    const issued = await issueOrgMemberCode(kind, orgId, async (code) => {
      await db
        .update(table)
        .set({ memberCode: code, updatedAt: new Date(), updatedBy: actor })
        .where(eq(table.id, membershipId));
      return code;
    });
    if (!issued) {
      /*
       * Loud, and NOT thrown. The person is already active — a throw here
       * would roll the caller into a 500 and leave them looking un-approved
       * while the row says otherwise. A missing id is repairable; a decision
       * that appears not to have registered is what an owner re-clicks.
       */
      logger.error(
        `[activateOrgMembership] could not issue a member id for ${kind} ${orgId} membership ${membershipId}`,
      );
    }
  }

  /*
   * The id is mirrored onto the account AFTER the mint, never before — running
   * it first would copy the placeholder onto `user.member_code`, where it is
   * final. Idempotent: an account already holding a real id keeps it.
   */
  await ensureAccountCodeFromMembership(userId);
}
