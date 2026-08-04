/**
 * Decides whether a membership change may proceed, for BOTH agency and outlet.
 *
 * Membership is identity on this platform: an `agency_user` / `outlet_user` row
 * is what every sub-role guard reads to decide who a caller is. Handing those
 * writes to org owners (rather than admin alone) therefore needs two questions
 * answered on every call, and they are different questions:
 *
 *   1. Is the member you named actually IN the organisation you addressed?
 *      Checked at the call site, because it needs a repository read. The route
 *      scope guard cannot answer it: the scope is checked on `:id` while the
 *      mutation targets `:memberId`, so an owner passing their OWN org as `:id`
 *      and a FOREIGN member id would otherwise sail through. *A scope check on
 *      the wrong parameter is not a scope check.*
 *
 *   2. Would the change leave the organisation with no active owner? That is
 *      what this file answers.
 *
 * Deliberately NOT a rule here: an owner may promote anyone in their own org to
 * owner, including handing ownership away. That is tenancy, not escalation —
 * the scope guard already confines it to the org they own, and an organisation
 * that cannot appoint its own people is not self-serving.
 */

/** The subset of a membership row these rules need. Both org tables satisfy it. */
export interface MemberLike {
  id: string;
  subRole: string;
  status: string;
}

/** A field left out = unchanged. */
export interface MemberChange {
  subRole?: string;
  status?: string;
}

const ACTIVE = 'active';
const OWNER = 'owner';

const isActiveOwner = (m: MemberLike) => m.subRole === OWNER && m.status === ACTIVE;

/**
 * Returns a refusal message, or `null` when the change may proceed.
 *
 * `members` must be every membership row of the organisation, not a filtered
 * page — the count of remaining owners is the whole point, and a truncated list
 * would under-count and refuse a legal change (or, filtered the other way,
 * permit an illegal one).
 */
export function guardMemberChange(args: {
  members: readonly MemberLike[];
  target: MemberLike;
  /** Omit for a removal. */
  next?: MemberChange;
}): string | null {
  const { members, target, next } = args;

  // Only an ACTIVE OWNER can be the last one. Demoting a finance head, or
  // touching an already-inactive owner, can never strand the organisation.
  if (!isActiveOwner(target)) return null;

  const removing = next === undefined;
  const demoting = next?.subRole !== undefined && next.subRole !== OWNER;
  const deactivating = next?.status !== undefined && next.status !== ACTIVE;
  if (!removing && !demoting && !deactivating) return null;

  const otherActiveOwners = members.filter((m) => m.id !== target.id && isActiveOwner(m));
  if (otherActiveOwners.length > 0) return null;

  // No self-demotion carve-out is needed: "you are the last owner" already
  // covers an owner locking themselves out, and it ALSO covers one owner
  // locking out the last OTHER owner — which a self-check alone would miss.
  return removing
    ? 'Cannot remove the last active owner — appoint another owner first'
    : 'Cannot change the last active owner — appoint another owner first';
}
