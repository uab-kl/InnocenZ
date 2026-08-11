/**
 * The per-user folder in R2: ONE named folder rather than a bare uuid, so the
 * bucket is readable in the Cloudflare dashboard.
 *
 *   user/vicky-pr-93ea08b0/receipts/drinks/scan-….jpg
 *   user/atlas-agency-owner-96cb6034/profile/avatar-….png
 *   user/innocenz-admin-86cef074/profile/avatar-….png
 *
 * Who they belong to in front, what they do behind, the id last — see
 * `composeUserFolder`.
 *
 * WHY THE ID SUFFIX IS NOT OPTIONAL: `user.username` has no unique constraint
 * and duplicates already exist in this database (two `jk`, two `Ng Jun Yu`).
 * A name-only folder would put two people in one prefix, where one user's
 * proof-photo cleanup deletes the other's evidence. The uuid head keeps them
 * apart and is what ownership is actually checked against — the role and name
 * are decoration and may change; the id may not.
 *
 * SYNCHRONOUS BY DESIGN. Key builders like buildComcardKey() are sync and are
 * called from sync code; making them async to await a lookup would ripple
 * through every caller. Instead the id→segment map is primed once at boot and
 * kept warm on signup/rename. A miss falls back to the raw uuid, which is a
 * valid key that self-heals on the next prime — never an error.
 */
import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { logger } from '@/util/logger';

/** userId -> folder segment (`pr-vicky-93ea08b0`). */
const cache = new Map<string, string>();

/** How much of the uuid rides along. 8 hex chars over a few thousand users. */
const ID_CHARS = 8;

/**
 * Which portal a user belongs to. There is no `pr` portal — a PR holds no
 * user_role row at all, so "no role" IS the PR case, not missing data.
 */
export type UserRoleLabel = 'admin' | 'agency' | 'outlet' | 'pr' | string;

/**
 * Lowercase, ASCII, hyphen-separated. Apostrophes and spaces are real in this
 * data ("Dato' Lim Wei Khoon") and must not reach an object key verbatim.
 */
export function slugifyUsername(username: string | null | undefined): string {
  if (!username) return '';
  return username
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, 40)
    .replace(/-+$/, '');
}

/** The immutable half — what ownership is proven by. */
function idPart(userId: string): string {
  return userId.replace(/-/g, '').slice(0, ID_CHARS);
}

/**
 * The same uuid head, for named folders outside `user/` (org logos).
 *
 * Exported rather than copied so both conventions move together if ID_CHARS
 * ever changes — a folder whose id length disagreed with the one ownership is
 * checked against is the kind of drift that surfaces months later as a missing
 * photo.
 */
export function idHead(id: string): string {
  return idPart(id);
}

/**
 * ONE folder per user: who they belong to in FRONT, what they do BEHIND, and
 * the id last.
 *
 *   user/atlas-agency-owner-96cb6034/…
 *   user/emhub-testing-owner-d83bcc1d/…
 *   user/vicky-pr-93ea08b0/…
 *   user/innocenz-admin-86cef074/…
 *
 * FRONT is the organisation they work for — the agency or the outlet. A PR
 * belongs to no single organisation (they can be tied to two agencies at
 * once), so their own nickname stands in front instead, and `pr` is what goes
 * behind it.
 *
 * THE ID IS LAST AND IS NOT OPTIONAL. `user.username` has no unique constraint
 * and duplicates already exist in this database (two `jk`, two `Ng Jun Yu`) —
 * and now that the front is the ORG, an agency's two finance staff would
 * otherwise both be `atlas-agency-finance`, one prefix holding two people,
 * where one user's proof-photo cleanup deletes the other's evidence. The uuid
 * head is also what ownership is actually checked against; the org name and
 * the role are decoration and may change, the id may not.
 */
export function composeUserFolder(
  userId: string,
  username: string | null | undefined,
  role: UserRoleLabel | null | undefined,
  orgName?: string | null,
  subRole?: string | null,
): string {
  const lane = slugifyUsername(role) || 'pr';
  // Org first; a PR (and an admin) has none, so their own name leads.
  const front = slugifyUsername(orgName) || slugifyUsername(username) || lane;
  // The specific job when known, else the portal lane — a PR's lane IS `pr`.
  const job = slugifyUsername(subRole) || lane;
  const parts = [front, job, idPart(userId)];

  /*
   * Never say the same word twice. The admin's username already ends in
   * "admin" and `role.role_name` is also "admin", which would read
   * `innocenz-admin-admin-86cef074`.
   */
  return parts
    .filter((p, i) => i === 0 || !parts.slice(0, i).join('-').endsWith(p))
    .join('-');
}

/** Call after creating or renaming a user so the next key uses the new name. */
export function rememberUserFolder(
  userId: string,
  username: string | null | undefined,
  role: UserRoleLabel | null | undefined,
  orgName?: string | null,
  subRole?: string | null,
): void {
  cache.set(userId, composeUserFolder(userId, username, role, orgName, subRole));
}

/**
 * The folder for this user. Falls back to the FULL uuid on a cache miss —
 * still a valid, owned key, just not a pretty one.
 */
export function userFolder(userId: string): string {
  return cache.get(userId) ?? userId;
}

/** `user/vicky-pr-93ea08b0/` — the prefix every key for this user starts with. */
export function userFolderPrefix(userId: string): string {
  return `user/${userFolder(userId)}/`;
}

/**
 * Does this key belong to this user?
 *
 * Matches on the uuid head ONLY, never the name or role — both can change, and
 * a renamed user must not lose access to their own evidence. Also accepts the
 * legacy `user/<full-uuid>/…` shape: rows written before the rename hold it,
 * and rejecting those would make a PR's own older photos look foreign, so they
 * would be dropped on carry-forward and skipped by cleanup.
 */
export function isOwnedUserKey(key: string, userId: string): boolean {
  if (!key.startsWith('user/')) return false;
  const parts = key.slice('user/'.length).split('/');
  const id = idPart(userId);
  /*
   * THREE shapes are live at once, and every one of them must match — a key
   * this rejects is a photo its own owner loses: dropped on carry-forward and
   * skipped by cleanup.
   *
   *   1  user/<full-uuid>/…                    owner in segment 1  (legacy)
   *   2  user/pr/<slug>-<id8>/…                owner in segment 2  (interim)
   *   3  user/<org>-<role>-<id8>/…             owner in segment 1  (current)
   *
   * Shape 2 existed only briefly but objects written under it are still in the
   * bucket until the migration moves them, so it is still matched. Scanning
   * two segments covers all three; it cannot produce a false positive, because
   * only the id8 tail is ever compared and no org or role slug carries one.
   *
   * Matching on the id ALONE — never the name, the org or the role — is what
   * lets someone be renamed, promoted, or moved between agencies without
   * losing access to their own evidence.
   */
  for (const segment of parts.slice(0, 3)) {
    if (segment === userId || segment === id || segment.endsWith(`-${id}`)) return true;
  }
  return false;
}

/**
 * id + username + portal code + the org they belong to + what they do there.
 *
 * `org_name` comes from the tenancy tables (`agency_user` / `outlet_user`), and
 * `sub_role` from `role.role_name` — the outlet model says so explicitly:
 * "Portal lane labels are stored on user_role→role, not outlet_user". A user
 * with no tenancy row yields null and falls back to the portal lane.
 *
 * `min()` throughout because a user can hold more than one role row; the folder
 * needs ONE stable answer, and a name that flickers between two prefixes would
 * scatter one person's files across both.
 */
const FOLDER_SOURCE_SQL = sql`
  select u.id,
         u.username,
         coalesce(min(po.code), 'pr') as role,
         min(r.role_name) as sub_role,
         coalesce(min(ag.name), min(ou.name)) as org_name
    from main."user" u
    left join main.user_role ur on ur.user_id = u.id
    left join main.role r on r.id = ur.role_id
    left join main.portal po on po.id = r.portal_id
    left join main.agency_user au on au.user_id = u.id
    left join main.agency ag on ag.id = au.agency_id
    left join main.outlet_user ou_link on ou_link.user_id = u.id
    left join main.outlet ou on ou.id = ou_link.outlet_id
   group by u.id, u.username`;

type FolderRow = {
  id: string;
  username: string | null;
  role: string | null;
  sub_role: string | null;
  org_name: string | null;
};

/** node-postgres hands back { rows }; some drivers return the array itself. */
function toRows(result: unknown): FolderRow[] {
  if (Array.isArray(result)) return result as FolderRow[];
  return ((result as { rows?: FolderRow[] }).rows ?? []) as FolderRow[];
}

/**
 * Load every user's folder once at boot. Failure is non-fatal: keys simply
 * fall back to uuid folders, which is exactly the old behaviour.
 */
export async function primeUserFolders(): Promise<void> {
  try {
    const rows = toRows(await db.execute(FOLDER_SOURCE_SQL));
    cache.clear();
    for (const r of rows) rememberUserFolder(r.id, r.username, r.role, r.org_name, r.sub_role);
    logger.info(`[user-folder] primed ${cache.size} user folder(s)`);
  } catch (error) {
    logger.warn('[user-folder] prime failed — falling back to uuid folders', error);
  }
}

/** Refresh one user (after a signup or a rename) without a full reprime. */
export async function refreshUserFolder(userId: string): Promise<void> {
  try {
    const rows = toRows(
      await db.execute(sql`${FOLDER_SOURCE_SQL} having u.id = ${userId}`),
    );
    const row = rows.find((r) => r.id === userId);
    if (row) rememberUserFolder(row.id, row.username, row.role, row.org_name, row.sub_role);
  } catch {
    // keep whatever is cached — a stale pretty name beats a thrown request
  }
}
