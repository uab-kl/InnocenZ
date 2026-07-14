import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

// Builds web + backend images on this machine, pushes them to Docker Hub,
// then ssh's in to run deploy/redeploy.sh — which pulls the new images and
// restarts both containers behind the Caddy reverse proxy. The server never
// needs a git checkout of this repo, only Docker + `docker login` access to
// the same Docker Hub namespace.
//
// Prerequisite: `docker login` on this machine (image push needs it).

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

loadEnv({ path: path.join(root, '.env') });
loadEnv({ path: path.join(root, '.env.local'), override: true });

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `Missing ${name}. Set it in .env.local, e.g.\n` +
        `  DEPLOY_HOST=your.server.ip\n  DEPLOY_USER=deploy\n`
    );
  }
  return value;
}

const DEPLOY_HOST = requireEnv('DEPLOY_HOST');
const DEPLOY_USER = requireEnv('DEPLOY_USER');
const DEPLOY_SSH_PORT = process.env.DEPLOY_SSH_PORT?.trim() || '22';
const DEPLOY_REMOTE_DIR = process.env.DEPLOY_REMOTE_DIR?.trim() || '~/innocenz';
const DEPLOY_DOMAIN = process.env.DEPLOY_DOMAIN?.trim() || 'innocenz.duckdns.org';
const FRONTEND_IMAGE = process.env.FRONTEND_IMAGE?.trim() || 'juneyou/innocenz-frontend:latest';
const BACKEND_IMAGE = process.env.BACKEND_IMAGE?.trim() || 'juneyou/innocenz-backend:latest';
const NETWORK_NAME = 'innocenz-network';
// NEXT_PUBLIC_* vars are inlined into the web client bundle at build time,
// so this must already be the backend's public URL, not a container-internal one.
const NEXT_PUBLIC_API_URL =
  process.env.NEXT_PUBLIC_API_URL?.trim() || `https://api.${DEPLOY_DOMAIN}/api`;

const deployDir = path.join(root, 'deploy');
const sshTarget = `${DEPLOY_USER}@${DEPLOY_HOST}`;

// deploy/.env(.frontend|.backend) hold real values/secrets and are
// git-ignored; fall back to the committed .example templates on first deploy.
function resolveDeployFile(name) {
  const real = path.join(deployDir, name);
  return fs.existsSync(real) ? real : path.join(deployDir, `${name}.example`);
}

function run(command, args, options = {}) {
  console.log(`\n$ ${command} ${args.join(' ')}`);
  execFileSync(command, args, { cwd: root, stdio: 'inherit', ...options });
}

run('docker', ['compose', 'build'], {
  env: { ...process.env, NEXT_PUBLIC_API_URL, FRONTEND_IMAGE, BACKEND_IMAGE },
});

run('docker', ['push', FRONTEND_IMAGE]);
run('docker', ['push', BACKEND_IMAGE]);

const remoteEnvContent = `FRONTEND_IMAGE=${FRONTEND_IMAGE}\nBACKEND_IMAGE=${BACKEND_IMAGE}\n`;
const remoteEnvPath = path.join(deployDir, '.env.generated');
fs.writeFileSync(remoteEnvPath, remoteEnvContent);

try {
  run('ssh', ['-p', DEPLOY_SSH_PORT, sshTarget, `mkdir -p ${DEPLOY_REMOTE_DIR}`]);

  const files = [
    [path.join(deployDir, 'docker-compose.yml'), 'docker-compose.yml'],
    [path.join(deployDir, 'Caddyfile'), 'Caddyfile'],
    [path.join(deployDir, 'redeploy.sh'), 'redeploy.sh'],
    [remoteEnvPath, '.env'],
    [resolveDeployFile('.env.frontend'), '.env.frontend'],
    [resolveDeployFile('.env.backend'), '.env.backend'],
  ];
  for (const [local, remoteName] of files) {
    run('scp', ['-P', DEPLOY_SSH_PORT, local, `${sshTarget}:${DEPLOY_REMOTE_DIR}/${remoteName}`]);
  }

  const remoteCommand = [
    `docker network inspect ${NETWORK_NAME} >/dev/null 2>&1 || docker network create ${NETWORK_NAME}`,
    `cd ${DEPLOY_REMOTE_DIR}`,
    `chmod +x redeploy.sh`,
    `./redeploy.sh`,
  ].join(' && ');

  run('ssh', ['-p', DEPLOY_SSH_PORT, sshTarget, remoteCommand]);

  console.log(
    `\nDeployed.\n  web     https://${DEPLOY_DOMAIN}\n  backend https://api.${DEPLOY_DOMAIN}/api`
  );
} finally {
  fs.rmSync(remoteEnvPath, { force: true });
}
