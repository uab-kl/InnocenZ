// Loads the ROOT .env before anything imports db/index.ts (which calls
// dotenv.config() against the cwd). Probes run from apps/backend so the `@/`
// path alias resolves; the .env lives at the repo root.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env'),
});
