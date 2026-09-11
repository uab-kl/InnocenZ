#!/usr/bin/env node
/**
 * THE DATABASE IS THE RBAC AUTHORITY — this keeps the portals honest about it.
 *
 * Owner, 11 Sep 2026: "the rbac must ensure what can do what cannot do, ofcourse
 * must from the database … web matrix must follow what database given."
 *
 * ⚠️ WHY THIS EXISTS. The web carried a SECOND copy of the role table, written
 * by hand in `outlet-rbac.ts` / `agency-rbac.ts`, and the two had drifted 14
 * cells apart. The database won every one of them at runtime, so the copy was
 * not merely redundant — it was WRONG on screen in both directions:
 *
 *   · outlet Finance holds `booking:create` in the database, and the server
 *     admits it (`POST /shift` → `requirePermission('booking','create')`), so
 *     Post Job worked — while the hand-written matrix said Finance was view
 *     only. A comment in shift.routes.ts still asserts Finance "cannot post a
 *     job". The matrix and the comment were both describing a rule nobody
 *     enforced.
 *   · the matrix granted `confirmDaily` to the outlet Owner, but NO outlet role
 *     holds `billing:update` at all, so the server refuses everyone.
 *
 * One fact, one place — the database rule this project already applies to
 * tables, applied to the role table itself. The portals now DERIVE their matrix
 * from the snapshot this script writes, so the copy cannot drift again:
 * regenerating is the only way to change it, and `--check` fails a stale one.
 *
 *   node tools/scripts/sync-rbac-matrix.mjs           # rewrite the snapshot
 *   node tools/scripts/sync-rbac-matrix.mjs --check   # exit 1 if it is stale
 *
 * ⚠️ It does NOT write every permission. Two are deliberately matrix-only
 * because the SERVER gates them by lane rather than by a module grant, so there
 * is no `role_permission` row to read — see MATRIX_ONLY in the rbac files.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(
	ROOT,
	'apps/web/src/agency-portal/lib/rbac-grants.generated.ts',
);

/** Sub-role value on the membership row → the role name the SERVER looks up. */
const OUTLET_LANES = {
	outlet_owner: 'Owner',
	outlet_guarantor: 'Guarantor',
	outlet_director: 'Director',
	outlet_finance: 'Finance',
	outlet_ops: 'Ops Head',
};
const AGENCY_LANES = {
	agency_owner: 'Owner',
	agency_guarantor: 'Guarantor',
	agency_director: 'Director',
	agency_finance: 'Finance',
};

function databaseUrl() {
	const envFile = path.join(ROOT, '.env');
	const line = fs
		.readFileSync(envFile, 'utf8')
		.split('\n')
		.find((l) => l.startsWith('DATABASE_URL='));
	if (!line) throw new Error('DATABASE_URL missing from .env');
	return line.slice('DATABASE_URL='.length).trim();
}

async function readGrants() {
	const client = new pg.Client({ connectionString: databaseUrl() });
	await client.connect();
	try {
		const { rows } = await client.query(`
			select p.code as portal, r.role_name as role,
			       m.module_key || ':' || pe.permission_type as grant
			from main.role r
			join main.role_permission rp on rp.role_id = r.id
			join main.m_permission pe on pe.id = rp.permission_id
			join main.m_module m on m.id = pe.module_id
			join main.portal p on p.id = r.portal_id
			where p.code in ('outlet', 'agency')
			order by 1, 2, 3`);
		return rows;
	} finally {
		await client.end();
	}
}

function build(rows, portal, lanes) {
	const byRole = new Map();
	for (const row of rows) {
		if (row.portal !== portal) continue;
		if (!byRole.has(row.role)) byRole.set(row.role, new Set());
		byRole.get(row.role).add(row.grant);
	}
	const out = {};
	for (const [lane, roleName] of Object.entries(lanes)) {
		const grants = byRole.get(roleName);
		if (!grants) {
			throw new Error(
				`No '${roleName}' role row on the ${portal} portal — the database is missing a lane the portals render. Refusing to write a snapshot that would silently strip it.`,
			);
		}
		out[lane] = [...grants].sort();
	}
	return out;
}

function render(outlet, agency) {
	const block = (name, data) =>
		`export const ${name} = {\n${Object.entries(data)
			.map(
				([lane, grants]) =>
					`\t${lane}: [\n${grants.map((g) => `\t\t"${g}",`).join('\n')}\n\t],`,
			)
			.join('\n')}\n} as const;\n`;

	return `// GENERATED FILE — DO NOT EDIT BY HAND.
//
// Written by \`node tools/scripts/sync-rbac-matrix.mjs\` from the live
// \`role_permission\` table. The database is the RBAC authority (owner's rule,
// 11 Sep 2026: "web matrix must follow what database given"), and the server
// reads the SAME rows through \`requirePermission\` → \`roleHasPermission\`, so
// what is listed here is what the API will actually allow.
//
// Each entry is that lane's grants as \`module_key:permission_type\`. The
// portals turn these into their own permission names through
// OUTLET_FEATURE_MODULE / AGENCY_FEATURE_MODULE — that mapping stays in
// TypeScript so this file is pure data.
//
// ⚠️ Editing this file changes nothing durable: the next sync overwrites it and
// \`--check\` fails while it disagrees with the database. To change what a role
// may do, change \`role_permission\` and re-run the sync.

${block('OUTLET_ROLE_GRANTS', outlet)}
${block('AGENCY_ROLE_GRANTS', agency)}`;
}

const check = process.argv.includes('--check');
const rows = await readGrants();
const next = render(
	build(rows, 'outlet', OUTLET_LANES),
	build(rows, 'agency', AGENCY_LANES),
);
const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : null;

// Compared with line endings normalised: git may check the file out as CRLF,
// and a snapshot that is "stale" only in its newlines is not stale.
const same = current !== null && current.replace(/\r\n/g, '\n') === next;

if (check) {
	if (same) {
		console.log('[rbac] the portal matrix matches the database.');
		process.exit(0);
	}
	console.error(
		current === null
			? `[rbac] STALE — ${path.relative(ROOT, OUT)} does not exist.`
			: `[rbac] STALE — ${path.relative(ROOT, OUT)} disagrees with the database.`,
	);
	console.error('[rbac] run: node tools/scripts/sync-rbac-matrix.mjs');
	process.exit(1);
}

if (same) {
	console.log('[rbac] already up to date — nothing written.');
	process.exit(0);
}
fs.writeFileSync(OUT, next);
console.log(`[rbac] wrote ${path.relative(ROOT, OUT)} from the live database.`);
