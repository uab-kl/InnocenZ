/**
 * READ-ONLY. What the agency roster card's "Att." and "Paid" now resolve to for
 * every PR on every agency's roster.
 *
 * Calls `loadPrStats` — the function the controller calls — rather than a
 * hand-written copy of its SQL, so a drift between this probe and production is
 * impossible by construction. It also re-derives each figure from raw rows and
 * asserts the two agree: a probe that only prints what the code returns can
 * certify whatever the code happens to do.
 *
 * SELECTs only. Creates no fixtures — every number below comes from rows that
 * were already there, which is the point: fixtures shaped to fit the query would
 * prove nothing about the live data.
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/probe-pr-stats.ts
 */
import '@/env.js'; // FIRST — the pg pool builds from unset credentials otherwise
import { sql } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { loadPrStats } from '@/features/pr-personnel/pr-stats.js';

type RosterRow = {
  agency_id: string;
  agency_name: string | null;
  user_id: string;
  display_name: string | null;
  tier: string | null;
};

async function main() {
  const roster = await db.execute<RosterRow>(sql`
    select ap.agency_id,
           a.name as agency_name,
           ap.user_id,
           coalesce(nullif(up.full_name, ''), u.username) as display_name,
           ap.tier
    from main.agency_pr ap
    join main."user" u on u.id = ap.user_id
    left join main.user_profile up on up.user_id = ap.user_id
    left join main.agency a on a.id = ap.agency_id
    where ap.approve_status = 'approved'
    order by a.name, display_name
  `);

  const rows = roster.rows ?? [];
  if (rows.length === 0) {
    console.log('No approved agency_pr memberships — nothing to measure.');
    return;
  }

  const byAgency = new Map<string, RosterRow[]>();
  for (const row of rows) {
    byAgency.set(row.agency_id, [...(byAgency.get(row.agency_id) ?? []), row]);
  }

  let mismatches = 0;
  let withAttendance = 0;
  let withPay = 0;

  for (const [agencyId, members] of byAgency) {
    const agencyName = members[0]?.agency_name ?? agencyId;
    console.log(`\n=== ${agencyName} (${members.length} PRs) ===`);

    const stats = await loadPrStats({
      prIds: members.map((m) => m.user_id),
      agencyId,
    });

    for (const member of members) {
      const stat = stats.get(member.user_id);
      const attendance = stat?.attendancePct ?? null;
      const paid = stat?.totalPaidRm ?? 0;

      // Independent re-derivation from raw rows, scoped the same way. If this
      // disagrees with loadPrStats the aggregate is wrong, and the whole point
      // of the probe is to catch that rather than to echo it back.
      const raw = await db.execute<{
        completed: number;
        missed: number;
        excused: number;
        paid: number;
      }>(sql`
        select
          (select count(*) from main.shift_assignment sa
             where sa.pr_id = ${member.user_id} and sa.agency_id = ${agencyId}
               and sa.status = 'completed')::int as completed,
          (select count(*) from main.shift_assignment sa
             where sa.pr_id = ${member.user_id} and sa.agency_id = ${agencyId}
               and sa.status in ('no_show','cancelled'))::int as missed,
          (select count(*) from main.shift_assignment sa
             where sa.pr_id = ${member.user_id} and sa.agency_id = ${agencyId}
               and sa.status = 'leave_approved')::int as excused,
          (select coalesce(sum(pv.net), 0) from main.payment_voucher pv
             where coalesce(pv.user_id, pv.pr_id) = ${member.user_id}
               and pv.agency_id = ${agencyId} and pv.status = 'paid')::float8 as paid
      `);
      const truth = raw.rows?.[0];
      if (!truth) continue;

      const concluded = Number(truth.completed) + Number(truth.missed);
      const expectedPct =
        concluded === 0 ? null : Math.round((Number(truth.completed) / concluded) * 100);
      const agrees =
        attendance === expectedPct && Math.abs(paid - Number(truth.paid)) < 0.005;
      if (!agrees) mismatches += 1;
      if (attendance !== null) withAttendance += 1;
      if (paid > 0) withPay += 1;

      const shown = attendance === null ? '—' : `${attendance}%`;
      console.log(
        `  ${agrees ? 'OK ' : 'BAD'} ${(member.display_name ?? '?').padEnd(28)}` +
          ` ${(member.tier ?? 'no-tier').padEnd(16)}` +
          ` Att ${shown.padStart(4)}` +
          ` (kept ${truth.completed}, missed ${truth.missed}, excused ${truth.excused})` +
          `  Paid RM ${paid.toFixed(2)}`,
      );
    }
  }

  console.log(
    `\n${rows.length} memberships · ${withAttendance} have an attendance record · ` +
      `${withPay} have been paid · ${mismatches} disagree with the raw rows`,
  );
  if (mismatches > 0) {
    console.log('MISMATCH — loadPrStats does not agree with the underlying rows.');
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
