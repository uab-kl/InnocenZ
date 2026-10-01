/**
 * CAN PV DETAIL SHOW THE VOUCHER IT WAS OPENED WITH?
 *
 * The screen reads two lists — payment history (closed weeks) and last week's
 * pay (every agency's voucher for it) — and used to fall back to LAST WEEK's
 * voucher for an id in neither. A stale link (a notice about a voucher since
 * replaced, an id from another device) therefore opened a DIFFERENT document,
 * headed with its number and carrying a live Sign button, under the one the PR
 * had tapped.
 *
 * Now an id is only shown when a list actually holds it. Otherwise the screen
 * says which of three things is true — and "not found" only once both lists
 * have answered, because an absence read off a list that is still loading, or
 * that failed to load, is evidence about the read, not about the voucher.
 *
 * Pure, so the rule is unit-tested (`pv-lookup.test.ts`).
 */
export type PvLookup =
  /** A loaded list holds this id — show it. */
  | 'found'
  /** A list has not answered yet — say so, claim nothing. */
  | 'loading'
  /** Both answered and neither holds it — say it is not found. */
  | 'notFound'
  /** A list FAILED, so absence proves nothing — offer a retry. */
  | 'unavailable';

export function pvLookupState(input: {
  pvId: string;
  /** Payment history's voucher ids — NULL until its first read has settled. */
  historyIds: readonly string[] | null;
  historyFailed: boolean;
  /** Last week's voucher ids, every agency's — NULL until its read has settled. */
  lastWeekIds: readonly string[] | null;
  lastWeekFailed: boolean;
}): PvLookup {
  const { pvId, historyIds, lastWeekIds } = input;
  if (historyIds?.includes(pvId) || lastWeekIds?.includes(pvId)) return 'found';
  if (historyIds === null || lastWeekIds === null) return 'loading';
  if (input.historyFailed || input.lastWeekFailed) return 'unavailable';
  return 'notFound';
}
