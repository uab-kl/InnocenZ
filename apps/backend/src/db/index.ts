import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const poolConfig = {
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  host: process.env.POSTGRES_HOST,
  port: process.env.POSTGRES_PORT ? Number(process.env.POSTGRES_PORT) : undefined,
  database: process.env.POSTGRES_DB,
};

const dbHost = poolConfig.host ?? '(unset)';
const dbPort = poolConfig.port ?? 5432;
const dbName = poolConfig.database ?? '(unset)';
console.info(`[db] PostgreSQL target: ${dbHost}:${dbPort}/${dbName}`);

const pool = new Pool(poolConfig);

export const db = drizzle(pool);
