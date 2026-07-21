/**
 * Load monorepo env for the backend (TypeScript entrypoints).
 * Same rules as scripts/load-dotenv.mjs: repo-root `.env`, then apps/backend/.env.
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
