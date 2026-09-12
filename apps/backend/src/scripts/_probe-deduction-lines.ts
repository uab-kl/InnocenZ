// Is there any NEGATIVE voucher line? Without one, the History deduction fix
// cannot be verified on screen — only by reading the mapper. READ-ONLY.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') });
const { db } = await import('@/db');
const { sql } = await import('drizzle-orm');
const cols = await db.execute(sql`select column_name from information_schema.columns where table_schema='main' and table_name='payment_voucher_line' order by ordinal_position`);
console.log('COLS:', JSON.stringify((cols.rows ?? cols).map((x:any)=>x.column_name)));
const r = await db.execute(sql`
  select component, count(*)::int as n, min(amount::text) as min_amt
  from main.payment_voucher_line group by component order by 2 desc`);
for (const x of (r.rows ?? r) as any[]) console.log(`${String(x.component).padEnd(14)} n=${String(x.n).padEnd(4)} min=${x.min_amt}`);
process.exit(0);
