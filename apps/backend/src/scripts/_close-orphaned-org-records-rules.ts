/**
 * The pure half of `_close-orphaned-org-records.ts`: what to do with each row
 * that names an organisation which no longer exists. Tested by calling it with
 * rows, never by running the script against the shared database.
 */
import { AWAITING_ANSWER } from '@/features/admin-request/admin-request.repository';
import { LIVE_MEMBER_SUBSCRIPTION_STATUSES } from '@/features/member-subscription/member-subscription.model';

export type OrphanTable = 'admin_request' | 'member_subscription';

export type OrphanRow = {
  table: OrphanTable;
  id: string;
  status: string;
  orgType: string;
  orgId: string;
};

export type OrphanAction =
  /** admin_request still waiting on an answer → 'declined', with a system note. */
  | 'decline'
  /** member_subscription still live → 'cancelled', `ended_at` stamped. */
  | 'cancel'
  /** Already answered / already ended — history, left exactly as it is. */
  | 'leave';

export function orphanAction(
  row: Pick<OrphanRow, 'table' | 'status'>,
): OrphanAction {
  if (row.table === 'admin_request') {
    // AWAITING_ANSWER — the one definition of "still waiting" the inbox and the
    // tier job share; a request an admin already answered is history.
    return (AWAITING_ANSWER as readonly string[]).includes(row.status)
      ? 'decline'
      : 'leave';
  }
  return (LIVE_MEMBER_SUBSCRIPTION_STATUSES as readonly string[]).includes(
    row.status,
  )
    ? 'cancel'
    : 'leave';
}

/** The system note a closed request carries in `remarks`, so an admin reading it later knows why. */
export function orphanNote(day: string): string {
  return `[System ${day}] Closed: the organisation this request was filed for no longer exists.`;
}

/**
 * Append the note to whatever an admin already wrote — never overwrite it — and
 * add nothing when it is already there, so a second run leaves the text as is.
 */
export function appendRemark(existing: string | null, note: string): string {
  const current = (existing ?? '').trim();
  if (current.includes(note)) return current;
  return current ? `${current}\n${note}` : note;
}

export type OrphanPlan = {
  decline: OrphanRow[];
  cancel: OrphanRow[];
  leave: OrphanRow[];
};

export function planOrphans(rows: readonly OrphanRow[]): OrphanPlan {
  const plan: OrphanPlan = { decline: [], cancel: [], leave: [] };
  for (const row of rows) plan[orphanAction(row)].push(row);
  return plan;
}
