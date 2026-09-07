/**
 * READ-ONLY probe: does `findOpenCheckInForUser` see the open check-in that
 * `checkInMine` must now refuse on?
 *
 * Deliberately not an HTTP probe. Hitting POST /check-in to watch it fail
 * WRITES a check-in if the guard is broken — the exact state we are trying to
 * make impossible. This calls the query directly, so a wrong answer costs
 * nothing.
 *
 *   pnpm tsx --tsconfig tsconfig.json src/scripts/_probe-open-checkin-guard.ts
 */
import { eq, sql } from 'drizzle-orm';
import { shiftAssignmentRepository } from '@/composition-root';
import { db } from '@/db/index';
import { OutletTable } from '@/features/outlet/outlet.model';
import { ShiftAssignmentTable } from '@/features/shift-assignment/shift-assignment.model';
import { ShiftTable } from '@/features/shift/shift.model';
import { UserTable } from '@/features/user/user.model';

const NIL_UUID = '00000000-0000-0000-0000-000000000000';

async function main() {
  // Every assignment carrying an unclosed check-in right now, whoever it is.
  const open = await db
    .select({
      assignmentId: ShiftAssignmentTable.id,
      prId: ShiftAssignmentTable.prId,
      userId: ShiftAssignmentTable.userId,
      name: UserTable.username,
      outlet: OutletTable.name,
      slot: ShiftTable.slot,
      checkInAt: ShiftAssignmentTable.checkInAt,
      status: ShiftAssignmentTable.status,
    })
    .from(ShiftAssignmentTable)
    .innerJoin(ShiftTable, eq(ShiftAssignmentTable.shiftId, ShiftTable.id))
    .leftJoin(OutletTable, eq(ShiftTable.outletId, OutletTable.id))
    .leftJoin(
      UserTable,
      eq(
        UserTable.id,
        sql`coalesce(${ShiftAssignmentTable.userId}, ${ShiftAssignmentTable.prId})`,
      ),
    )
    .where(
      sql`${ShiftAssignmentTable.checkInAt} is not null and ${ShiftAssignmentTable.checkOutAt} is null`,
    );

  console.log(`\nOPEN CHECK-INS LIVE: ${open.length}`);
  for (const row of open) {
    console.log(
      `  ${row.name ?? row.prId} · ${row.outlet} · ${row.slot} · in ${row.checkInAt?.toLocaleTimeString()} · ${row.status}`,
    );
  }

  // For each person holding one, ask the guard what it would say about a
  // DIFFERENT assignment of theirs — the one they would try to stamp next.
  console.log('\nWHAT THE GUARD ANSWERS (excluding their own open row or not):');
  const seen = new Set<string>();
  for (const row of open) {
    const personId = row.userId ?? row.prId;
    if (seen.has(personId)) continue;
    seen.add(personId);

    const verdict = await shiftAssignmentRepository.findOpenCheckInForUser({
      userId: personId,
      prId: row.prId,
      excludeAssignmentId: NIL_UUID,
    });
    console.log(
      `  ${row.name ?? personId} -> ${
        verdict
          ? `BLOCKED · "Check out of ${verdict.outletName} first" (${verdict.slot}, in ${verdict.checkInAt.toLocaleTimeString()})`
          : 'allowed (no open check-in)'
      }`,
    );

    // A row must NOT block itself: excluding its own id has to come back clean,
    // or a PR could never close the shift they are standing on.
    const self = await shiftAssignmentRepository.findOpenCheckInForUser({
      userId: personId,
      prId: row.prId,
      excludeAssignmentId: row.assignmentId,
    });
    console.log(
      `    excluding its own row -> ${
        self
          ? `still blocked by ${self.outletName} (a SECOND open row — the bug)`
          : 'clean'
      }`,
    );
  }

  // Someone with no open check-in must be waved through.
  const clean = await db
    .select({ id: UserTable.id, name: UserTable.username })
    .from(UserTable)
    .where(eq(UserTable.username, 'Alice'))
    .limit(1);
  if (clean[0]) {
    const verdict = await shiftAssignmentRepository.findOpenCheckInForUser({
      userId: clean[0].id,
      excludeAssignmentId: NIL_UUID,
    });
    console.log(
      `\nCONTROL · ${clean[0].name} -> ${
        verdict
          ? `BLOCKED by ${verdict.outletName} (WRONG)`
          : 'allowed (correct — no open check-in)'
      }`,
    );
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
