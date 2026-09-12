/**
 * MONEY IS THE OWNER'S ALONE — and the guarantor keeps everything else.
 *
 * Owner, 12 Sep 2026: "owner priority to get charge, guarantor no payment made
 * like other member just see paid and unpaid, owner make payment fpx and the
 * payment method continue."
 *
 * The guarantor is the interesting case: they pass every OTHER owner gate, so
 * this checks BOTH halves — refused on money, still admitted to org changes —
 * because narrowing the wrong gate would silently demote the stand-in.
 *
 * ⚠️ Reads and deliberately-invalid bodies only. Nothing is charged or saved.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') });
const { db } = await import('@/db');
const { sql } = await import('drizzle-orm');
const { JwtControllerClass } = await import('@/features/jwt/jwt.controller');
const jwtController = new JwtControllerClass();
const BASE = `http://localhost:${process.env.BACKEND_PORT ?? 7777}/api/v1`;

const people = await db.execute(sql`
  select distinct on (ou.sub_role) ou.sub_role, u.email, ou.outlet_id as org_id, 'outlet' as kind
  from main.outlet_user ou join main."user" u on u.id = ou.user_id
  where ou.status = 'active' and u.email is not null
    and not exists (select 1 from main.user_role ur join main.role r on r.id = ur.role_id
                    where ur.user_id = u.id and r.role_name = 'admin')
  order by ou.sub_role, u.email
`);

// GET payment-method/mine: reading the instrument is owner-only now.
// GET subscription-payment/invoice/*: paid/unpaid stays readable by everyone.
const EXPECT: Record<string, { readCard: number; orgEdit: 'allowed' | 'refused' }> = {
  owner:            { readCard: 200, orgEdit: 'allowed' },
  guarantor:        { readCard: 403, orgEdit: 'allowed' },
  finance:          { readCard: 403, orgEdit: 'refused' },
  operations_head:  { readCard: 403, orgEdit: 'refused' },
  director:         { readCard: 403, orgEdit: 'refused' },
};

let fail = 0;
for (const p of (people.rows ?? people) as any[]) {
  const want = EXPECT[p.sub_role];
  if (!want) continue;
  const token = jwtController.generateAccessToken({ loginMethod: 'email', loginCriteria: p.email } as never);
  const h = { Authorization: `Bearer ${token}`, 'x-org-id': p.org_id, 'x-org-kind': 'outlet', 'Content-Type': 'application/json' };

  const card = await fetch(`${BASE}/payment-method/mine`, { headers: h });
  // Org edit, probed with an invalid body: 403 = gate refused, 400 = gate passed.
  const edit = await fetch(`${BASE}/outlet/${p.org_id}`, {
    method: 'PUT', headers: h, body: JSON.stringify({ __probe: 'invalid on purpose' }),
  });
  const editGot = edit.status === 403 ? 'refused' : 'allowed';

  const cardOk = card.status === want.readCard;
  const editOk = editGot === want.orgEdit;
  if (!cardOk || !editOk) fail++;
  console.log(
    `${cardOk && editOk ? 'PASS' : 'FAIL'}  ${String(p.sub_role).padEnd(16)} ` +
    `payment-method=${String(card.status).padEnd(3)}(want ${want.readCard})  ` +
    `org-edit=${editGot.padEnd(8)}(want ${want.orgEdit})`,
  );
}
console.log(fail ? `\n${fail} FAILED` : '\nonly the owner touches money; the guarantor still runs the organisation');
process.exit(fail ? 1 : 0);
