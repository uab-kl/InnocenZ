/**
 * The bell's number, and whether the awaiting-PV stand-in still earns a row.
 *
 * Pure — the TopBar owns the fetching; these decide what it shows.
 */

type BadgeRow = { id: string; readAt: string | null };

/**
 * How many notifications are unread, for the badge.
 *
 * ⚠️ THE SERVER'S COUNT, not the page's. The bell loads the newest 50 rows, and
 * counting the unread among THOSE is what froze the badge at 50 for a PR with
 * 64 unread (`innocenz-test`, 28 Sep 2026) — and, after "Mark all read" cleared
 * the page, hid the rest behind a badge of 0 with nothing on screen to tap.
 *
 * Rows this device has just marked read are taken off the server's figure until
 * the next fetch recounts them; the loaded page's own unread rows are a floor,
 * in case the count was read before a new row arrived. `serverUnread: null`
 * (not fetched yet, or it failed) falls back to the page, which is what the
 * badge always showed.
 */
export function unreadBadgeCount(input: {
  serverUnread: number | null;
  rows: readonly BadgeRow[];
  locallyRead: readonly string[];
  /** Unread rows that live on this device only — the awaiting-PV stand-in. */
  derivedUnread: number;
}): number {
  const readHere = new Set(input.locallyRead);
  const unreadOnPage = input.rows.filter((r) => r.readAt === null);
  const stillUnread = unreadOnPage.filter((r) => !readHere.has(r.id)).length;
  const derived = Math.max(0, input.derivedUnread);
  if (input.serverUnread === null) return stillUnread + derived;
  const justRead = unreadOnPage.length - stillUnread;
  return Math.max(stillUnread, input.serverUnread - justRead) + derived;
}

/** The badge's text — nothing at 0, and a phone-sized cap past 99. */
export function badgeLabel(count: number): string | null {
  if (!Number.isFinite(count) || count <= 0) return null;
  return count > 99 ? '99+' : String(Math.floor(count));
}

/**
 * Whether the awaiting-PV stand-in duplicates a real row.
 *
 * It covers for `payment_voucher_issued`, so a real row for THE SAME voucher
 * replaces it. Keyed on the voucher: hiding the stand-in whenever ANY issued row
 * existed meant last month's notice silenced this week's "review & sign" nudge.
 * An issued row naming no voucher at all cannot be told apart, so it still
 * counts as cover — two copies of one prompt is the failure this avoids.
 */
export function realRowCoversVoucher(
  rows: readonly { kind: string; payload: Record<string, unknown> | null }[],
  voucherId: string,
): boolean {
  return rows.some((r) => {
    if (r.kind !== 'payment_voucher_issued') return false;
    const named = r.payload?.voucherId;
    return typeof named !== 'string' || named === voucherId;
  });
}
