/**
 * READ-ONLY. Is the "refresh token" simply a second ACCESS token?
 *
 * `generateRefreshToken` signs the same payload with the same key and a longer
 * expiry, and `verifyToken` checks signature, algorithm and expiry — nothing
 * says which of the two it is holding. If that is right, the value the web app
 * keeps in `localStorage` under `refresh_token` opens the whole API, and the
 * short access-token lifetime buys nothing.
 *
 * Mints a token for an account that already exists and calls a READ endpoint
 * with it. Writes nothing.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') });
const { db } = await import('@/db');
const { sql } = await import('drizzle-orm');
const { JwtControllerClass } = await import('@/features/jwt/jwt.controller');

const jwt = new JwtControllerClass();
const [row] = (await db.execute(sql`
  select u.email from main."user" u
  join main.user_role ur on ur.user_id = u.id
  join main.role r on r.id = ur.role_id and r.role_name = 'admin'
  where u.status = 'active' and u.email is not null
  limit 1
`)).rows as Array<{ email: string }>;

const payload = { loginMethod: 'email', loginCriteria: row.email } as never;
const refresh = jwt.generateRefreshToken(payload);

const res = await fetch('http://localhost:7777/api/v1/auth/me', {
  headers: { Authorization: `Bearer ${refresh}` },
});
console.log('GET /auth/me using the REFRESH token ->', res.status);
console.log(
  res.status === 200
    ? 'CONFIRMED: the refresh token is accepted as an access token.'
    : 'Not accepted — the two are distinguishable after all.',
);
const decoded = jwt.verifyToken(refresh) as { exp?: number; iat?: number };
if (decoded.exp && decoded.iat) {
  console.log('refresh token lifetime (days):', ((decoded.exp - decoded.iat) / 86400).toFixed(2));
}
process.exit(0);
