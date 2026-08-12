/**
 * Rate-card math for the PR app — turns the `/shift-assignment/mine` `rate`
 * field (this PR's tier rate at the shift's outlet) into the drink/tip
 * commission the Scan / Self-log screens log. Happy-hour aware: within the
 * outlet's HH window the happy-hour drink % applies, otherwise the normal one.
 *
 * When an outlet hasn't configured its workspace rate card yet (`rate` is null),
 * we fall back to the prototype's flat rates (drinks 15%, tips 10%) so the flow
 * still works — real rates take over the moment the outlet fills its Workspace.
 */
import type { OutletDrinkItem, ShiftAssignmentRate } from './api';

/** Fallback rates used only when no outlet rate card is configured. */
export const FALLBACK_DRINK_PCT = 15;
export const FALLBACK_TIP_PCT = 10;

/** Catalog section of a menu item — mirrors outlet_drink_menu.category. */
export type MenuCategory = 'drink' | 'service' | 'tip';

export type MenuDrink = { id: string; name: string; priceRm: number; category: MenuCategory };

function toMenuCategory(raw: string | null | undefined): MenuCategory {
  return raw === 'service' || raw === 'tip' ? raw : 'drink';
}

/** Map the backend drink menu (money as strings) to the screen's number form. */
export function drinkMenuFromAssignment(
  items: OutletDrinkItem[] | null | undefined,
): MenuDrink[] {
  return (items ?? []).map((d) => ({
    id: d.id,
    name: d.name,
    priceRm: Number(d.priceRm) || 0,
    category: toMenuCategory(d.category),
  }));
}

/**
 * The menu slice for one scan page: the Drinks page shows category 'drink';
 * the Tips page shows 'service' + 'tip' (Booking commission, Havoc, Tip…).
 * Falls back to the whole menu when the outlet hasn't tagged categories yet,
 * so an untagged legacy menu still lets the PR log.
 */
export function menuForScanCategory(
  menu: MenuDrink[],
  scanCategory: 'drinks' | 'tips',
): MenuDrink[] {
  const filtered =
    scanCategory === 'drinks'
      ? menu.filter((d) => d.category === 'drink')
      : menu.filter((d) => d.category === 'service' || d.category === 'tip');
  return filtered.length > 0 ? filtered : menu;
}

/**
 * Which PV money bucket one logged item belongs to (build-sheet rule 2C-4):
 * drinks → drinks; Tip + Booking commission → tips; other services → others.
 */
export function receiptKindForItem(item: MenuDrink): 'drinks' | 'tips' | 'others' {
  if (item.category === 'drink') return 'drinks';
  /*
   * EVERY service entitlement is a tips-side item, never an "other".
   *
   * `menuForScanCategory` already puts 'service' and 'tip' on the Tips page
   * together, and both are commissioned at the TIP rate — but this tested only
   * 'tip', plus one hardcoded id (`booking-com`) that happened to be the seeded
   * Booking commission. So every service an outlet configures itself fell to
   * 'others', which the app labels **OT** and the backend files as component
   * 'other' — the same bucket as genuine overtime.
   *
   * Havoc, set up under Service Entitlement at RM 1,000, was logged as
   * "OT · RM 2,000.00": two units of a bar service reading as an overtime claim.
   * 'others' is left to what really is other — overtime and unclassified.
   */
  if (item.category === 'tip' || item.category === 'service') return 'tips';
  return 'others';
}

/** 'HH:MM' → minutes since midnight, or null when malformed/empty. */
function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Whether `now` falls in the outlet's happy-hour window. Handles a window that
 * crosses midnight (e.g. 22:00 → 02:00), which night shifts routinely do. No
 * window set (either bound blank/invalid, or start === end) → not happy hour.
 */
export function isHappyHourNow(
  start: string,
  end: string,
  now: Date = new Date(),
): boolean {
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (s == null || e == null || s === e) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  return s < e ? cur >= s && cur < e : cur >= s || cur < e;
}

function pctOr(value: string | null | undefined, fallback: number): number {
  const n = value == null ? NaN : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Drink commission % to apply right now (happy-hour aware). */
export function drinkCommissionPct(
  rate: ShiftAssignmentRate | null,
  now: Date = new Date(),
): number {
  if (!rate) return FALLBACK_DRINK_PCT;
  if (isHappyHourNow(rate.happyHourStart, rate.happyHourEnd, now) && rate.happyHourDrinkPct != null) {
    return pctOr(rate.happyHourDrinkPct, FALLBACK_DRINK_PCT);
  }
  return pctOr(rate.drinkPct, FALLBACK_DRINK_PCT);
}

/** Tip commission %. */
export function tipCommissionPct(rate: ShiftAssignmentRate | null): number {
  if (!rate) return FALLBACK_TIP_PCT;
  return pctOr(rate.tipPct, FALLBACK_TIP_PCT);
}

/**
 * The guest-facing happy-hour discount, clamped to 0–100.
 *
 * Defensive despite the field being non-optional on `ShiftAssignmentRate`: a
 * backend that has not restarted still serves the old payload without it (tsx
 * watch keeps stale routes alive), and an `undefined` multiplied into a price
 * yields NaN — which would reach a receipt, a shift_sale row and a voucher as
 * money nobody can read. Anything non-numeric means "no discount".
 */
export function happyHourDiscountPct(rate: ShiftAssignmentRate | null): number {
  const n = Number(rate?.happyHourDrinkDiscountPct);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

/**
 * What a guest actually pays for ONE unit of `item` right now.
 *
 * The menu price is the LIST price — `receipt-parser.ts` looks every price up
 * from the outlet menu and never trusts the paper's arithmetic — so inside the
 * happy-hour window the list price is NOT what was charged. Logging it there
 * overstated the outlet's floor sales and, because commission is a percentage
 * of the sale, overpaid the PR on top of the happy-hour commission bump.
 *
 * DRINKS ONLY. `happy_hour_drink_discount_pct` is a bar promotion on drinks;
 * tips and service entitlements (Havoc, Booking commission) are not menu drinks
 * and are never discounted — see `receiptKindForItem`, which routes those to the
 * tips bucket.
 *
 * Rounded to the cent HERE, per unit, so the unit price the PR is shown times
 * the quantity equals the line total exactly. Rounding the line total instead
 * would print receipts whose own arithmetic does not check out.
 */
export function effectiveUnitPriceRm(
  item: MenuDrink,
  rate: ShiftAssignmentRate | null,
  now: Date = new Date(),
): number {
  if (item.category !== 'drink') return item.priceRm;
  if (!rate || !isHappyHourNow(rate.happyHourStart, rate.happyHourEnd, now)) {
    return item.priceRm;
  }
  const pct = happyHourDiscountPct(rate);
  if (pct <= 0) return item.priceRm;
  return Math.round(item.priceRm * (1 - pct / 100) * 100) / 100;
}

/**
 * The line total a guest pays for `qty` of `item` right now — the ONE place a
 * logged drink's `sales` figure is computed.
 *
 * Every caller must come through here rather than reach for `priceRm * qty`:
 * the scan screen alone priced items at eight separate sites, and a discount
 * applied at seven of them is a discount that silently disagrees with itself
 * between what the PR is shown and what reaches the voucher.
 */
export function lineSalesRm(
  item: MenuDrink,
  qty: number,
  rate: ShiftAssignmentRate | null,
  now: Date = new Date(),
): number {
  return Math.round(effectiveUnitPriceRm(item, rate, now) * qty * 100) / 100;
}

/** Whether a discount is actually in force right now, for UI that says so. */
export function isDrinkDiscountActive(
  rate: ShiftAssignmentRate | null,
  now: Date = new Date(),
): boolean {
  if (!rate) return false;
  return (
    isHappyHourNow(rate.happyHourStart, rate.happyHourEnd, now) &&
    happyHourDiscountPct(rate) > 0
  );
}

/** Commission (RM) for a sales amount in one category, at the current rate. */
export function commissionFor(
  category: 'drinks' | 'tips',
  sales: number,
  rate: ShiftAssignmentRate | null,
  now: Date = new Date(),
): number {
  const pct = category === 'tips' ? tipCommissionPct(rate) : drinkCommissionPct(rate, now);
  return Math.round(sales * (pct / 100) * 100) / 100;
}

/**
 * Hours in a scheduled shift before overtime starts.
 *
 * Hardcoded because `/shift-assignment/mine` does not ship the tier's configured
 * `standard_shift_hours` — the column exists on outlet_tier_rate but is not in
 * the ShiftAssignmentRate payload. Widen the payload and read it from there
 * rather than changing this number.
 */
export const STANDARD_SHIFT_HOURS = 6;

/**
 * The longest a single shift can plausibly run. A venue shift is one night; past
 * this the stamps describe something else entirely.
 */
export const MAX_PLAUSIBLE_SHIFT_HOURS = 16;

/**
 * Overtime hours between two attendance stamps, or 0 when they cannot be
 * trusted.
 *
 * The elapsed time is wall-clock, not worked time, so a forgotten check-out or a
 * stale check-in from an earlier shift makes it grow without limit — that is how
 * one live voucher ended up billing "Overtime 113.1h", a third of its value, for
 * a night nobody worked 113 hours of.
 *
 * Beyond MAX_PLAUSIBLE_SHIFT_HOURS this returns 0 rather than a capped figure:
 * the stamps are known-wrong at that point, and a capped number is still invented
 * money that lands on a voucher looking deliberate. The agency adds real overtime
 * by hand instead.
 */
export function overtimeHours(
  checkInAt: string | null | undefined,
  checkOutMs: number,
  /**
   * THIS shift's own scheduled window in minutes (`scheduledMinutes`, sealed at
   * check-out by migration 0097). When known it wins over the six-hour default,
   * exactly as it does in `overtimeRate`.
   *
   * The two disagreed until now, and both directions were wrong on real
   * bookings: a four-hour shift worked for six reported NO overtime (6 − 6),
   * hiding two real hours, while an eight-hour shift worked exactly to its end
   * reported two hours of overtime (8 − 6) that nobody worked and no server
   * column records. `overtimeRate` was already pricing against the real window,
   * so the phone was multiplying invented hours by a correct rate.
   */
  scheduledMinutes?: number | null,
): number {
  if (!checkInAt) return 0;
  const checkInMs = new Date(checkInAt).getTime();
  if (!Number.isFinite(checkInMs) || !Number.isFinite(checkOutMs)) return 0;

  const elapsed = (checkOutMs - checkInMs) / 3_600_000;
  // Negative means the stamps are out of order — as untrustworthy as too long.
  if (elapsed <= 0 || elapsed > MAX_PLAUSIBLE_SHIFT_HOURS) return 0;

  const threshold =
    scheduledMinutes != null && scheduledMinutes > 0
      ? scheduledMinutes / 60
      : STANDARD_SHIFT_HOURS;
  return Math.max(0, elapsed - threshold);
}

/** Overtime is paid at 1.5× the normal hourly rate. */
const OT_MULTIPLIER = 1.5;

/**
 * The overtime rate in RM per hour.
 *
 * `rate.otAfterHours` is NOT a rate. Despite the name it is the DB column
 * `standard_shift_hours` — the length of a standard shift, i.e. the threshold
 * after which overtime starts — and it is 6. This function used to spend it
 * directly as ringgit per hour, which is how one live voucher came to bill
 * "Overtime 113.1h @ RM6.00/h": a shift length charged as a wage.
 *
 * `rate.wagePerHour` is likewise the DB column `daily_wage` (Tier I = 500), not
 * an hourly figure — see the alias note on OutletTierRateTable. So the hourly
 * rate has to be derived, and overtime is 1.5× that:
 *
 *     500 / 6 × 1.5 = 125.00
 *
 * which is exactly what `outlet_workspace.ot_after_hours` holds for every
 * outlet, confirming 125 was the intended figure all along. Deriving per tier
 * also beats that flat column: Tier V (1000/day) correctly yields 250/h.
 *
 * Returns 0 when no trustworthy rate can be derived — the agency adds real
 * overtime by hand rather than have a guess land on a voucher.
 */
export function overtimeRate(
  rate: ShiftAssignmentRate | null,
  payPerHour: number,
  /**
   * This shift's own scheduled window in minutes (`scheduledMinutes`, sealed at
   * check-out by migration 0097). When known it WINS over the rate card's
   * standard-shift length, because the server prices the approval that way and
   * the phone must never quote a figure the agency will not see.
   */
  scheduledMinutes?: number | null,
): number {
  const dailyWage = Number(rate?.wagePerHour);
  // This shift's real window first, the rate card's standard shift second. They
  // differ on every booking that is not six hours, and not cosmetically: at
  // RM700 a 2-hour shift makes an ordinary hour RM350, so pricing overtime at
  // `700/6 × 1.5` = RM175 pays an overtime hour HALF of an ordinary one.
  // Overtime is 1.5× of what an hour on THIS shift is worth.
  const shiftHours =
    scheduledMinutes != null && scheduledMinutes > 0
      ? scheduledMinutes / 60
      : Number(rate?.otAfterHours);
  if (Number.isFinite(dailyWage) && dailyWage > 0 && Number.isFinite(shiftHours) && shiftHours > 0) {
    return (dailyWage / shiftHours) * OT_MULTIPLIER;
  }
  // Fallback for an unconfigured tier. `payPerHour` is the shift's
  // `pay_per_hour`, which since migration 0047 is fed a DAILY wage by
  // basePayFromPayTierRows — every live shift reads 500 — so it divides by the
  // standard shift too. Using it raw would bill 500 × 1.5 = RM750/h.
  if (Number.isFinite(payPerHour) && payPerHour > 0) {
    return (payPerHour / STANDARD_SHIFT_HOURS) * OT_MULTIPLIER;
  }
  return 0;
}

/**
 * Overtime pay (RM) for hours worked beyond the scheduled shift. Returns 0 when
 * there is no positive overtime or no rate can be derived.
 */
export function overtimePay(
  otHours: number,
  rate: ShiftAssignmentRate | null,
  payPerHour: number,
  /** This shift's scheduled window — see overtimeRate. */
  scheduledMinutes?: number | null,
): number {
  if (otHours <= 0) return 0;
  const otRate = overtimeRate(rate, payPerHour, scheduledMinutes);
  if (otRate <= 0) return 0;
  return Math.round(otHours * otRate * 100) / 100;
}
