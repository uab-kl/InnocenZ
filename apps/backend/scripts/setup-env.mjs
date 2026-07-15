import { generateKeyPairSync } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

if (existsSync('.env')) {
  console.log('.env already exists, skipping');
  process.exit(0);
}

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const escape = (key) => key.replace(/\n/g, '\\n');
const template = readFileSync('.env.example', 'utf8');

const env = template
  .replace('JWT_PRIVATE_KEY=""', `JWT_PRIVATE_KEY="${escape(privateKey)}"`)
  .replace('JWT_PUBLIC_KEY=""', `JWT_PUBLIC_KEY="${escape(publicKey)}"`);

writeFileSync('.env', env);
console.log('.env created with generated JWT keys');
