/**
 * Where tapping a notification in the PR app goes — the ITEM it is about, not
 * merely a page. Until 29 Sep 2026 only a voucher opened anything: every other
 * row closed the bell and left the PR to go and find the shift, the MC/leave
 * decision or the overtime it described, while the bell's own hint promised
 * "tap to open the screen".
 *
 * Pure — no hooks, no navigation, no React Native — so every kind's rule is
 * unit-tested (`notification-targets.test.ts`). TopBar applies it to the rows
 * the server returns, against what the app has already loaded.
 *
 * ⚠️ THE SERVER'S KINDS ARE THE SOURCE OF TRUTH. `SUBJECT` below is a Record
 * over `NotificationKind`, which mirrors the backend enum
 * (apps/backend/src/features/notification/notification.model.ts), so a kind
 * added there and mirrored in api.ts does not compile here until someone
 * decides what it opens. Each rule reads its PRODUCER's payload keys, named
 * beside it; nothing is matched on the English title or body.
 *
 * ⚠️ NO ITEM, NO TRIP. `null` means "stay on the notifications list": the bell
 * marks the row read and keeps the sheet open. Navigating to a page that cannot
 * show the thing is worse than staying put — the row is spent, and the PR is
 * left hunting for something the app already knew was not there.
 */
import type { NotificationKind, NotificationRecord } from './api';

/** What a notification is ABOUT, read off the server's kind and payload. */
export type NotificationSubject =
  /** One payment voucher (`payload.voucherId`). */
  | { type: 'voucher'; voucherId: string }
  /** One shift assignment. `shiftDate` only when the producer sends it. */
  | { type: 'assignment'; assignmentId: string; shiftDate: string | null }
  /** Overtime on one assignment — money that lands on that week's voucher. */
  | { type: 'overtime'; assignmentId: string | null; shiftDate: string | null }
  /** An outlet-swap request, answered in the app before the shift starts. */
  | { type: 'swap'; swapId: string }
  /** A decision on this PR's agency membership — a join or a departure. */
  | { type: 'membership' };

/** A place in the app that can SHOW the subject. */
export type NotificationDestination =
  /** PV detail — a CLOSED week's voucher (the only kind that screen can show). */
  | { to: 'pv'; pvId: string }
  /** Payment → This week: the open week, which PV detail cannot show. */
  | { to: 'paymentThisWeek' }
  /**
   * Shifts → Agency Schedule, with that day's sheet open. `assignmentId` names
   * the booking the notice is about, so the sheet can SAY it is gone when it
   * was removed after the notice — instead of opening on a bare month.
   */
  | { to: 'scheduleDay'; dateIso: string; assignmentId?: string }
  /** Shifts → To-do, where a swap request is accepted or declined. */
  | { to: 'swapRequests'; swapId?: string }
  /** Profile — the PR's agencies and where each membership stands. */
  | { to: 'profile' };

/**
 * Why a notice that IS about something still opens nothing — said in the bell
 * as one short line, instead of a tap that silently does nothing (or, as the
 * swap notice did, a trip to an empty To-do).
 */
export type NotificationStayReason =
  /** The PR already accepted this swap. */
  | 'swapAccepted'
  /** The PR already declined it. */
  | 'swapDeclined'
  /** The agency withdrew it before the PR answered. */
  | 'swapWithdrawn'
  /** Not on the PR's list at all — deleted with its shift or booking. */
  | 'swapClosed';

/** What the app has already loaded. A destination is only as good as this. */
export type DestinationContext = {
  /**
   * `/shift-assignment/mine` — EVERY status, cancelled and MC/leave rows
   * included (the schedule's day sheet lists them all).
   */
  assignments: ReadonlyArray<{
    id: string;
    shiftDate: string;
    agencyId?: string | null;
  }>;
  /** The open week (`usePrEarnings().current`), or null before it loads. */
  thisWeek: {
    weekStart: string;
    weekEnd: string;
    /** Every voucher in the week — one per agency since 0129. */
    voucherIds: readonly string[];
  } | null;
  /**
   * CLOSED weeks' vouchers (payment history). NULL while unknown — still
   * loading, failed, or not fetched yet — and a voucher id is then trusted
   * as it came, rather than refused for missing from a list that has not
   * arrived.
   */
  closedVouchers: ReadonlyArray<{
    voucherId: string;
    agencyId?: string | null;
    weekStart: string | null;
    weekEnd: string | null;
  }> | null;
  /**
   * The PR's swap requests (`/outlet-swap/mine`) — EVERY status, because the
   * answered ones are exactly what a stale notice points at. NULL or absent
   * while unknown (not fetched, loading, failed): a swap notice is then trusted
   * as it came, and To-do re-reads on arrival.
   */
  swaps?: ReadonlyArray<{ id: string; status: string }> | null;
};

type Payload = Record<string, unknown>;

/** One kind's rule: the payload in, what it is about out (null = nothing). */
type SubjectRule = (payload: Payload) => NotificationSubject | null;

/** A non-empty string off the payload, or null. */
function text(payload: Payload, key: string): string | null {
  const value = payload[key];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** 'YYYY-MM-DD' from a date or a timestamp string; null for anything else. */
function calendarDay(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const day = value.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

/** Is `day` inside [start, end]? Zero-padded ISO days compare as strings. */
function within(day: string, start: unknown, end: unknown): boolean {
  const from = calendarDay(start);
  const to = calendarDay(end);
  return !!from && !!to && day >= from && day <= to;
}

const voucher: SubjectRule = (p) => {
  const voucherId = text(p, 'voucherId');
  return voucherId ? { type: 'voucher', voucherId } : null;
};

const assignment: SubjectRule = (p) => {
  const assignmentId = text(p, 'assignmentId');
  return assignmentId
    ? { type: 'assignment', assignmentId, shiftDate: calendarDay(p.shiftDate) }
    : null;
};

const nothing: SubjectRule = () => null;

/**
 * TOTAL over the server's kinds — the compiler holds it to that. The comment on
 * each names the producer and the payload keys it writes.
 */
const SUBJECT: Record<NotificationKind, SubjectRule> = {
  // payment-voucher-issue.ts issuedNotice / paidNotice —
  // { voucherId, voucherNo, weekStart, weekEnd } and { voucherId, voucherNo, amount }.
  payment_voucher_issued: voucher,
  payment_voucher_paid: voucher,
  // payment-voucher.controller resolveDispute — { voucherId, disputeId, outcome }.
  // The claim is shown on its voucher's grid (the red / VERIFIED cells and the
  // tags on each receipt), which is where the PR raised it.
  payment_voucher_dispute_resolved: voucher,
  // shift-assignment.controller create — { assignmentId, shiftId, shiftDate }.
  shift_assigned: assignment,
  // Three producers share this kind. The venue WITHDRAWING the shift deletes
  // it and every booking on it (shift.controller notifyShiftWithdrawn,
  // `withdrawn: true`, no assignmentId) — there is nothing left to open. The
  // agency CANCELLING keeps the row as 'cancelled' and UNASSIGNING deletes it;
  // both send { assignmentId, shiftId }, and the destination step tells them
  // apart by looking the row up.
  shift_cancelled: (p) => (p.withdrawn === true ? null : assignment(p)),
  // cutlost.controller notifyOutcome — { requestId, assignmentId, shiftId, payAmount }.
  shift_released_early: assignment,
  // shift-assignment.controller approveLeave / rejectLeave —
  // { assignmentId, shiftId, decision }. The MC/leave lives on the assignment.
  leave_decided: assignment,
  // shift-assignment.controller notifyPrOvertimeDecided —
  // { assignmentId, decision, overtimeMinutes, shiftDate, amount }.
  overtime_decided: (p) => {
    const assignmentId = text(p, 'assignmentId');
    const shiftDate = calendarDay(p.shiftDate);
    return assignmentId || shiftDate
      ? { type: 'overtime', assignmentId, shiftDate }
      : null;
  },
  // agency.controller setAgencyPrApproval — { agencyId, userId, approveStatus };
  // pr.controller update — { prId, agencyId, userId, status }. Join accepted or
  // declined, departure approved or refused: all of it is the membership.
  agency_join_resolved: () => ({ type: 'membership' }),
  // An agency's own free-text notice carries only { agencyId } — nothing to
  // open (see the kind's note in notification.model.ts). outlet-swap.controller
  // reuses the kind for a swap request: { swapId, assignmentId, shiftDate }.
  agency_broadcast: (p) => {
    const swapId = text(p, 'swapId');
    return swapId ? { type: 'swap', swapId } : null;
  },
  // Written to AGENCY and OUTLET members only — never a PR's. Mapped so the
  // record stays total; a PR account that somehow holds one stays on the list.
  overtime_pending_approval: nothing,
  pr_rating_low: nothing,
  cutlost_requested: nothing,
  cutlost_decided: nothing,
  shift_cover_needed: nothing,
  pv_day_review_pending: nothing,
  leave_requested: nothing,
  subscription_tier_weekly: nothing,
  subscription_invoice_opened: nothing,
  subscription_autopay_failed: nothing,
};

/**
 * What one stored notification is about. A kind this build does not know yet
 * (the enum is extended by migrations, and a newer API can pair with an older
 * app) and a malformed payload both answer null — never a crash in the bell.
 */
export function notificationSubject(
  record: Pick<NotificationRecord, 'kind' | 'payload'>,
): NotificationSubject | null {
  // Typed as possibly missing on purpose: the Record is total over the kinds
  // THIS build knows, and the wire can carry one it does not.
  const rule: SubjectRule | undefined = SUBJECT[record.kind];
  if (!rule) return null;
  try {
    return rule(record.payload ?? {});
  } catch {
    return null;
  }
}

/**
 * A voucher opens where it can be READ. PV detail renders closed weeks only
 * (payment history and last week) and answers "not found" for any other id —
 * it used to fall back to LAST WEEK's voucher — so the open week's voucher must
 * go to Payment → This week instead, and an id that a LOADED history does not
 * hold opens nothing rather than a dead end.
 */
function voucherDestination(
  voucherId: string,
  ctx: DestinationContext,
): NotificationDestination | null {
  if (ctx.thisWeek?.voucherIds.includes(voucherId)) {
    return { to: 'paymentThisWeek' };
  }
  if (ctx.closedVouchers && !ctx.closedVouchers.some((v) => v.voucherId === voucherId)) {
    return null;
  }
  return { to: 'pv', pvId: voucherId };
}

/**
 * A shift opens on its DAY in the schedule — the sheet that lists every shift
 * on it with what happened to each (booked, cancelled, MC/leave, worked).
 *
 * The loaded row wins. A row that is not loaded is either NEWER than this
 * phone's list — only a fresh booking carries its day on the wire — or GONE:
 * unassigned after the notice was sent. This list cannot tell those apart, so
 * the day opens either way and the booking travels with it: the schedule
 * re-reads on arrival, and a booking still missing from the fresh list is said
 * to be gone on the day's own sheet. (It used to open the MONTH and nothing
 * else — which read as "the app lost my shift".) With no day to go on at all,
 * it stays on the list.
 */
function assignmentDestination(
  assignmentId: string,
  shiftDate: string | null,
  ctx: DestinationContext,
): NotificationDestination | null {
  const row = ctx.assignments.find((a) => a.id === assignmentId);
  const day = calendarDay(row?.shiftDate) ?? shiftDate;
  return day ? { to: 'scheduleDay', dateIso: day, assignmentId } : null;
}

/**
 * Where a swap request is answered: To-do — but only while it is still waiting
 * for an answer. One already accepted, declined or withdrawn (or deleted with
 * its shift) has no card left there, so the trip landed on an empty To-do; it
 * now stays on the list, and `notificationStayReason` says why. Unknown swaps
 * are trusted — To-do re-reads them on arrival.
 */
function swapDestination(
  swapId: string,
  ctx: DestinationContext,
): NotificationDestination | null {
  if (ctx.swaps) {
    const swap = ctx.swaps.find((s) => s.id === swapId);
    if (swap?.status !== 'pending_pr') return null;
  }
  return { to: 'swapRequests', swapId };
}

/**
 * Overtime is MONEY on a week's voucher ("RM… is on that week's payment
 * voucher"), so it opens the week that carries it: This week while it is
 * open, the closed voucher after. A PR on two rosters holds one voucher per
 * agency for that week, and the claim is on the one whose agency BOOKED the
 * shift. No week on screen yet → the shift it was worked on.
 */
function overtimeDestination(
  assignmentId: string | null,
  shiftDate: string | null,
  ctx: DestinationContext,
): NotificationDestination | null {
  const row = assignmentId ? ctx.assignments.find((a) => a.id === assignmentId) : undefined;
  const day = shiftDate ?? calendarDay(row?.shiftDate);
  if (day) {
    const week = ctx.thisWeek;
    if (week && within(day, week.weekStart, week.weekEnd)) {
      return { to: 'paymentThisWeek' };
    }
    const closed = (ctx.closedVouchers ?? []).filter((v) =>
      within(day, v.weekStart, v.weekEnd),
    );
    const booking = row?.agencyId
      ? closed.filter((v) => v.agencyId === row.agencyId)
      : [];
    const carrier =
      booking.length === 1 ? booking[0] : closed.length === 1 ? closed[0] : null;
    if (carrier) return { to: 'pv', pvId: carrier.voucherId };
  }
  return assignmentId ? assignmentDestination(assignmentId, day, ctx) : null;
}

/**
 * Where tapping this notification should land, given what is loaded — or null
 * to stay on the notifications list.
 */
export function notificationDestination(
  record: Pick<NotificationRecord, 'kind' | 'payload'>,
  ctx: DestinationContext,
): NotificationDestination | null {
  const subject = notificationSubject(record);
  if (!subject) return null;
  switch (subject.type) {
    case 'voucher':
      return voucherDestination(subject.voucherId, ctx);
    case 'assignment':
      return assignmentDestination(subject.assignmentId, subject.shiftDate, ctx);
    case 'overtime':
      return overtimeDestination(subject.assignmentId, subject.shiftDate, ctx);
    case 'swap':
      return swapDestination(subject.swapId, ctx);
    case 'membership':
      return { to: 'profile' };
    default:
      return null;
  }
}

/**
 * Why tapping this notice opens nothing, when that deserves a sentence — or
 * null (it opens something, or there is nothing to explain: an agency's own
 * broadcast was never about an item).
 *
 * Only swap requests, today: they are the one notice whose item routinely goes
 * stale on its own — the request dies once it is answered, and the notice
 * stays in the bell.
 */
export function notificationStayReason(
  record: Pick<NotificationRecord, 'kind' | 'payload'>,
  ctx: DestinationContext,
): NotificationStayReason | null {
  const subject = notificationSubject(record);
  if (subject?.type !== 'swap' || !ctx.swaps) return null;
  const swap = ctx.swaps.find((s) => s.id === subject.swapId);
  if (!swap) return 'swapClosed';
  switch (swap.status) {
    case 'pending_pr':
      return null;
    case 'approved':
      return 'swapAccepted';
    case 'declined':
      return 'swapDeclined';
    case 'cancelled':
      return 'swapWithdrawn';
    default:
      // A status this build does not know is not one it can answer from.
      return 'swapClosed';
  }
}
