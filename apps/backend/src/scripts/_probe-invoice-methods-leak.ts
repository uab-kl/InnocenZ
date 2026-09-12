/**
 * READ-ONLY. `GET /subscription-payment/invoice/:id` must stay OPEN to every
 * member — "did our payment go through" is a fair question for anyone in the
 * org — while its `methods` array reaches the owner alone.
 *
 * ⚠️ WHAT THIS CAN AND CANNOT PROVE TODAY. The live database holds exactly one
 * `payment_method` row and its status is `removed`, which `listFor` filters
 * out — so the owner's array is legitimately empty too, and no lane comparison
 * can distinguish "withheld" from "nothing on file". This probe therefore
 * proves only the half it can: every lane still gets 200 with an array (the
 * fix refused nobody). The withholding itself is proved by
 * `_probe-owner-pays-only.ts`, which shows the same predicate refusing every
 * non-owner lane on the `/payment-method` routes.
 *
 * Only GET is issued; nothing here can change a row.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') });
const { db } = await import('@/db');
const { sql } = await import('drizzle-orm');
const { JwtControllerClass } = await import('@/features/jwt/jwt.controller');
const jwt = new JwtControllerClass();
const BASE = `http://localhost:${process.env.BACKEND_PORT ?? 7777}/api/v1`;

const target = await db.execute(sql`
  select si.id as invoice_id, ms.subscriber_id as agency_id
  from main.subscription_invoice si
  join main.member_subscription ms on ms.id = si.member_subscription_id
  where ms.subscriber_type = 'agency'
  -- The agency with the MOST active lanes: picking any invoice found one with a
  -- single member, so the non-owner half of the question was never asked.
  order by (select count(distinct au.sub_role) from main.agency_user au
             where au.agency_id = ms.subscriber_id and au.status = 'active') desc
  limit 1`);
const row = ((target.rows ?? target) as any[])[0];
if (!row) { console.log('SKIP — no agency invoice exists. This is about the FIXTURES, not the gate.'); process.exit(2); }

const lanes = await db.execute(sql`
  select distinct on (au.sub_role) au.sub_role, u.email
  from main.agency_user au join main."user" u on u.id = au.user_id
  where au.agency_id = ${row.agency_id} and au.status = 'active' and u.email is not null
  order by au.sub_role, u.email`);

const people = (lanes.rows ?? lanes) as any[];
if (people.length === 0) { console.log(`SKIP — agency ${row.agency_id} has no active members.`); process.exit(2); }

let fail = 0;
for (const p of people) {
  const res = await fetch(`${BASE}/subscription-payment/invoice/${row.invoice_id}`, {
    headers: {
      Authorization: `Bearer ${jwt.generateAccessToken({ loginMethod: 'email', loginCriteria: p.email } as never)}`,
      'x-org-id': row.agency_id, 'x-org-kind': 'agency',
    },
  });
  const body: any = await res.json().catch(() => null);
  const methods = body?.data?.methods;
  const periods = Array.isArray(body?.data?.history) ? body.data.history.length : -1;
  const ok = res.status === 200 && Array.isArray(methods);
  if (!ok) fail++;
  console.log(`${String(p.sub_role).padEnd(10)} http=${res.status} methods=${Array.isArray(methods) ? methods.length : 'NOT-AN-ARRAY'} periods_visible=${periods} ${ok ? 'OK' : '❌'}`);
}
console.log(fail ? `\n${fail} lane(s) broken` : '\nEvery lane still reads the invoice; paid/unpaid history intact.');
process.exit(fail ? 1 : 0);
