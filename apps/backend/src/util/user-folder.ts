/**
 * The per-user folder in R2: a role folder plus a named folder, rather than a
 * bare uuid, so the bucket is readable in the Cloudflare dashboard and
 * `user/pr/` holds nothing but PRs.
 *
 *   user/pr/vicky-93ea08b0/receipts/drinks/scan-….jpg
 *   user/agency/dato-lim-wei-khoon-96cb6034/profile/avatar-….png
 *   user/admin/uab-innocenz-admin-91e1a150/profile/avatar-….png
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
 * `pr/vicky-93ea08b0` — TWO segments, so the bucket has one folder per role
 * and `user/pr/` contains only PRs.
 */
export function composeUserFolder(
  userId: string,
  username: string | null | undefined,
  role: UserRoleLabel | null | undefined,
): string {
  const roleDir = slugifyUsername(role) || 'pr';
  const name = slugifyUsername(username);
  return `${roleDir}/${name ? `${name}-${idPart(userId)}` : idPart(userId)}`;
}

/** Call after creating or renaming a user so the next key uses the new name. */
export function rememberUserFolder(
  userId: string,
  username: string | null | undefined,
  role: UserRoleLabel | null | undefined,
): void {
  cache.set(userId, composeUserFolder(userId, username, role));
}

/**
 * The folder for this user. Falls back to the FULL uuid on a cache miss —
 * still a valid, owned key, just not a pretty one.
 */
export function userFolder(userId: string): string {
  return cache.get(userId) ?? userId;
}

/** `user/pr-vicky-93ea08b0/` — the prefix every key for this user starts with. */
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
  // Legacy shape puts the owner in segment 1 (`user/<full-uuid>/…`); the
  // role-foldered shape puts it in segment 2 (`user/pr/<slug>-<id8>/…`).
  for (const segment of parts.slice(0, 2)) {
    if (segment === userId || segment === id || segment.endsWith(`-${id}`)) return true;
  }
  return false;
}

/** id + username + portal code, with 'pr' standing in for "no role row". */
const FOLDER_SOURCE_SQL = sql`
  select u.id,
         u.username,
         coalesce(min(po.code), 'pr') as role
    from main."user" u
    left join main.user_role ur on ur.user_id = u.id
    left join main.role r on r.id = ur.role_id
    left join main.portal po on po.id = r.portal_id
   group by u.id, u.username`;

type FolderRow = { id: string; username: string | null; role: string | null };

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
    for (const r of rows) rememberUserFolder(r.id, r.username, r.role);
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
    if (row) rememberUserFolder(row.id, row.username, row.role);
  } catch {
    // keep whatever is cached — a stale pretty name beats a thrown request
  }
}
