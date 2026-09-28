/**
 * ONE-TIME CLEAN-UP — the phone numbers the admin screen INVENTED
 * (Fix First, 28 Sep 2026).
 *
 * "Create admin" (apps/web/src/services/admin/admins.ts) sent
 * `phoneNum: '+admin-' + 12 hex characters`, because `/auth/register` demanded
 * a phone and the screen has no field for one. The value was stored as-is on
 * the admin's `user.phone_num`, and it was not harmless: the code sender
 * stripped the letters and read what was left — `+admin-0a12b3456c78` →
 * `0123456 78…` — as a real Malaysian mobile, so the admin's password-reset and
 * contact-change codes went by WhatsApp and SMS to whoever holds that line.
 *
 * Both causes are closed in code (the screen sends no phone; `toWhatsAppDigits`
 * refuses any value holding a letter). What is left is the rows already
 * written, which this sets to NULL — the honest value for "no phone on file".
 * `phone_num` is nullable and its unique index admits any number of NULLs.
 *
 * ⚠️ AFTER --apply those admins have no phone at all: every code reaches them
 * by email only, and they cannot sign in BY PHONE (they never could — no real
 * number was ever on file). They add a real one from their own Security
 * settings.
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/_clear-fake-admin-phones.ts          # dry run: counts only
 *   npx tsx --tsconfig tsconfig.json src/scripts/_clear-fake-admin-phones.ts --apply  # write
 *
 * Prints COUNTS only — never a phone number, an email, a name or an id.
 * Re-running is a no-op: a cleared row no longer matches.
 */
import './_probe-env';
import { sql } from 'drizzle-orm';
import { db } from '@/db';

const APPLY = process.argv.includes('--apply');
const ACTOR = 'clear-fake-admin-phones-2026-09-28';
/** The placeholder's fixed prefix. `+` and `-` are literal in LIKE. */
const PLACEHOLDER = '+admin-%';

type CountRow = { total: number; admins: number; not_admins: number };

function toRows<T>(r: unknown): T[] {
  if (Array.isArray(r)) return r as T[];
  return ((r as { rows?: unknown[] }).rows ?? []) as T[];
}

async function main() {
  const [counts] = toRows<CountRow>(
    await db.execute(sql`
      select count(*)::int as total,
             count(*) filter (where is_admin)::int as admins,
             count(*) filter (where not is_admin)::int as not_admins
        from (
          select exists (
                   select 1
                     from main.user_role ur
                     join main.role r on r.id = ur.role_id
                    where ur.user_id = u.id
                      and r.role_name = 'admin'
                 ) as is_admin
            from main."user" u
           where u.phone_num like ${PLACEHOLDER}
        ) placeholder_rows`),
  );

  console.log(`mode: ${APPLY ? 'APPLY' : 'dry run (pass --apply to write)'}`);
  console.log(`accounts whose phone is an invented '+admin-…' value: ${counts?.total ?? 0}`);
  console.log(`  holding the admin role:                             ${counts?.admins ?? 0}`);
  // Not expected. A non-admin carrying the placeholder would mean something
  // else wrote it — worth knowing before the value disappears.
  console.log(`  NOT holding the admin role:                         ${counts?.not_admins ?? 0}`);

  if (!APPLY) return;

  const result = await db.execute(sql`
    update main."user"
       set phone_num = null,
           updated_at = now(),
           updated_by = ${ACTOR}
     where phone_num like ${PLACEHOLDER}`);
  const written = (result as { rowCount?: number | null }).rowCount ?? 0;
  console.log(`rows cleared to NULL:                                ${written}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(String(e).slice(0, 500));
    process.exit(1);
  });
