import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

const here = dirname(fileURLToPath(import.meta.url));
// this file: apps/backend/src/db/index.ts → backend root is ../..
const backendRoot = resolve(here, '../..');
const repoRoot = resolve(backendRoot, '../..');
const rootEnv = resolve(repoRoot, '.env');
const backendEnv = resolve(backendRoot, '.env');
if (existsSync(rootEnv)) config({ path: rootEnv });
if (existsSync(backendEnv)) config({ path: backendEnv, override: true });

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
