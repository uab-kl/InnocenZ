import 'dotenv/config';

import { eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { OutletTable } from '@/features/outlet/outlet.model';
import { ShiftTable, type ShiftStatus } from '@/features/shift/shift.model';
import { logger } from '@/util/logger';

// Seeds the `shift` table so the outlet Today / History screens and the agency
// roster have real rows to read. The table exists and is wired end to end but
// was empty, so every shift-driven screen rendered blank.
//
// Dates are generated relative to today: past nights are `sealed` (History),
// today is `confirmed` (Today), the next few nights are `open` (upcoming).
// Idempotent: rows stamped with this ACTOR are cleared first, so re-running
// re-bases the window on the current date without touching anyone else's rows.
const ACTOR = 'seed-sample-shifts';

/** Nights relative to today, with the status each should carry. */
const SCHEDULE: Array<{ offsetDays: number; status: ShiftStatus }> = [
  { offsetDays: -6, status: 'sealed' },
  { offsetDays: -5, status: 'sealed' },
  { offsetDays: -3, status: 'sealed' },
  { offsetDays: -2, status: 'sealed' },
  { offsetDays: -1, status: 'sealed' },
  { offsetDays: 0, status: 'confirmed' },
  { offsetDays: 1, status: 'open' },
  { offsetDays: 3, status: 'open' },
];

const SLOTS = ['8pm - 2am', '9pm - 3am'];
const EVENTS = ['Friday floor', 'Weekend push', 'Ladies night', 'Corporate booking'];

function isoDate(offsetDays: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0); // midday avoids any TZ rollover on the date part
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function money(value: number): string {
  return value.toFixed(2);
}

export async function seedSampleShifts(): Promise<void> {
  const outlets = await db
    .select({
      id: OutletTable.id,
      name: OutletTable.name,
      agencyId: OutletTable.onboardedByAgencyId,
    })
    .from(OutletTable);

  const staffed = outlets.filter((o) => o.agencyId !== null);
  if (staffed.length === 0) {
    logger.warn(
      '[seed-sample-shifts] No outlets with an onboarding agency — run seed-sample-orgs first',
    );
    return;
  }

  await db.delete(ShiftTable).where(eq(ShiftTable.createdBy, ACTOR));

  const rows = [];
  for (const [outletIndex, outlet] of staffed.entries()) {
    for (const [nightIndex, night] of SCHEDULE.entries()) {
      // Vary headcount and rate a little per outlet/night so the dashboards do
      // not render a flat line.
      const quantity = 3 + ((outletIndex + nightIndex) % 3);
      const payPerHour = 25 + ((outletIndex * 5 + nightIndex * 3) % 15);
      const hours = 6;
      const estimatedCost = quantity * payPerHour * hours;
      const isPast = night.status === 'sealed';

      rows.push({
        agencyId: outlet.agencyId as string,
        outletId: outlet.id,
        shiftDate: isoDate(night.offsetDays),
        slot: SLOTS[nightIndex % SLOTS.length],
        eventName: EVENTS[(outletIndex + nightIndex) % EVENTS.length],
        eventKind: 'normal' as const,
        languages: 'EN, BM',
        quantity,
        // Past and today's nights are fully staffed; upcoming ones partially.
        filled: night.status === 'open' ? Math.max(0, quantity - 2) : quantity,
        preferredRating: 4,
        payPerHour: money(payPerHour),
        estimatedCost: money(estimatedCost),
        // Only sealed nights have realised sales.
        liveSales: money(isPast ? estimatedCost * 3 + outletIndex * 250 : 0),
        status: night.status,
        createdBy: ACTOR,
        updatedBy: ACTOR,
      });
    }
  }

  await db.insert(ShiftTable).values(rows);

  logger.info(
    `[seed-sample-shifts] Done. ${rows.length} shifts across ${staffed.length} outlet(s), ${isoDate(SCHEDULE[0].offsetDays)} → ${isoDate(SCHEDULE[SCHEDULE.length - 1].offsetDays)}.`,
  );
  for (const outlet of staffed) {
    logger.info(`  ${outlet.name}: ${SCHEDULE.length} shift(s)`);
  }
}

const isDirectRun = process.argv[1]?.includes('seed-sample-shifts');
if (isDirectRun) {
  seedSampleShifts()
    .then(() => process.exit(0))
    .catch((error) => {
      logger.error('[seed-sample-shifts] Error:', error);
      process.exit(1);
    });
}
