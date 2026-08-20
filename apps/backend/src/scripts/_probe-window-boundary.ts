/**
 * READ-ONLY, NO WRITES. Where exactly does the new cross-agency rule draw the line?
 *
 * Alice is booked by Why We Met on 2026-08-18, 15:00-04:00 at JK House. Atlas asks
 * to book her at Velvet 23 the same day. Under the OLD day rule every one of these
 * was refused. Under the new rule only the window + the trip are protected.
 *
 * Real venue pins, the real overlap test, the real travel model.
 *   npx tsx --tsconfig tsconfig.json src/scripts/_probe-window-boundary.ts
 */
import './_probe-env';
import { sql } from 'drizzle-orm';
import { db } from '../db/index';
import { shiftsOverlap } from '../util/slot-window';
import { foreignTravelBlock, travelMinutesBetween } from '../features/shift-assignment/travel-gap';

const ATLAS = 'c30fcd15', WWM = '665ee433';

async function main() {
  const pins: any = await db.execute(sql`SELECT name, lat, lng, id FROM main.outlet WHERE name IN ('JK House','Velvet 23')`);
  const byName: any = {};
  for (const p of (pins.rows ?? pins)) byName[p.name] = { outletId: p.id, lat: Number(p.lat), lng: Number(p.lng) };

  const jk = byName['JK House'], velvet = byName['Velvet 23'];
  const need = travelMinutesBetween(velvet, jk);
  console.log(`\nJK House -> Velvet 23 needs ${need} min of travel (real pins, road-winding model).`);
  console.log(`Alice is held by Why We Met on 2026-08-18, 15:00 - 04:00 at JK House.\n`);

  const heldByWwm = [{
    shiftDate: '2026-08-18', slot: '15:00 - 04:00',
    outletId: jk.outletId, outletName: 'JK House',
    outletLat: jk.lat, outletLng: jk.lng, checkOutAt: null, agencyId: WWM,
  }];

  const candidates = [
    '06:00 - 10:00', '08:00 - 12:00', '09:00 - 13:00', '10:00 - 14:00',
    '11:00 - 14:15', '12:00 - 14:30', '13:00 - 14:45', '14:00 - 15:00',
    '15:00 - 16:00', '22:00 - 04:00',
  ];

  const rows = candidates.map((slot) => {
    const overlaps = shiftsOverlap('2026-08-18', slot, '2026-08-18', '15:00 - 04:00');
    const travelBlocked = foreignTravelBlock({
      shift: { shiftDate: '2026-08-18', slot, ...velvet },
      others: heldByWwm,
      actingAgencyId: ATLAS,
    });
    const endsAt = slot.split(' - ')[1];
    const gap = overlaps ? null : Math.round((new Date(`2026-08-18T15:00:00Z`).getTime() - new Date(`2026-08-18T${endsAt}:00Z`).getTime()) / 60000);
    return {
      atlasWants: slot,
      gapToHerShift: gap === null ? '—' : `${gap} min`,
      needs: `${need} min`,
      OLD_dayRule: 'BLOCKED',
      NEW_rule: overlaps ? 'BLOCKED (overlap)' : travelBlocked ? 'BLOCKED (travel)' : '✅ ALLOWED',
    };
  });
  console.table(rows);
  const freed = rows.filter((r) => r.NEW_rule.startsWith('✅')).length;
  console.log(`${freed} of ${rows.length} slots the DAY rule refused are now bookable by the other agency.`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
