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
        `  DEPLOY_HOST=your.server.ip\n  DEPLOY_USER=deploy\n  DEPLOY_DOMAIN=your.domain\n`,
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
// VITE_* are inlined into the web client at image build time.
const VITE_API_URL =
  process.env.VITE_API_URL?.trim() || `https://api.${DEPLOY_DOMAIN}/api`;
const VITE_GRAPHQL_ENDPOINT =
  process.env.VITE_GRAPHQL_ENDPOINT?.trim() || VITE_API_URL.replace(/\/api\/?$/, '/graphql');
const VITE_R2_PUBLIC_URL = process.env.VITE_R2_PUBLIC_URL?.trim() || '';
const VITE_OUTLET_ROLE_ID = process.env.VITE_OUTLET_ROLE_ID?.trim() || '';
const VITE_AGENCY_ROLE_ID = process.env.VITE_AGENCY_ROLE_ID?.trim() || '';

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

/**
 * Real secret files only — never the committed `.example` templates.
 * Prefer `tools/deploy/.env.backend.<env>` then `tools/deploy/.env.backend`.
 * If neither exists, return null and leave the server file untouched.
 */
function resolveSecretFile(baseName) {
  const scoped = path.join(deployDir, `${baseName}.${envName}`);
  if (fs.existsSync(scoped)) return scoped;
  const shared = path.join(deployDir, baseName);
  if (fs.existsSync(shared)) return shared;
  return null;
}

function run(command, args, options = {}) {
  console.log(`\n$ ${command} ${args.join(' ')}`);
  execFileSync(command, args, { cwd: root, stdio: 'inherit', ...options });
}

const buildEnv = {
  ...process.env,
  FRONTEND_IMAGE,
  BACKEND_IMAGE,
  VITE_API_URL,
  VITE_GRAPHQL_ENDPOINT,
  VITE_R2_PUBLIC_URL,
  VITE_OUTLET_ROLE_ID,
  VITE_AGENCY_ROLE_ID,
  // Clear host secrets so Docker build cannot accidentally inherit a local
  // production DATABASE_URL / R2_* into the image layer environment.
  DATABASE_URL: '',
  POSTGRES_HOST: '',
  POSTGRES_DB: '',
  POSTGRES_USER: '',
  POSTGRES_PASSWORD: '',
  R2_BUCKET_NAME: '',
  R2_PUBLIC_URL: '',
  R2_ACCESS_KEY_ID: '',
  R2_SECRET_ACCESS_KEY: '',
  R2_ENDPOINT: '',
  R2_ACCOUNT_ID: '',
};

run('docker', ['compose', 'build'], { env: buildEnv });

run('docker', ['tag', FRONTEND_IMAGE, FRONTEND_VERSION_IMAGE]);
run('docker', ['tag', BACKEND_IMAGE, BACKEND_VERSION_IMAGE]);

run('docker', ['push', FRONTEND_IMAGE]);
run('docker', ['push', FRONTEND_VERSION_IMAGE]);
run('docker', ['push', BACKEND_IMAGE]);
run('docker', ['push', BACKEND_VERSION_IMAGE]);

const generatedEnvContent = [
  `DEPLOY_ENV=${envName}`,
  `FRONTEND_IMAGE=${FRONTEND_IMAGE}`,
  `BACKEND_IMAGE=${BACKEND_IMAGE}`,
  `FRONTEND_CONTAINER_NAME=innocenz-frontend`,
  `BACKEND_CONTAINER_NAME=innocenz-backend`,
  '',
].join('\n');
const generatedEnvPath = path.join(os.tmpdir(), `innocenz-deploy-${envName}.env`);
fs.writeFileSync(generatedEnvPath, generatedEnvContent);

const caddyfileContent =
  `${DEPLOY_DOMAIN} {\n\treverse_proxy frontend:3000\n}\n\n` +
  `api.${DEPLOY_DOMAIN} {\n\treverse_proxy backend:7777\n}\n`;
const generatedCaddyfilePath = path.join(os.tmpdir(), `innocenz-Caddyfile-${envName}`);
fs.writeFileSync(generatedCaddyfilePath, caddyfileContent);

const backendEnvLocal = resolveSecretFile('.env.backend');
const frontendEnvLocal = resolveSecretFile('.env.frontend');

if (!backendEnvLocal) {
  console.warn(
    `\n⚠️  No tools/deploy/.env.backend.${envName} (or .env.backend) found.\n` +
      `   Server ~/…/.env.backend will NOT be overwritten (keeps existing DB/R2).\n` +
      `   To manage secrets from this PC: copy tools/deploy/.env.backend.example →\n` +
      `   tools/deploy/.env.backend.${envName} and fill staging/production values.\n`,
  );
}

try {
  run('ssh', ['-p', DEPLOY_SSH_PORT, sshTarget, `mkdir -p ${DEPLOY_REMOTE_DIR}`]);

  /** Always shipped (non-secret). */
  const files = [
    [path.join(deployDir, 'docker-compose.yml'), 'docker-compose.yml'],
    [generatedCaddyfilePath, 'Caddyfile'],
    [path.join(deployDir, 'deploy.sh'), 'deploy.sh'],
    [generatedEnvPath, '.env'],
  ];

  // Secrets: upload only when a real local file exists — never the .example.
  if (frontendEnvLocal) {
    files.push([frontendEnvLocal, '.env.frontend']);
    console.log(`Using frontend env: ${path.relative(root, frontendEnvLocal)}`);
  } else {
    console.warn('Skipping .env.frontend upload (no local secret file) — keeping server copy.');
  }
  if (backendEnvLocal) {
    files.push([backendEnvLocal, '.env.backend']);
    console.log(`Using backend env: ${path.relative(root, backendEnvLocal)}`);
  } else {
    console.warn('Skipping .env.backend upload (no local secret file) — keeping server copy.');
  }

  for (const [local, remoteName] of files) {
    run('scp', ['-P', DEPLOY_SSH_PORT, local, `${sshTarget}:${DEPLOY_REMOTE_DIR}/${remoteName}`]);
  }

  // Refuse to start if the server still has no backend secrets.
  const ensureBackendEnv = [
    `cd ${DEPLOY_REMOTE_DIR}`,
    `if [ ! -f .env.backend ]; then`,
    `  echo "ERROR: ${DEPLOY_REMOTE_DIR}/.env.backend is missing.";`,
    `  echo "Create tools/deploy/.env.backend.${envName} locally and redeploy,";`,
    `  echo "or scp a filled .env.backend to the server once.";`,
    `  exit 1;`,
    `fi`,
    `if ! grep -q '^DATABASE_URL=.' .env.backend; then`,
    `  echo "ERROR: .env.backend has no DATABASE_URL — refusing to start.";`,
    `  exit 1;`,
    `fi`,
  ].join('\n');

  const remoteCommand = [
    ensureBackendEnv,
    `docker network inspect ${NETWORK_NAME} >/dev/null 2>&1 || docker network create ${NETWORK_NAME}`,
    `cd ${DEPLOY_REMOTE_DIR}`,
    `chmod +x deploy.sh`,
    `./deploy.sh`,
  ].join(' && ');

  run('ssh', ['-p', DEPLOY_SSH_PORT, sshTarget, remoteCommand]);

  console.log(
    `\nDeployed [${envName}] @ ${GIT_SHA}.\n  web     https://${DEPLOY_DOMAIN}\n  backend https://api.${DEPLOY_DOMAIN}/api\n  images  ${FRONTEND_VERSION_IMAGE}, ${BACKEND_VERSION_IMAGE}`,
  );
} finally {
  fs.rmSync(generatedEnvPath, { force: true });
  fs.rmSync(generatedCaddyfilePath, { force: true });
}
