import { createServer } from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import v8 from 'node:v8';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const mobileRoot = path.join(root, 'apps/mobile');
export const isWin = process.platform === 'win32';

// Minimal root .env reader (process env wins).
export function readRootEnv() {
  const vars = {};
  for (const file of ['.env', '.env.local']) {
    const envPath = path.join(root, file);
    if (!fs.existsSync(envPath)) continue;
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
      if (match) vars[match[1]] = match[2];
    }
  }
  return { ...vars, ...process.env };
}

export function envPort(name, fallback, source = process.env) {
  const raw = source[name];
  if (raw == null || raw === '') return fallback;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Invalid ${name}=${raw}. Expected an integer port 1-65535.`);
  }
  return port;
}

function tryBind(port, host) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, host);
  });
}

// Check both a wildcard bind and a loopback-specific bind: a port can look free on
// one and still be held on the other, which silently causes connection resets
// instead of a clean "port in use" error.
export async function isPortFree(port) {
  const [wildcardFree, loopbackFree] = await Promise.all([
    tryBind(port, '0.0.0.0'),
    tryBind(port, '127.0.0.1'),
  ]);
  return wildcardFree && loopbackFree;
}

export async function findFreePort(startPort, reserved = new Set()) {
  let port = startPort;
  while (reserved.has(port) || !(await isPortFree(port))) {
    port += 1;
  }
  return port;
}

// A TCP probe alone can't tell us "the backend is free" reliably, because the
// backend does several seconds of async setup (env, DB, Apollo) before it ever
// calls `server.listen()`. If two dev scripts start close together, both probes
// can see the port as free before either backend has actually bound it. A PID
// lockfile claims ownership atomically and synchronously, before either script
// starts the slow backend bootstrap.
export const BACKEND_LOCK_PATH = path.join(root, 'node_modules', '.cache', 'dev-backend.lock');

function isPidAlive(pid) {
  if (!Number.isInteger(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function acquireBackendLock() {
  fs.mkdirSync(path.dirname(BACKEND_LOCK_PATH), { recursive: true });
  for (;;) {
    try {
      const fd = fs.openSync(BACKEND_LOCK_PATH, 'wx');
      fs.writeSync(fd, String(process.pid));
      fs.closeSync(fd);
      return true;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const holderPid = Number(fs.readFileSync(BACKEND_LOCK_PATH, 'utf8').trim());
      if (isPidAlive(holderPid)) return false;
      // Stale lock left behind by a process that didn't shut down cleanly.
      try {
        fs.unlinkSync(BACKEND_LOCK_PATH);
      } catch {
        // Another process may have cleaned it up first; retry the loop either way.
      }
    }
  }
}

export function releaseBackendLock() {
  try {
    const holderPid = Number(fs.readFileSync(BACKEND_LOCK_PATH, 'utf8').trim());
    if (holderPid === process.pid) fs.unlinkSync(BACKEND_LOCK_PATH);
  } catch {
    // Lock already gone — nothing to release.
  }
}

// How long a lock holder gets to finish backend bootstrap (env, DB, Apollo, RBAC
// seed) before we stop believing its lock. Bootstrap is seconds; this is a wide
// margin so a slow-but-healthy start is never raced.
const BACKEND_BOOTSTRAP_GRACE_MS = 120_000;

/** Age of the lockfile, or Infinity when there is none. */
function backendLockAgeMs() {
  try {
    return Date.now() - fs.statSync(BACKEND_LOCK_PATH).mtimeMs;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

// A TCP bind-probe is not trustworthy on Windows: without SO_EXCLUSIVEADDRUSE
// (which Node doesn't set by default), a second process can successfully bind()
// a port another process already holds, so `isPortFree` can report "free" for a
// port that's really taken — that's what let a duplicate backend get all the way
// through its bootstrap before crashing with EADDRINUSE at `.listen()`. Checking
// the application layer instead — does anything actually answer HTTP here? — isn't
// fooled by that OS-level ambiguity.
//
// "Something answers" is not "OUR backend answers" (19 Nov 2026). Another project
// built from the same template can sit on 7777 with its own /api/v1/health — on
// the owner's PC a WSL project held 3000, 7777 and 8081 at once, answered 200, and
// this probe used to call that "InnocenZ is already running, reuse it": the
// portals would then have logged in and written against the other project's API.
// So read the body: InnocenZ's health is `{ success: true, data: { status:
// 'healthy' } }` (features/health/health.controller.ts); anything else is foreign.
/**
 * @param {number | string} target a port on 127.0.0.1, or an origin/URL
 * @returns {Promise<'innocenz' | 'foreign' | 'none'>}
 */
export async function probeBackend(target, timeoutMs = 2000) {
  const origin =
    typeof target === 'number' ? `http://127.0.0.1:${target}` : new URL(target).origin;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // Use /api/v1/health — a bare GET /graphql trips Apollo CSRF prevention
    // (no content-type / apollo-require-preflight) and logs a scary 400.
    const res = await fetch(`${origin}/api/v1/health`, { signal: controller.signal });
    try {
      const body = await res.json();
      return body?.success === true && body?.data?.status === 'healthy' ? 'innocenz' : 'foreign';
    } catch {
      return 'foreign'; // answered HTTP, but not with our JSON
    }
  } catch {
    return 'none';
  } finally {
    clearTimeout(timer);
  }
}

async function isBackendResponding(port, timeoutMs = 2000) {
  return (await probeBackend(port, timeoutMs)) === 'innocenz';
}

/**
 * Stop here when another project's server answers where the InnocenZ backend
 * should be. Reusing it sends logins and writes to the wrong API; killing it
 * takes down someone else's work. Neither is ours to do, so say so and exit.
 */
export async function refuseForeignBackend(target) {
  if ((await probeBackend(target)) !== 'foreign') return;
  const where = typeof target === 'number' ? `port ${target}` : new URL(target).origin;
  console.error(`
[dev] ${where} is answered by ANOTHER project's server, not the InnocenZ backend.
      InnocenZ will not reuse it (the portals would talk to the wrong API) and
      will not kill it. Either stop that project first, or give InnocenZ its own
      backend port in .env.local: BACKEND_PORT plus every URL that names the old
      port (VITE_API_URL, VITE_GRAPHQL_ENDPOINT, NEXT_PUBLIC_API_URL, API_URL,
      EXPO_PUBLIC_API_URL, VITE_API_PROXY_TARGET).
`);
  // Let the probe's socket finish closing first: exiting mid-close trips a libuv
  // assertion on Windows (Node 25: "UV_HANDLE_CLOSING", exit 127 instead of 1).
  await new Promise((resolve) => setTimeout(resolve, 150));
  process.exit(1);
}

// Claims backend ownership, then verifies the port isn't already serving — covers
// a backend started outside our lock (left over from before this file existed, or
// launched by hand), which the lock alone can't see.
export async function claimBackendOwnership(backendPort) {
  // Before the lock: a foreign server on our port must never be reused or killed.
  await refuseForeignBackend(backendPort);
  let ownsBackend = acquireBackendLock();
  if (ownsBackend && (await isBackendResponding(backendPort))) {
    releaseBackendLock();
    ownsBackend = false;
  }
  // A LIVE lock holder is not proof of a live backend. `dev:all` can outlive its
  // own backend child (crashed, or killed by hand), and the lock then outlives
  // the server: every later `dev:web` reads a live holder PID, declines to start
  // a backend, and prints "already running, reusing it" while nothing listens.
  // The port stays dead for as long as that parent lives and the app shows
  // "Network Error" on every call. Past the bootstrap grace window, believe the
  // port over the lock and take over.
  if (
    !ownsBackend &&
    backendLockAgeMs() > BACKEND_BOOTSTRAP_GRACE_MS &&
    !(await isBackendResponding(backendPort))
  ) {
    console.log(
      `[dev] Backend lock is held but nothing answers on port ${backendPort} — taking over and starting a backend.`
    );
    try {
      fs.unlinkSync(BACKEND_LOCK_PATH);
    } catch {
      // Someone else cleaned it up first — acquire below decides the winner.
    }
    ownsBackend = acquireBackendLock();
  }
  return ownsBackend;
}

export function resolveBin(packageName, binParts, extraDirs = []) {
  const candidates = [root, ...extraDirs].map((dir) =>
    path.join(dir, 'node_modules', packageName, ...binParts)
  );
  const match = candidates.find((candidate) => fs.existsSync(candidate));
  if (!match) {
    throw new Error(
      `Cannot find ${packageName} CLI. Run \`pnpm install\` from the repo root, then retry.`
    );
  }
  return match;
}

export function spawnProc(children, command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd ?? root,
    shell: options.shell ?? false,
    env: {
      ...process.env,
      ...options.env,
      // Ensure workspace bins resolve even when spawned without a login shell.
      PATH: `${path.join(root, 'node_modules', '.bin')}${path.delimiter}${process.env.PATH ?? ''}`,
    },
    stdio: options.stdio ?? 'inherit',
  });
  children.push(child);
  return child;
}

/** Kill a spawned child. On Windows, wait for the full process tree to die. */
export function killChild(child) {
  if (!child?.pid || child.killed) return;
  if (isWin) {
    // Must be sync: async taskkill + process.exit() races and leaves Vite orphans
    // holding WEB_PORT (often 3001 when 3000 is taken by Cursor).
    spawnSync('taskkill', ['/pid', String(child.pid), '/f', '/t'], {
      stdio: 'ignore',
      windowsHide: true,
    });
  } else {
    try {
      child.kill('SIGTERM');
    } catch {
      // Already gone.
    }
  }
}

/**
 * True when a process command line runs from THIS checkout — a path inside the
 * repo root, either slash style, followed by a separator or the end of a token.
 * The separator check keeps `…/InnocenZ` from matching `…/InnocenZ-proto`.
 */
export function isRepoCommandLine(cmd, repoRoot = root, caseInsensitive = isWin) {
  if (!cmd) return false;
  const norm = (s) => {
    const forward = String(s).replace(/\\/g, '/');
    return caseInsensitive ? forward.toLowerCase() : forward;
  };
  const rootNorm = norm(repoRoot).replace(/\/+$/, '');
  const escaped = rootNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`${escaped}(?:/|["'\\s]|$)`).test(norm(cmd));
}

/**
 * Every process LISTENING on `ports`, with its command line and whether it
 * belongs to this repo. Read-only — killPortListeners acts on it, and it can be
 * run alone to see what a cleanup would touch.
 * @returns {{ port: number, pid: number, name: string, cmd: string, owned: boolean }[]}
 */
export function listPortListeners(ports) {
  const unique = [...new Set(ports.filter((p) => Number.isInteger(p) && p > 0))];
  if (!unique.length) return [];
  const rows = [];

  if (isWin) {
    const ps = spawnSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        `$rows = foreach ($p in @(${unique.join(',')})) { Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | ForEach-Object { $pr = Get-CimInstance Win32_Process -Filter "ProcessId=$($_.OwningProcess)" -ErrorAction SilentlyContinue; [pscustomobject]@{ port = $p; pid = [int]$_.OwningProcess; name = [string]$pr.Name; cmd = [string]$pr.CommandLine } } }; ConvertTo-Json -Compress -InputObject @($rows)`,
      ],
      { encoding: 'utf8', windowsHide: true },
    );
    try {
      rows.push(...[].concat(JSON.parse(ps.stdout || '[]') ?? []));
    } catch {
      return []; // Unreadable answer: list nothing, so nothing gets killed.
    }
  } else {
    for (const port of unique) {
      const found = spawnSync(
        'sh',
        ['-c', `lsof -nP -t -iTCP:${port} -sTCP:LISTEN 2>/dev/null || fuser ${port}/tcp 2>/dev/null`],
        { encoding: 'utf8' },
      );
      for (const pid of (found.stdout || '').match(/\d+/g) ?? []) {
        const cmd = spawnSync('ps', ['-o', 'command=', '-p', pid], { encoding: 'utf8' });
        rows.push({ port, pid: Number(pid), name: '', cmd: (cmd.stdout || '').trim() });
      }
    }
  }

  const seen = new Set();
  return rows
    .filter((r) => Number.isInteger(r?.pid) && r.pid > 0)
    .filter((r) => !seen.has(`${r.port}:${r.pid}`) && seen.add(`${r.port}:${r.pid}`))
    .map((r) => ({ ...r, owned: isRepoCommandLine(r.cmd) }));
}

/**
 * Force-free TCP listen ports we claimed. Catches Windows orphans where pnpm →
 * cmd → vite left a node process outside the tracked child.pid tree.
 *
 * ⚠️ Only processes started from THIS repo are killed (19 Nov 2026). This used to
 * Stop-Process whatever held the port. On a PC that also runs a WSL project,
 * the Windows-side holder of 8081/7777/3000 is `wslrelay` — the bridge every
 * WSL server is reached through — so starting or stopping InnocenZ cut the
 * other project off. A holder we did not start is left alone; the cost is a
 * busy port (the web port then moves up, Expo offers 8082), never a kill.
 */
export function killPortListeners(ports) {
  for (const { pid, owned } of listPortListeners(ports)) {
    if (!owned || pid === process.pid) continue;
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // Already gone, or not ours to signal.
    }
  }
}

/**
 * Delete corrupt Metro file-map caches (%TEMP%\metro-file-map-*) left by a
 * force-killed Metro dying mid cache write. Metro only WARNS on a corrupt
 * cache, then silently full-crawls the monorepo for minutes — during which
 * every bundle request 500s and localhost:8081 renders a blank page (web,
 * Android and iOS alike; 8 Aug 2026). Validating at startup keeps warm,
 * healthy caches and turns the failure mode into one log line.
 */
export function clearCorruptMetroCaches() {
  const tmp = os.tmpdir();
  let names = [];
  try {
    names = fs.readdirSync(tmp).filter((n) => n.startsWith('metro-file-map-'));
  } catch {
    return; // Unreadable temp dir — Metro will handle its own cache.
  }
  for (const name of names) {
    const file = path.join(tmp, name);
    try {
      v8.deserialize(fs.readFileSync(file));
    } catch {
      try {
        fs.rmSync(file, { force: true });
        console.log(`Removed corrupt Metro cache ${name} (avoids a minutes-long silent re-crawl).`);
      } catch {
        // Locked by a live Metro — leave it; that process owns it.
      }
    }
  }
}

/**
 * Free leftovers from an unclean prior stop so the next `dev:all` / `dev:web`
 * gets stable ports. Never touches `webPortStart` itself (often Cursor on 3000);
 * clears webPortStart+1..+5, Metro, and a dead backend port only.
 */
export async function clearStaleDevPorts({
  webPortStart,
  backendPort,
  clearBackend = true,
}) {
  const ports = [8081, 8082];
  for (let p = webPortStart + 1; p <= webPortStart + 5; p++) ports.push(p);

  if (clearBackend && Number.isInteger(backendPort)) {
    // Keep a healthy backend (reused by claimBackendOwnership); only clear dead
    // holds. A FOREIGN answer is not dead — claimBackendOwnership refuses it.
    if ((await probeBackend(backendPort)) === 'none') ports.push(backendPort);
  }

  killPortListeners(ports);
  // Brief settle so Windows releases the sockets before we probe/bind.
  await new Promise((r) => setTimeout(r, 250));
}

/**
 * @param {import('node:child_process').ChildProcess[]} children
 * @param {number[] | (() => number[])} [ports] Ports to free on shutdown (web/backend/metro).
 */
export function makeShutdown(children, ports = []) {
  let shuttingDown = false;
  return function shutdown(code = 0) {
    if (shuttingDown) return;
    shuttingDown = true;
    releaseBackendLock();
    for (const child of children) killChild(child);
    const list = typeof ports === 'function' ? ports() : ports;
    killPortListeners(list);
    process.exit(code);
  };
}

export function prefixOutput(label, color, reset, chunk, stream) {
  for (const line of chunk.toString().split(/\r?\n/)) {
    if (!line.length) continue;
    process[stream].write(`${color}[${label}]${reset} ${line}\n`);
  }
}

/**
 * Wait until `url` accepts an HTTP connection (any status counts).
 * Used by `dev:all` to start Vite before Expo so both file watchers don't
 * cold-start at once on Windows (Metro + Vite fighting → 60s SSR timeouts).
 */
export async function waitForHttp(
  url,
  { timeoutMs = 120_000, intervalMs = 400, label = 'service' } = {},
) {
  const started = Date.now();
  process.stdout.write(`[dev] waiting for ${label}…`);
  while (Date.now() - started < timeoutMs) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2_000);
      try {
        await fetch(url, { signal: controller.signal });
        process.stdout.write(' ready\n');
        return true;
      } finally {
        clearTimeout(timer);
      }
    } catch {
      process.stdout.write('.');
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
  process.stdout.write(` timed out after ${timeoutMs}ms\n`);
  return false;
}
