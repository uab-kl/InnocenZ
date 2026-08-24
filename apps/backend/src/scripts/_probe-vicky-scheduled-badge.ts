/**
 * READ-ONLY. Why does the outlet's SELECT PRS picker badge a PR "Scheduled"?
 *
 * The badge is NOT a claim about this venue. It fires off
 * `GET /pr-availability/committed-outlet`, which returns bare `HH:MM - HH:MM`
 * windows for every agency the venue is approved with — deliberately including
 * bookings at OTHER venues, anonymised to times only. The client then pads each
 * window by `TRAVEL_BUFFER_MINUTES` (45) and badges on overlap with the DRAFTED
 * time.
 *
 * So "Scheduled" is correct iff the PR holds a committed window that, padded by
 * 45 minutes either side, overlaps the drafted window. This probe prints every
 * window the read would return for one PR on one date, then replays the real
 * client rule against a set of candidate draft windows — so the answer is the
 * arithmetic the UI actually runs, not a guess about it.
 *
 * Writes nothing: two selects.
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/_probe-vicky-scheduled-badge.ts [name] [date]
 */
import './_probe-env';
import { sql } from 'drizzle-orm';
import { db } from '../db/index';

/** The 45 minutes the picker pads a busy window by, both sides. */
const TRAVEL_BUFFER_MINUTES = 45;

/** `"22:00 - 04:00"` -> [1320, 1680]; end pushed past midnight when it wraps. */
function windowMinutes(win: string): [number, number] | null {
  const m = /(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/.exec(win);
  if (!m) return null;
  const start = Number(m[1]) * 60 + Number(m[2]);
  let end = Number(m[3]) * 60 + Number(m[4]);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  if (end <= start) end += 1440;
  return [start, end];
}

/** The client's `windowsOverlapPadded`, same shifts, same pad. */
function overlapsPadded(busy: string, asked: string): boolean {
  const wb = windowMinutes(busy);
  const wa = windowMinutes(asked);
  if (!wb || !wa) return false;
  const b0 = wb[0] - TRAVEL_BUFFER_MINUTES;
  const b1 = wb[1] + TRAVEL_BUFFER_MINUTES;
  for (const shift of [-1440, 0, 1440]) {
    if (Math.max(wa[0], b0 + shift) < Math.min(wa[1], b1 + shift)) return true;
  }
  return false;
}

const NEEDLE = process.argv[2] ?? 'Vicky';
const DATE = process.argv[3] ?? '2026-08-24';

async function main() {
  console.log(`\nSELECT PRS "Scheduled" badge — ${NEEDLE} on ${DATE}\n`);

  // Who is this person? `username` is the handle the comcard prints; the legal
  // name lives on the profile as `full_name`. There is no `user.name` column —
  // asking for one is how the first run of this probe failed, which is also the
  // proof that it can fail.
  const people = await db.execute(sql`
    SELECT u.id, u.username, up.full_name
    FROM main."user" u
    LEFT JOIN main.user_profile up ON up.user_id = u.id
    WHERE u.username ILIKE ${`%${NEEDLE}%`} OR up.full_name ILIKE ${`%${NEEDLE}%`}
    ORDER BY u.username
  `);
  const rows =
    (people as unknown as { rows: Array<Record<string, unknown>> }).rows ?? [];
  if (rows.length === 0) {
    console.log(`  no user matching "${NEEDLE}"`);
    return;
  }
  for (const p of rows) {
    console.log(
      `  user ${p.id}  username=${p.username}  full_name=${p.full_name ?? '—'}`,
    );
  }
  const userIds = rows.map((r) => String(r.id));

  // Every assignment on that date, WITH its venue — the same rows
  // `listCommittedWindows` reads, plus the outlet name the API strips before it
  // reaches the browser. Printing the venue is the point: it says whether the
  // badge came from this venue or another one.
  // `= ANY($1)` binds a JS array as ONE text param and postgres rejects it as a
  // malformed array literal — placeholders per id instead.
  const idList = sql.join(
    userIds.map((id) => sql`${id}`),
    sql`, `,
  );
  const committed = await db.execute(sql`
    SELECT sa.pr_id, sa.status, s.slot, s.shift_date, o.name AS outlet_name,
           a.name AS agency_name, sa.check_out_at
    FROM main.shift_assignment sa
    JOIN main.shift s ON s.id = sa.shift_id
    LEFT JOIN main.outlet o ON o.id = s.outlet_id
    LEFT JOIN main.agency a ON a.id = sa.agency_id
    WHERE sa.pr_id IN (${idList})
      AND s.shift_date::date = ${DATE}::date
    ORDER BY s.slot
  `);
  const cRows =
    (committed as unknown as { rows: Array<Record<string, unknown>> }).rows ?? [];

  console.log(`\n  ${cRows.length} assignment row(s) on ${DATE}:`);
  const liveWindows: string[] = [];
  for (const r of cRows) {
    // The committed read drops `completed` rows and anyone already clocked out —
    // it mirrors the assign guard, so a finished shift must NOT badge.
    const counted = r.status !== 'completed' && r.check_out_at === null;
    console.log(
      `    ${counted ? 'COUNTS ' : 'skipped'}  slot=${String(r.slot)}  status=${String(r.status)}  venue=${String(r.outlet_name)}  agency=${String(r.agency_name)}`,
    );
    if (counted && r.slot) liveWindows.push(String(r.slot));
  }

  if (liveWindows.length === 0) {
    console.log(
      `\n  => No committed window on ${DATE}. A "Scheduled" badge on this date\n     could NOT have come from an assignment.\n`,
    );
    return;
  }

  const drafts = [
    '13:00 - 14:00',
    '15:00 - 16:00',
    '18:00 - 22:00',
    '20:00 - 02:00',
    '22:00 - 04:00',
  ];
  console.log(
    `\n  Would the badge fire? (busy window padded ${TRAVEL_BUFFER_MINUTES}min either side)\n`,
  );
  for (const draft of drafts) {
    const hits = liveWindows.filter((w) => overlapsPadded(w, draft));
    console.log(
      `    draft ${draft}  ->  ${hits.length > 0 ? `BADGE (via ${hits.join(', ')})` : 'no badge'}`,
    );
  }
  console.log(
    `\n  The badge names no venue and no agency — only the time. That is the\n  cross-agency busy rule: the venue learns she is taken, not by whom.\n`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
