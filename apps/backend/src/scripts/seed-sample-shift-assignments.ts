import 'dotenv/config';

import { eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { PrTable } from '@/features/pr/pr.model';
import { ShiftTable } from '@/features/shift/shift.model';
import {
  ShiftAssignmentTable,
  type ShiftAssignmentStatus,
} from '@/features/shift-assignment/shift-assignment.model';
import { logger } from '@/util/logger';

// Seeds the `shift_assignment` table — the roster link between a `pr` and a
// `shift`. The outlet History screen is built per ASSIGNMENT (one sealed night
// per PR), not per shift, so the table being empty left History blank even
// though the shifts existed.
//
// Rows are derived from whatever shifts and PRs are already in the DB, so this
// stays in sync with seed-sample-shifts / seed-sample-pr-personnel. Idempotent:
// rows stamped with this ACTOR are cleared first, and nobody else's are touched.
const ACTOR = 'seed-sample-shift-assignments';

// Matches the 6h night the shift seed prices its estimates against.
const SHIFT_HOURS = 6;
const SHIFT_START_HOUR = 20; // 8pm

/** Shift status -> the roster state its assignments should carry. */
const ASSIGNMENT_STATUS: Record<string, ShiftAssignmentStatus> = {
  sealed: 'completed',
  completed: 'completed',
  confirmed: 'confirmed',
  open: 'assigned',
  draft: 'assigned',
  cancelled: 'cancelled',
};

function money(value: number): string {
  return value.toFixed(2);
}

/** `YYYY-MM-DD` + an hour offset -> a timestamp for the check-in/out stamps. */
function stampAt(shiftDate: string, hoursFromStart: number): Date {
  const d = new Date(`${shiftDate}T00:00:00.000Z`);
  d.setUTCHours(SHIFT_START_HOUR + hoursFromStart);
  return d;
}

export async function seedSampleShiftAssignments(): Promise<void> {
  const shifts = await db
    .select({
      id: ShiftTable.id,
      agencyId: ShiftTable.agencyId,
      outletId: ShiftTable.outletId,
      shiftDate: ShiftTable.shiftDate,
      status: ShiftTable.status,
      quantity: ShiftTable.quantity,
      filled: ShiftTable.filled,
      payPerHour: ShiftTable.payPerHour,
    })
    .from(ShiftTable);

  if (shifts.length === 0) {
    logger.warn('[seed-sample-shift-assignments] No shifts — run seed-sample-shifts first');
    return;
  }

  const prs = await db
    .select({ id: PrTable.id, agencyId: PrTable.agencyId, name: PrTable.name })
    .from(PrTable)
    .where(eq(PrTable.status, 'active'));

  if (prs.length === 0) {
    logger.warn(
      '[seed-sample-shift-assignments] No active PRs — run seed-sample-pr-personnel first',
    );
    return;
  }

  const prsByAgency = new Map<string, typeof prs>();
  for (const pr of prs) {
    const bucket = prsByAgency.get(pr.agencyId) ?? [];
    bucket.push(pr);
    prsByAgency.set(pr.agencyId, bucket);
  }

  await db.delete(ShiftAssignmentTable).where(eq(ShiftAssignmentTable.createdBy, ACTOR));

  const rows = [];
  const skippedAgencies = new Set<string>();
  // Rotates the starting PR per shift so nights do not all draw the same faces.
  let rotation = 0;

  for (const shift of shifts) {
    const pool = prsByAgency.get(shift.agencyId) ?? [];
    if (pool.length === 0) {
      skippedAgencies.add(shift.agencyId);
      continue;
    }

    const status = ASSIGNMENT_STATUS[shift.status] ?? 'assigned';
    // Staff to the shift's own headcount, capped by the agency's real roster.
    const wanted = status === 'assigned' ? (shift.filled ?? 0) : shift.quantity;
    const headcount = Math.min(Math.max(wanted, 0), pool.length);
    // `pay_per_hour` holds a DAILY wage despite the name — it is set from
    // basePayFromPayTierRows, and tier rows have been daily since migration
    // 0047 (Tier I = 500). Multiplying by SHIFT_HOURS billed a day six times
    // over: 500 x 6 = RM3000 per assignment. The live rows are correct
    // (700.00 = Tier III, 600.00 = Tier II) because they predate this path.
    const payAmount = money(Number(shift.payPerHour ?? 0));
    const isWorked = status === 'completed';

    for (let i = 0; i < headcount; i += 1) {
      const pr = pool[(rotation + i) % pool.length];
      rows.push({
        agencyId: shift.agencyId,
        shiftId: shift.id,
        prId: pr.id,
        status,
        payAmount,
        // Only worked nights carry real stamps; upcoming ones stay unstamped.
        checkInAt: isWorked ? stampAt(shift.shiftDate, 0) : null,
        checkOutAt: isWorked ? stampAt(shift.shiftDate, SHIFT_HOURS) : null,
        notes: null,
        createdBy: ACTOR,
        updatedBy: ACTOR,
      });
    }
    rotation += 1;
  }

  if (rows.length === 0) {
    logger.warn('[seed-sample-shift-assignments] Nothing to insert — no shift matched a PR roster');
    return;
  }

  await db.insert(ShiftAssignmentTable).values(rows);

  const completed = rows.filter((r) => r.status === 'completed').length;
  logger.info(
    `[seed-sample-shift-assignments] Done. ${rows.length} assignment(s) across ${shifts.length} shift(s); ${completed} completed (History rows).`,
  );
  for (const agencyId of skippedAgencies) {
    logger.warn(`  Skipped shifts for agency ${agencyId} — no active PR in its roster`);
  }
}

const isDirectRun = process.argv[1]?.includes('seed-sample-shift-assignments');
if (isDirectRun) {
  seedSampleShiftAssignments()
    .then(() => process.exit(0))
    .catch((error) => {
      logger.error('[seed-sample-shift-assignments] Error:', error);
      process.exit(1);
    });
}
