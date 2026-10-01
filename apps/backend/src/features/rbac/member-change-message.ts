import { portalRoleNameForSubRole } from '@/features/rbac/portal-role-map';

/**
 * WHAT A MEMBER WRITE SAYS IT DID — the sentence the portal shows verbatim.
 *
 * Owner's standing rule: every agency action confirms, in the server's own
 * words. `PUT` and `DELETE /:id/members/:memberId` answered "Member updated" and
 * "Member removed" whatever happened, so a reactivation, a promotion and a
 * removal all read the same — and the Approvals pane showed nothing at all.
 *
 * A leaf (one pure import) so the agency and outlet controllers share it.
 */

export type MemberUpdateFacts = {
  org: 'agency' | 'outlet';
  /** The row BEFORE the write. */
  previousStatus: string;
  previousSubRole: string;
  /** Has this membership ever been active? `first_activated_at` (0163). */
  wasMember: boolean;
  /** What the request asked for — absent means "not changed". */
  nextStatus?: string | null;
  nextSubRole?: string | null;
};

export function memberUpdateMessage(facts: MemberUpdateFacts): string {
  const { org, previousStatus, previousSubRole, wasMember } = facts;
  const nextStatus = facts.nextStatus ?? undefined;
  const nextSubRole = facts.nextSubRole ?? undefined;
  const role = portalRoleNameForSubRole(org, nextSubRole ?? previousSubRole);

  if (nextStatus === 'active' && previousStatus !== 'active') {
    // Somebody who was on the team is RESTORED; somebody who never was is
    // ADMITTED — the same distinction `removalStatusFor` draws on the way out.
    return wasMember
      ? `Member reactivated as ${role}.`
      : `Request approved — they join as ${role}.`;
  }
  if (nextStatus != null && nextStatus !== 'active' && previousStatus === 'active') {
    return 'Member deactivated — they no longer have access.';
  }
  if (nextSubRole != null && nextSubRole !== previousSubRole) {
    return `Role changed to ${role}.`;
  }
  return 'Member updated';
}

/** The DELETE's answer, from the status `removalStatusFor` chose. */
export function memberRemovalMessage(nextStatus: string): string {
  return nextStatus === 'rejected'
    ? 'Request declined — they were not added to the team.'
    : 'Member deactivated — they no longer have access.';
}
