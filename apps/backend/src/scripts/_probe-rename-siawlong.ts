/**
 * Give the Atlas Financial Head their real name back.
 *
 * `seed-account-details.ts --rename-placeholders` swept this account into the
 * sub-role rename and called them "Lim Jia Yi". It should never have been in
 * scope: the guard that protects real colleagues tested only for an
 * `@unitedalliedbusiness.com` address, and this person signs in with a personal
 * gmail — so an account a script read as a placeholder was somebody's actual
 * one. That guard now lists personal addresses explicitly.
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/_probe-rename-siawlong.ts          # dry run
 *   npx tsx --tsconfig tsconfig.json src/scripts/_probe-rename-siawlong.ts --apply
 */
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { UserTable } from '@/features/user/user.model';
import { UserProfileTable } from '@/features/user/user-profile/user-profile.model';

const EMAIL = 'siawlong0205@gmail.com';
const SYNTHETIC = 'Lim Jia Yi';
const REAL_NAME = 'Siaw Long';
const APPLY = process.argv.includes('--apply');

const [row] = await db
  .select({
    id: UserTable.id,
    username: UserTable.username,
    fullName: UserProfileTable.fullName,
  })
  .from(UserTable)
  .leftJoin(UserProfileTable, eq(UserProfileTable.userId, UserTable.id))
  .where(eq(UserTable.email, EMAIL));

if (!row) {
  console.log(`No account for ${EMAIL}.`);
  process.exit(1);
}
console.log(`display "${row.username}"   legal "${row.fullName}"`);

if (row.username === REAL_NAME && row.fullName === REAL_NAME) {
  console.log('Already correct — nothing to do.');
  process.exit(0);
}
/**
 * Only rewrite the name this script is known to have written. Anything else
 * means a person has since set it deliberately, and a repair that overwrites a
 * deliberate edit is the original mistake pointing the other way.
 */
if (row.username !== SYNTHETIC && row.fullName !== SYNTHETIC) {
  console.log(`Expected "${SYNTHETIC}"; found something else. Refusing.`);
  process.exit(1);
}
if (!APPLY) {
  console.log(`\nDry run. Would set both names to "${REAL_NAME}".`);
  process.exit(0);
}

await db
  .update(UserTable)
  .set({ username: REAL_NAME, updatedBy: 'restore-real-name', updatedAt: new Date() })
  .where(eq(UserTable.id, row.id));
await db
  .update(UserProfileTable)
  .set({ fullName: REAL_NAME, updatedBy: 'restore-real-name', updatedAt: new Date() })
  .where(eq(UserProfileTable.userId, row.id));

console.log(`\nRenamed to "${REAL_NAME}". Re-run the seeder to realign gender, IC and card.`);
process.exit(0);
