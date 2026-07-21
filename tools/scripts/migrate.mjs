import { spawn } from 'node:child_process';
import { readRootEnv, root } from './dev-shared.mjs';

// Run the backend migration chain from the repo root using the single root .env.
//
// Why this exists: every backend script loads env via dotenv relative to the
// current working directory. `pnpm --filter innocenz-backend run migrate` forces
// cwd to apps/backend/ (empty .env there), so DATABASE_URL is lost and pg falls
// back to localhost:5432 -> ECONNREFUSED. This wrapper loads the root .env into
// the environment first, then runs the backend script from the root. Child
// scripts inherit DATABASE_URL (dotenv never overrides existing vars), while
// drizzle's relative paths (out: ./postgres/migrations) still resolve because
// pnpm --filter runs the script with cwd = apps/backend.
//
// Usage (from repo root):
//   pnpm migrate         -> generate + migrate + seed
//   pnpm migrate:deploy  -> migrate + seed (no generate)
//   pnpm db:reset        -> drop schemas + migrate + seed  (DESTRUCTIVE)

const env = readRootEnv();

if (!env.DATABASE_URL) {
  console.error('DATABASE_URL is not set in the root .env — aborting.');
  process.exit(1);
}

const target = process.argv[2] ?? 'migrate';
const child = spawn('pnpm', ['--filter', 'innocenz-backend', 'run', target], {
  cwd: root,
  env,
  stdio: 'inherit',
  shell: true,
});

child.on('exit', (code) => process.exit(code ?? 1));
