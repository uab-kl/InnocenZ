import { config as loadEnv } from 'dotenv';
import {
  root,
  isWin,
  envPort,
  findFreePort,
  claimBackendOwnership,
  releaseBackendLock,
  clearStaleDevPorts,
  spawnProc,
  makeShutdown,
  prefixOutput,
} from './dev-shared.mjs';

const webRoot = `${root}/apps/web`;
const children = [];
const ownedPorts = [];
const shutdown = makeShutdown(children, () => ownedPorts);

// Load root env files (later files override earlier ones). Process env wins.
loadEnv({ path: `${root}/.env` });
loadEnv({ path: `${root}/.env.local`, override: true });

const WEB_PORT_START = envPort('WEB_PORT', 3000);
const BACKEND_PORT_START = envPort('BACKEND_PORT', 7780);
const API_URL =
  process.env.VITE_API_URL?.trim() ||
  `http://localhost:${BACKEND_PORT_START}/api`;

const colors = {
  web: '\x1b[36m', // cyan
  backend: '\x1b[32m', // green
  reset: '\x1b[0m',
  bold: '\x1b[1m',
};

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
process.on('exit', releaseBackendLock);

await clearStaleDevPorts({
  webPortStart: WEB_PORT_START,
  backendPort: BACKEND_PORT_START,
});

const webPort = await findFreePort(WEB_PORT_START, new Set([BACKEND_PORT_START]));
const backendPort = BACKEND_PORT_START;
const publicApiUrl = API_URL;
const ownsBackend = await claimBackendOwnership(backendPort);
ownedPorts.push(webPort);
if (ownsBackend) ownedPorts.push(backendPort);

console.log(`
${colors.bold}Web (frontend) + backend${colors.reset}
  ${colors.web}frontend${colors.reset}  http://localhost:${webPort}
  ${colors.backend}backend${colors.reset}   http://localhost:${backendPort}/api${ownsBackend ? '' : ' (already running, reusing)'}
  ${colors.backend}api url${colors.reset}   ${publicApiUrl}
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
