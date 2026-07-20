import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
      await fetch(`http://127.0.0.1:${port}/graphql`, { signal: controller.signal });
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

export function killChild(child) {
  if (!child?.pid || child.killed) return;
  if (isWin) {
    spawn('taskkill', ['/pid', String(child.pid), '/f', '/t'], { stdio: 'ignore' });
  } else {
    child.kill('SIGTERM');
  }
}

export function makeShutdown(children) {
  return function shutdown(code = 0) {
    releaseBackendLock();
    for (const child of children) killChild(child);
    process.exit(code);
  };
}

export function prefixOutput(label, color, reset, chunk, stream) {
  for (const line of chunk.toString().split(/\r?\n/)) {
    if (!line.length) continue;
    process[stream].write(`${color}[${label}]${reset} ${line}\n`);
  }
}
