import { config } from 'dotenv';
import pg from 'pg';

config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();

try {
  // Drop app schema and drizzle migration history so a fresh journal can apply cleanly.
  await client.query('DROP SCHEMA IF EXISTS main CASCADE');
  await client.query('DROP SCHEMA IF EXISTS drizzle CASCADE');
  console.log('Dropped main and drizzle schemas. Run pnpm run migrate:deploy next.');
} finally {
  client.release();
  await pool.end();
}
