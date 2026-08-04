import { config as loadEnv } from 'dotenv';
import {
  root,
  mobileRoot,
  isWin,
  envPort,
  findFreePort,
  claimBackendOwnership,
  releaseBackendLock,
  resolveBin,
  spawnProc,
  makeShutdown,
  prefixOutput,
} from './dev-shared.mjs';

const webRoot = `${root}/apps/web`;
const children = [];
/** Ports this run claimed — freed on Ctrl+C so Vite/Expo orphans can't pin them. */
const ownedPorts = [];
const shutdown = makeShutdown(children, () => ownedPorts);

// Load root env files (later files override earlier ones). Process env wins.
loadEnv({ path: `${root}/.env` });
loadEnv({ path: `${root}/.env.local`, override: true });

const WEB_PORT_START = envPort('WEB_PORT', 3000);
const BACKEND_PORT_START = envPort('BACKEND_PORT', 7780);
const publicApiUrl =
  process.env.VITE_API_URL?.trim() || `http://localhost:${BACKEND_PORT_START}/api`;
// Mobile needs its own override, if any — leaving EXPO_PUBLIC_API_URL unset lets
// apps/mobile/src/lib/api.ts autodetect the dev machine's LAN IP from Expo's
// hostUri, which is what physical devices need (localhost means "the phone
// itself" inside a mobile app, not the dev machine).
const mobileApiUrl = process.env.EXPO_PUBLIC_API_URL?.trim() || process.env.MOBILE_API_URL?.trim();

const colors = {
  web: '\x1b[36m', // cyan
  backend: '\x1b[32m', // green
  reset: '\x1b[0m',
  bold: '\x1b[1m',
};

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
process.on('exit', releaseBackendLock);

const webPort = await findFreePort(WEB_PORT_START, new Set([BACKEND_PORT_START]));
const backendPort = BACKEND_PORT_START;
const ownsBackend = await claimBackendOwnership(backendPort);
ownedPorts.push(webPort);
// Expo defaults to 8081; free it on stop even if Metro bumped to 8082 later.
ownedPorts.push(8081, 8082);
if (ownsBackend) ownedPorts.push(backendPort);

console.log(`
${colors.bold}Web + Mobile + backend${colors.reset}
  ${colors.web}frontend${colors.reset}  http://localhost:${webPort}
  ${colors.backend}backend${colors.reset}   http://localhost:${backendPort}/api${ownsBackend ? '' : ' (already running, reusing)'}
  ${colors.backend}api url${colors.reset}   ${publicApiUrl}

Expo needs a real TTY for the QR code — its output is not prefixed like the others.
`);

if (webPort !== WEB_PORT_START) {
  console.log(`Port ${WEB_PORT_START} is in use, using ${webPort} for frontend.`);
}

if (!ownsBackend) {
  console.log(`Backend already running on port ${backendPort}, reusing it instead of starting a new instance.`);
} else {
  const backend = spawnProc(
    children,
    'pnpm',
    ['--filter', 'innocenz-backend', 'run', 'dev'],
    {
      env: {
        NODE_ENV: process.env.NODE_ENV ?? 'development',
        PORT: String(backendPort),
        BACKEND_PORT: String(backendPort),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: isWin,
    }
  );
  backend.stdout?.on('data', (chunk) => prefixOutput('backend', colors.backend, colors.reset, chunk, 'stdout'));
  backend.stderr?.on('data', (chunk) => prefixOutput('backend', colors.backend, colors.reset, chunk, 'stderr'));
  backend.on('exit', (code) => {
    if (code) console.error(`[backend] exited with code ${code}`);
    shutdown(code ?? 0);
  });
}

const web = spawnProc(
  children,
  'pnpm',
  ['--filter', 'innocenz-admin', 'run', 'dev', '--', '--port', String(webPort)],
  {
    cwd: webRoot,
    env: {
      PORT: String(webPort),
      WEB_PORT: String(webPort),
      VITE_API_URL: publicApiUrl,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: isWin,
  }
);
web.stdout?.on('data', (chunk) => prefixOutput('web', colors.web, colors.reset, chunk, 'stdout'));
web.stderr?.on('data', (chunk) => prefixOutput('web', colors.web, colors.reset, chunk, 'stderr'));
web.on('exit', (code) => {
  if (code) console.error(`[web] exited with code ${code}`);
  shutdown(code ?? 0);
});

// Use the workspace-root Expo CLI with mobile cwd. `pnpm exec` from apps/mobile
// looks for apps/mobile/node_modules/expo, which does not exist with hoisted installs.
const expoCli = resolveBin('expo', ['bin', 'cli'], [mobileRoot]);
const expo = spawnProc(children, process.execPath, [expoCli, 'start'], {
  cwd: mobileRoot,
  stdio: 'inherit',
  env: mobileApiUrl ? { EXPO_PUBLIC_API_URL: mobileApiUrl } : {},
});
expo.on('exit', (code) => {
  if (code) console.error(`[expo] exited with code ${code}`);
  shutdown(code ?? 0);
});
