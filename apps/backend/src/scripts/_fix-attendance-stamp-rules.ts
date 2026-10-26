/**
 * The pure half of `_fix-attendance-stamp.ts` — argument parsing, the default
 * proposal and the refusals — kept apart so they are tested by calling them with
 * dates, never by running the script against the shared database.
 *
 * See the script's header for why it exists (the 119.13 h Velvet 23 night).
 */
import { MAX_PLAUSIBLE_SHIFT_HOURS } from '@/features/payment-voucher/payment-voucher-audit';
import {
  signedRecordMarks,
  type VoucherSettlementView,
} from '@/features/payment-voucher/voucher-signed-record';
import { earnedWage } from '@/features/shift-assignment/wage';

export { MAX_PLAUSIBLE_SHIFT_HOURS };

const HOUR_MS = 3_600_000;
/** Malaysia is UTC+8 all year — the same fixed offset `shiftWindowInstants` uses. */
const VENUE_UTC_OFFSET_MS = 8 * HOUR_MS;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type StampArgs =
  | { mode: 'list-long' }
  | {
      mode: 'fix';
      assignmentId: string;
      checkIn: Date | null;
      checkOut: Date | null;
      apply: boolean;
      /** Overrides the released / signed-voucher refusal (`settledRefusal`). */
      forceSettled: boolean;
    };

function valueAfter(argv: readonly string[], flag: string): string | null {
  const at = argv.indexOf(flag);
  if (at < 0) return null;
  const value = argv[at + 1];
  if (!value || value.startsWith('--'))
    throw new Error(`${flag} needs a value`);
  return value;
}

/**
 * An ISO instant WITH its offset — `2026-07-24T04:00:00+08:00` or `…Z`.
 *
 * A bare `2026-07-24T04:00` is refused: JavaScript reads it in the clock of
 * whatever machine runs the script, which is exactly the eight-hour drift
 * `shiftWindowInstants` was written to stop. A stamp that moves money must say
 * which clock it is on.
 */
export function parseInstant(raw: string, flag: string): Date {
  if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(raw)) {
    throw new Error(
      `${flag} must carry its offset, e.g. 2026-07-24T04:00:00+08:00 — got "${raw}"`,
    );
  }
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) throw new Error(`${flag} is not a date: "${raw}"`);
  return new Date(ms);
}

export function parseStampArgs(argv: readonly string[]): StampArgs {
  if (argv.includes('--list-long')) {
    if (argv.includes('--apply'))
      throw new Error(
        '--list-long only reads; it cannot be combined with --apply',
      );
    return { mode: 'list-long' };
  }
  const assignmentId = valueAfter(argv, '--assignment');
  if (!assignmentId) throw new Error('pass --assignment <id>, or --list-long');
  if (!UUID.test(assignmentId))
    throw new Error(`--assignment is not a uuid: "${assignmentId}"`);
  const rawIn = valueAfter(argv, '--checkin');
  const rawOut = valueAfter(argv, '--checkout');
  return {
    mode: 'fix',
    assignmentId,
    checkIn: rawIn ? parseInstant(rawIn, '--checkin') : null,
    checkOut: rawOut ? parseInstant(rawOut, '--checkout') : null,
    apply: argv.includes('--apply'),
    forceSettled: argv.includes('--force-settled'),
  };
}

/** An instant as the venue's wall clock with its offset: `2026-07-23T22:00:00+08:00`. */
export function venueIso(at: Date): string {
  return `${new Date(at.getTime() + VENUE_UTC_OFFSET_MS).toISOString().slice(0, 19)}+08:00`;
}

/** Clocked hours between two stamps, to two places — what History shows. */
export function clockedHours(checkIn: Date, checkOut: Date): number {
  return (
    Math.round(((checkOut.getTime() - checkIn.getTime()) / HOUR_MS) * 100) / 100
  );
}

/**
 * The shift DAY ± 16 h: from 16 h before the venue's midnight that opens
 * `shiftDate` to 16 h after the midnight that closes it. Wide enough for an
 * overnight 22:00–04:00 shift and for a PR who checked in early; narrow enough
 * that a stamp five days out (the 28 Jul check-out on a 23 Jul night) is refused.
 */
export function shiftDayBounds(shiftDate: string): { from: Date; to: Date } {
  const [y, m, d] = shiftDate.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) throw new Error(`unusable shift date "${shiftDate}"`);
  const midnight = Date.UTC(y, m - 1, d) - VENUE_UTC_OFFSET_MS;
  return {
    from: new Date(midnight - MAX_PLAUSIBLE_SHIFT_HOURS * HOUR_MS),
    to: new Date(midnight + 24 * HOUR_MS + MAX_PLAUSIBLE_SHIFT_HOURS * HOUR_MS),
  };
}

export type Proposal =
  | { ok: true; checkInAt: Date; checkOutAt: Date; hours: number }
  | { ok: false; refusal: string };

/**
 * The stamps to write: whatever was passed, else the current check-in and — by
 * default — a check-out at the shift's SCHEDULED END, which is what the live
 * check-out clamp (`sealCheckOut`) would have written had the stamp come through
 * it. Refused, never adjusted, when a stamp falls outside the shift day ± 16 h,
 * the span is not forward, or the result is still over 16 h.
 */
export function proposeStamps(input: {
  shiftDate: string;
  scheduled: { start: Date; end: Date } | null;
  current: { checkInAt: Date | null; checkOutAt: Date | null };
  overrides: { checkIn: Date | null; checkOut: Date | null };
}): Proposal {
  const { shiftDate, scheduled, current, overrides } = input;
  const checkInAt = overrides.checkIn ?? current.checkInAt;
  if (!checkInAt)
    return { ok: false, refusal: 'the row has no check-in; pass --checkin' };
  const checkOutAt = overrides.checkOut ?? scheduled?.end ?? null;
  if (!checkOutAt) {
    return {
      ok: false,
      refusal:
        'the slot has no parseable end time, so there is no default; pass --checkout',
    };
  }

  const bounds = shiftDayBounds(shiftDate);
  const outside = (at: Date) => at < bounds.from || at > bounds.to;
  if (outside(checkInAt)) {
    return {
      ok: false,
      refusal: `check-in ${checkInAt.toISOString()} is outside the shift day ± ${MAX_PLAUSIBLE_SHIFT_HOURS} h`,
    };
  }
  if (outside(checkOutAt)) {
    return {
      ok: false,
      refusal: `check-out ${checkOutAt.toISOString()} is outside the shift day ± ${MAX_PLAUSIBLE_SHIFT_HOURS} h`,
    };
  }
  if (checkOutAt <= checkInAt)
    return { ok: false, refusal: 'check-out must be after check-in' };
  const hours = clockedHours(checkInAt, checkOutAt);
  if (hours > MAX_PLAUSIBLE_SHIFT_HOURS) {
    // The usual cause: the CHECK-IN is wrong too. Name the scheduled start so
    // the person deciding has the one candidate value in front of them — but
    // never pick it for them; an invented check-in is a decision, not a default.
    const hint =
      !overrides.checkIn && scheduled
        ? `; the check-in looks wrong too — pass --checkin (the scheduled start is ${venueIso(scheduled.start)})`
        : '';
    return {
      ok: false,
      refusal: `the proposed span is ${hours} h — still over ${MAX_PLAUSIBLE_SHIFT_HOURS} h${hint}`,
    };
  }
  if (
    current.checkInAt?.getTime() === checkInAt.getTime() &&
    current.checkOutAt?.getTime() === checkOutAt.getTime()
  ) {
    return {
      ok: false,
      refusal: 'the row already carries these stamps — nothing to change',
    };
  }
  return { ok: true, checkInAt, checkOutAt, hours };
}

/**
 * `worked_minutes` for the new stamps — through `earnedWage`, the rule the
 * check-out seal itself runs, so the derived column cannot disagree with it.
 *
 * Null (= leave the column alone) on a row sealed before 0097, which carries no
 * worked minutes and no day rate; inventing them here would claim the row was
 * pro-rated when it never was. `wouldPay` is reported, never written: the
 * owner's instruction is that this night's pay stays as it is.
 */
export function derivedWorkedMinutes(input: {
  storedWorkedMinutes: number | null;
  dayRateAmount: string | null;
  scheduled: { start: Date; end: Date } | null;
  checkInAt: Date;
  checkOutAt: Date;
}): { workedMinutes: number | null; wouldPay: string | null } {
  if (input.storedWorkedMinutes == null || input.dayRateAmount == null) {
    return { workedMinutes: null, wouldPay: null };
  }
  const earned = earnedWage({
    dayRate: input.dayRateAmount,
    scheduled: input.scheduled,
    checkInAt: input.checkInAt,
    checkOutAt: input.checkOutAt,
  });
  return { workedMinutes: earned.workedMinutes, wouldPay: earned.amount };
}

/** A voucher carrying this assignment's money — by a line's ref or a receipt. */
export type CarryingVoucher = VoucherSettlementView & {
  voucherNo: string | null;
};

/**
 * Why this assignment's stamps may not be changed without `--force-settled`,
 * or null when they may.
 *
 * Refused when the assignment was RELEASED (`released_by` set — a cut-loss or
 * agency release already settled the night) or when its money sits on a
 * voucher that is a signed record (`signedRecordMarks`: a SIGNED/PAID status,
 * either signature, or a paid stamp). The stamps are then part of what was
 * signed or settled, and "the clock was wrong" is a correction someone must
 * choose to make on a settled record — never one this script makes by default.
 * Independent of `proposeStamps`: the out-of-window refusals still apply.
 */
export function settledRefusal(
  input: { released: boolean; vouchers: readonly CarryingVoucher[] },
  forceSettled: boolean,
): string | null {
  if (forceSettled) return null;
  const reasons: string[] = [];
  if (input.released)
    reasons.push('the assignment was released (released_by is set)');
  for (const voucher of input.vouchers) {
    const marks = signedRecordMarks(voucher);
    if (marks.length > 0) {
      reasons.push(
        `its money is on ${voucher.voucherNo ?? 'an unnumbered voucher'} (${marks.join(', ')})`,
      );
    }
  }
  if (reasons.length === 0) return null;
  return `settled record — ${reasons.join('; ')}. Re-run with --force-settled to change its stamps anyway.`;
}
