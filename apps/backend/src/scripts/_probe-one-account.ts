/** What one account belongs to. READ-ONLY. */
import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from '@/db/index';
const rows = (r: unknown): Record<string, unknown>[] =>
  ((r as { rows?: Record<string, unknown>[] }).rows ?? (r as Record<string, unknown>[]));
async function main() {
  const email = process.argv[2] ?? 'jinkgan48@gmail.com';
  const u = rows(await db.execute(sql`
    select id, username, status, member_code from main."user" where lower(email) = lower(${email})`));
  console.log(`\naccount "${email}": ${u.length ? 'EXISTS' : 'does NOT exist'}`);
  if (!u.length) { console.log('-> an invite to this address can never be accepted.'); process.exit(0); }
  console.log(`   ${u[0].username} | status=${u[0].status} | ${u[0].member_code}`);
  const m = rows(await db.execute(sql`
    select 'agency' as kind, a.name as org, au.status, au.member_code
      from main.agency_user au join main.agency a on a.id = au.agency_id
     where au.user_id = ${u[0].id}::uuid`));
  const o = rows(await db.execute(sql`
    select 'outlet' as kind, ot.name as org, ou.status, ou.member_code
      from main.outlet_user ou join main.outlet ot on ot.id = ou.outlet_id
     where ou.user_id = ${u[0].id}::uuid`));
  const all = [...m, ...o];
  console.log(`   memberships: ${all.length}`);
  for (const x of all) console.log(`     ${x.kind} | ${x.org} | ${x.status} | ${x.member_code}`);
  const enterable = all.filter((x) => x.status === 'active').length;
  console.log(`\n   enterable now: ${enterable}`);
  console.log(`   -> ${enterable > 1 ? 'the CHOOSER appears after sign-in' : enterable === 1 ? 'goes straight into that one portal (no chooser)' : 'no portal — lands on /no-access with the reason'}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
