/**
 * Remove the SCRIPT-DRAWN signatures sitting on real accounts.
 *
 * Owner's instruction, 13 Sep 2026: *"choose (recommended) the delete all 74,
 * user can save their sign in the profile setting page so no need to sign
 * everytime"*.
 *
 * 🔴 WHY THIS MATTERS. `user_profile.signature_ink` is what the agency web's
 * TAP-TO-SIGN button sends (`use-my-signature` -> `financeSign`). A signature no
 * person ever drew could therefore land on a real payment voucher in one tap.
 * The PR phone is not exposed the same way — `PvDetailScreen` starts `sigInk`
 * at null and sends only what was drawn there and then.
 *
 * ⚠️ SELECTED BY SHAPE, NEVER BY `updated_by`. The ad-hoc `seed-account-details`
 * script swept these rows at 01:21 on 9 Sep, so `updated_by` names it on rows it
 * merely TOUCHED as well as rows it wrote — which is exactly how two genuine,
 * human-drawn signatures came to be listed as fakes in the backlog. The
 * fingerprint is the fixed 600x200 pad plus a first stroke starting at x=40;
 * real ink carries a screen-sized pad and sub-pixel float coordinates.
 *
 * ⚠️ Unparseable ink is KEPT, not deleted. It cannot be proven synthetic, and
 * `use-my-signature` already treats it as "nothing on file", so it offers no
 * tap-to-sign button and does no harm where it sits.
 *
 * Aborts untouched if the data has moved since it was surveyed.
 *
 *   npx tsx src/scripts/cleanup-synthetic-signatures.ts --dry-run
 *   npx tsx src/scripts/cleanup-synthetic-signatures.ts --apply
 */
import path from 'node:path';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') });
const { db } = await import('@/db');
const { sql, inArray } = await import('drizzle-orm');
const { UserProfileTable } = await import('@/features/user/user-profile/user-profile.model');

const apply = process.argv.includes('--apply');
// `indexOf` returns -1 when the flag is absent, and argv[-1 + 1] is argv[0] —
// the node binary. The first dry run tried to overwrite node.exe.
const backupFlag = process.argv.indexOf('--backup');
const backupPath = backupFlag >= 0 ? process.argv[backupFlag + 1] : undefined;

/** The seeding script's fingerprint. See the note above on why not `updated_by`. */
function isScriptDrawn(raw: string): boolean {
  try {
    const ink = JSON.parse(raw) as { w?: number; h?: number; strokes?: unknown };
    if (ink.w !== 600 || ink.h !== 200) return false;
    const strokes = Array.isArray(ink.strokes) ? (ink.strokes as unknown[]) : [];
    const firstStroke = Array.isArray(strokes[0]) ? (strokes[0] as unknown[]) : [];
    const first = Array.isArray(firstStroke[0]) ? (firstStroke[0] as number[]) : null;
    return first?.[0] === 40;
  } catch {
    return false;
  }
}

type Row = { user_id: string; email: string | null; signature_ink: string };
const rows = (
  await db.execute(sql`
    select up.user_id, u.email, up.signature_ink
    from main.user_profile up
    join main."user" u on u.id = up.user_id
    where up.signature_ink is not null
    order by u.email nulls last
  `)
).rows as Row[];

const synthetic = rows.filter((r) => isScriptDrawn(r.signature_ink));
const kept = rows.filter((r) => !isScriptDrawn(r.signature_ink));

// PRECONDITIONS — the survey this was written against. A mismatch means the
// data moved, and the safe answer is to look again rather than to write.
const EXPECTED_TOTAL = 76;
const EXPECTED_SYNTHETIC = 74;
if (rows.length !== EXPECTED_TOTAL || synthetic.length !== EXPECTED_SYNTHETIC) {
  console.error(
    `ABORT — surveyed ${EXPECTED_SYNTHETIC}/${EXPECTED_TOTAL}, found ${synthetic.length}/${rows.length}.`,
  );
  console.error('Nothing written. Re-run _probe-synthetic-signatures.ts and re-read.');
  process.exit(1);
}

console.log(`${rows.length} on file · ${synthetic.length} script-drawn · ${kept.length} kept`);
console.log(`kept: ${kept.map((r) => r.email ?? r.user_id).join(', ')}`);

if (backupPath) {
  // Every row, kept ones included — a backup that only holds what was removed
  // cannot show what the table looked like.
  writeFileSync(backupPath, JSON.stringify(rows, null, 2), 'utf8');
  console.log(`backup written: ${backupPath} (${rows.length} rows)`);
}

if (!apply) {
  console.log('\nDRY RUN — nothing written. Pass --apply to clear them.');
  process.exit(0);
}

const ids = synthetic.map((r) => r.user_id);
await db
  .update(UserProfileTable)
  .set({ signatureInk: null, updatedBy: 'cleanup:synthetic-signatures' })
  .where(inArray(UserProfileTable.userId, ids));

// Re-read rather than trust the write.
const after = (
  await db.execute(sql`
    select u.email from main.user_profile up
    join main."user" u on u.id = up.user_id
    where up.signature_ink is not null order by u.email
  `)
).rows as Array<{ email: string | null }>;
console.log(`\nAFTER: ${after.length} signature(s) remain`);
for (const r of after) console.log(`  ${r.email}`);
process.exit(0);
