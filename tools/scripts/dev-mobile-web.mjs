/**
 * Run the PR app in a BROWSER (`expo start --web`), against a backend already
 * running on this machine.
 *
 * Why this exists beside dev-mobile.mjs: that script runs `expo start`, which
 * wants a real TTY for its QR code and a phone to scan it. That requirement is
 * the whole reason nothing in apps/mobile had ever been executed — every change
 * to the PR app shipped on types and reading alone. react-native-web and
 * react-dom are already dependencies, so the same screens render in a page.
 *
 * It is NOT a substitute for a device: the camera, the geofence and the native
 * pickers behave differently or not at all on web. It is enough to exercise
 * layout, navigation, and anything driven by an API response — which is most of
 * what goes wrong.
 *
 * EXPO_PUBLIC_API_URL is pinned rather than autodetected. The autodetect path
 * resolves the dev machine's LAN IP from Expo's hostUri, which is right for a
 * phone and wrong for a browser sitting on the same machine as the backend.
 */
import { mobileRoot, readRootEnv, resolveBin, spawnProc, makeShutdown } from './dev-shared.mjs';

const children = [];
const shutdown = makeShutdown(children);
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

const rootEnv = readRootEnv();
const apiUrl =
  rootEnv.EXPO_PUBLIC_API_URL?.trim() ||
  `http://localhost:${rootEnv.BACKEND_PORT?.trim() || '7777'}/api`;
const r2PublicUrl =
  rootEnv.EXPO_PUBLIC_R2_PUBLIC_URL?.trim() || rootEnv.R2_PUBLIC_URL?.trim() || '';

console.log(`Starting Expo web against ${apiUrl} (backend must already be running).`);

const expoCli = resolveBin('expo', ['bin', 'cli'], [mobileRoot]);
const expo = spawnProc(children, process.execPath, [expoCli, 'start', '--web'], {
  cwd: mobileRoot,
  stdio: 'inherit',
  env: {
    EXPO_PUBLIC_API_URL: apiUrl,
    BROWSER: 'none',
    ...(r2PublicUrl ? { EXPO_PUBLIC_R2_PUBLIC_URL: r2PublicUrl } : {}),
  },
});

expo.on('exit', (code) => shutdown(code ?? 0));
