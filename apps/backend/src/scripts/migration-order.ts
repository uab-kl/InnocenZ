/**
 * WHICH MIGRATIONS DRIZZLE WOULD SILENTLY SKIP.
 *
 * drizzle's migrator does not compare hashes. It reads the NEWEST ledger row's
 * `created_at` and applies only journal entries whose `when` is later —
 * everything at or below that stamp is treated as done, and it still prints
 * "migrations applied successfully!". On 28 Sep 2026 the shared database's
 * ledger ran to 2026-10-23 (37 rows stamped in the future, from hand-authored
 * `when` values), so a migration written today with today's stamp would have
 * been skipped without a word — the `migrate:deploy` trap CLAUDE.md warns of.
 *
 * Identity is the `when` stamp, NOT the file hash: drizzle writes
 * `created_at = when`, while 132 of 167 migration files no longer hash the way
 * they did when applied (line endings, later edits). A hash comparison would
 * call almost every applied migration "pending".
 *
 * Pure, so the rule is unit-tested; `check-migration-order.ts` is the CLI that
 * feeds it the journal and the ledger and fails `migrate:deploy` loudly.
 */

export type JournalEntry = { tag: string; when: number };

/**
 * Journal entries applied under a stamp that is no longer in the journal —
 * verified live, so they must not read as "pending". Keep this list short and
 * say why for each; a new entry here is a claim that someone checked the DB.
 */
export const KNOWN_RESTAMPED: ReadonlySet<string> = new Set([
  // Its objects (overtime columns, payment_voucher.bank_ref) are live and in
  // use; its `when` was re-stamped after it was applied.
  '0077_overtime_approval_and_bank',
]);

/** Entries not in the ledger whose stamp is too old for drizzle to run them. */
export function migrationsThatWouldBeSkipped(
  journal: readonly JournalEntry[],
  ledgerCreatedAt: readonly number[],
  knownRestamped: ReadonlySet<string> = KNOWN_RESTAMPED,
): JournalEntry[] {
  if (ledgerCreatedAt.length === 0) return [];
  const applied = new Set(ledgerCreatedAt);
  const newest = Math.max(...ledgerCreatedAt);
  return journal.filter(
    (e) => !applied.has(e.when) && !knownRestamped.has(e.tag) && e.when <= newest,
  );
}

/** Entries drizzle WILL run on the next migrate (not in the ledger, stamped later). */
export function migrationsThatWillRun(
  journal: readonly JournalEntry[],
  ledgerCreatedAt: readonly number[],
): JournalEntry[] {
  const applied = new Set(ledgerCreatedAt);
  const newest = ledgerCreatedAt.length ? Math.max(...ledgerCreatedAt) : -Infinity;
  return journal.filter((e) => !applied.has(e.when) && e.when > newest);
}

/**
 * The smallest `when` a NEW migration may carry: after every ledger row and
 * every journal entry, and never before now. Whole seconds, like the journal.
 */
export function nextSafeWhen(
  journal: readonly JournalEntry[],
  ledgerCreatedAt: readonly number[],
  now: number = Date.now(),
): number {
  const latest = Math.max(now, ...journal.map((e) => e.when), ...ledgerCreatedAt);
  return (Math.floor(latest / 1000) + 1) * 1000;
}
