/**
 * READ-ONLY. Did 0165 land, and is it INERT as designed?
 *
 * The column must exist (or every query on `user` breaks — a Drizzle field with
 * no migration takes the whole table down, which on `user` means nobody can log
 * in), and every existing row must be NULL, which is what makes the change sign
 * nobody out.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') });
const { db } = await import('@/db');
const { sql } = await import('drizzle-orm');

const col = await db.execute(sql`
  select column_name, data_type, is_nullable, column_default
  from information_schema.columns
  where table_schema = 'main' and table_name = 'user' and column_name = 'sessions_valid_from'
`);
console.log('column:', JSON.stringify(col.rows ?? col, null, 2));

const rows = await db.execute(sql`
  select count(*) as users,
         count(sessions_valid_from) as with_a_cutoff
  from main."user"
`);
console.log('rows:', JSON.stringify(rows.rows ?? rows, null, 2));

// And the table still reads, which is the thing a missing migration breaks.
const sample = await db.execute(sql`select count(*) as n from main."user" where status = 'active'`);
console.log('active users still readable:', JSON.stringify(sample.rows ?? sample, null, 2));
process.exit(0);
