/**
 * READ-ONLY. Exactly which signatures are SCRIPT-DRAWN, by fingerprint.
 *
 * The seeding script always drew on a 600x200 pad and always started its first
 * stroke at x=40. A person drawing on the real web pad produces neither: the
 * pad is sized to the screen, and the first point lands wherever they touched.
 *
 * TEST_SCRIPT described the shape as "roughly 20 points starting at x=40" —
 * that part was imprecise. Point counts run 57-131 and strokes run 2-3, so
 * COUNTS are the wrong test. The pad size plus the fixed first x is the
 * fingerprint, and it separates the set cleanly.
 *
 * Writes nothing. Prints the delete list and, deliberately, the KEEP list too:
 * a cleanup that cannot name what it is sparing is not reviewable.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') });
const { db } = await import('@/db');
const { sql } = await import('drizzle-orm');

export type SigRow = {
  user_id: string;
  email: string | null;
  signature_ink: string;
  updated_by: string | null;
};

/** The script's fingerprint: fixed 600x200 pad, first stroke starting at x=40. */
export function isScriptDrawn(raw: string): boolean {
  try {
    const ink = JSON.parse(raw) as { w?: number; h?: number; strokes?: unknown };
    if (ink.w !== 600 || ink.h !== 200) return false;
    const strokes = Array.isArray(ink.strokes) ? (ink.strokes as unknown[]) : [];
    const firstStroke = Array.isArray(strokes[0]) ? (strokes[0] as unknown[]) : [];
    const first = Array.isArray(firstStroke[0]) ? (firstStroke[0] as number[]) : null;
    return first?.[0] === 40;
  } catch {
    // Unparseable ink cannot be proven synthetic, so it is KEPT. The sign
    // button already treats it as "no signature on file" (see use-my-signature).
    return false;
  }
}

const rows = (
  await db.execute(sql`
    select up.user_id, u.email, up.signature_ink, up.updated_by
    from main.user_profile up
    join main."user" u on u.id = up.user_id
    where up.signature_ink is not null
    order by u.email nulls last
  `)
).rows as SigRow[];

const synthetic = rows.filter((r) => isScriptDrawn(r.signature_ink));
const keep = rows.filter((r) => !isScriptDrawn(r.signature_ink));

console.log(`${rows.length} on file · ${synthetic.length} script-drawn · ${keep.length} kept\n`);
console.log('KEEP (drawn by a person, or unparseable):');
for (const r of keep) console.log(`  ${r.email ?? r.user_id}`);
console.log('\nWOULD DELETE:');
for (const r of synthetic) console.log(`  ${r.email ?? r.user_id}`);
process.exit(0);
