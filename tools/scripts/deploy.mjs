import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

// Builds web + backend images on this machine, pushes them to Docker Hub,
// then ssh's in to run tools/deploy/deploy.sh — which pulls the new images
// and restarts both containers behind the Caddy reverse proxy. The server
// never needs a git checkout of this repo, only Docker + `docker login`
// access to the same Docker Hub namespace.
//
// Usage: pnpm deploy:staging | pnpm deploy:production
// (`pnpm deploy` alone is reserved by pnpm itself, so this can't be
// `pnpm deploy <env>` — use the colon-suffixed scripts instead.)
// Prerequisite: `docker login` on this machine (image push needs it).

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const envName = process.argv[2]?.trim();
if (!envName) {
  throw new Error('Usage: node tools/scripts/deploy.mjs <environment>\n  e.g. staging, production');
}

const envFileName = `.env.deploy.${envName}`;
loadEnv({ path: path.join(root, '.env') });
loadEnv({ path: path.join(root, envFileName), override: true });

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `Missing ${name}. Set it in ${envFileName} (copy ${envFileName}.example to get started), e.g.\n` +
        `  DEPLOY_HOST=your.server.ip\n  DEPLOY_USER=deploy\n  DEPLOY_DOMAIN=your.domain\n`
    );
  }
  return value;
}

const DEPLOY_HOST = requireEnv('DEPLOY_HOST');
const DEPLOY_USER = requireEnv('DEPLOY_USER');
const DEPLOY_DOMAIN = requireEnv('DEPLOY_DOMAIN');
const DEPLOY_SSH_PORT = process.env.DEPLOY_SSH_PORT?.trim() || '22';
const DEPLOY_REMOTE_DIR = process.env.DEPLOY_REMOTE_DIR?.trim() || `~/innocenz-${envName}`;
const FRONTEND_IMAGE =
  process.env.FRONTEND_IMAGE?.trim() || `juneyou/innocenz-frontend:${envName}`;
const BACKEND_IMAGE = process.env.BACKEND_IMAGE?.trim() || `juneyou/innocenz-backend:${envName}`;
const NETWORK_NAME = `innocenz-${envName}-network`;
// NEXT_PUBLIC_* vars are inlined into the web client bundle at build time,
// so this must already be the backend's public URL, not a container-internal one.
const NEXT_PUBLIC_API_URL =
  process.env.NEXT_PUBLIC_API_URL?.trim() || `https://api.${DEPLOY_DOMAIN}/api`;

const deployDir = path.join(root, 'tools/deploy');
const sshTarget = `${DEPLOY_USER}@${DEPLOY_HOST}`;

// Every deploy also gets an immutable `<env>-<sha>` tag alongside the
// floating `<env>` tag, so a bad deploy can be rolled back to a known
// image instead of whatever last happened to be pushed to the floating tag.
const GIT_SHA = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root })
  .toString()
  .trim();
function versionTagFor(image) {
  return `${image.slice(0, image.lastIndexOf(':'))}:${envName}-${GIT_SHA}`;
}
const FRONTEND_VERSION_IMAGE = versionTagFor(FRONTEND_IMAGE);
const BACKEND_VERSION_IMAGE = versionTagFor(BACKEND_IMAGE);

// tools/deploy/.env.(frontend|backend).<env> hold real values/secrets and are
// git-ignored; fall back to the committed .example templates on first deploy.
function resolveDeployFile(baseName) {
  const scoped = path.join(deployDir, `${baseName}.${envName}`);
  if (fs.existsSync(scoped)) return scoped;
  const shared = path.join(deployDir, baseName);
  if (fs.existsSync(shared)) return shared;
  return path.join(deployDir, `${baseName}.example`);
}

function run(command, args, options = {}) {
  console.log(`\n$ ${command} ${args.join(' ')}`);
  execFileSync(command, args, { cwd: root, stdio: 'inherit', ...options });
}

run('docker', ['compose', 'build'], {
  env: { ...process.env, NEXT_PUBLIC_API_URL, FRONTEND_IMAGE, BACKEND_IMAGE },
});

run('docker', ['tag', FRONTEND_IMAGE, FRONTEND_VERSION_IMAGE]);
run('docker', ['tag', BACKEND_IMAGE, BACKEND_VERSION_IMAGE]);

run('docker', ['push', FRONTEND_IMAGE]);
run('docker', ['push', FRONTEND_VERSION_IMAGE]);
run('docker', ['push', BACKEND_IMAGE]);
run('docker', ['push', BACKEND_VERSION_IMAGE]);

const generatedEnvContent = `FRONTEND_IMAGE=${FRONTEND_IMAGE}\nBACKEND_IMAGE=${BACKEND_IMAGE}\n`;
const generatedEnvPath = path.join(os.tmpdir(), `innocenz-deploy-${envName}.env`);
fs.writeFileSync(generatedEnvPath, generatedEnvContent);

const caddyfileContent =
  `${DEPLOY_DOMAIN} {\n\treverse_proxy frontend:3000\n}\n\n` +
  `api.${DEPLOY_DOMAIN} {\n\treverse_proxy backend:7777\n}\n`;
const generatedCaddyfilePath = path.join(os.tmpdir(), `innocenz-Caddyfile-${envName}`);
fs.writeFileSync(generatedCaddyfilePath, caddyfileContent);

try {
  run('ssh', ['-p', DEPLOY_SSH_PORT, sshTarget, `mkdir -p ${DEPLOY_REMOTE_DIR}`]);

  const files = [
    [path.join(deployDir, 'docker-compose.yml'), 'docker-compose.yml'],
    [generatedCaddyfilePath, 'Caddyfile'],
    [path.join(deployDir, 'deploy.sh'), 'deploy.sh'],
    [generatedEnvPath, '.env'],
    [resolveDeployFile('.env.frontend'), '.env.frontend'],
    [resolveDeployFile('.env.backend'), '.env.backend'],
  ];
  for (const [local, remoteName] of files) {
    run('scp', ['-P', DEPLOY_SSH_PORT, local, `${sshTarget}:${DEPLOY_REMOTE_DIR}/${remoteName}`]);
  }

  const remoteCommand = [
    `docker network inspect ${NETWORK_NAME} >/dev/null 2>&1 || docker network create ${NETWORK_NAME}`,
    `cd ${DEPLOY_REMOTE_DIR}`,
    `chmod +x deploy.sh`,
    `./deploy.sh`,
  ].join(' && ');

  run('ssh', ['-p', DEPLOY_SSH_PORT, sshTarget, remoteCommand]);

  console.log(
    `\nDeployed [${envName}] @ ${GIT_SHA}.\n  web     https://${DEPLOY_DOMAIN}\n  backend https://api.${DEPLOY_DOMAIN}/api\n  images  ${FRONTEND_VERSION_IMAGE}, ${BACKEND_VERSION_IMAGE}`
  );
} finally {
  fs.rmSync(generatedEnvPath, { force: true });
  fs.rmSync(generatedCaddyfilePath, { force: true });
}
