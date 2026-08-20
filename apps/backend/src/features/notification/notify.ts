import { logger } from '@/util/logger.js';
import { DbTransaction } from '@/types/db-transaction.js';
import { NotificationRepositoryClass } from './notification.repository.js';
import { Notification, NotificationKind } from './notification.model.js';

const repository = new NotificationRepositoryClass();

/** Who raised it, for the audit columns. Not the recipient. */
const SYSTEM_ACTOR = 'system';

export interface NotifyInput {
  /** Recipient — a `user` id, not a pr/agency/outlet id. */
  userId: string;
  kind: NotificationKind;
  title: string;
  body?: string;
  payload?: Record<string, unknown>;
  /**
   * Pass the surrounding transaction when the notification only makes sense if
   * the parent write commits. Without it a rolled-back voucher still tells the
   * PR their voucher was issued.
   */
  tx?: DbTransaction;
  /** Defaults to 'system' — set it when a real user caused the notification. */
  actor?: string;
}

/**
 * Raise one notification.
 *
 * The single entry point every producer uses, so that when a real transport
 * (WhatsApp for PRs, email for agency/outlet) finally exists, it is added here
 * once instead of at every call site.
 *
 * **Never throws.** A notification is a side effect of something more important
 * — issuing a voucher, resolving a dispute — and must not be able to fail that
 * operation. Failures are logged and reported through the return value. The one
 * exception is a caller passing `tx`: inside a transaction the insert runs on the
 * caller's connection, so a genuine DB fault will still surface to them, which is
 * the correct behaviour when they have explicitly tied the two writes together.
 */
export async function notify(input: NotifyInput): Promise<Notification | null> {
  const actor = input.actor ?? SYSTEM_ACTOR;
  try {
    const row = await repository.create(
      {
        userId: input.userId,
        kind: input.kind,
        title: input.title,
        body: input.body,
        payload: input.payload,
        createdBy: actor,
        updatedBy: actor,
      },
      input.tx,
    );
    if (!row) {
      logger.error(`[notify] ${input.kind} for user ${input.userId} was not written`);
    }
    return row;
  } catch (error) {
    logger.error('[notify] Error:', error);
    return null;
  }
}

/**
 * Same thing for several recipients — an agency's members, a shift's PRs.
 *
 * Sequential rather than Promise.all: these run inside the caller's transaction
 * when one is passed, and a single connection cannot serve parallel statements.
 * The volumes here are a handful of rows, not a broadcast.
 */
export async function notifyMany(
  userIds: string[],
  input: Omit<NotifyInput, 'userId'>,
): Promise<number> {
  let written = 0;
  // Deduplicate: one person holding two memberships should not be told twice.
  for (const userId of [...new Set(userIds)]) {
    const row = await notify({ ...input, userId });
    if (row) written += 1;
  }
  return written;
}

/**
 * The opposite of raising one: what was asked for has happened.
 *
 * Lives beside `notify` deliberately. A producer that can raise a call to action
 * needs somewhere obvious to retire it, and having nowhere is how
 * `shift_cover_needed` came to be raised on every cancel and retired by nothing —
 * an agency that re-staffed the PR still carried an unread notice telling them to
 * find a replacement they had already found.
 *
 * **Never throws**, the same contract as `notify`: retiring a prompt must not be
 * able to fail the re-staffing that earned it.
 */
export async function resolveCoverNeeded(
  assignmentId: string,
  actor: string = SYSTEM_ACTOR,
): Promise<number> {
  try {
    return await repository.resolveCoverNeeded(assignmentId, actor);
  } catch (error) {
    logger.error('[resolveCoverNeeded] Error:', error);
    return 0;
  }
}

/**
 * Retire the prompt when a DIFFERENT PR filled the seat.
 *
 * The caller must have established that the shift is no longer short — see the
 * repository method, which explains why retiring early is worse than retiring
 * late. Never throws, same as the rest of this module.
 */
export async function resolveCoverNeededForShift(
  shiftId: string,
  actor: string = SYSTEM_ACTOR,
): Promise<number> {
  try {
    return await repository.resolveCoverNeededForShift(shiftId, actor);
  } catch (error) {
    logger.error('[resolveCoverNeededForShift] Error:', error);
    return 0;
  }
}
