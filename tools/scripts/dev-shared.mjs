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

// A TCP bind-probe is not trustworthy on Windows: without SO_EXCLUSIVEADDRUSE
// (which Node doesn't set by default), a second process can successfully bind()
// a port another process already holds, so `isPortFree` can report "free" for a
// port that's really taken — that's what let a duplicate backend get all the way
// through its bootstrap before crashing with EADDRINUSE at `.listen()`. Checking
// the application layer instead — does anything actually answer HTTP here? — isn't
// fooled by that OS-level ambiguity.
async function isBackendResponding(port, timeoutMs = 2000) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      // Use /api/v1/health — a bare GET /graphql trips Apollo CSRF prevention
      // (no content-type / apollo-require-preflight) and logs a scary 400.
      await fetch(`http://127.0.0.1:${port}/api/v1/health`, {
        signal: controller.signal,
      });
      return true;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return false;
  }
}

// Claims backend ownership, then verifies the port isn't already serving — covers
// a backend started outside our lock (left over from before this file existed, or
// launched by hand), which the lock alone can't see.
export async function claimBackendOwnership(backendPort) {
  let ownsBackend = acquireBackendLock();
  if (ownsBackend && (await isBackendResponding(backendPort))) {
    releaseBackendLock();
    ownsBackend = false;
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
 * Force-free TCP listen ports we claimed. Catches Windows orphans where pnpm →
 * cmd → vite left a node process outside the tracked child.pid tree.
 */
export function killPortListeners(ports) {
  const unique = [...new Set(ports.filter((p) => Number.isInteger(p) && p > 0))];
  if (!unique.length) return;

  if (isWin) {
    const list = unique.join(',');
    spawnSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        `foreach ($p in @(${list})) { Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } }`,
      ],
      { stdio: 'ignore', windowsHide: true },
    );
    return;
  }

  for (const port of unique) {
    spawnSync('sh', ['-c', `fuser -k ${port}/tcp >/dev/null 2>&1 || true`], {
      stdio: 'ignore',
    });
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
    // Keep a healthy backend (reused by claimBackendOwnership); only clear dead holds.
    if (!(await isBackendResponding(backendPort))) ports.push(backendPort);
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
