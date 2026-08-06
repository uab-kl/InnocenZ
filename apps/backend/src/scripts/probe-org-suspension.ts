/**
 * Proves inactive organisations lock people out — and that suspended /
 * pending_review do not (they keep a profile-only portal session).
 *
 * Also asserts that nobody legitimate was locked out by the denial rule:
 * `pending_review` is the DEFAULT status for both `agency` and `outlet`, and a
 * platform admin holds no membership row at all.
 *
 * The inactivation it performs is restored in a `finally`.
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/probe-org-suspension.ts
 */
import '@/env.js'; // FIRST — the pg pool builds from unset credentials otherwise
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { AgencyTable, AgencyUserTable } from '@/features/agency/agency.model.js';
import { OutletTable } from '@/features/outlet/outlet.model.js';
import { UserTable } from '@/features/user/user.model.js';
import { suspendedOrgBlock } from '@/features/auth/org-status.js';

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean, detail: string) {
  if (ok) {
    passed++;
    console.log(`  PASS  ${label} — ${detail}`);
  } else {
    failed++;
    console.log(`  FAIL  ${label} — ${detail}`);
  }
}

async function main() {
  console.log('\nORG ACCESS DENIAL — live\n');

  const agencies = await db
    .select({ id: AgencyTable.id, name: AgencyTable.name, status: AgencyTable.status })
    .from(AgencyTable);
  const outlets = await db
    .select({ id: OutletTable.id, name: OutletTable.name, status: OutletTable.status })
    .from(OutletTable);

  const tally = (rows: { status: string }[]) =>
    rows.reduce<Record<string, number>>((a, r) => ((a[r.status] = (a[r.status] ?? 0) + 1), a), {});
  console.log(`  agencies (${agencies.length}):`, JSON.stringify(tally(agencies)));
  console.log(`  outlets  (${outlets.length}):`, JSON.stringify(tally(outlets)));

  const deniedNow = [...agencies, ...outlets].filter((o) => o.status === 'inactive');
  check(
    'nobody is newly locked out by this change',
    deniedNow.length === 0,
    deniedNow.length === 0
      ? 'no live organisation is inactive'
      : `WOULD NOW BE BLOCKED: ${deniedNow.map((o) => `${o.name}(${o.status})`).join(', ')}`,
  );

  const [member] = await db
    .select({ userId: AgencyUserTable.userId, agencyId: AgencyTable.id, name: AgencyTable.name })
    .from(AgencyUserTable)
    .innerJoin(AgencyTable, eq(AgencyUserTable.agencyId, AgencyTable.id))
    .where(and(eq(AgencyUserTable.status, 'active'), eq(AgencyTable.status, 'active')));

  if (!member) {
    console.log('\n  ABORT — no active member of an active agency to test with.\n');
    process.exit(2);
  }
  console.log(`\n  test subject: a member of agency "${member.name}"`);

  const before = await suspendedOrgBlock(member.userId);
  check('an active agency does NOT block its member', before === null, `got ${JSON.stringify(before)}`);

  try {
    await db
      .update(AgencyTable)
      .set({ status: 'suspended' })
      .where(eq(AgencyTable.id, member.agencyId));
    console.log(`  [temporarily suspended "${member.name}"]`);

    const duringSuspended = await suspendedOrgBlock(member.userId);
    check(
      'a SUSPENDED agency does NOT block login (profile-only portal)',
      duringSuspended === null,
      `got ${JSON.stringify(duringSuspended)}`,
    );
  } finally {
    await db
      .update(AgencyTable)
      .set({ status: 'active' })
      .where(eq(AgencyTable.id, member.agencyId));
    console.log(`  [restored "${member.name}" to active after suspend test]`);
  }

  try {
    await db
      .update(AgencyTable)
      .set({ status: 'inactive' })
      .where(eq(AgencyTable.id, member.agencyId));
    console.log(`  [temporarily inactivated "${member.name}"]`);

    const duringInactive = await suspendedOrgBlock(member.userId);
    check(
      'an INACTIVE agency blocks its member',
      typeof duringInactive === 'string' && /inactive/i.test(duringInactive),
      `got ${JSON.stringify(duringInactive)}`,
    );
  } finally {
    await db
      .update(AgencyTable)
      .set({ status: 'active' })
      .where(eq(AgencyTable.id, member.agencyId));
    console.log(`  [restored "${member.name}" to active]`);
  }

  const after = await suspendedOrgBlock(member.userId);
  check('restoring the agency restores access', after === null, `got ${JSON.stringify(after)}`);

  // The carve-out that matters most: a platform admin holds no membership row.
  // If this returned a block, the rule would have locked every admin out of
  // their own platform — the classic over-application of a denial rule.
  const adminEmail = process.env.DEFAULT_ADMIN_EMAIL;
  if (adminEmail) {
    const [admin] = await db
      .select({ id: UserTable.id })
      .from(UserTable)
      .where(eq(UserTable.email, adminEmail));
    if (admin) {
      const adminBlock = await suspendedOrgBlock(admin.id);
      check(
        'a platform admin, who belongs to no organisation, is never blocked',
        adminBlock === null,
        `got ${JSON.stringify(adminBlock)}`,
      );
    }
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
