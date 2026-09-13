/**
 * READ-ONLY. Is overtime actually RECORDED on the shift row, so the phone's
 * "recorded at check-out, waiting on your agency" is a true statement?
 *
 * The audit flagged that wording as wrong. On CheckInScreen it WAS — the columns
 * stay null there and the screen now says "estimate". On PaymentScreen the same
 * sentence is read off the server's own `overtime_minutes`, so this settles
 * which of the two claims is which.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') });
const { db } = await import('@/db');
const { sql } = await import('drizzle-orm');

const rows = await db.execute(sql`
  select
    count(*)                                                as assignments,
    count(*) filter (where overtime_minutes is not null)    as have_ot_column,
    count(*) filter (where coalesce(overtime_minutes,0) > 0) as with_overtime,
    coalesce(sum(overtime_minutes), 0)                      as total_ot_minutes
  from main.shift_assignment
`);
console.log(JSON.stringify(rows.rows ?? rows, null, 2));
process.exit(0);
