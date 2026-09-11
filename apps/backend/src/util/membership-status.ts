/**
 * THE FOUR WORDS A MEMBERSHIP ROW'S `status` MAY HOLD.
 *
 * ⚠️ `pending` and `rejected` describe a REQUEST; `active` and `inactive`
 * describe a MEMBERSHIP. The distinction is the whole point (0162):
 *
 *   pending   asked to join; nobody has answered yet
 *   active    on the team
 *   rejected  asked and was turned down — NEVER a member, so this person does
 *             not belong on the organisation's roster at all
 *   inactive  WAS a member and the owner removed them — real history, and they
 *             stay on the roster marked inactive
 *
 * Declining and removing used to write the same word, which is how a declined
 * applicant ended up inside "TEAM · 6 MEMBER(S)".
 *
 * The database does not enforce this — both columns are a free `varchar(50)`
 * with no CHECK constraint — so this list and the zod enums built from it are
 * the only thing standing between a typo and a value that reads as "not
 * active" everywhere while meaning nothing.
 */
export const MEMBERSHIP_STATUSES = [
  'pending',
  'active',
  'rejected',
  'inactive',
] as const;

export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

/**
 * Which word a REMOVAL should write, given what the row is now.
 *
 * ⚠️ Decline and Remove are the SAME HTTP call — the Decline button and the
 * Team screen's Remove button both fire `DELETE /:id/members/:memberId` — so
 * the repository, which sees only an id and an actor, cannot tell them apart.
 * The controller can, because it has already loaded the row: a membership that
 * has never been anything but `pending` was never a member, so removing it is
 * a DECLINE. Anything else was on the team, so removing it is a DEACTIVATION.
 *
 * Deriving it from the row rather than trusting a flag from the client means
 * the two buttons cannot disagree, and a client that knows nothing about this
 * still produces the right word.
 */
export function removalStatusFor(current: string): MembershipStatus {
  return current === 'pending' ? 'rejected' : 'inactive';
}
