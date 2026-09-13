/**
 * READ-ONLY. Does the old-data chain actually return a row now?
 *
 * Exercises registry -> path resolution -> repository with a FAKE request whose
 * `params` is empty — which is the real state inside `platformAuditMiddleware`,
 * and the thing that made every fetcher return null.
 *
 * Deliberately NOT done by sending a PUT. An "idempotent" outlet update is
 * exactly the write this project's rule is about: a schema default can turn a
 * same-value save into a real change, which is how a geofence radius was
 * rewritten on a logo save. The fetchers only READ, so they can be called
 * directly.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') });
const { db } = await import('@/db');
const { sql } = await import('drizzle-orm');
const { fetchAuditOldData } = await import('@/features/audit-log/audit-log.repository');
const { registerAllAuditOldDataFetchers, resolveEntityFromPath } = await import(
  '@/features/audit-log/audit-log.wrapper'
);

registerAllAuditOldDataFetchers();

/** A request as the middleware sees it: params EMPTY, url present. */
const fakeReq = (url: string) =>
  ({ originalUrl: url, params: {}, query: {}, body: {} }) as never;

const [outlet] = (await db.execute(sql`select id, name from main.outlet limit 1`))
  .rows as Array<{ id: string; name: string }>;
const [agency] = (await db.execute(sql`select id, name from main.agency limit 1`))
  .rows as Array<{ id: string; name: string }>;
const [user] = (await db.execute(sql`select id, email from main."user" limit 1`))
  .rows as Array<{ id: string; email: string }>;

const cases = [
  ['outlet', `/api/v1/outlet/${outlet.id}`, outlet.name],
  ['agency', `/api/v1/agency/${agency.id}`, agency.name],
  ['user', `/api/v1/user/${user.id}`, user.email],
] as const;

let failed = 0;
for (const [label, url, expect] of cases) {
  const entity = resolveEntityFromPath(url);
  const old = await fetchAuditOldData(entity, fakeReq(url));
  const ok = old !== null && old !== undefined;
  if (!ok) failed += 1;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(7)} entity=${String(entity).padEnd(8)} old_data=${
      ok ? `row for "${expect}"` : 'NULL'
    }`,
  );
}

// And the case that must STAY null — a collection write has no prior row.
const none = await fetchAuditOldData(
  resolveEntityFromPath('/api/v1/outlet'),
  fakeReq('/api/v1/outlet'),
);
const noneOk = none === null;
if (!noneOk) failed += 1;
console.log(`${noneOk ? 'PASS' : 'FAIL'}  collection write returns null (no id to read)`);

console.log(failed ? `\n${failed} FAILED` : '\nthe old-data chain returns rows');
process.exit(0);
