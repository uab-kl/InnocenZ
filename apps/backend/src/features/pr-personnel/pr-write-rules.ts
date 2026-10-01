/**
 * Two PR-personnel decisions that used to be made by the OLDEST membership or
 * by whoever typed last (28 Sep 2026 audit, backend). Pure, so each rule is
 * unit-tested rather than probed with a write.
 */

/**
 * `POST /pr`'s refusal when a NEW stub would have no mobile number — the only
 * way a stub is ever claimed is the PR's own sign-up proving that number. The
 * web maps this exact sentence to its translation, so change both together.
 */
export const PR_MOBILE_REQUIRED =
  'A mobile number is required to add a new PR — it is how the PR claims the account at sign-up';

/** The identity half of `user_profile` a roster add may touch. */
export type IdentityPatch = { fullName?: string; idNo?: string };

const blank = (value: string | null | undefined): boolean => !value?.trim();

/**
 * What `POST /pr` may write to a person's legal name and IC number.
 *
 * It used to write both unconditionally — onto an EXISTING account matched by
 * the phone or email the agency typed. So agency B adding a PR who already
 * works for agency A rewrote her legal name to B's spelling, and, when B left
 * the IC blank, `ensureOpsBridge` then stored `id_no = NULL` over the IC she
 * had verified. Knowing somebody's phone number is not authority over their
 * identity document.
 *
 *  - A stub CREATED by this request takes what the agency typed: nothing else
 *    describes that person yet.
 *  - An existing account keeps what it has. A blank field may be filled — the
 *    agency is then the first to describe it — but a stored value is never
 *    overwritten, and never cleared. Corrections go through the editor
 *    (`PUT /pr/:id`), which names the membership it writes.
 */
export function identityPatchForAdd(input: {
  createdStub: boolean;
  stored: { fullName: string | null; idNo: string | null } | null;
  typed: { name: string; icNo?: string | null };
}): IdentityPatch {
  const name = input.typed.name.trim();
  const icNo = input.typed.icNo?.trim() || '';
  const patch: IdentityPatch = {};
  if (input.createdStub) {
    if (name) patch.fullName = name;
    if (icNo) patch.idNo = icNo;
    return patch;
  }
  if (name && blank(input.stored?.fullName)) patch.fullName = name;
  if (icNo && blank(input.stored?.idNo)) patch.idNo = icNo;
  return patch;
}

/**
 * WHOSE penalty rules `GET /pr/mine/penalty-rules` serves.
 *
 * It used to answer with the OLDEST membership's rules — so a PR on two rosters
 * was shown agency A's cancellation bands on the Cancel button of a shift from
 * agency B, while the server charged B's (`shift-assignment` prices a cancel by
 * the ASSIGNMENT's agency). A preview priced by one agency and a charge by
 * another is a wrong number on the button that costs money.
 *
 *  - `requested` given: that agency, and only if the caller is an approved PR of
 *    it — anything else is `null` (the caller answers 404, never another
 *    agency's schedule).
 *  - nothing requested: EVERY agency she works for. Each rule row carries its
 *    own `agencyId`, so a client picks the one behind the shift; oldest first,
 *    so a client that has not learned to pick still reads what it read before.
 */
export function penaltyRuleAgencyIds(
  approvedAgencyIds: readonly string[],
  requested: string | null | undefined,
): string[] | null {
  if (requested == null || requested === '') return [...approvedAgencyIds];
  return approvedAgencyIds.includes(requested) ? [requested] : null;
}
