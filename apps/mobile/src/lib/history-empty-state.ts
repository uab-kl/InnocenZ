/**
 * Which sentence History's shift list shows when it has nothing to show.
 *
 * Pure, so the rule is tested rather than eyeballed — the bug it fixes was a
 * single `else` that answered every emptiness with "No shifts match these
 * filters" and a Reset button, including the commonest one of all: a PR with
 * no filter set and no shift yet this week. The live-week card above already
 * says "No shifts in this week", so she read two contradictory sentences and a
 * button that could do nothing.
 */
export type HistoryEmptyState =
  /** Say nothing here — shifts are shown, or the week card says it itself. */
  | 'none'
  /** A filter hid everything — the only case Reset can fix. */
  | 'noShiftsMatch'
  /** No voucher has ever been issued, so there are no payroll weeks at all. */
  | 'noPayrollWeeksYet'
  /** Payroll weeks exist, but none of them carries a shift (a fee-only week). */
  | 'noPayrollShiftsYet';

export function historyEmptyState(input: {
  shownCount: number;
  weekTab: 'current' | 'payroll';
  hasAnyPayrollWeek: boolean;
  filtersActive: boolean;
}): HistoryEmptyState {
  if (input.shownCount > 0) return 'none';
  // No voucher ever: the truest answer whatever the filters say — a Reset
  // could not conjure a payroll week.
  if (input.weekTab === 'payroll' && !input.hasAnyPayrollWeek) return 'noPayrollWeeksYet';
  if (input.filtersActive) return 'noShiftsMatch';
  // The live week's card is drawn even when empty, and says so in its body.
  if (input.weekTab === 'current') return 'none';
  return 'noPayrollShiftsYet';
}

/**
 * Whether any filter is narrowing the list. Trimmed like the search itself: a
 * query of spaces filters nothing, so it must not count as a filter either.
 */
export function historyFiltersActive(filters: {
  query: string;
  outlet: string;
  status: string;
  date: string;
}): boolean {
  return (
    filters.query.trim() !== '' ||
    filters.outlet !== 'all' ||
    filters.status !== 'any' ||
    filters.date !== ''
  );
}
