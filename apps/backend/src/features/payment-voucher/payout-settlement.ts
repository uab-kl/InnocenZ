import type { PayoutItemStatus } from './payout-batch.model';

/**
 * THE RULES OF SETTLING A RUN, with no database attached.
 *
 * These lived inside `PayoutBatchRepository.settle`, wrapped in a transaction,
 * which meant the only way to ask "is 57-paid-2-failed a finished batch?" was
 * to write 59 rows to a shared database. No backend test in this repo touches a
 * database, so in practice the rules were never asked at all.
 *
 * The DATABASE stays the authority on what actually changed — the guarded
 * `WHERE status = 'signed'` update is still what protects a voucher. What moved
 * here is the decision-making around it.
 */

/** A line the settle call is allowed to act on. */
export type SettlementItemView = {
  id: string;
  voucherId: string;
  status: PayoutItemStatus;
};

export type SettlementRequest = {
  itemId: string;
  status: Extract<PayoutItemStatus, 'paid' | 'failed' | 'returned' | 'sent'>;
};

/**
 * Statuses that mean a run has NOT finished.
 *
 * Everything else is terminal, including 'failed' and 'returned' — a bounced
 * payment is a settled fact, not an outstanding one.
 */
export const IN_FLIGHT_ITEM_STATUSES: readonly PayoutItemStatus[] = ['pending', 'sent'];

/**
 * A batch is settled when nothing is still in flight — NOT when everything
 * succeeded.
 *
 * 57 landed and 2 bounced is a FINISHED run with two visible failures. Calling
 * that anything other than settled would keep a completed run open forever, and
 * calling it 'failed' would hide 57 successful payments behind one red word.
 */
export function isBatchTerminal(itemStatuses: readonly PayoutItemStatus[]): boolean {
  if (itemStatuses.length === 0) return false;
  return !itemStatuses.some((s) => IN_FLIGHT_ITEM_STATUSES.includes(s));
}

/**
 * Only 'paid' asks a voucher to move. 'sent' is an acknowledgement; 'failed'
 * and 'returned' are the opposite of payment.
 */
export function settlementMarksPaid(status: SettlementRequest['status']): boolean {
  return status === 'paid';
}

/**
 * Split a settle request into lines that belong to this batch and lines that
 * do not.
 *
 * Unknown ids are REPORTED, never silently skipped: a bank response naming a
 * line we do not have means the file and the batch disagree, and quietly
 * settling the other 58 hides that. Duplicate ids in one payload collapse to
 * the last, so a response listing a line twice cannot double-apply.
 */
export function partitionSettlements(
  items: readonly SettlementItemView[],
  settlements: readonly SettlementRequest[],
): { applicable: SettlementRequest[]; unknownItemIds: string[] } {
  const known = new Set(items.map((i) => i.id));
  const byId = new Map<string, SettlementRequest>();
  const unknownItemIds: string[] = [];
  for (const s of settlements) {
    if (!known.has(s.itemId)) {
      if (!unknownItemIds.includes(s.itemId)) unknownItemIds.push(s.itemId);
      continue;
    }
    byId.set(s.itemId, s);
  }
  return { applicable: [...byId.values()], unknownItemIds };
}

/**
 * What the batch's item statuses WOULD be once these settlements land.
 *
 * Used to answer "does this call finish the run?" without a second round trip.
 * The repository still re-reads the real statuses afterwards — this is for
 * reasoning and for tests, not a substitute for the database.
 */
export function projectItemStatuses(
  items: readonly SettlementItemView[],
  settlements: readonly SettlementRequest[],
): PayoutItemStatus[] {
  const { applicable } = partitionSettlements(items, settlements);
  const next = new Map(applicable.map((s) => [s.itemId, s.status]));
  return items.map((i) => next.get(i.id) ?? i.status);
}

/**
 * Which vouchers this settle call will ASK to move signed -> paid.
 *
 * "Ask", not "will move": the repository's UPDATE carries
 * `WHERE status = 'signed'`, so a voucher that is pending, disputed or already
 * paid simply does not match and no bell is rung for it. That guard is
 * deliberately NOT duplicated here — a pure function cannot know a voucher's
 * current status, and pretending it can is how two copies of one rule drift.
 */
export function voucherPayCandidates(
  items: readonly SettlementItemView[],
  settlements: readonly SettlementRequest[],
): string[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const { applicable } = partitionSettlements(items, settlements);
  const out: string[] = [];
  for (const s of applicable) {
    if (!settlementMarksPaid(s.status)) continue;
    const voucherId = byId.get(s.itemId)?.voucherId;
    if (voucherId && !out.includes(voucherId)) out.push(voucherId);
  }
  return out;
}
