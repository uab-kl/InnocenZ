import type { AgencyMemberRepositoryClass } from '@/features/agency/agency-member.repository';
import { notifyMany } from '@/features/notification/notify.js';
import type { OutletRepositoryClass } from '@/features/outlet/outlet.repository';
import { logger } from '@/util/logger';
import type { ShiftType } from './shift.model';
import type { PreparedShiftPost } from './shift-post-check';
import type { ShiftRepositoryClass } from './shift.repository';

/**
 * WHO HEARS ABOUT A SHIFT BEING POSTED OR WITHDRAWN.
 *
 * Moved out of shift.controller.ts unchanged (30 Sep 2026). Every announcement
 * here goes out AFTER the write it describes has been answered, and none of
 * them can turn a post or a withdrawal that succeeded into one that failed.
 */
export type ShiftNotificationDeps = {
  agencyMemberRepository: Pick<AgencyMemberRepositoryClass, 'listByAgency'>;
  outletRepository: Pick<OutletRepositoryClass, 'getById'>;
  shiftRepository: Pick<ShiftRepositoryClass, 'listAgencyIdsForShifts'>;
};

/**
 * Announce freshly written shifts to their invited agencies — one
 * `notifyShiftPosted` per shift, the same for a single post and a batch.
 *
 * AFTER the response on purpose: the shifts are already written, the venue
 * must not wait on a notification fan-out, and a bell that fails must not
 * read as a post that failed. One shift at a time rather than all at once, so
 * a month posted in one go does not queue thirty fan-outs on the pool
 * together; a failure is logged and the next shift is still announced.
 */
export function notifyPostedAfterCommit(
  deps: ShiftNotificationDeps,
  posted: readonly { post: PreparedShiftPost; shift: ShiftType }[],
  actor: string,
  caller: 'create' | 'createBatch',
): void {
  void (async () => {
    for (const { post, shift } of posted) {
      await notifyShiftPosted(deps, {
        shift: {
          id: shift.id,
          shiftDate: shift.shiftDate,
          slot: shift.slot ?? null,
          eventName: shift.eventName ?? null,
          quantity: shift.quantity,
        },
        outletId: post.row.outletId,
        agencyIds: post.notifyAgencyIds,
        actor,
      }).catch((error) => {
        logger.error(`[ShiftController.${caller}] notify Error:`, error);
      });
    }
  })();
}

/**
 * Tell the invited agencies that a venue has just asked for staff.
 *
 * Posting used to be SILENT on the agency's end. The shift reached them only
 * when somebody happened to open the roster and a 30-second-stale query
 * refetched, so the venue pressed Post and then had no way to know whether
 * anyone had seen it. Withdrawal notified; creation did not — the half that
 * takes work off the table was announced and the half that puts work on it was
 * not.
 *
 * Reuses `shift_cover_needed` rather than adding a `shift_posted` kind. That
 * kind is already AGENCY-addressed and already means "seats need filling",
 * which is exactly true here — only the cause differs (a new post rather than
 * a dropout). Same reasoning `notifyShiftWithdrawn` gives just below for
 * reusing `shift_cancelled`, and it avoids a `notification_kind` enum
 * migration on a shared database. If the two ever need filtering apart, a
 * dedicated kind is the fix and it costs one hand-authored migration.
 *
 * ⚠️ Names the VENUE but never another agency. On a shared shift several
 * agencies are invited at once, and each one is told only that the venue is
 * asking — never who else was asked. Same rule as the busy flag: an agency
 * learns WHAT it can act on, never who it is competing with.
 *
 * Never throws: the shift IS created, and a failed notification must not be
 * reported to the outlet as a failed post.
 */
export async function notifyShiftPosted(
  deps: ShiftNotificationDeps,
  input: {
    shift: { id: string; shiftDate: string; slot: string | null; eventName: string | null; quantity: number };
    outletId: string;
    agencyIds: string[];
    actor: string;
  },
): Promise<void> {
  const { shift, outletId, agencyIds, actor } = input;
  if (agencyIds.length === 0) return;

  const outlet = await deps.outletRepository.getById(outletId);
  const where = outlet?.name ?? 'A venue';
  const when = `${shift.shiftDate}${shift.slot ? ` · ${shift.slot}` : ''}`;

  const memberLists = await Promise.all(
    agencyIds.map((agencyId) => deps.agencyMemberRepository.listByAgency(agencyId)),
  );
  // Deduped: one person can hold a membership at more than one invited agency
  // and must not be told twice about a single shift.
  const recipients = [
    ...new Set(
      memberLists
        .flat()
        .filter((m) => m.status === 'active')
        .map((m) => m.userId),
    ),
  ];
  if (recipients.length === 0) return;

  await notifyMany(recipients, {
    kind: 'shift_cover_needed',
    title: `New shift — ${where}`,
    body: `${where} posted a shift on ${when}${
      shift.eventName ? ` (${shift.eventName})` : ''
    } and needs ${shift.quantity} PR${shift.quantity === 1 ? '' : 's'}.`,
    payload: {
      shiftId: shift.id,
      shiftDate: shift.shiftDate,
      outletName: outlet?.name ?? null,
      posted: true,
    },
    actor,
  });
}

/**
 * Tell everyone a withdrawn shift mattered to: the PRs who were booked on it,
 * and the agency that staffed it.
 *
 * Both use the existing `shift_cancelled` kind. That kind names the EVENT — a
 * shift that was on is now off — which is exactly true for both audiences, and
 * it avoids a `notification_kind` enum migration on a shared database for a
 * message that reads identically. If these two ever need to be filtered apart
 * (a PR-only inbox, say), a dedicated `shift_withdrawn` kind is the fix, and it
 * costs one hand-authored migration.
 *
 * Never throws: the shift is already gone, and a failed notification must not
 * be reported to the outlet as a failed withdrawal.
 */
export async function notifyShiftWithdrawn(
  deps: ShiftNotificationDeps,
  input: {
    shift: { id: string; agencyId: string; shiftDate: string; slot: string | null; eventName: string | null };
    outletName: string | null;
    affected: { prId: string; userId: string | null }[];
    actor: string;
  },
): Promise<void> {
  const { shift, outletName, affected, actor } = input;
  const where = outletName ?? 'the venue';
  const when = `${shift.shiftDate}${shift.slot ? ` · ${shift.slot}` : ''}`;
  const payload = {
    shiftId: shift.id,
    shiftDate: shift.shiftDate,
    outletName,
    withdrawn: true,
  };

  // `shift_assignment.pr_id` IS the user id after 0089, so `userId` and `prId`
  // are the same value; prefer the explicit column and fall back.
  const prRecipients = [
    ...new Set(affected.map((a) => a.userId ?? a.prId).filter(Boolean)),
  ] as string[];
  if (prRecipients.length > 0) {
    await notifyMany(prRecipients, {
      kind: 'shift_cancelled',
      title: 'A shift was withdrawn',
      body: `${where} withdrew the shift on ${when}. You are no longer booked for it.`,
      payload,
      actor,
    });
  }

  // EVERY invited agency, not just the anchor (0124).
  //
  // The PRs above are notified from `shift_assignment`, so they already hear
  // about this correctly. Reading `shift.agencyId` here meant that on a shared
  // shift the other agencies' PRs were told their booking had gone while the
  // agencies that rostered them were told nothing — the worst possible split,
  // because the first the agency learns of it is a PR asking why.
  const invited =
    (await deps.shiftRepository.listAgencyIdsForShifts([shift.id])).get(shift.id) ??
    [shift.agencyId];
  const memberLists = await Promise.all(
    invited.map((agencyId) => deps.agencyMemberRepository.listByAgency(agencyId)),
  );
  // Deduped: one person can hold a membership at more than one of the invited
  // agencies, and they should not get the same withdrawal twice.
  const agencyRecipients = [
    ...new Set(
      memberLists
        .flat()
        .filter((m) => m.status === 'active')
        .map((m) => m.userId),
    ),
  ];
  if (agencyRecipients.length === 0) return;
  await notifyMany(agencyRecipients, {
    kind: 'shift_cancelled',
    title: `Shift withdrawn — ${where}`,
    body:
      affected.length > 0
        ? `${where} withdrew the shift on ${when}. ${affected.length} booked PR${affected.length === 1 ? ' was' : 's were'} released and notified.`
        : `${where} withdrew the shift on ${when}. Nobody was booked on it.`,
    payload: { ...payload, releasedCount: affected.length },
    actor,
  });
}
