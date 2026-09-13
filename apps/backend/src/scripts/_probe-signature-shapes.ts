/**
 * READ-ONLY. Tell a SCRIPT-DRAWN signature from one a person actually drew.
 *
 * Not by counting to 74 — by SHAPE. The seeding script drew a fixed pad
 * (600x200), a fixed point count, and a first point at a fixed x. A human
 * drawing on a pad produces none of those consistently.
 *
 * Prints the distinct shapes with counts so the detector can be written from
 * the data rather than from the headline number. Writes nothing.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') });
const { db } = await import('@/db');
const { sql } = await import('drizzle-orm');

const rows = await db.execute(sql`
  select up.user_id, u.email, up.signature_ink, up.updated_by, up.updated_at
  from main.user_profile up
  join main."user" u on u.id = up.user_id
  where up.signature_ink is not null
`);

type Row = { user_id: string; email: string | null; signature_ink: string; updated_by: string | null };
const list = (rows.rows ?? rows) as Row[];

const shapes = new Map<string, { n: number; emails: string[] }>();
for (const r of list) {
  let key = 'UNPARSEABLE';
  try {
    const ink = JSON.parse(r.signature_ink) as {
      w?: number; h?: number; strokes?: number[][][] | unknown;
    };
    const strokes = Array.isArray(ink.strokes) ? (ink.strokes as unknown[]) : [];
    const points = strokes.reduce<number>(
      (n, s) => n + (Array.isArray(s) ? s.length : 0),
      0,
    );
    const firstStroke = Array.isArray(strokes[0]) ? (strokes[0] as unknown[]) : [];
    const first = Array.isArray(firstStroke[0]) ? (firstStroke[0] as number[]) : null;
    key = `pad ${ink.w}x${ink.h} · strokes ${strokes.length} · points ${points} · firstX ${first ? first[0] : 'n/a'}`;
  } catch {
    /* keep UNPARSEABLE */
  }
  const cur = shapes.get(key) ?? { n: 0, emails: [] };
  cur.n += 1;
  if (cur.emails.length < 4) cur.emails.push(r.email ?? r.user_id.slice(0, 8));
  shapes.set(key, cur);
}

console.log(`${list.length} signatures on file\n`);
for (const [key, v] of [...shapes.entries()].sort((a, b) => b[1].n - a[1].n)) {
  console.log(`${String(v.n).padStart(3)}  ${key}`);
  console.log(`     e.g. ${v.emails.join(', ')}`);
}
process.exit(0);
