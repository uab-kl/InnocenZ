/**
 * WHO HOLDS AN OWNER-LEVEL LANE, AND WOULD RESTRICTING THE ADMIN RESTORE
 * DROPDOWN STRAND ANYBODY — asked of the live rows, READ ONLY.
 *
 * Owner, 14 Sep 2026: the admin portal's "Switch this membership back on"
 * dialog offers Owner and Guarantor, and "they should not be allowed to make
 * someone as the owner or guarantor of an agency/outlet".
 *
 * ⚠️ NOTHING HERE WRITES. Every statement is a SELECT. The question "would
 * removing those two options leave an organisation unable to recover an owner?"
 * is answered by counting rows, never by trying the write — a previous session
 * destroyed two venues' rate cards probing a gate with a real body.
 *
 * `guarantor` matters as much as `owner`: agency.model.ts calls it "stands in
 * for the owner, at owner level — including paying PRs", so it is the second
 * owner-level lane, not a junior one.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') });
const { db } = await import('@/db');
const { sql } = await import('drizzle-orm');

const rowsOf = (r: unknown): unknown[] =>
  Array.isArray(r) ? r : ((r as { rows?: unknown[] })?.rows ?? []);

const show = (title: string, result: unknown) => {
  const rows = rowsOf(result);
  console.log(`\n=== ${title} ===`);
  if (!rows.length) {
    console.log('  (no rows)');
    return;
  }
  for (const r of rows) console.log('  ', JSON.stringify(r));
};

// 1. The shape of every membership, per org kind, by lane and status.
const agencyLanes = await db.execute(sql`
  SELECT sub_role, status, COUNT(*)::int AS n
  FROM main.agency_user
  GROUP BY sub_role, status
  ORDER BY sub_role, status
`);
const outletLanes = await db.execute(sql`
  SELECT sub_role, status, COUNT(*)::int AS n
  FROM main.outlet_user
  GROUP BY sub_role, status
  ORDER BY sub_role, status
`);
show('agency_user — lane x status', agencyLanes);
show('outlet_user — lane x status', outletLanes);

/*
 * 2. THE STRAND TEST, and the reason this probe exists.
 *
 * If an organisation has NO active owner-level member, then removing Owner and
 * Guarantor from the admin dialog would leave nobody able to put one back from
 * that screen — the admin is the break-glass lane. If every organisation has
 * one, the restriction costs nothing operationally.
 */
const agencyNoOwner = await db.execute(sql`
  SELECT a.id, a.name,
         COUNT(*) FILTER (WHERE au.sub_role IN ('owner','guarantor') AND au.status <> 'active')::int AS other_owner_level
  FROM main.agency a
  LEFT JOIN main.agency_user au ON au.agency_id = a.id
  GROUP BY a.id, a.name
  HAVING COUNT(*) FILTER (WHERE au.sub_role IN ('owner','guarantor') AND au.status = 'active') = 0
  ORDER BY a.name
`);
const outletNoOwner = await db.execute(sql`
  SELECT o.id, o.name,
         COUNT(*) FILTER (WHERE ou.sub_role IN ('owner','guarantor') AND ou.status <> 'active')::int AS other_owner_level
  FROM main.outlet o
  LEFT JOIN main.outlet_user ou ON ou.outlet_id = o.id
  GROUP BY o.id, o.name
  HAVING COUNT(*) FILTER (WHERE ou.sub_role IN ('owner','guarantor') AND ou.status = 'active') = 0
  ORDER BY o.name
`);
show('AGENCIES WITH NO ACTIVE OWNER-LEVEL MEMBER (strand risk)', agencyNoOwner);
show('OUTLETS WITH NO ACTIVE OWNER-LEVEL MEMBER (strand risk)', outletNoOwner);

// 3. Non-active owner-level rows — the ones an admin might want to switch back on.
const agencyDormant = await db.execute(sql`
  SELECT au.id, a.name AS org, au.sub_role, au.status
  FROM main.agency_user au JOIN main.agency a ON a.id = au.agency_id
  WHERE au.sub_role IN ('owner','guarantor') AND au.status <> 'active'
  ORDER BY a.name
`);
const outletDormant = await db.execute(sql`
  SELECT ou.id, o.name AS org, ou.sub_role, ou.status
  FROM main.outlet_user ou JOIN main.outlet o ON o.id = ou.outlet_id
  WHERE ou.sub_role IN ('owner','guarantor') AND ou.status <> 'active'
  ORDER BY o.name
`);
show('agency owner-level memberships NOT active', agencyDormant);
show('outlet owner-level memberships NOT active', outletDormant);

process.exit(0);
