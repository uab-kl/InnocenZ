import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const mobileRoot = path.join(root, 'apps/mobile');
const isWin = process.platform === 'win32';
const mobileOnly = process.argv.includes('--mobile-only');
const children = [];

function resolveBin(packageName, ...binParts) {
  const candidates = [
    path.join(root, 'node_modules', packageName, ...binParts),
    path.join(mobileRoot, 'node_modules', packageName, ...binParts),
  ];
  const match = candidates.find((candidate) => fs.existsSync(candidate));
  if (!match) {
    throw new Error(
      `Cannot find ${packageName} CLI. Run \`pnpm install\` from the repo root, then retry.`
    );
  }
  return match;
}

function spawnProc(command, args, options = {}) {
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

if (!mobileOnly) {
  const nxCli = resolveBin('nx', 'dist', 'bin', 'nx.js');
  const backend = spawnProc(
    process.execPath,
    [nxCli, 'run', '@org/backend:serve', '--tui=false'],
    { stdio: ['ignore', 'pipe', 'pipe'] }
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

  console.log('Starting backend + Expo (QR needs a real TTY — Expo owns this terminal).');
} else {
  console.log('Starting Expo only.');
}

// Use the workspace-root Expo CLI with mobile cwd. `pnpm exec` from apps/mobile
// looks for apps/mobile/node_modules/expo, which does not exist with hoisted installs.
const expoCli = resolveBin('expo', 'bin', 'cli');
const expo = spawnProc(process.execPath, [expoCli, 'start'], {
  cwd: mobileRoot,
  stdio: 'inherit',
});

expo.on('exit', (code) => shutdown(code ?? 0));
