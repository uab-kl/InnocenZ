/**
 * Shift-slot time windows, and whether two of them collide.
 *
 * Extracted from `shift-assignment.controller.ts`, which used it to refuse
 * double-booking a PR at assign time. `shift.controller.ts` needs the identical
 * rule for the other direction — editing a shift's time into a clash — and two
 * copies of an overlap test is exactly how the two ends of one rule start
 * disagreeing about what "overlap" means.
 */

/** "8pm", "20:00", "8.30pm" -> minutes since midnight, or null when not a clock time. */
function clockToMinutes(token: string): number | null {
  const m = token.trim().match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?$/i);
  if (!m) return null;
  let hour = Number(m[1]);
  const minutes = Number(m[2] ?? '0');
  const meridiem = m[3]?.toLowerCase();
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (meridiem === 'pm' ? 12 : 0);
  } else if (hour > 23) return null;
  if (minutes > 59) return null;
  return hour * 60 + minutes;
}

/**
 * "22:00 - 04:00" -> a minutes window [start, end), overnight wrapped past 24h.
 *
 * Two passes, and the order is deliberate. The embedded HH:MM regex runs FIRST
 * and unchanged, so a decorated slot ("Friday 22:00 - 04:00") keeps resolving
 * exactly as it always did. Only when that finds nothing does the lenient pass
 * run, splitting on the dash and reading each side as a clock token — which is
 * what admits "8pm - 2am" and "8.30pm-2am".
 *
 * The lenient pass was lifted out of `shift-assignment.controller.ts`, which kept
 * a private copy of it for the check-out clamp. Two parsers for one slot string
 * is how the pay window and the clash guard start disagreeing about when a shift
 * ends, and now that the window decides MONEY (see `earnedWage`) that is not a
 * disagreement worth carrying. The change is purely additive: every slot that
 * parsed before parses identically, and some that did not now do.
 */
export function slotMinutes(slot: string | null | undefined): { start: number; end: number } | null {
  if (!slot) return null;
  const m = slot.match(/(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})/);
  if (m) {
    const start = Number(m[1]) * 60 + Number(m[2]);
    let end = Number(m[3]) * 60 + Number(m[4]);
    if (end <= start) end += 24 * 60;
    return { start, end };
  }
  const parts = slot.split(/[—–-]/);
  if (parts.length !== 2) return null;
  const start = clockToMinutes(parts[0]);
  const end = clockToMinutes(parts[1]);
  if (start == null || end == null) return null;
  return { start, end: end <= start ? end + 24 * 60 : end };
}

/**
 * Malaysia is UTC+8 all year — there is no DST — so a fixed offset is exact
 * rather than an approximation. Every venue in this system is Malaysian; the day
 * one is not, this belongs on the outlet row and this becomes its default.
 */
const VENUE_UTC_OFFSET_MINUTES = 8 * 60;

/**
 * A shift's scheduled window as two real instants, read in the VENUE's timezone.
 *
 * ⚠️ Never build this with `new Date(y, m, d, hh, mm)`. That reads the clock in
 * the SERVER's timezone, which is right only by luck: on a UTC host a 20:00–02:00
 * Kuala Lumpur shift lands eight hours late, and every stamp a PR made falls
 * outside its own window. That mattered little while this fed only the
 * forgot-to-check-out clamp — a wrong window there mostly meant "no clamp" — but
 * the window is now the DIVISOR for pro-rata pay, where an eight-hour drift pays
 * a fully-worked shift RM0.00 and looks deliberate doing it.
 *
 * Null when the free-text slot carries no window ("Late night") or the date is
 * unusable. Callers must treat null as "no schedule", never as a zero window.
 */
export function shiftWindowInstants(
  shiftDate: string,
  slot: string | null | undefined,
): { start: Date; end: Date } | null {
  const w = slotMinutes(slot);
  if (!w) return null;
  const [y, m, d] = shiftDate.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  const midnight = Date.UTC(y, m - 1, d) - VENUE_UTC_OFFSET_MINUTES * 60_000;
  return {
    start: new Date(midnight + w.start * 60_000),
    end: new Date(midnight + w.end * 60_000),
  };
}

/** Label-only slots ("Late night") carry no window — nothing to clash with. */
export function slotWindowsOverlap(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const wa = slotMinutes(a);
  const wb = slotMinutes(b);
  if (!wa || !wb) return false;
  return wa.start < wb.end && wb.start < wa.end;
}

/**
 * The calendar day a shift belongs to, in the venue's timezone.
 *
 * Clash checks compare days before they compare windows, and doing that in UTC
 * puts a 22:00–04:00 Kuala Lumpur shift on two different dates depending on
 * which end you look at.
 */
export function shiftDayKey(d: string | Date): string {
  return new Date(d).toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
}

/** Whole days since epoch for a venue-local date — the offset that puts two
 *  shifts on one timeline. */
function dayIndex(d: string | Date): number {
  const [y, m, day] = shiftDayKey(d).split('-').map(Number);
  return Date.UTC(y, m - 1, day) / 86_400_000;
}

/**
 * A shift's window in absolute minutes on a continuous timeline.
 *
 * `slotMinutes` already wraps an overnight end past 24h, so a 22:00–04:00 shift
 * on day N occupies [N·1440+1320, N·1440+1680) — which correctly runs into
 * day N+1.
 */
export function shiftWindow(
  shiftDate: string | Date,
  slot: string | null | undefined,
): { start: number; end: number } | null {
  const w = slotMinutes(slot);
  if (!w) return null;
  const base = dayIndex(shiftDate) * 1440;
  return { start: base + w.start, end: base + w.end };
}

/**
 * Do two shifts collide in real time?
 *
 * Use this rather than comparing day keys and then windows. That older shape
 * only ever tested shifts sharing a `shiftDate`, so **an overnight shift never
 * met the next morning's**: 22:00–04:00 on the 30th and 02:00–06:00 on the 31st
 * genuinely overlap from 02:00 to 04:00, and both guards passed it. Overnight is
 * the normal shape here, which made that the likeliest real collision of all.
 *
 * Label-only slots ("Late night") carry no window, so they never clash.
 */
export function shiftsOverlap(
  aDate: string | Date,
  aSlot: string | null | undefined,
  bDate: string | Date,
  bSlot: string | null | undefined,
): boolean {
  const wa = shiftWindow(aDate, aSlot);
  const wb = shiftWindow(bDate, bSlot);
  if (!wa || !wb) return false;
  return wa.start < wb.end && wb.start < wa.end;
}
