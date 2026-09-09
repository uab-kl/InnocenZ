/**
 * Human-readable account ids — the ONE place they are minted.
 *
 *   agency operator  INN + <ORG CODE> + AGY + 0001   e.g. INNATAGY0001
 *   venue operator   INN + <ORG CODE> + OLT + 0001   e.g. INNEMOLT0001
 *   PR               INNPR0001
 *   admin            INNADM0001
 *
 * Nobody types one. Every id is issued at creation and never edited afterwards:
 * an id that can change is not an id, it is a nickname, and support quoting one
 * back from an email would be quoting a value that has since moved.
 */
import { and, eq, isNotNull, like, sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { AgencyTable, AgencyUserTable } from '@/features/agency/agency.model';
import { OutletTable, OutletUserTable } from '@/features/outlet/outlet.model';
import { RoleTable } from '@/features/rbac/role/role.model';
import { UserRoleTable } from '@/features/rbac/user-role/user-role.model';
import { UserTable } from '@/features/user/user.model';
import type { DbTransaction } from '@/types/db-transaction';
import { logger } from '@/util/logger';

const BRAND = 'INN';
const DIGITS = 4;

/** How many times to re-take the next number when another writer won the race. */
const MAX_ATTEMPTS = 5;

export type MemberCodeOrgKind = 'agency' | 'outlet';

const ORG_SEGMENT: Record<MemberCodeOrgKind, string> = {
  agency: 'AGY',
  outlet: 'OLT',
};

/**
 * A short letter code proposed from the organisation's name.
 *
 * The owner's own examples do not share one rule — Atlas Agency -> AT, Why We
 * Met -> WWM, UAB Emhub -> EM — so this is a SUGGESTION an admin can overrule,
 * not a derivation anyone should trust blindly:
 *
 *  * several words -> their initials       (Why We Met -> WWM)
 *  * one word      -> its first two letters (Atlas -> AT)
 *
 * Words naming the category rather than the business are dropped first, so
 * "Atlas Agency" reads as one word and "UAB Emhub" keeps both. Returns null for
 * a name with no letters at all — a case for a human, not a fallback that mints
 * `INNAGY0001` and looks deliberate.
 */
export function suggestOrgPrefix(name: string): string | null {
  const NOISE = new Set([
    'agency',
    'agencies',
    'outlet',
    'club',
    'bar',
    'lounge',
    'sdn',
    'bhd',
    'pte',
    'ltd',
    'the',
  ]);
  const words = name
    .replace(/[^A-Za-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !NOISE.has(w.toLowerCase()));
  if (words.length === 0) {
    const letters = name.replace(/[^A-Za-z]/g, '');
    return letters ? letters.slice(0, 2).toUpperCase() : null;
  }
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return words
    .slice(0, 4)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

/**
 * The suggestion, made unique against the organisations that already hold one.
 *
 * Two agencies called "Atlas" both suggest AT; the second becomes AT2. A taken
 * code is not a cosmetic problem — every id built on it would collide with the
 * other organisation's from the very first member.
 */
export async function reserveOrgPrefix(
  kind: MemberCodeOrgKind,
  name: string,
  tx?: DbTransaction,
): Promise<string | null> {
  const base = suggestOrgPrefix(name);
  if (!base) return null;
  const dbClient = tx ?? db;
  for (let n = 1; n <= 99; n += 1) {
    const candidate = n === 1 ? base : `${base}${n}`;
    const taken =
      kind === 'agency'
        ? await dbClient
            .select({ id: AgencyTable.id })
            .from(AgencyTable)
            .where(eq(AgencyTable.memberCodePrefix, candidate))
            .limit(1)
        : await dbClient
            .select({ id: OutletTable.id })
            .from(OutletTable)
            .where(eq(OutletTable.memberCodePrefix, candidate))
            .limit(1);
    if (taken.length === 0) return candidate;
  }
  return null;
}

const pad = (n: number) => String(n).padStart(DIGITS, '0');

/** The numeric tail of an id, or 0 for anything that does not end in digits. */
function tailNumber(code: string | null): number {
  if (!code) return 0;
  const m = code.match(/(\d+)$/);
  return m ? Number(m[1]) : 0;
}

/** 23505 = unique_violation. Drizzle 0.45 hides the pg code under `.cause`. */
function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.code === '23505' || e?.cause?.code === '23505';
}

/**
 * The next id for one organisation, as a plain string.
 *
 * Used by the two membership `add()` functions, which insert it themselves so
 * the id and the row commit together inside whatever transaction the caller
 * already opened. The unique index is what makes a race safe: two adds landing
 * on the same number means the SECOND insert fails rather than two members
 * quietly sharing an id. `issueOrgMemberCode` below wraps this with a retry for
 * callers that own the write.
 */
export async function nextOrgMemberCode(
  kind: MemberCodeOrgKind,
  orgId: string,
  tx?: DbTransaction,
): Promise<string | null> {
  // 🔴 EVERY read below goes through the CALLER’S transaction when there is one.
  // Sign-up creates the organisation and its first member in one transaction, so
  // a lookup on the pooled `db` connection cannot see the organisation yet: it
  // returned undefined, this function returned null, and the owner was inserted
  // with NO id and the organisation with NO prefix — silently, because a null id
  // is also what a legitimately un-backfilled row looks like. Three venues were
  // created that way before it was caught.
  const dbClient = tx ?? db;
  const org =
    kind === 'agency'
      ? (
          await dbClient
            .select({
              prefix: AgencyTable.memberCodePrefix,
              name: AgencyTable.name,
            })
            .from(AgencyTable)
            .where(eq(AgencyTable.id, orgId))
            .limit(1)
        )[0]
      : (
          await dbClient
            .select({
              prefix: OutletTable.memberCodePrefix,
              name: OutletTable.name,
            })
            .from(OutletTable)
            .where(eq(OutletTable.id, orgId))
            .limit(1)
        )[0];
  if (!org) return null;

  let prefix = org.prefix;
  if (!prefix) {
    prefix = await reserveOrgPrefix(kind, org.name, tx);
    if (!prefix) return null;
    if (kind === 'agency') {
      await dbClient
        .update(AgencyTable)
        .set({ memberCodePrefix: prefix })
        .where(eq(AgencyTable.id, orgId));
    } else {
      await dbClient
        .update(OutletTable)
        .set({ memberCodePrefix: prefix })
        .where(eq(OutletTable.id, orgId));
    }
  }

  const head = `${BRAND}${prefix}${ORG_SEGMENT[kind]}`;
  const rows =
    kind === 'agency'
      ? await dbClient
          .select({ code: AgencyUserTable.memberCode })
          .from(AgencyUserTable)
          .where(
            and(
              isNotNull(AgencyUserTable.memberCode),
              like(AgencyUserTable.memberCode, `${head}%`),
            ),
          )
      : await dbClient
          .select({ code: OutletUserTable.memberCode })
          .from(OutletUserTable)
          .where(
            and(
              isNotNull(OutletUserTable.memberCode),
              like(OutletUserTable.memberCode, `${head}%`),
            ),
          );
  const next =
    rows.reduce((max, r) => Math.max(max, tailNumber(r.code)), 0) + 1;
  return `${head}${pad(next)}`;
}

/**
 * Next id for one ORGANISATION membership, handed to `issue` to write.
 *
 * Numbering restarts inside each organisation — that is what "separate by each
 * organisation" means — so this counts only the rows sharing that prefix, and
 * retries when the unique index refuses the number. Read-then-write cannot be
 * made safe by reading more carefully; the index is what settles a race.
 */
export async function issueOrgMemberCode<T>(
  kind: MemberCodeOrgKind,
  orgId: string,
  issue: (code: string) => Promise<T>,
): Promise<T | null> {
  const org =
    kind === 'agency'
      ? (
          await db
            .select({
              prefix: AgencyTable.memberCodePrefix,
              name: AgencyTable.name,
            })
            .from(AgencyTable)
            .where(eq(AgencyTable.id, orgId))
            .limit(1)
        )[0]
      : (
          await db
            .select({
              prefix: OutletTable.memberCodePrefix,
              name: OutletTable.name,
            })
            .from(OutletTable)
            .where(eq(OutletTable.id, orgId))
            .limit(1)
        )[0];
  if (!org) return null;

  let prefix = org.prefix;
  if (!prefix) {
    // An organisation created before this scheme existed, or one whose code was
    // never set. Reserve one now rather than refusing to issue the id.
    prefix = await reserveOrgPrefix(kind, org.name);
    if (!prefix) return null;
    if (kind === 'agency') {
      await db
        .update(AgencyTable)
        .set({ memberCodePrefix: prefix })
        .where(eq(AgencyTable.id, orgId));
    } else {
      await db
        .update(OutletTable)
        .set({ memberCodePrefix: prefix })
        .where(eq(OutletTable.id, orgId));
    }
  }

  const head = `${BRAND}${prefix}${ORG_SEGMENT[kind]}`;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const rows =
      kind === 'agency'
        ? await db
            .select({ code: AgencyUserTable.memberCode })
            .from(AgencyUserTable)
            .where(
              and(
                isNotNull(AgencyUserTable.memberCode),
                like(AgencyUserTable.memberCode, `${head}%`),
              ),
            )
        : await db
            .select({ code: OutletUserTable.memberCode })
            .from(OutletUserTable)
            .where(
              and(
                isNotNull(OutletUserTable.memberCode),
                like(OutletUserTable.memberCode, `${head}%`),
              ),
            );
    const next =
      rows.reduce((max, r) => Math.max(max, tailNumber(r.code)), 0) + 1;
    try {
      return await issue(`${head}${pad(next + attempt)}`);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      logger.warn(
        `[member-code] ${head}${pad(next + attempt)} was taken, retrying`,
      );
    }
  }
  return null;
}

/**
 * Next id for a person who belongs to no organisation — a PR or an admin.
 *
 * One global sequence per family, stored on `user`, because a PR keeps their id
 * as they move between agencies.
 */
export async function issuePersonCode<T>(
  family: 'PR' | 'ADM',
  issue: (code: string) => Promise<T>,
): Promise<T | null> {
  const head = `${BRAND}${family}`;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const rows = await db
      .select({ code: UserTable.memberCode })
      .from(UserTable)
      .where(
        and(
          isNotNull(UserTable.memberCode),
          like(UserTable.memberCode, `${head}%`),
        ),
      );
    const next =
      rows.reduce((max, r) => Math.max(max, tailNumber(r.code)), 0) + 1;
    try {
      return await issue(`${head}${pad(next + attempt)}`);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      logger.warn(
        `[member-code] ${head}${pad(next + attempt)} was taken, retrying`,
      );
    }
  }
  return null;
}

/**
 * Give a PR or an admin their id if they do not have one yet.
 *
 * Called AFTER the role is granted, never at user creation: `createUser` mints
 * org operators and PRs alike and does not know which it is making — on the
 * agency add-a-PR path the role is not assigned until a statement later. Keying
 * off the granted role instead also covers PROMOTION, where somebody becomes an
 * admin with no new user row created at all and no creation hook ever fires.
 *
 * Idempotent and quiet: a person who already holds an id keeps it, and a person
 * who is neither a PR nor an admin gets none.
 */
export async function ensurePersonCode(userId: string): Promise<void> {
  const [existing] = await db
    .select({ code: UserTable.memberCode })
    .from(UserTable)
    .where(eq(UserTable.id, userId))
    .limit(1);
  if (!existing || existing.code) return;

  const roles = await db
    .select({ roleName: RoleTable.roleName })
    .from(UserRoleTable)
    .innerJoin(RoleTable, eq(RoleTable.id, UserRoleTable.roleId))
    .where(eq(UserRoleTable.userId, userId));
  const names = roles.map((r) => (r.roleName ?? '').toLowerCase());
  const family = names.includes('admin')
    ? ('ADM' as const)
    : names.includes('pr')
      ? ('PR' as const)
      : null;
  if (!family) return;

  await issuePersonCode(family, async (code) => {
    await db
      .update(UserTable)
      .set({ memberCode: code })
      .where(eq(UserTable.id, userId));
    return code;
  });
}

/**
 * Does this organisation already have members holding ids?
 *
 * The freeze rule: once one id is issued, the organisation's code may not
 * change, because every id already printed on a screen or an email was built
 * from it.
 */
export async function orgHasIssuedCodes(
  kind: MemberCodeOrgKind,
  orgId: string,
): Promise<boolean> {
  const rows =
    kind === 'agency'
      ? await db
          .select({ n: sql<number>`count(*)` })
          .from(AgencyUserTable)
          .where(
            and(
              eq(AgencyUserTable.agencyId, orgId),
              isNotNull(AgencyUserTable.memberCode),
            ),
          )
      : await db
          .select({ n: sql<number>`count(*)` })
          .from(OutletUserTable)
          .where(
            and(
              eq(OutletUserTable.outletId, orgId),
              isNotNull(OutletUserTable.memberCode),
            ),
          );
  return Number(rows[0]?.n ?? 0) > 0;
}
