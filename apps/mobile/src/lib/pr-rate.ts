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

export type MenuDrink = { id: string; name: string; priceRm: number };

/** Map the backend drink menu (money as strings) to the screen's number form. */
export function drinkMenuFromAssignment(
  items: OutletDrinkItem[] | null | undefined,
): MenuDrink[] {
  return (items ?? []).map((d) => ({
    id: d.id,
    name: d.name,
    priceRm: Number(d.priceRm) || 0,
  }));
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
 * Overtime pay (RM) for hours worked beyond the scheduled shift. Uses the tier's
 * real OT/hr rate when configured; otherwise falls back to payPerHour × 1.5
 * (the prototype rule). Returns 0 when there is no positive overtime.
 */
export function overtimePay(
  otHours: number,
  rate: ShiftAssignmentRate | null,
  payPerHour: number,
): number {
  if (otHours <= 0) return 0;
  const otRate =
    rate?.otAfterHours != null && Number.isFinite(Number(rate.otAfterHours))
      ? Number(rate.otAfterHours)
      : payPerHour * 1.5;
  if (otRate <= 0) return 0;
  return Math.round(otHours * otRate * 100) / 100;
}
