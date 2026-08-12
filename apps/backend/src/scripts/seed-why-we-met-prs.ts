import 'dotenv/config';

import { randomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { AgencyTable } from '@/features/agency/agency.model';
import { AgencyPrTable } from '@/features/pr-personnel/pr.model';
import { RoleTable } from '@/features/rbac/role/role.model';
import { UserRoleTable } from '@/features/rbac/user-role/user-role.model';
import { UserProfileTable } from '@/features/user/user-profile/user-profile.model';
import { UserTable } from '@/features/user/user.model';
import { hashPassword } from '@/util/password';
import { r2Configured, r2PutObject } from '@/util/r2';
import { composeUserFolder } from '@/util/user-folder';
import { logger } from '@/util/logger';

// One-off: file the owner's picture folders as Why We Met (AGY777) PRs.
//
// Each folder under PRS_DIR is one PR; the folder NAME is their nickname and
// the files inside are their gallery. Photos land in R2 under the same
// `user/pr/<slug>-<uuid>/portfolio/` prefix the mobile app writes to, but keep
// their ORIGINAL filenames (not `slot-N-<ts>`): nothing parses the filename
// back, and a stable name makes a re-run overwrite the same key instead of
// stranding a timestamped orphan next to it.
//
// The membership is created `approve_status = 'pending'` — the same Approval
// state Alice and Vicky hold today — so every one of them sits in the
// agency's approval queue for the owner to decide on.
//
// These accounts have NO usable login: the password is 32 random bytes that
// are hashed and thrown away. The owner edits them from the agency portal.
//
// Idempotent: matched by email. An existing user is never re-uploaded or
// re-passworded; only the missing halves (role, membership) are topped up.
const ACTOR = 'seed-wwm-prs';
const AGENCY_CODE = 'AGY777';
const PR_ROLE_NAME = 'pr';
const PRS_DIR = process.env.PRS_DIR ?? 'C:/Users/jinkg/Pictures/prs';

// Vicky (Victoria Tan Mei Lin) is already a member — her folder is her
// pictures, not a new person. Alice has no folder, so nothing to skip there.
const SKIP_FOLDERS = new Set(['victoria']);

const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

/** user_profile.portfolio_photos is an 8-slot array padded with nulls. */
const PORTFOLIO_SLOTS = 8;

async function run(): Promise<void> {
  if (!r2Configured()) {
    logger.error('[seed-wwm-prs] R2 is not configured — refusing to seed photo-less PRs.');
    return;
  }

  const [agency] = await db
    .select({ id: AgencyTable.id, name: AgencyTable.name })
    .from(AgencyTable)
    .where(eq(AgencyTable.agencyCode, AGENCY_CODE))
    .limit(1);
  if (!agency) {
    logger.error(`[seed-wwm-prs] Agency ${AGENCY_CODE} not found — run seed-why-we-met-agency first.`);
    return;
  }

  const [prRole] = await db
    .select({ id: RoleTable.id })
    .from(RoleTable)
    .where(eq(RoleTable.roleName, PR_ROLE_NAME))
    .limit(1);
  if (!prRole) {
    logger.error('[seed-wwm-prs] PR role not found — run init-roles first.');
    return;
  }

  const folders = readdirSync(PRS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !SKIP_FOLDERS.has(d.name))
    .map((d) => d.name)
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

  let created = 0;
  let skipped = 0;
  let memberships = 0;
  let uploaded = 0;

  for (const nickname of folders) {
    const dir = join(PRS_DIR, nickname);
    const files = readdirSync(dir)
      .filter((f) => CONTENT_TYPES[extname(f).toLowerCase()])
      .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    if (files.length === 0) {
      logger.warn(`[seed-wwm-prs] ${nickname}: no images — skipped entirely.`);
      continue;
    }

    // Owner's rule: every nickname LEADS with a capital letter — "Angie",
    // "CharlotteII", "Ip17pm". The folder may be lowercase; the name may not.
    const username = nickname.charAt(0).toUpperCase() + nickname.slice(1);
    const email = `pr.${nickname.toLowerCase()}@whywemet.demo`;
    let [user] = await db
      .select({ id: UserTable.id, profileImage: UserTable.profileImage })
      .from(UserTable)
      .where(eq(UserTable.email, email))
      .limit(1);

    if (!user) {
      // Unusable by design — hashed, never printed, never stored elsewhere.
      const throwawayPassword = randomBytes(32).toString('base64url');
      const [inserted] = await db
        .insert(UserTable)
        .values({
          email,
          username,
          passwordHash: await hashPassword(throwawayPassword),
          status: 'active',
          createdBy: ACTOR,
          updatedBy: ACTOR,
        })
        .returning({ id: UserTable.id, profileImage: UserTable.profileImage });
      if (!inserted) continue;
      user = inserted;

      // Same folder scheme every real upload uses: `pr/<slug>-<uuid>`.
      const folder = composeUserFolder(user.id, nickname, 'pr', null, 'pr');
      const keys: string[] = [];
      for (const file of files) {
        const key = `user/${folder}/portfolio/${basename(file).toLowerCase()}`;
        await r2PutObject({
          key,
          body: readFileSync(join(dir, file)),
          contentType: CONTENT_TYPES[extname(file).toLowerCase()]!,
        });
        keys.push(key);
        uploaded += 1;
      }

      // Gallery = every photo; profile picture = the first one, by REFERENCE
      // (no second copy of the object — one image lives once in the bucket).
      const portfolioPhotos: (string | null)[] = [
        ...keys,
        ...Array<null>(Math.max(0, PORTFOLIO_SLOTS - keys.length)).fill(null),
      ].slice(0, PORTFOLIO_SLOTS);

      await db
        .update(UserTable)
        .set({ profileImage: keys[0], updatedBy: ACTOR, updatedAt: new Date() })
        .where(eq(UserTable.id, user.id));
      await db.insert(UserProfileTable).values({
        userId: user.id,
        portfolioPhotos,
        createdBy: ACTOR,
        updatedBy: ACTOR,
      });

      created += 1;
      logger.info(`[seed-wwm-prs] ${nickname}: created with ${keys.length} photos.`);
    } else {
      // Top-up: the folder is the source of truth. A photo dropped in AFTER
      // the first run (grace4.png, janice4.png — the comcard needs 4) is
      // uploaded and slotted in; photos already stored are never re-sent.
      const folder = composeUserFolder(user.id, nickname, 'pr', null, 'pr');
      const expected = files.map(
        (file) => `user/${folder}/portfolio/${basename(file).toLowerCase()}`,
      );
      const [profile] = await db
        .select({
          id: UserProfileTable.id,
          portfolioPhotos: UserProfileTable.portfolioPhotos,
        })
        .from(UserProfileTable)
        .where(eq(UserProfileTable.userId, user.id))
        .limit(1);
      const stored = new Set(
        (profile?.portfolioPhotos ?? []).filter(
          (key): key is string => typeof key === 'string',
        ),
      );
      const missing = files.filter((_, i) => !stored.has(expected[i]!));

      if (missing.length === 0) {
        skipped += 1;
        logger.info(`[seed-wwm-prs] ${nickname}: already exists — photos untouched.`);
      } else {
        for (const file of missing) {
          await r2PutObject({
            key: `user/${folder}/portfolio/${basename(file).toLowerCase()}`,
            body: readFileSync(join(dir, file)),
            contentType: CONTENT_TYPES[extname(file).toLowerCase()]!,
          });
          uploaded += 1;
        }
        const portfolioPhotos: (string | null)[] = [
          ...expected,
          ...Array<null>(Math.max(0, PORTFOLIO_SLOTS - expected.length)).fill(null),
        ].slice(0, PORTFOLIO_SLOTS);
        if (profile) {
          await db
            .update(UserProfileTable)
            .set({ portfolioPhotos, updatedBy: ACTOR, updatedAt: new Date() })
            .where(eq(UserProfileTable.id, profile.id));
        } else {
          await db.insert(UserProfileTable).values({
            userId: user.id,
            portfolioPhotos,
            createdBy: ACTOR,
            updatedBy: ACTOR,
          });
        }
        await db
          .update(UserTable)
          .set({ profileImage: expected[0], updatedBy: ACTOR, updatedAt: new Date() })
          .where(eq(UserTable.id, user.id));
        logger.info(`[seed-wwm-prs] ${nickname}: topped up ${missing.length} photo(s).`);
      }
    }

    const [hasRole] = await db
      .select({ id: UserRoleTable.id })
      .from(UserRoleTable)
      .where(and(eq(UserRoleTable.userId, user.id), eq(UserRoleTable.roleId, prRole.id)))
      .limit(1);
    if (!hasRole) {
      await db.insert(UserRoleTable).values({
        userId: user.id,
        roleId: prRole.id,
        createdBy: ACTOR,
        updatedBy: ACTOR,
      });
    }

    const inserted = await db
      .insert(AgencyPrTable)
      .values({
        agencyId: agency.id,
        userId: user.id,
        approveStatus: 'pending',
        createdBy: ACTOR,
        updatedBy: ACTOR,
      })
      .onConflictDoNothing()
      .returning({ id: AgencyPrTable.id });
    if (inserted.length > 0) memberships += 1;
  }

  // Self-heal rows seeded before the capitalisation rule: the nickname's
  // first letter must be a capital. Scoped to this seeder's own rows only.
  const fixed = await db.execute(sql`
    update main."user"
       set username = upper(left(username, 1)) || right(username, -1),
           updated_by = ${ACTOR}, updated_at = now()
     where created_by = ${ACTOR} and left(username, 1) ~ '[a-z]'
  `);
  if ((fixed.rowCount ?? 0) > 0) {
    logger.info(`[seed-wwm-prs] Capitalised ${fixed.rowCount} nicknames.`);
  }

  logger.info(
    `[seed-wwm-prs] Done — ${created} PRs created, ${skipped} already existed, ` +
      `${memberships} new pending memberships, ${uploaded} photos uploaded to R2.`,
  );
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error('[seed-wwm-prs] Error:', error);
    process.exit(1);
  });
