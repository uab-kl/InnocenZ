/**
 * READ-ONLY. Did extracting `resolveOrgOwnerPayer` out of `orgOwnerPaysOnly`
 * change what that guard answers?
 *
 * The guard decides who may see and replace the organisation's payment
 * instrument and who may start an FPX checkout — owner's rule, 12 Sep 2026:
 * "guarantor no payment made like other member just see paid and unpaid, owner
 * make payment fpx and the payment method continue."
 *
 * Only GETs are issued, both `orgOwnerPaysOnly`-gated, so nothing can be
 * written — the standing lesson from `never-probe-a-gate-with-a-write`.
 * 403 = refused; 200 = admitted.
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

const PATHS = ['/payment-method/mine', '/payment-method/mine/all'];
/** Money is the one place the guarantor does NOT stand in for the owner. */
const EXPECT: Record<string, 'allowed' | 'refused'> = {
  owner: 'allowed', guarantor: 'refused', finance: 'refused', director: 'refused',
  operations_head: 'refused', ops: 'refused',
};

let fail = 0;
let checked = 0;
for (const kind of ['agency', 'outlet'] as const) {
  const table = kind === 'agency' ? 'agency_user' : 'outlet_user';
  const orgCol = kind === 'agency' ? 'agency_id' : 'outlet_id';
  const people = await db.execute(sql`
    select distinct on (m.sub_role) m.sub_role, u.email, m.${sql.raw(orgCol)} as org_id
    from main.${sql.raw(table)} m join main."user" u on u.id = m.user_id
    where m.status = 'active' and u.email is not null
      and not exists (select 1 from main.user_role ur join main.role r on r.id = ur.role_id
                      where ur.user_id = u.id and r.role_name = 'admin')
    order by m.sub_role, u.email`);

  for (const p of (people.rows ?? people) as any[]) {
    const want = EXPECT[p.sub_role];
    if (!want) { console.log(`${kind}/${p.sub_role}: no expectation recorded — skipped`); continue; }
    const marks: string[] = [];
    for (const pth of PATHS) {
      const res = await fetch(`${BASE}${pth}`, {
        headers: {
          Authorization: `Bearer ${jwt.generateAccessToken({ loginMethod: 'email', loginCriteria: p.email } as never)}`,
          'x-org-id': p.org_id, 'x-org-kind': kind,
        },
      });
      const got = res.status === 403 ? 'refused' : res.status === 200 ? 'allowed' : `http${res.status}`;
      checked++;
      if (got !== want) fail++;
      marks.push(`${pth.split('/').pop()}=${got}`);
    }
    console.log(`${kind.padEnd(7)} ${String(p.sub_role).padEnd(16)} want=${want.padEnd(8)} ${marks.join('  ')}`);
  }
}
console.log(`\n${checked} call(s) checked — ${fail ? `${fail} MISMATCH` : 'every lane answers as the owner\'s rule says'}`);
process.exit(fail ? 1 : 0);
