/**
 * Did the public team-member sign-up actually SAVE, and can that account log in?
 *
 * Importers/callers: none — a standalone probe, run by hand.
 * Affected API: none written. Reads only.
 * Data schemas: unchanged.
 * Owner's question: "got saved to database ?" / "this can login after sign up ?"
 *
 * READ-ONLY.
 *   cd apps/backend && npx tsx --tsconfig tsconfig.json src/scripts/_probe-member-signup.ts
 */
import 'dotenv/config';

import { sql } from 'drizzle-orm';
import { db } from '@/db/index';

const rows = (r: unknown): Record<string, unknown>[] =>
  ((r as { rows?: Record<string, unknown>[] }).rows ?? (r as Record<string, unknown>[]));

async function main() {
  const users = rows(
    await db.execute(sql`
      select u.id, u.username, u.email, u.status, u.member_code,
             u.password_hash is not null as has_pw,
             u.profile_image is not null as has_photo,
             p.full_name, u.created_at
        from main."user" u
        left join main.user_profile p on p.user_id = u.id
       where u.created_by = 'member-signup'
       order by u.created_at desc limit 20`),
  );
  console.log(`\n=== accounts created by member sign-up: ${users.length} ===`);
  for (const r of users) {
    console.log(
      ` ${r.username} | ${r.email} | status=${r.status} | code=${r.member_code} | pw=${r.has_pw} | photo=${r.has_photo} | profile=${r.full_name}`,
    );
  }

  const pend = rows(
    await db.execute(sql`
      select 'agency' as kind, au.status, au.sub_role, a.name as org, u.email
        from main.agency_user au
        join main.agency a on a.id = au.agency_id
        join main."user" u on u.id = au.user_id
       where au.status <> 'active'
      union all
      select 'outlet', ou.status, ou.sub_role, o.name, u.email
        from main.outlet_user ou
        join main.outlet o on o.id = ou.outlet_id
        join main."user" u on u.id = ou.user_id
       where ou.status <> 'active'`),
  );
  console.log(`\n=== memberships NOT active (the approval queue): ${pend.length} ===`);
  for (const r of pend) {
    console.log(` ${r.kind} | ${r.org} | asked=${r.sub_role} | status=${r.status} | ${r.email}`);
  }

  const roles = rows(
    await db.execute(sql`
      select u.email, count(ur.id)::int as roles
        from main."user" u
        left join main.user_role ur on ur.user_id = u.id
       where u.created_by = 'member-signup'
       group by u.email`),
  );
  console.log(`\n=== portal roles on those accounts (0 => lands on /no-access) ===`);
  for (const r of roles) console.log(` ${r.email} -> ${r.roles} role(s)`);
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
