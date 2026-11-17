/**
 * WHICH COLUMN THE VOUCHER LIST IS ORDERED BY, parsed from the query string.
 *
 * The list is PAGINATED by the server, and its order was hardcoded in SQL
 * (`desc(weekStart), desc(createdAt)`). A console that sorted the ten rows it
 * had been handed would reorder one page of many while its header claimed to
 * have sorted the table — so the ordering is decided here, before `limit` and
 * `offset` choose which rows the page even contains.
 *
 * ⚠️ An unrecognised field returns `null`, meaning "keep the default order".
 * That is SAFE, and is deliberately not the call made for the module portal
 * filter, which sends `__none__` rather than fall back: a filter that falls
 * back answers a narrowed question with every row, while a bad SORT only
 * reorders rows the reader was going to get anyway. Nothing appears or
 * disappears either way.
 *
 * Pure and dependency-free, so every branch is tested without a database.
 */
export const VOUCHER_SORT_FIELDS = [
  'issuedDate',
  'createdAt',
  'weekStart',
  'net',
  'prName',
  'status',
] as const;

export type VoucherSortField = (typeof VOUCHER_SORT_FIELDS)[number];
export type SortDirection = 'asc' | 'desc';

export type VoucherSort = {
  field: VoucherSortField;
  direction: SortDirection;
};

function isSortField(value: unknown): value is VoucherSortField {
  return (
    typeof value === 'string' &&
    (VOUCHER_SORT_FIELDS as readonly string[]).includes(value)
  );
}

/**
 * ⚠️ A WHITELIST, not a cast. `sortBy` arrives from the query string and the
 * repository turns the chosen field into an ORDER BY. Letting an arbitrary
 * string through would hand a caller control of that clause.
 *
 * `direction` defaults to `desc`: every date column on this screen is read
 * newest-first, and the one lane that missed that default opened the admin
 * inbox on the oldest voucher on the platform.
 */
export function parseVoucherSort(
  sortBy: unknown,
  sortDirection: unknown,
): VoucherSort | null {
  if (!isSortField(sortBy)) return null;
  const direction: SortDirection =
    typeof sortDirection === 'string' && sortDirection.toLowerCase() === 'asc'
      ? 'asc'
      : 'desc';
  return { field: sortBy, direction };
}
