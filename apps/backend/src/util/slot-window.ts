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
