/**
 * The venue's clock, on the phone.
 *
 * The mobile mirror of `apps/backend/src/util/slot-window.ts`. It exists because
 * the cancel-fee arithmetic is computed TWICE — once here, to show the PR what
 * cancelling will cost, and once on the server, which seals the figure onto the
 * assignment — and `cancel-fee.ts` states the requirement plainly: the two "must
 * agree exactly — a PR who is shown -RM 27.50 and sealed at -RM 41.25 has been
 * lied to".
 *
 * They could not agree while both sides built their instants with the LOCAL-time
 * constructor. The server's local time is the container's (UTC in deployment);
 * the phone's is the device's. Reading the venue's wall clock in the venue's own
 * zone is the only answer that comes out the same on both.
 *
 * Not in `demo-shifts.ts`, where its sibling `shiftEndDate` lives: that module is
 * demo scaffolding under a standing rule about purging demo data from real
 * sessions, and this is money.
 */

/**
 * Malaysia is UTC+8 all year — no DST — so a fixed offset is exact rather than
 * an approximation. Mirrors `VENUE_UTC_OFFSET_MINUTES` in the backend's
 * `slot-window.ts`; the day a venue is not Malaysian, both move onto the outlet
 * row together.
 */
const VENUE_UTC_OFFSET_MINUTES = 8 * 60;

/**
 * "8pm", "20:00", "8.30pm" -> minutes since midnight, or null when not a clock
 * time. A CHARACTER-FOR-CHARACTER PORT of `clockToMinutes` in the backend's
 * `slot-window.ts`. Do not "improve" one side of it.
 *
 * The "am"/"pm" here are PARSER KEYWORDS matching a slot string the agency
 * typed, not copy — this whole file renders nothing. Never localise them: the
 * server's copy of this regex cannot change, and a slot that stops parsing on
 * the phone quotes a cancellation fee from a different band than the one the
 * server seals.
 */
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
 * Minutes-from-midnight for the start and end of a free-text slot.
 *
 * ⚠️ A PORT OF THE BACKEND'S `slotMinutes`, DELIBERATELY IDENTICAL — two passes
 * in the same order, the same regexes, the same wrap rule.
 *
 * A first draft of this file wrote its own lenient pass: a GLOBAL meridiem scan
 * requiring am/pm on BOTH sides. That is not what the server does — the server
 * SPLITS on the dash and reads each half with `clockToMinutes`, which accepts a
 * bare 24-hour token. The two therefore disagreed on mixed slots: "20:00 - 2am"
 * resolved on the server and returned null here, so the phone would have shown
 * "No cancellation fee" for a shift the server then charged the late band on —
 * which is the exact lie this whole fix exists to stop telling. A near-copy of a
 * money rule is worse than an obvious duplicate, because it looks right.
 */
function slotMinutes(
  slot: string | null | undefined,
): { start: number; end: number } | null {
  if (!slot) return null;
  const m = slot.match(/(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})/);
  if (m) {
    const start = Number(m[1]) * 60 + Number(m[2]);
    let end = Number(m[3]) * 60 + Number(m[4]);
    // Crosses midnight: "22:00 - 04:00" ends the next morning.
    if (end <= start) end += 24 * 60;
    return { start, end };
  }
  const parts = slot.split(/[—–-]/);
  if (parts.length !== 2) return null;
  const start = clockToMinutes(parts[0]!);
  const end = clockToMinutes(parts[1]!);
  if (start == null || end == null) return null;
  return { start, end: end <= start ? end + 24 * 60 : end };
}

/**
 * A shift's scheduled window as two real instants, read in the VENUE's timezone.
 *
 * ⚠️ Never build this with `new Date(y, m, d, hh, mm)`. That reads the wall clock
 * in the DEVICE's timezone, which is right only while every PR's phone is set to
 * Malaysia. A PR who travels, or whose phone carries the wrong zone, would be
 * quoted a cancellation fee from a different band than the one the server seals.
 *
 * Null when the slot carries no readable window ("Late night") or the date is
 * unusable. Treat null as "no schedule", never as a zero window.
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

/** A shift's start instant, or null when the slot carries no readable window. */
export function shiftStartDate(
  shiftDate: string,
  slot: string | null,
): Date | null {
  return shiftWindowInstants(shiftDate, slot)?.start ?? null;
}
