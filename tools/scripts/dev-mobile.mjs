import {
  root,
  mobileRoot,
  readRootEnv,
  claimBackendOwnership,
  releaseBackendLock,
  resolveBin,
  spawnProc,
  makeShutdown,
} from './dev-shared.mjs';

const mobileOnly = process.argv.includes('--mobile-only');
const children = [];
const shutdown = makeShutdown(children);

const rootEnv = readRootEnv();
const backendPort = rootEnv.BACKEND_PORT?.trim() || '7777';
// VITE_API_URL is web-only (localhost is correct there, since the browser runs on
// the same machine as the backend). Mobile needs its own override, if any — leaving
// EXPO_PUBLIC_API_URL unset lets apps/mobile/src/lib/api.ts autodetect the dev
// machine's LAN IP from Expo's hostUri, which is what physical devices need.
const apiUrl = rootEnv.EXPO_PUBLIC_API_URL?.trim() || rootEnv.MOBILE_API_URL?.trim();
const r2PublicUrl =
  rootEnv.EXPO_PUBLIC_R2_PUBLIC_URL?.trim() || rootEnv.R2_PUBLIC_URL?.trim() || '';

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
process.on('exit', releaseBackendLock);

if (!mobileOnly) {
  const ownsBackend = await claimBackendOwnership(Number(backendPort));

  if (!ownsBackend) {
    console.log(`Backend already running on port ${backendPort}, reusing it instead of starting a new instance.`);
  } else {
    const nxCli = resolveBin('nx', ['dist', 'bin', 'nx.js'], [mobileRoot]);
    const backend = spawnProc(
      children,
      process.execPath,
      [nxCli, 'run', 'innocenz-backend:dev', '--tui=false'],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        // Backend env.ts reads PORT; root .env only defines BACKEND_PORT.
        env: { PORT: backendPort, NODE_ENV: rootEnv.NODE_ENV ?? 'development' },
      }
    );

    const prefixLine = (chunk, stream) => {
      for (const line of chunk.toString().split(/\r?\n/)) {
        if (line.length) process[stream].write(`[backend] ${line}\n`);
      }
    };

    backend.stdout?.on('data', (chunk) => prefixLine(chunk, 'stdout'));
    backend.stderr?.on('data', (chunk) => prefixLine(chunk, 'stderr'));
    backend.on('exit', (code) => {
      if (code) console.error(`[backend] exited with code ${code}`);
    });
  }

  console.log('Starting backend + Expo (QR needs a real TTY — Expo owns this terminal).');
} else {
  console.log('Starting Expo only.');
}

// Use the workspace-root Expo CLI with mobile cwd. `pnpm exec` from apps/mobile
// looks for apps/mobile/node_modules/expo, which does not exist with hoisted installs.
const expoCli = resolveBin('expo', ['bin', 'cli'], [mobileRoot]);
const expo = spawnProc(children, process.execPath, [expoCli, 'start'], {
  cwd: mobileRoot,
  stdio: 'inherit',
  // Only set EXPO_PUBLIC_API_URL when explicitly overridden; otherwise leave it
  // unset so apps/mobile/src/lib/api.ts autodetects the dev machine's LAN IP.
  // Always forward R2 public base so `user/…` keys resolve to CDN URLs.
  env: {
    ...(apiUrl ? { EXPO_PUBLIC_API_URL: apiUrl } : {}),
    ...(r2PublicUrl ? { EXPO_PUBLIC_R2_PUBLIC_URL: r2PublicUrl } : {}),
  },
});

expo.on('exit', (code) => shutdown(code ?? 0));
