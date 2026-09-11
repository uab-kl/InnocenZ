/**
 * EVERY field the sign-up form asked for, read back from the database.
 *
 * Importers/callers: none — standalone probe, run by hand.
 * Affected API: none. READ-ONLY.
 * Owner's instruction: "make sure that really take from the database and the
 * sign up page really works all input by the user account saved to database".
 *
 *   cd apps/backend && npx tsx --tsconfig tsconfig.json src/scripts/_probe-signup-fields.ts <email>
 */
import 'dotenv/config';

import { sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { comparePassword } from '@/util/password';

const rows = (r: unknown): Record<string, unknown>[] =>
  ((r as { rows?: Record<string, unknown>[] }).rows ?? (r as Record<string, unknown>[]));

const EMAIL = process.argv[2] ?? 'nurul.aina.zulkifli@photo-probe.test';
/** What was TYPED into the form — each line below compares against it. */
const TYPED = {
  fullName: 'Nurul Aina binti Zulkifli',
  email: EMAIL,
  phone: '60134567890',
  password: 'Ph0toProbe!2026',
  org: 'Atlas Agency',
  role: 'director',
};

function line(label: string, typed: string, stored: unknown) {
  const s = stored == null ? '(null)' : String(stored);
  const ok = s === typed;
  console.log(` ${ok ? 'OK  ' : '!!  '}${label.padEnd(16)} typed=${JSON.stringify(typed)}  stored=${JSON.stringify(s)}`);
  return ok;
}

async function main() {
  const [u] = rows(
    await db.execute(sql`
      select u.id, u.username, u.email, u.phone_num, u.password_hash, u.profile_image,
             u.status, u.member_code, u.created_by, u.created_at, p.full_name
        from main."user" u
        left join main.user_profile p on p.user_id = u.id
       where lower(u.email) = lower(${EMAIL})`),
  );
  if (!u) { console.log(`\n!! no account for ${EMAIL}`); process.exit(1); }

  console.log('\n=== WHAT THE USER TYPED vs WHAT THE DATABASE HOLDS ===');
  line('full name', TYPED.fullName, u.username);
  line('profile.full_name', TYPED.fullName, u.full_name);
  line('email', TYPED.email, u.email);
  line('mobile', TYPED.phone, u.phone_num);

  const hash = String(u.password_hash ?? '');
  const pwOk = hash ? await comparePassword(TYPED.password, hash) : false;
  console.log(` ${pwOk ? 'OK  ' : '!!  '}${'password'.padEnd(16)} typed="Ph0toProbe!2026"  stored=<bcrypt ${hash.slice(0, 7)}…> verifies=${pwOk}`);
  console.log(` ${hash.includes(TYPED.password) ? '!!  ' : 'OK  '}${'plaintext leak'.padEnd(16)} password is NOT stored in the clear`);

  const img = u.profile_image == null ? null : String(u.profile_image);
  console.log(`\n=== THE PHOTO ===`);
  console.log(` ${img ? 'OK  ' : '!!  '}profile_image = ${JSON.stringify(img)}`);
  console.log(`     R2 configured: ${Boolean(process.env.R2_BUCKET || process.env.R2_ACCOUNT_ID)}   public base: ${process.env.R2_PUBLIC_URL ?? '(none)'}`);

  const mem = rows(
    await db.execute(sql`
      select a.name as org, au.sub_role, au.status, au.member_code, au.created_at
        from main.agency_user au
        join main.agency a on a.id = au.agency_id
       where au.user_id = ${u.id}::uuid
      union all
      select o.name, ou.sub_role, ou.status, ou.member_code, ou.created_at
        from main.outlet_user ou
        join main.outlet o on o.id = ou.outlet_id
       where ou.user_id = ${u.id}::uuid`),
  );
  console.log('\n=== THE ORGANISATION THEY CHOSE ===');
  if (mem.length === 0) console.log(' !!  no membership row');
  for (const m of mem) {
    line('organisation', TYPED.org, m.org);
    line('role asked for', TYPED.role, m.sub_role);
    line('membership', 'pending', m.status);
    console.log(`     member_code = ${m.member_code}  (must be INNPND while waiting)`);
  }

  const roles = rows(
    await db.execute(sql`select count(*)::int as n from main.user_role where user_id = ${u.id}::uuid`),
  );
  console.log(`\n=== ACCESS GRANTED BY SIGNING UP ===`);
  console.log(` ${Number(roles[0].n) === 0 ? 'OK  ' : '!!  '}user_role rows = ${roles[0].n}  (must be 0 — signing up grants nothing)`);
  console.log(`\n     account status=${u.status}  member_code=${u.member_code}  created_by=${u.created_by}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
