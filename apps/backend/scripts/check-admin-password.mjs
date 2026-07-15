import { config } from 'dotenv';
import pg from 'pg';
import bcrypt from 'bcrypt';

config();

const email = process.argv[2] ?? process.env.DEFAULT_ADMIN_EMAIL;
const passwords = process.argv.slice(3);

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const r = await pool.query(
  'SELECT email, password_hash, status FROM main.admin WHERE email = $1',
  [email],
);

if (!r.rows[0]) {
  console.log('No admin found for:', email);
} else {
  console.log('Admin:', { email: r.rows[0].email, status: r.rows[0].status });
  for (const pwd of passwords) {
    const ok = await bcrypt.compare(pwd, r.rows[0].password_hash);
    console.log(`Password "${pwd}" => ${ok ? 'MATCH' : 'no match'}`);
  }
}

await pool.end();
