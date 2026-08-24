/**
 * READ-ONLY. Did 0132 land, and does the dress-code lane actually carry a value
 * from the venue's composer to the person who has to wear it?
 *
 * Writes nothing. "migrations applied successfully!" prints whether or not YOUR
 * entry ran (the 0016 `when` trap), so this asks information_schema instead —
 * and a green tsc cannot prove the read half at all: the TYPE says the fields
 * exist, the QUERY decides whether they arrive.
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/_probe-shift-dress-code.ts
 */
import './_probe-env';
import { sql } from 'drizzle-orm';
import { db } from '../db/index';
import { ShiftAssignmentRepositoryClass } from '../features/shift-assignment/shift-assignment.repository';
import { CreateShiftSchema } from '../schema/shift.schema';

let failures = 0;
function check(claim: string, ok: boolean, detail = '') {
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${claim}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  console.log('\n=== main.shift — the venue-ask columns ===');
  const cols: any = await db.execute(sql`
    SELECT column_name, data_type, character_maximum_length AS len, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'main' AND table_name = 'shift'
      AND column_name IN ('dress_code', 'languages')
    ORDER BY column_name`);
  const rows = cols.rows ?? cols;
  console.table(rows);

  const dress = rows.find((r: any) => r.column_name === 'dress_code');
  check('0132 landed: main.shift.dress_code exists', Boolean(dress));
  check('it is varchar(60)', dress?.len === 60, `len=${dress?.len}`);
  check('it is NULLable — "no answer given" must stay sayable', dress?.is_nullable === 'YES');

  const tpl: any = await db.execute(sql`
    SELECT character_maximum_length AS len FROM information_schema.columns
    WHERE table_schema='main' AND table_name='shift_template' AND column_name='dress_code'`);
  const tplLen = (tpl.rows ?? tpl)[0]?.len;
  check(
    'the template column the composer copies FROM is the same width',
    tplLen === dress?.len,
    `template=${tplLen} shift=${dress?.len}`,
  );

  console.log('\n=== what live shifts carry today ===');
  const live: any = await db.execute(sql`
    SELECT count(*)::int AS shifts,
           count(dress_code)::int AS with_dress_code,
           count(languages)::int AS with_languages
    FROM main.shift`);
  console.table(live.rows ?? live);
  console.log(
    '  A zero under with_dress_code is EXPECTED until a shift is posted from the\n' +
      '  composer after 0132. It is not evidence either way.',
  );

  // ── WHAT IS RECOVERABLE FOR SHIFTS POSTED BEFORE 0132 ─────────────────
  // Nothing, for most of them: the dress code died in the BROWSER at post time,
  // so there is no row anywhere holding the old answer and no backfill can
  // invent one. The single exception is a shift posted FROM a template, whose
  // own `dress_code` (0128) was persisted all along — that is a real value, and
  // it is what the composer would have pre-filled the field with.
  console.log('\n=== recoverable for pre-0132 shifts ===');
  const recoverable: any = await db.execute(sql`
    SELECT count(*)::int AS pre_0132_shifts,
           count(s.template_id)::int AS from_a_template,
           count(t.dress_code)::int AS template_carries_a_dress_code
    FROM main.shift s
    LEFT JOIN main.shift_template t ON t.id = s.template_id
    WHERE s.dress_code IS NULL`);
  console.table(recoverable.rows ?? recoverable);
  const rec = (recoverable.rows ?? recoverable)[0];
  console.log(
    rec.template_carries_a_dress_code > 0
      ? `  ${rec.template_carries_a_dress_code} old shift(s) COULD be backfilled from their template.`
      : '  Nothing to backfill: no pre-0132 shift came from a template that named one.',
  );

  // ── THE WRITE BOUNDARY ──────────────────────────────────────────────────────
  // The create path destructures the parsed body and inserts the rest, so
  // whatever zod KEEPS is what lands. A field the schema silently discards still
  // returns 201 and writes nothing — which is exactly how the dress code was
  // lost for months one layer up, in the web mapper.
  console.log('\n=== POST /shift accepts a dress code ===');
  // A REAL v4 uuid. The first draft of this probe used
  // '00000000-0000-0000-0000-000000000001', which zod's .uuid() refuses (the
  // version nibble is 0 and only the all-zero nil uuid is special-cased). Every
  // parse below then failed for that reason instead of the one being tested —
  // and "61 chars is refused" PASSED anyway, off a rejection that had nothing to
  // do with the length. A fixture the instrument cannot accept turns a negative
  // check into a rubber stamp.
  const base = {
    outletId: '11111111-1111-4111-8111-111111111111',
    shiftDate: '2026-08-24',
  };
  const control = CreateShiftSchema.safeParse(base);
  check(
    'CONTROL: the bare fixture parses, so a failure below means what it says',
    control.success,
    control.success ? '' : JSON.stringify(control.error.issues),
  );
  const kept = CreateShiftSchema.safeParse({ ...base, dressCode: 'Black elegant' });
  check(
    'zod KEEPS dressCode — a discarded field would 201 and write nothing',
    kept.success && kept.data.dressCode === 'Black elegant',
    kept.success ? `kept "${kept.data.dressCode}"` : JSON.stringify(kept.error.issues),
  );
  const tooLong = CreateShiftSchema.safeParse({ ...base, dressCode: 'x'.repeat(61) });
  check('and REFUSES 61 chars, so the column can never truncate in silence', !tooLong.success);
  check('while a post with no dress code is still valid', control.success);

  // ── THE READ BOUNDARY ───────────────────────────────────────────────────────
  console.log('\n=== the PR /mine feed carries both asks ===');
  const anyPr: any = await db.execute(sql`
    SELECT COALESCE(sa.user_id, sa.pr_id) AS user_id, count(*)::int AS shifts
    FROM main.shift_assignment sa
    GROUP BY 1 ORDER BY 2 DESC LIMIT 1`);
  const prRow = (anyPr.rows ?? anyPr)[0];
  if (!prRow) {
    console.log('  SKIP — no assignment exists, so the feed cannot be fired at anything.');
    console.log('  A SKIP is not a pass: this half stays unproven until one does.');
    failures++;
  } else {
    const feed = await new ShiftAssignmentRepositoryClass().listForUser(prRow.user_id);
    check('the feed returned rows to inspect', feed.length > 0, `${feed.length} shifts`);
    const first: any = feed[0];
    if (first) {
      check("each row carries a 'dressCode' key — null is an answer, ABSENT is a bug", 'dressCode' in first);
      check("each row carries a 'languages' key", 'languages' in first);
      const withLangs = feed.filter((r: any) => r.languages);
      console.log(
        withLangs.length > 0
          ? `  live value proof — ${withLangs.length} of ${feed.length} shifts arrive carrying languages: ${JSON.stringify((withLangs[0] as any).languages)}`
          : '  (no assigned shift carries languages yet — only the KEY is proven here)',
      );
    }
  }

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
