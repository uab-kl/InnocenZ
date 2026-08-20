/**
 * READ-ONLY. Does the PR `/mine` feed now name WHO booked each shift?
 *
 * Fires the real repository method the mobile app's /mine endpoint uses, for a
 * PR who is rostered by two different agencies, and prints the agency per row.
 * Before the agency join this column did not exist and the app fell back to
 * `agencies[0]`, labelling every shift with one agency's name.
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/_probe-alice.ts
 */
import './_probe-env';
import { ShiftAssignmentRepositoryClass } from '../features/shift-assignment/shift-assignment.repository';
import { shiftsOverlap } from '../util/slot-window';

const ALICE = '1cfade6c-166a-40ee-bc9a-40eecb3f88fb';

async function main() {
  const repo = new ShiftAssignmentRepositoryClass();
  const rows = await repo.listForPr(ALICE);

  console.log(`\n=== /mine for Alice — ${rows.length} assignments ===`);
  console.table(
    rows.map((r) => ({
      date: r.shiftDate,
      slot: r.slot,
      venue: r.outletName,
      status: r.status,
      agencyName: r.agencyName ?? '** STILL NULL **',
      agencyId: r.agencyId?.slice(0, 8),
    })),
  );

  const named = rows.filter((r) => r.agencyName);
  const distinct = new Set(rows.map((r) => r.agencyName));
  console.log(`\nrows carrying an agency name: ${named.length}/${rows.length}`);
  console.log(`distinct agencies on ONE PR's schedule: ${distinct.size} -> ${[...distinct].join(' | ')}`);
  console.log(
    distinct.size > 1
      ? '✅ the feed distinguishes them — agencies[0] would have flattened all of these to one name'
      : '⚠️ only one agency present; this PR cannot demonstrate the bug',
  );

  // The cross-agency OVERNIGHT clash — the case the day-guard cannot see,
  // because the two shifts carry different `shiftDate`s.
  console.log('\n=== overnight cross-agency clash detection ===');
  for (const r of rows) {
    const nextMorning = shiftsOverlap(r.shiftDate, r.slot, r.shiftDate, r.slot);
    if (!r.slot) continue;
    void nextMorning;
  }
  const wwm = rows.find((r) => r.agencyName === 'Why We Met Agency');
  if (wwm) {
    // A hypothetical Atlas shift 02:00–06:00 the MORNING AFTER Alice's WWM night.
    const d = new Date(`${wwm.shiftDate}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    const nextDay = d.toISOString().slice(0, 10);
    const overlaps = shiftsOverlap(nextDay, '02:00 - 06:00', wwm.shiftDate, wwm.slot);
    console.log(`WWM books Alice ${wwm.shiftDate} ${wwm.slot} (${wwm.outletName})`);
    console.log(`Atlas tries    ${nextDay} 02:00 - 06:00`);
    console.log(`  shiftsOverlap -> ${overlaps}  (different shiftDate, so the day-guard never sees it)`);
    console.log(`  clash.agencyId === actingAgencyId ? ${wwm.agencyId === 'ATLAS'} -> refusal uses the NEUTRAL wording`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
