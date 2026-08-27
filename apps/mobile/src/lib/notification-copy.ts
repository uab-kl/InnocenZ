/**
 * Stored English notification rows → the active locale, AT THE RENDER.
 *
 * A `notification` row is written by the BACKEND and PERSISTED. Translating the
 * producer would bake whatever language the writer happened to pick into the
 * database — and leave every row already on the table in the old one — so the
 * wire stays English (which is also what a log line and a bug report carry) and
 * this module maps it onto the dictionary at render time. Same shape as
 * `localizeLoginError` (i18n/translations.ts) and `localizeApiError`
 * (lib/api-error-copy.ts).
 *
 * ⚠️ EVERY resolver keys off `row.kind` and `row.payload`, NEVER off the English
 * title or body. A copy edit on the backend must not silently turn the bell
 * sheet back to English, and matching prose is exactly how that happens.
 *
 * ⚠️ ANYTHING it cannot rebuild falls through to the stored English, FIELD BY
 * FIELD. A kind added server-side, a payload missing a part, and an agency's
 * free-text broadcast all render as they always did rather than as a blank or a
 * guessed sentence. Half a message in the right language beats a whole one we
 * invented.
 *
 * Only PR-addressed kinds have resolvers. `overtime_pending_approval`,
 * `leave_requested`, `cutlost_requested`, `cutlost_decided`, `pr_rating_low`,
 * `shift_cover_needed` and `pv_day_review_pending` are written to AGENCY and
 * OUTLET members — this app never receives one, and inventing PR copy for them
 * would be copy nobody reads.
 */
import { formatMessage } from '../i18n';
import type { AppLocale, AppTranslations } from '../i18n';
import { formatRM } from './demo-shifts';
import type {
  NotificationKind,
  NotificationRecord,
  PrDisputeComponent,
} from './api';

export type LocalizedNotification = { title: string; body: string };

/** What a resolver may override. An omitted field keeps the stored English. */
type Localized = { title?: string; body?: string };

type Ctx = {
  payload: Record<string, unknown>;
  stored: LocalizedNotification;
  locale: AppLocale;
  t: AppTranslations;
};

/** `null` = this row is not one we can rebuild; show it as it was stored. */
type Resolver = (ctx: Ctx) => Localized | null;

/** A calendar day, and nothing else — never a timestamp. */
const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * 'Wed, 26 Aug' from a stored 'YYYY-MM-DD', in the ACTIVE locale.
 *
 * Built from the parts and constructed as a LOCAL date: `new Date('2026-08-26')`
 * is parsed as UTC midnight, which renders the 25th in Asia/KL. Same fix, and
 * the same reason, as `formatShiftDay` in OutletSwapRequests.tsx.
 */
function calendarDay(value: unknown, locale: AppLocale): string | null {
  if (typeof value !== 'string') return null;
  const parts = YMD.exec(value.trim());
  if (!parts) return null;
  const y = Number(parts[1]);
  const m = Number(parts[2]);
  const d = Number(parts[3]);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d).toLocaleDateString(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/** A non-empty string off the payload, or null. */
function text(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** A finite number off the payload. Accepts the numeric-as-string shape too. */
function count(payload: Record<string, unknown>, key: string): number | null {
  const value = payload[key];
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * The shift day this row is about: the payload's own field first, then the
 * stored body when that body is a BARE date and nothing else.
 *
 * `shift_assigned` and `shift_cancelled` both put the date in the body, and only
 * the first also puts it in the payload. Asking whether the WHOLE body is a date
 * tests the shape of a value — there is no English word in it to break — which
 * is a different thing from matching prose.
 */
function shiftDay(ctx: Ctx): string | null {
  return (
    calendarDay(ctx.payload.shiftDate, ctx.locale) ??
    calendarDay(ctx.stored.body, ctx.locale)
  );
}

/**
 * Decision words, BOTH tenses, mapped to one boolean.
 *
 * The producers disagree: overtime writes `decision: 'approve' | 'reject'`,
 * leave writes `'approved' | 'rejected'`, and a dispute writes
 * `outcome: 'accepted' | 'rejected'`. An unknown word yields `undefined`, and
 * every caller falls through on that — reading a value we do not recognise as
 * "rejected" would tell a PR the opposite of what happened.
 */
const OUTCOME: Record<string, boolean | undefined> = {
  approve: true,
  approved: true,
  accept: true,
  accepted: true,
  reject: false,
  rejected: false,
  decline: false,
  declined: false,
};

function outcomeOf(payload: Record<string, unknown>, key: string): boolean | null {
  const value = payload[key];
  if (typeof value !== 'string') return null;
  const decided = OUTCOME[value.trim().toLowerCase()];
  return decided === undefined ? null : decided;
}

/**
 * The RECORD KEYS are the stored `payment_voucher_dispute_component` values and
 * must never move; only the label is copy. Wages and Others borrow the payment
 * grid's own row labels and Drinks / Tips the Check-In table's, rather than
 * naming the same four buckets a second time.
 */
const COMPONENT_LABEL: Record<
  PrDisputeComponent,
  (t: AppTranslations) => string
> = {
  wages: (t) => t.evidence.kindWages,
  drinks: (t) => t.shiftStatus.drinks,
  tips: (t) => t.shiftStatus.tips,
  others: (t) => t.evidence.kindOthers,
};

/**
 * `${component} on ${disputeDate}` (+ ` — ${note}`), the dispute outcome's body.
 *
 * Its payload carries the OUTCOME but not the component, the day or the note, so
 * those three are read back off the stored line. What the pattern matches are
 * STORED VALUES — the four enum members and an ISO date — with one joining word
 * between them; a miss returns the line untouched. Same technique, and the same
 * fail-open rule, as `localizeApiError`.
 */
const DISPUTE_BODY =
  /^(wages|drinks|tips|others) on (\d{4}-\d{2}-\d{2})(?:\s+—\s+([\s\S]*))?$/;

function disputeBody(ctx: Ctx): string | null {
  const parts = DISPUTE_BODY.exec(ctx.stored.body.trim());
  if (!parts) return null;
  const date = calendarDay(parts[2], ctx.locale);
  if (!date) return null;
  // The alternation above admits only the four enum members, so the lookup is
  // total — the cast asserts what the pattern already guarantees.
  const component = COMPONENT_LABEL[parts[1] as PrDisputeComponent](ctx.t);
  // The agency's resolution note is the AGENCY'S OWN WORDS — carried across
  // verbatim, never translated.
  const note = (parts[3] ?? '').trim();
  return note === ''
    ? formatMessage(ctx.t.notif.disputeBody, { component, date })
    : formatMessage(ctx.t.notif.disputeBodyWithNote, { component, date, note });
}

const shiftAssigned: Resolver = (ctx) => {
  const date = shiftDay(ctx);
  const out: Localized = { title: ctx.t.notif.shiftAssignedTitle };
  if (date) out.body = formatMessage(ctx.t.notif.shiftAssignedBody, { date });
  return out;
};

/**
 * Three producers share `shift_cancelled`, and the payload separates only one of
 * them: `withdrawn: true` is the venue pulling the whole shift (shift.controller
 * `notifyShiftWithdrawn`). The other two — the agency cancelling the assignment,
 * and the agency unassigning the PR — send an IDENTICAL payload
 * (`{ assignmentId, shiftId }`), so they collapse onto one label. It is true of
 * both: the booking is off. Splitting them needs a discriminator on the wire, not
 * a guess here; see the note in the handover.
 */
const shiftCancelled: Resolver = (ctx) => {
  const date = shiftDay(ctx);
  if (ctx.payload.withdrawn === true) {
    const venue = text(ctx.payload, 'outletName');
    const out: Localized = { title: ctx.t.notif.shiftWithdrawnTitle };
    if (date) {
      out.body = venue
        ? formatMessage(ctx.t.notif.shiftWithdrawnBody, { venue, date })
        : formatMessage(ctx.t.notif.shiftWithdrawnBodyNoVenue, { date });
    }
    return out;
  }
  const out: Localized = { title: ctx.t.notif.shiftCancelledTitle };
  if (date) out.body = formatMessage(ctx.t.notif.shiftCancelledBody, { date });
  return out;
};

const leaveDecided: Resolver = (ctx) => {
  const approved = outcomeOf(ctx.payload, 'decision');
  if (approved === null) return null;
  return approved
    ? {
        title: ctx.t.notif.leaveApprovedTitle,
        body: ctx.t.notif.leaveApprovedBody,
      }
    : {
        title: ctx.t.notif.leaveRejectedTitle,
        body: ctx.t.notif.leaveRejectedBody,
      };
};

const overtimeDecided: Resolver = (ctx) => {
  const approved = outcomeOf(ctx.payload, 'decision');
  if (approved === null) return null;
  const out: Localized = {
    title: approved
      ? ctx.t.notif.overtimeApprovedTitle
      : ctx.t.notif.overtimeRejectedTitle,
  };
  const minutes = count(ctx.payload, 'overtimeMinutes');
  const date = calendarDay(ctx.payload.shiftDate, ctx.locale);
  if (minutes === null || !date) return out;
  if (!approved) {
    out.body = formatMessage(ctx.t.notif.overtimeRejectedBody, {
      minutes,
      date,
    });
    return out;
  }
  // The approved half names money, so it needs the figure as well. Formatted
  // through formatRM so one ringgit amount reads the same everywhere in the app.
  const amount = count(ctx.payload, 'amount');
  if (amount === null) return out;
  out.body = formatMessage(ctx.t.notif.overtimeApprovedBody, {
    minutes,
    date,
    amount: formatRM(amount),
  });
  return out;
};

const disputeResolved: Resolver = (ctx) => {
  const accepted = outcomeOf(ctx.payload, 'outcome');
  if (accepted === null) return null;
  const out: Localized = {
    title: accepted
      ? ctx.t.notif.disputeAcceptedTitle
      : ctx.t.notif.disputeRejectedTitle,
  };
  const body = disputeBody(ctx);
  if (body) out.body = body;
  return out;
};

const paymentVoucherIssued: Resolver = (ctx) => {
  const out: Localized = { title: ctx.t.notif.pvIssuedTitle };
  const start = calendarDay(ctx.payload.weekStart, ctx.locale);
  const end = calendarDay(ctx.payload.weekEnd, ctx.locale);
  if (start && end) {
    out.body = formatMessage(ctx.t.notif.pvIssuedBody, { start, end });
  }
  return out;
};

/**
 * Title only. The body names the venue and the day
 * (`${outletName} on ${shiftDate} — wages sealed at RM…`) and the payload
 * carries NEITHER, only `payAmount` — rebuilding it would drop which shift was
 * cut short, and a PR reading a sealed wage has to know which day it belongs to.
 */
const releasedEarly: Resolver = (ctx) => ({
  title: ctx.t.notif.releasedEarlyTitle,
});

/**
 * Two very different messages ride on `agency_broadcast`.
 *
 * A `swapId` in the payload is the outlet-swap request (outlet-swap.controller
 * reuses this kind rather than migrating the PG enum) — that one is ours to
 * word, so its title is localized. Its BODY names the current slot and the
 * proposed one, neither of which is in the payload, and a message asking "accept
 * or decline" must not lose the time it is proposing.
 *
 * Everything else is an AGENCY'S OWN BROADCAST: free text a person typed. It is
 * never touched — translating it would put words in their mouth.
 */
const agencyBroadcast: Resolver = (ctx) => {
  if (!text(ctx.payload, 'swapId')) return null;
  return { title: ctx.t.notif.swapRequestTitle };
};

/**
 * ⚠️ `approveStatus: 'approved'` is AMBIGUOUS on the wire and deliberately falls
 * through.
 *
 * Two producers in agency.controller write it: a JOIN being accepted ("You were
 * accepted by the agency") and a DEPARTURE being refused ("Your departure request
 * was declined") — the membership continues in both, so both stamp 'approved',
 * with identical payload keys. Telling a PR they were accepted when they were
 * actually held to their agency is worse than leaving one row in English, so this
 * resolver only answers the cases the payload separates:
 *   • `approveStatus: 'left'`     — departure approved (only that path writes it)
 *   • `approveStatus: 'rejected'` — join declined (a refused departure never is)
 *   • `status: 'active' | 'inactive'` — pr.controller's own decision, a key the
 *     agency.controller paths do not send.
 * The fix is one field on the wire; see the handover.
 */
const agencyJoinResolved: Resolver = (ctx) => {
  const status = text(ctx.payload, 'status');
  if (status === 'active') {
    return {
      title: ctx.t.notif.joinAcceptedTitle,
      body: ctx.t.notif.joinAcceptedBody,
    };
  }
  // The reject reason IS the stored body — the agency's words, left alone.
  if (status === 'inactive') return { title: ctx.t.notif.joinDeclinedTitle };

  const approveStatus = text(ctx.payload, 'approveStatus');
  if (approveStatus === 'left') {
    return {
      title: ctx.t.notif.departureApprovedTitle,
      body: ctx.t.notif.departureApprovedBody,
    };
  }
  if (approveStatus === 'rejected') {
    return { title: ctx.t.notif.joinDeclinedTitle };
  }
  return null;
};

const RESOLVERS: Partial<Record<NotificationKind, Resolver>> = {
  shift_assigned: shiftAssigned,
  shift_cancelled: shiftCancelled,
  leave_decided: leaveDecided,
  overtime_decided: overtimeDecided,
  payment_voucher_dispute_resolved: disputeResolved,
  payment_voucher_issued: paymentVoucherIssued,
  shift_released_early: releasedEarly,
  agency_broadcast: agencyBroadcast,
  agency_join_resolved: agencyJoinResolved,
};

/**
 * One stored notification, in the reader's language.
 *
 * `locale` and `t` are both passed in, with NO defaults: `t` supplies the words
 * and `locale` the date formatting, and a default on either would pin one
 * language forever — the bug this file exists to undo.
 */
export function localizeNotification(
  row: NotificationRecord,
  locale: AppLocale,
  t: AppTranslations,
): LocalizedNotification {
  const stored: LocalizedNotification = {
    title: row.title,
    body: row.body ?? '',
  };
  const resolve = RESOLVERS[row.kind];
  if (!resolve) return stored;
  try {
    const localized = resolve({
      payload: row.payload ?? {},
      stored,
      locale,
      t,
    });
    if (!localized) return stored;
    return {
      title: localized.title ?? stored.title,
      body: localized.body ?? stored.body,
    };
  } catch {
    // A malformed payload must never blank the bell. The stored row is always a
    // correct answer here, just not a translated one.
    return stored;
  }
}
