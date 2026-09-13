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
 * Inline in the middleware it was three `&&`s that nothing could exercise.
 */
export function isTokenBeforeCutoff(
  issuedAt: Date | null | undefined,
  cutoff: Date | null | undefined,
): boolean {
  if (!cutoff) return false;
  if (!issuedAt) return false;
  return issuedAt.getTime() < cutoff.getTime();
}
