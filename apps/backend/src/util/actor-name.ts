import { sql, type SQL } from 'drizzle-orm';
import { alias, type PgColumn } from 'drizzle-orm/pg-core';
import { UserTable } from '@/features/user/user.model';

/**
 * WHO SWITCHED THIS ROW OFF — read back as a NAME, from one place.
 *
 * The audit quartet (`created_by` / `updated_by` / `created_at` / `updated_at`)
 * has been on every one of these tables all along, and `updated_by` already
 * held the answer. What was missing was any way to READ it: the column stores
 * a user id, the admin archive screen wants a person, and nothing joined the
 * two. So the screen could say a membership ended and never say who ended it.
 *
 * ⚠️ THE NAME IS NEVER COPIED ONTO THE ROW. `updated_by` keeps the id and the
 * name is resolved through this join on every read, so renaming a person
 * corrects their name on every record they ever touched — the database rule
 * that one fact lives in one table, applied to the actor.
 *
 * ⚠️ THE CAST GOES UUID → TEXT, NEVER TEXT → UUID, and this is the whole
 * reason the rule is centralised rather than written out six times.
 * `updated_by` is `varchar`, not a uuid and not a foreign key, because
 * `getActor` writes the literal `'system'` for unauthenticated and
 * scheduler-driven writes. `updated_by::uuid` would therefore throw
 * `invalid input syntax for type uuid: "system"` and take out the whole
 * query — an admin list screen 500ing because one row was written by a cron
 * job. Casting the uuid side to text cannot fail: a non-uuid simply matches
 * nothing, and the LEFT JOIN leaves the name null, which is the honest answer.
 */
export const ActorUser = alias(UserTable, 'actor_user');

/**
 * The ON condition for the actor join. Pass the table's own `updatedBy`
 * column — e.g. `actorJoinOn(AgencyUserTable.updatedBy)`.
 *
 * A LEFT JOIN, always: a row whose `updated_by` is `'system'`, an empty
 * string, or an id whose account has since been hard-deleted must still
 * appear on the screen. An INNER JOIN here would silently drop exactly the
 * rows an archive exists to preserve.
 */
export function actorJoinOn(updatedByColumn: PgColumn): SQL {
  return sql`${ActorUser.id}::text = ${updatedByColumn}`;
}

/**
 * The selectable name. Null when the actor is `'system'`, unknown, or a
 * deleted account — callers render their own fallback rather than being
 * handed an invented one.
 */
export const actorNameColumn = ActorUser.username;
