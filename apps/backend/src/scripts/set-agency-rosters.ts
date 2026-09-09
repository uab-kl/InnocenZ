/**
 * Shape the two demo rosters the agency Manage PR page is judged on.
 *
 * Owner, 8 Sep 2026: Why We Met **35**, Atlas Agency **22**, with **5** PRs on
 * both — Vicky, jk, Alice, Aisyah Sofea and Nurul Aina. 35 + 22 − 5 = 52, which
 * is exactly the number of accounts holding the PR role, so every PR lands on at
 * least one roster and none is left orphaned.
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/set-agency-rosters.ts          # dry run
 *   npx tsx --tsconfig tsconfig.json src/scripts/set-agency-rosters.ts --apply
 *
 * ── Decisions worth knowing ────────────────────────────────────────────────
 *
 * ONLY these two agencies are touched. Delta, Starline and AliMaMa keep exactly
 * the memberships they have: nobody asked about them, and a PR who is also on
 * Delta still makes both requested numbers true. Widening a roster change to
 * agencies outside the request would be inventing scope.
 *
 * Unwanted rows are DELETED rather than marked `left`. The keep-the-row rule on
 * `agency_pr` exists so a real departure survives as history the approvals page
 * can read; this is not a departure, it is demo data being laid out — and a
 * `left` row would still be counted, because the roster query iterates
 * memberships and filters only `rejected`, so the page would show the wrong
 * number while looking correct in the database.
 *
 * Selection is DETERMINISTIC: the five shared first, then whoever is already on
 * Atlas, then username order. Re-running proposes the same split.
 */
import 'dotenv/config';

import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/index';
import { UserTable } from '@/features/user/user.model';
import { AgencyTable } from '@/features/agency/agency.model';
import { AgencyPrTable } from '@/features/pr-personnel/pr.model';
import { RoleTable } from '@/features/rbac/role/role.model';
import { UserRoleTable } from '@/features/rbac/user-role/user-role.model';

const ACTOR = 'set-agency-rosters';
const APPLY = process.argv.includes('--apply');

const WWM_CODE = 'AGY777';
const ATLAS_CODE = 'AGY001';
const WWM_TARGET = 35;
const ATLAS_TARGET = 22;

/** The five on BOTH rosters, addressed by EMAIL — usernames have been renamed. */
const SHARED_EMAILS = [
  'pr.vicky@innocenz.demo',
  'kaiforgame48@gmail.com', // jk
  'pr.alice@innocenz.demo',
  'pr.haziq@innocenz.demo', // Aisyah Sofea (account renamed this session)
  'pr.nurul@innocenz.demo', // Nurul Aina
];

async function main() {
  const agencies = await db
    .select({ id: AgencyTable.id, name: AgencyTable.name, code: AgencyTable.agencyCode })
    .from(AgencyTable);
  const wwm = agencies.find((a) => a.code === WWM_CODE);
  const atlas = agencies.find((a) => a.code === ATLAS_CODE);
  if (!wwm || !atlas) throw new Error('Why We Met or Atlas Agency not found');

  const prRows = await db
    .select({ id: UserTable.id, username: UserTable.username, email: UserTable.email })
    .from(UserTable)
    .innerJoin(UserRoleTable, eq(UserRoleTable.userId, UserTable.id))
    .innerJoin(RoleTable, eq(RoleTable.id, UserRoleTable.roleId))
    .where(eq(RoleTable.roleName, 'pr'));

  // One row per account: a user holding the role twice would otherwise be
  // counted twice and quietly shrink the roster by one.
  const unique = new Map(prRows.map((p) => [p.id, p]));
  const all = [...unique.values()].sort((a, b) =>
    (a.username ?? '').localeCompare(b.username ?? ''),
  );
  const implied = WWM_TARGET + ATLAS_TARGET - SHARED_EMAILS.length;
  if (all.length !== implied) {
    console.log(`NOTE: ${all.length} PR accounts, but the targets imply ${implied}.`);
  }

  const byEmail = new Map(all.map((p) => [(p.email ?? '').toLowerCase(), p]));
  const shared = SHARED_EMAILS.map((email) => {
    const found = byEmail.get(email);
    if (!found) throw new Error(`No PR account for ${email} — refusing to guess a substitute`);
    return found;
  });
  const sharedIds = new Set(shared.map((p) => p.id));

  const existing = await db
    .select({ agencyId: AgencyPrTable.agencyId, userId: AgencyPrTable.userId })
    .from(AgencyPrTable)
    .where(inArray(AgencyPrTable.agencyId, [wwm.id, atlas.id]));
  const onAtlasNow = new Set(existing.filter((r) => r.agencyId === atlas.id).map((r) => r.userId));

  const rest = all.filter((p) => !sharedIds.has(p.id));
  const atlasFirst = rest.filter((p) => onAtlasNow.has(p.id));
  const atlasThen = rest.filter((p) => !onAtlasNow.has(p.id));
  const atlasOnly = [...atlasFirst, ...atlasThen].slice(0, ATLAS_TARGET - shared.length);
  const atlasOnlyIds = new Set(atlasOnly.map((p) => p.id));

  const wantAtlas = new Set([...sharedIds, ...atlasOnlyIds]);
  const wantWwm = new Set([
    ...sharedIds,
    ...rest.filter((p) => !atlasOnlyIds.has(p.id)).map((p) => p.id),
  ]);

  console.log(`\n${APPLY ? '=== APPLYING ===' : '=== DRY RUN (add --apply) ==='}`);
  console.log(`PR accounts   : ${all.length}`);
  console.log(`shared (both) : ${shared.length} — ${shared.map((p) => p.username).join(', ')}`);
  console.log(`${atlas.name} : ${wantAtlas.size} (target ${ATLAS_TARGET})`);
  console.log(`${wwm.name}   : ${wantWwm.size} (target ${WWM_TARGET})`);

  let added = 0;
  let removed = 0;
  let approved = 0;

  for (const { agency, want } of [
    { agency: atlas, want: wantAtlas },
    { agency: wwm, want: wantWwm },
  ]) {
    const have = new Set(existing.filter((r) => r.agencyId === agency.id).map((r) => r.userId));
    const toAdd = [...want].filter((id) => !have.has(id));
    const toDrop = [...have].filter((id) => !want.has(id));
    const toApprove = [...want].filter((id) => have.has(id));

    console.log(
      `\n  ${agency.name}: +${toAdd.length} added, -${toDrop.length} removed, ${toApprove.length} kept`,
    );
    if (!APPLY) continue;

    if (toDrop.length) {
      await db
        .delete(AgencyPrTable)
        .where(and(eq(AgencyPrTable.agencyId, agency.id), inArray(AgencyPrTable.userId, toDrop)));
      removed += toDrop.length;
    }
    if (toAdd.length) {
      // All four audit columns together — the database rule, not a preference.
      await db.insert(AgencyPrTable).values(
        toAdd.map((userId) => ({
          agencyId: agency.id,
          userId,
          approveStatus: 'approved' as const,
          createdBy: ACTOR,
          updatedBy: ACTOR,
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      );
      added += toAdd.length;
    }
    if (toApprove.length) {
      // The page counts memberships whatever their status, so a stale `pending`
      // would inflate the roster while reading as an applicant on screen.
      await db
        .update(AgencyPrTable)
        .set({ approveStatus: 'approved', updatedBy: ACTOR, updatedAt: new Date() })
        .where(
          and(eq(AgencyPrTable.agencyId, agency.id), inArray(AgencyPrTable.userId, toApprove)),
        );
      approved += toApprove.length;
    }
  }

  console.log(
    `\n${APPLY ? `Added ${added}, removed ${removed}, approved ${approved}.` : 'Nothing written.'}\n`,
  );
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
