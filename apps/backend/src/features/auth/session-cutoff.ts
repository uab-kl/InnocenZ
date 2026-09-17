/**
 * Is this token older than the last time the account's sessions were cut?
 *
 * A pure function with its own tests, because the two edge cases decide whether
 * this feature is a security fix or an outage:
 *
 *  • `iat` has SECOND precision, so a token minted in the same second as the
 *    password change compares EQUAL. Refusing on equal would log people out
 *    with the very token they were just issued.
 *  • A token with no `iat` cannot be dated, and an undatable token is LET
 *    THROUGH. Refusing it would sign out every holder of a token minted before
 *    this shipped — turning a fix into a platform-wide logout.
 *
 * ⚠️ BOTH SIDES ARE COMPARED IN WHOLE SECONDS. The cutoff used to be stored
 * with milliseconds while `iat` has none, so a cutoff of 10:00:00.700 against a
 * token minted a moment LATER, at 10:00:00.900, read as `10:00:00.000 <
 * 10:00:00.700` — the fresh token re-issued by the very change that stamped the
 * cutoff was refused as old. Every stamp is floored now (`floorToSecond`), and
 * this comparison floors too, so a cutoff written before that change is judged
 * the same way.
 *
 * Inline in the middleware it was three `&&`s that nothing could exercise.
 */
export function isTokenBeforeCutoff(
  issuedAt: Date | null | undefined,
  cutoff: Date | null | undefined,
): boolean {
  if (!cutoff) return false;
  if (!issuedAt) return false;
  return Math.floor(issuedAt.getTime() / 1000) < Math.floor(cutoff.getTime() / 1000);
}

/**
 * The moment to stamp into `user.sessions_valid_from`: now, floored to the
 * whole second, because `iat` — the thing it is compared against — has no
 * milliseconds. Every writer of that column goes through this.
 */
export function floorToSecond(date: Date = new Date()): Date {
  return new Date(Math.floor(date.getTime() / 1000) * 1000);
}
