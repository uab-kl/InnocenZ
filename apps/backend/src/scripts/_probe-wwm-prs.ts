import 'dotenv/config';

import { sql } from 'drizzle-orm';
import { db } from '@/db/index';

// Throwaway probe: who is already linked to Why We Met (AGY777), and do any
// of the picture-folder nicknames collide with existing usernames?
const FOLDERS = [
  'angie', 'anonymouse', 'ash', 'August', 'ava', 'bernice', 'charlotte',
  'charlotteII', 'cindy', 'emoji', 'gin', 'grace', 'hannah', 'hazel',
  'ip17pm', 'janice', 'jenny', 'jes', 'July', 'karyan', 'moon', 'mumu',
  'only', 'pinky', 'pony', 'sarah', 'september', 'tee', 'ThirthyThree',
  'veron', 'victoria', 'weiqi', 'winnie', 'xiaobao', 'yuki', 'yvon', 'zoe',
];

async function run() {
  const agency = await db.execute(
    sql`select id, name from main.agency where agency_code = 'AGY777'`,
  );
  console.log('agency:', agency.rows);

  const members = await db.execute(sql`
    select ap.approve_status, count(*) as n
    from main.agency_pr ap
    where ap.agency_id = ${(agency.rows[0] as { id: string }).id}
    group by ap.approve_status
  `);
  console.log('member counts by status:', members.rows);

  const samples = await db.execute(sql`
    select u.username, u.profile_image,
           jsonb_array_length(p.portfolio_photos) as slots
    from main.agency_pr ap
    join main."user" u on u.id = ap.user_id
    left join main.user_profile p on p.user_id = u.id
    where ap.agency_id = ${(agency.rows[0] as { id: string }).id}
      and u.created_by = 'seed-wwm-prs'
    order by u.username limit 3
  `);
  console.log('new-batch samples:', samples.rows);

  const collisions = await db.execute(sql`
    select username, email from main."user"
    where lower(username) = any(${sql.raw(
      `array[${FOLDERS.map((f) => `'${f.toLowerCase()}'`).join(',')}]`,
    )})
  `);
  console.log('username collisions:', collisions.rows);

  // Key shape ground truth: how existing PRs' images are keyed today.
  const keys = await db.execute(sql`
    select u.username, u.profile_image, p.portfolio_photos
    from main."user" u
    left join main.user_profile p on p.user_id = u.id
    where u.username in ('Vicky', 'Alice', 'jk')
  `);
  console.log('key shapes:', JSON.stringify(keys.rows, null, 1));
}

run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
