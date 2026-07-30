/**
 * Shift-slot time windows, and whether two of them collide.
 *
 * Extracted from `shift-assignment.controller.ts`, which used it to refuse
 * double-booking a PR at assign time. `shift.controller.ts` needs the identical
 * rule for the other direction — editing a shift's time into a clash — and two
 * copies of an overlap test is exactly how the two ends of one rule start
 * disagreeing about what "overlap" means.
 */

/** "22:00 - 04:00" -> a minutes window [start, end), overnight wrapped past 24h. */
export function slotMinutes(slot: string | null | undefined): { start: number; end: number } | null {
  if (!slot) return null;
  const m = slot.match(/(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const start = Number(m[1]) * 60 + Number(m[2]);
  let end = Number(m[3]) * 60 + Number(m[4]);
  if (end <= start) end += 24 * 60;
  return { start, end };
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
