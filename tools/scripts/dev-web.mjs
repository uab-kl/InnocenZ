import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const webRoot = path.join(root, 'apps/web');
const isWin = process.platform === 'win32';
const children = [];

// Load root env files (later files override earlier ones). Process env wins.
loadEnv({ path: path.join(root, '.env') });
loadEnv({ path: path.join(root, '.env.local'), override: true });

function envPort(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid ${name}=${raw}. Expected an integer port 1-65535.`);
  }
  return port;
}

const WEB_PORT_START = envPort('WEB_PORT', 3000);
const BACKEND_PORT_START = envPort('BACKEND_PORT', 7777);
const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.trim() ||
  `http://localhost:${BACKEND_PORT_START}/api`;

const colors = {
  web: '\x1b[36m', // cyan
  backend: '\x1b[32m', // green
  reset: '\x1b[0m',
  bold: '\x1b[1m',
};

function tryBind(port, host) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, host);
  });
}

async function isPortFree(port) {
  const [wildcardFree, loopbackFree] = await Promise.all([
    tryBind(port, '0.0.0.0'),
    tryBind(port, '127.0.0.1'),
  ]);
  return wildcardFree && loopbackFree;
}

async function findFreePort(startPort, reserved = new Set()) {
  let port = startPort;
  while (reserved.has(port) || !(await isPortFree(port))) {
    port += 1;
  }
  return port;
}

function resolveBin(packageName, ...binParts) {
  const candidate = path.join(root, 'node_modules', packageName, ...binParts);
  if (!fs.existsSync(candidate)) {
    throw new Error(
      `Cannot find ${packageName} CLI at ${candidate}. Run \`pnpm install\` from the repo root, then retry.`
    );
  }
  return candidate;
}

function spawnProc(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd ?? root,
    shell: options.shell ?? false,
    env: {
      ...process.env,
      ...options.env,
      PATH: `${path.join(root, 'node_modules', '.bin')}${path.delimiter}${process.env.PATH ?? ''}`,
    },
    stdio: options.stdio ?? 'inherit',
  });
  children.push(child);
  return child;
}

function prefixOutput(label, color, chunk, stream) {
  for (const line of chunk.toString().split(/\r?\n/)) {
    if (!line.length) continue;
    process[stream].write(`${color}[${label}]${colors.reset} ${line}\n`);
  }
}

function killChild(child) {
  if (!child?.pid || child.killed) return;
  if (isWin) {
    spawn('taskkill', ['/pid', String(child.pid), '/f', '/t'], { stdio: 'ignore' });
  } else {
    child.kill('SIGTERM');
  }
}

function shutdown(code = 0) {
  for (const child of children) killChild(child);
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

const webPort = await findFreePort(WEB_PORT_START);
const backendPort = await findFreePort(BACKEND_PORT_START, new Set([webPort]));
const publicApiUrl =
  backendPort === BACKEND_PORT_START
    ? API_URL
    : `http://localhost:${backendPort}/api`;

console.log(`
${colors.bold}Web (frontend) + backend${colors.reset}
  ${colors.web}frontend${colors.reset}  http://localhost:${webPort}
  ${colors.backend}backend${colors.reset}   http://localhost:${backendPort}/api
  ${colors.backend}api url${colors.reset}   ${publicApiUrl}
`);

if (webPort !== WEB_PORT_START) {
  console.log(`Port ${WEB_PORT_START} is in use, using ${webPort} for frontend.`);
}
if (backendPort !== BACKEND_PORT_START) {
  console.log(`Port ${BACKEND_PORT_START} is in use, using ${backendPort} for backend.`);
}

const nxCli = resolveBin('nx', 'dist', 'bin', 'nx.js');
const nextCli = resolveBin('next', 'dist', 'bin', 'next');

const backend = spawnProc(
  process.execPath,
  [nxCli, 'run', '@org/backend:serve', '--tui=false'],
  {
    env: {
      PORT: String(backendPort),
      BACKEND_PORT: String(backendPort),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  }
);
backend.stdout?.on('data', (chunk) => prefixOutput('backend', colors.backend, chunk, 'stdout'));
backend.stderr?.on('data', (chunk) => prefixOutput('backend', colors.backend, chunk, 'stderr'));
backend.on('exit', (code) => {
  if (code) console.error(`[backend] exited with code ${code}`);
  shutdown(code ?? 0);
});

const web = spawnProc(
  process.execPath,
  [nextCli, 'dev', '-p', String(webPort)],
  {
    cwd: webRoot,
    env: {
      PORT: String(webPort),
      WEB_PORT: String(webPort),
      NEXT_PUBLIC_API_URL: publicApiUrl,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  }
);
web.stdout?.on('data', (chunk) => prefixOutput('web', colors.web, chunk, 'stdout'));
web.stderr?.on('data', (chunk) => prefixOutput('web', colors.web, chunk, 'stderr'));
web.on('exit', (code) => {
  if (code) console.error(`[web] exited with code ${code}`);
  shutdown(code ?? 0);
});
