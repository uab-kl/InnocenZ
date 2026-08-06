/**
 * Copy Brevo HTML templates beside the esbuild bundle so
 * `renderTemplate` can read them at runtime from dist/templates.
 */
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src', 'features', 'mailing', 'templates');
const dest = join(root, 'dist', 'templates');

mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log('[copy-mail-templates] copied to dist/templates');
