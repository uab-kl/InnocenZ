/**
 * READ-ONLY. Does the outlet picker's "Scheduled" badge see an overnight
 * booking that runs INTO the drafted day?
 *
 * The assign guard reads `listForPr` — every assignment the PR holds, with no
 * date window — and compares on a continuous timeline, so a 22:00-04:00 shift
 * on the 23rd correctly refuses a 02:00-06:00 shift on the 24th. Its own
 * comment says so.
 *
 * The badge does NOT. `useOutletBusyWindows(dateIsos)` fetches
 * `from = min(dates)`, `to = max(dates)`, and `listCommittedWindows` filters
 * `shift_date >= from AND <= to`. An overnight shift is stamped only on its
 * START date, so drafting the 24th never fetches the 23rd's row — and the
 * client then buckets what it did fetch by exact date, so it could not use it
 * anyway. `windowsOverlapPadded` handles the +/-1440 wrap perfectly and never
 * gets the chance.
 *
 * This probe calls the REAL repository method, not a restatement of it, and
 * asks the same question two ways: with `from` on the drafted day (what the
 * picker does) and with `from` one day earlier (what it would have to do).
 *
 * Writes nothing.
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/_probe-overnight-busy-window-carry.ts
 */
import './_probe-env';
import { sql } from 'drizzle-orm';
import { db } from '../db/index';
import { PrAvailabilityRepositoryClass } from '../features/pr-availability/pr-availability.repository';

const repo = new PrAvailabilityRepositoryClass();
let failures = 0;

function check(claim: string, ok: boolean, detail = '') {
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${claim}${detail ? ` — ${detail}` : ''}`);
}

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

/** Does the window run past midnight into the following day? */
function isOvernight(win: string): boolean {
  const w = windowMinutes(win);
  return !!w && w[1] > 1440;
}

async function main() {
  console.log('\nOvernight carry-over — can the badge see last night`s shift?\n');

  // Any live overnight assignment: slot wraps past midnight, and the committed
  // read would still count the row (not completed, not clocked out).
  const found = await db.execute(sql`
    SELECT ap.user_id, u.username, sa.agency_id, a.name AS agency,
           s.shift_date, s.slot, o.name AS outlet
    FROM main.shift_assignment sa
    JOIN main.shift s ON s.id = sa.shift_id
    JOIN main.agency_pr ap
      ON ap.user_id = sa.pr_id OR ap.user_id = sa.user_id
    JOIN main."user" u ON u.id = ap.user_id
    LEFT JOIN main.agency a ON a.id = sa.agency_id
    LEFT JOIN main.outlet o ON o.id = s.outlet_id
    WHERE ap.approve_status = 'approved'
      AND ap.agency_id = sa.agency_id
      AND sa.status NOT IN ('cancelled', 'no_show', 'leave_approved', 'completed')
      AND sa.check_out_at IS NULL
      AND s.slot ~ '^[0-9]{1,2}:[0-9]{2} *- *[0-9]{1,2}:[0-9]{2}$'
    ORDER BY s.shift_date DESC
  `);
  const rows =
    (found as unknown as { rows: Array<Record<string, unknown>> }).rows ?? [];
  const overnight = rows.filter((r) => isOvernight(String(r.slot)));

  if (overnight.length === 0) {
    // Zero comparable rows must SKIP, never pass — an empty result proves
    // nothing about the rule, only about the fixture.
    console.log(
      '  SKIP  no live overnight assignment on the DB right now, so this cannot be\n        tested against real data. Re-run once one exists.\n',
    );
    return;
  }

  const r = overnight[0];
  const userId = String(r.user_id);
  const agencyId = String(r.agency_id);
  const startDate = String(r.shift_date).slice(0, 10);
  const slot = String(r.slot);
  const next = new Date(`${startDate}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const draftDate = next.toISOString().slice(0, 10);
  const win = windowMinutes(slot);
  const spillMinutes = (win?.[1] ?? 1440) - 1440;
  const spill = `${String(Math.floor(spillMinutes / 60)).padStart(2, '0')}:${String(spillMinutes % 60).padStart(2, '0')}`;

  console.log(
    `  Live overnight booking: ${r.username} — ${slot} on ${startDate} at ${r.outlet} (${r.agency})`,
  );
  console.log(`  It occupies 00:00 - ${spill} of ${draftDate}.\n`);

  // WHAT THE PICKER ASKS: from = to = the drafted day.
  const asPickerAsks = await repo.listCommittedWindows({
    agencyIds: [agencyId],
    from: draftDate,
    to: draftDate,
    userId,
  });
  // WHAT IT WOULD HAVE TO ASK to see the night before.
  const withDayBefore = await repo.listCommittedWindows({
    agencyIds: [agencyId],
    from: startDate,
    to: draftDate,
    userId,
  });

  console.log(`  picker's own range (from=to=${draftDate}):`);
  if (asPickerAsks.length === 0) console.log('      (nothing)');
  for (const w of asPickerAsks) console.log(`      ${w.date}  ${w.slot}`);
  console.log(`\n  one day earlier (from=${startDate}):`);
  if (withDayBefore.length === 0) console.log('      (nothing)');
  for (const w of withDayBefore) console.log(`      ${w.date}  ${w.slot}`);

  console.log('');
  const pickerSeesIt = asPickerAsks.some((w) => w.slot === slot);
  const widerSeesIt = withDayBefore.some((w) => w.slot === slot);
  check(
    'the wider range DOES return the overnight window (the row is reachable)',
    widerSeesIt,
    widerSeesIt ? slot : 'not returned — then the fixture is wrong, not the rule',
  );
  check(
    "the picker's own range does NOT return it (this is the gap)",
    !pickerSeesIt,
    pickerSeesIt
      ? 'it did return it — no gap after all'
      : `${slot} invisible on ${draftDate}`,
  );
  // Even once fetched, the client buckets by exact date — so the window would
  // still have to be looked up under the PREVIOUS day's key to be usable.
  check(
    'and it is stamped with its START date, not the day it runs into',
    withDayBefore.some(
      (w) => w.slot === slot && w.date.slice(0, 10) === startDate,
    ),
    `date=${startDate}, draft=${draftDate}`,
  );

  console.log(
    `\n  => A venue drafting a small-hours shift on ${draftDate} gets NO badge on this\n     PR, requests her, and the assign guard then refuses — it reads every\n     assignment with no date window and compares on a continuous timeline.\n     The preview warns LESS than the guard it previews.\n`,
  );
  console.log(failures === 0 ? '  all checks passed\n' : `  ${failures} FAILED\n`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
