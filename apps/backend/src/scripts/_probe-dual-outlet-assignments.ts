/** READ-ONLY. Same question for /shift-assignment/:id and /pr/:id, both venues. */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') });
const { db } = await import('@/db');
const { sql } = await import('drizzle-orm');
const { JwtControllerClass } = await import('@/features/jwt/jwt.controller');

const EMAIL = 'jinkgan48@gmail.com';
const token = new JwtControllerClass().generateAccessToken({
  loginMethod: 'email', loginCriteria: EMAIL,
} as never);

const venues = (await db.execute(sql`
  select o.id, o.name from main.outlet_user ou
  join main.outlet o on o.id = ou.outlet_id
  join main."user" u on u.id = ou.user_id
  where u.email = ${EMAIL} and ou.status = 'active' order by ou.created_at
`)).rows as Array<Record<string, string>>;

const get = (url: string, orgId?: string) =>
  fetch(`http://localhost:7777/api/v1${url}`, {
    headers: orgId
      ? { Authorization: `Bearer ${token}`, 'x-org-id': orgId }
      : { Authorization: `Bearer ${token}` },
  }).then((r) => r.status);

for (const v of venues) {
  const [asg] = (await db.execute(sql`
    select sa.id from main.shift_assignment sa
    join main.shift s on s.id = sa.shift_id
    where s.outlet_id = ${v.id} order by s.shift_date desc limit 1
  `)).rows as Array<Record<string, string>>;
  console.log(`\n${v.name}`);
  if (asg) {
    console.log(`  /shift-assignment/:id   no hdr ${await get(`/shift-assignment/${asg.id}`)} · scoped ${await get(`/shift-assignment/${asg.id}`, v.id)}`);
  } else {
    console.log('  /shift-assignment/:id   no assignment to test with');
  }
  const [pr] = (await db.execute(sql`
    select distinct sa.user_id as id from main.shift_assignment sa
    join main.shift s on s.id = sa.shift_id
    where s.outlet_id = ${v.id} and sa.user_id is not null limit 1
  `)).rows as Array<Record<string, string>>;
  if (pr) {
    console.log(`  /pr/:id                 no hdr ${await get(`/pr/${pr.id}`)} · scoped ${await get(`/pr/${pr.id}`, v.id)}`);
  } else {
    console.log('  /pr/:id                 no PR to test with');
  }
}
process.exit(0);
