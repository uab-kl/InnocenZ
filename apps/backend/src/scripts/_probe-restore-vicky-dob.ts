/**
 * Put Vicky's original birth date back.
 *
 * WHY THIS EXISTS AT ALL: an earlier run of `seed-account-details.ts
 * --trust-ic-dob` overwrote `dob` 1996-03-12 with 1995-03-12, the date her IC
 * encodes. The owner then settled the demo direction the other way — the stored
 * date stays and the fabricated IC moves — which makes the value that run
 * destroyed the authoritative one.
 *
 * It is recoverable ONLY because the parity probe had printed it before the
 * write ("IC 950312-14-8821 says 1995-03-12, dob column says 1996-03-12"). That
 * is luck, not method: a script that overwrites a human-entered field should
 * record the prior value somewhere it can be read back, and that one did not.
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/_probe-restore-vicky-dob.ts          # dry run
 *   npx tsx --tsconfig tsconfig.json src/scripts/_probe-restore-vicky-dob.ts --apply
 */
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { UserTable } from '@/features/user/user.model';
import { UserProfileTable } from '@/features/user/user-profile/user-profile.model';

/** The value the probe recorded before it was overwritten. */
const ORIGINAL_DOB = '1996-03-12';
const OVERWRITTEN_WITH = '1995-03-12';
const EMAIL = 'pr.vicky@innocenz.demo';
const APPLY = process.argv.includes('--apply');

const [row] = await db
  .select({
    userId: UserProfileTable.userId,
    username: UserTable.username,
    dob: UserProfileTable.dob,
    idNo: UserProfileTable.idNo,
  })
  .from(UserProfileTable)
  .innerJoin(UserTable, eq(UserTable.id, UserProfileTable.userId))
  .where(eq(UserTable.email, EMAIL));

if (!row) {
  console.log(`No account for ${EMAIL} — nothing to restore.`);
  process.exit(1);
}
console.log(`${row.username}: dob is ${row.dob}, IC is ${row.idNo}`);

if (row.dob === ORIGINAL_DOB) {
  console.log('Already the original value — nothing to do.');
  process.exit(0);
}
/**
 * Refuse unless the column holds exactly what the bad run wrote. Anything else
 * means somebody has edited it since, and restoring would clobber a newer
 * decision with a stale one.
 */
if (row.dob !== OVERWRITTEN_WITH) {
  console.log(`Expected ${OVERWRITTEN_WITH} before restoring; found ${row.dob}. Refusing.`);
  process.exit(1);
}
if (!APPLY) {
  console.log(`\nDry run. Would set dob ${row.dob} -> ${ORIGINAL_DOB}.`);
  process.exit(0);
}

await db
  .update(UserProfileTable)
  .set({ dob: ORIGINAL_DOB, updatedBy: 'restore-original-dob', updatedAt: new Date() })
  .where(eq(UserProfileTable.userId, row.userId));
console.log(`\nRestored dob to ${ORIGINAL_DOB}. Now re-run the seeder with --ic-follows-dob.`);
process.exit(0);
