import { config } from 'dotenv';
import pg from 'pg';

config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();

try {
  const schemas = await client.query(
    "SELECT schema_name FROM information_schema.schemata WHERE schema_name IN ('main', 'drizzle')",
  );
  console.log('schemas:', schemas.rows);

  try {
    const migrations = await client.query(
      'SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at',
    );
    console.log('drizzle migrations:', migrations.rows);
  } catch (error) {
    console.log('drizzle migrations table:', error.message);
  }

  const tables = await client.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main' ORDER BY 1",
  );
  console.log('main tables:', tables.rows.map((r) => r.table_name));
} finally {
  client.release();
  await pool.end();
}
