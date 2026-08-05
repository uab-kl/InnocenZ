import '@/load-env';
import pg from 'pg';

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

async function main() {
  await client.connect();
  const r = await client.query(`
    SELECT u.profile_image, p.full_name, p.comcard_image, p.portfolio_photos
    FROM main."user" u
    LEFT JOIN main.user_profile p ON p.user_id = u.id
    WHERE u.id = $1
  `, ['4003eadb-d067-4f60-af24-6910805f04f1']);
  console.log(JSON.stringify(r.rows[0], null, 2));
  await client.end();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
