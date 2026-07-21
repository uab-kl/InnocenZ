import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// Same as scripts/load-dotenv.mjs — resolve from this file, not cwd.
const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)));
const repoRoot = resolve(backendRoot, '../..');
const rootEnv = resolve(repoRoot, '.env');
const backendEnv = resolve(backendRoot, '.env');
if (existsSync(rootEnv)) config({ path: rootEnv });
if (existsSync(backendEnv)) config({ path: backendEnv, override: true });

if (!process.env.DATABASE_URL) {
  throw new Error(
    'Database URL not initialized — set DATABASE_URL in the repo root .env or apps/backend/.env',
  );
}

export default defineConfig({
  out: './postgres/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
