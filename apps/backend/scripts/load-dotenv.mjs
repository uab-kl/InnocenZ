/**
 * Load monorepo env for the backend.
 * Repo-root `.env` first (where `pnpm dev:all` keeps DATABASE_URL / JWT / etc.),
 * then optional `apps/backend/.env` overrides.
 *
 * Resolve paths from this file so scripts work regardless of cwd.
 */
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(backendRoot, '../..');

const rootEnv = resolve(repoRoot, '.env');
const backendEnv = resolve(backendRoot, '.env');

if (existsSync(rootEnv)) config({ path: rootEnv });
if (existsSync(backendEnv)) config({ path: backendEnv, override: true });
