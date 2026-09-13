/** READ-ONLY. The two KEPT signatures, in detail — the audit note called one of them fake. */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') });
const { db } = await import('@/db');
const { sql } = await import('drizzle-orm');

const rows = (await db.execute(sql`
  select u.email, up.signature_ink, up.updated_by, up.updated_at
  from main.user_profile up join main."user" u on u.id = up.user_id
  where u.email in ('owner@atlas-agency.my', 'siawlong0205@gmail.com')
`)).rows as Array<Record<string, string>>;

for (const r of rows) {
  const ink = JSON.parse(r.signature_ink) as { w: number; h: number; strokes: number[][][] };
  const pts = ink.strokes.flat();
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  console.log(`\n${r.email}`);
  console.log(`  pad         ${ink.w} x ${ink.h}`);
  console.log(`  strokes     ${ink.strokes.length}  points ${pts.length}`);
  console.log(`  first point (${pts[0]?.[0]}, ${pts[0]?.[1]})`);
  console.log(`  x range     ${Math.min(...xs)} .. ${Math.max(...xs)}`);
  console.log(`  y range     ${Math.min(...ys)} .. ${Math.max(...ys)}`);
  console.log(`  updated_by  ${r.updated_by}`);
  console.log(`  updated_at  ${r.updated_at}`);
}
process.exit(0);
