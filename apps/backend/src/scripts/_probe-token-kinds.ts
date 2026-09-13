/**
 * READ-ONLY. Claims about the auth change, each checked against the RUNNING
 * server.
 *
 *  1. an access token still works                  (nothing broke)
 *  2. a refresh token no longer opens the API      (the hole is closed)
 *  3. an UNTYPED token still works                 (nobody already signed in is
 *                                                   thrown out on deploy)
 *  4. POST /auth/refresh trades a refresh token for a fresh access token,
 *     and refuses an access token offered in its place
 *
 * Claim 3 decides whether this is a fix or an outage: every token issued before
 * the `type` claim existed carries no type.
 *
 * Mints tokens for an account that already exists; writes nothing.
 */
import path from 'node:path';
import { createPrivateKey } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') });
const { db } = await import('@/db');
const { sql } = await import('drizzle-orm');
const { env } = await import('@/env');
const { JwtControllerClass } = await import('@/features/jwt/jwt.controller');

const jwtc = new JwtControllerClass();
const [row] = (await db.execute(sql`
  select u.email from main."user" u
  join main.user_role ur on ur.user_id = u.id
  join main.role r on r.id = ur.role_id and r.role_name = 'admin'
  where u.status = 'active' and u.email is not null limit 1
`)).rows as Array<{ email: string }>;

const info = { loginMethod: 'email' as const, loginCriteria: row.email };
const access = jwtc.generateAccessToken(info);
const refresh = jwtc.generateRefreshToken(info);

// A token exactly as they were minted BEFORE the `type` claim existed.
// `createPrivateKey` rather than the raw PEM string: the value round-trips
// through dotenv with escaped newlines, and RS256 refuses anything it cannot
// read as an asymmetric key.
const pem = env.JWT_PRIVATE_KEY.split(String.raw`\n`).join('\n');
const legacy = jwt.sign(info, createPrivateKey(pem), {
  algorithm: env.JWT_ALGORITHM as jwt.Algorithm,
  expiresIn: '15m',
});

const me = (t: string) =>
  fetch('http://localhost:7777/api/v1/auth/me', {
    headers: { Authorization: `Bearer ${t}` },
  }).then((r) => r.status);

const post = (body: unknown) =>
  fetch('http://localhost:7777/api/v1/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

const results: Array<[string, boolean, string]> = [];
const accessStatus = await me(access);
results.push(['access token opens the API', accessStatus === 200, `got ${accessStatus}`]);

const refreshStatus = await me(refresh);
results.push(['refresh token is REFUSED', refreshStatus === 401, `got ${refreshStatus}`]);

const legacyStatus = await me(legacy);
results.push(['untyped (pre-change) token still works', legacyStatus === 200, `got ${legacyStatus}`]);

const good = await post({ refreshToken: refresh });
const minted = (good.body as { data?: { accessToken?: string } })?.data?.accessToken;
results.push(['/auth/refresh accepts a refresh token', good.status === 200 && !!minted, `got ${good.status}`]);

if (minted) {
  results.push(['the token it mints works', (await me(minted)) === 200, 'checked']);
}

const wrong = await post({ refreshToken: access });
results.push(['/auth/refresh refuses an ACCESS token', wrong.status === 401, `got ${wrong.status}`]);

const empty = await post({});
results.push(['/auth/refresh refuses an empty body', empty.status === 400, `got ${empty.status}`]);

let failed = 0;
for (const [name, ok, detail] of results) {
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (${detail})`);
}
console.log(failed ? `\n${failed} FAILED` : '\nall claims hold');
process.exit(0);
