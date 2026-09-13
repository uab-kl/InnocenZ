/**
 * READ-ONLY. Did clearing `user_profile.signature_ink` touch any VOUCHER?
 *
 * It must not have: a voucher's marks live in `payment_voucher.pr_signature` and
 * `.finance_head_signature`, which are separate columns written at signing time.
 * The owner's condition was "no existing voucher changes", so it is checked
 * rather than assumed.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') });
const { db } = await import('@/db');
const { sql } = await import('drizzle-orm');

const rows = await db.execute(sql`
  select
    count(*)                                             as vouchers,
    count(pr_signature)                                  as with_pr_signature,
    count(finance_head_signature)                        as with_finance_signature,
    count(*) filter (where status in ('signed','paid'))  as signed_or_paid
  from main.payment_voucher
`);
console.log('payment_voucher:', JSON.stringify(rows.rows ?? rows, null, 2));

const profiles = await db.execute(sql`
  select count(*) as profiles, count(signature_ink) as with_signature
  from main.user_profile
`);
console.log('user_profile:', JSON.stringify(profiles.rows ?? profiles, null, 2));
process.exit(0);
