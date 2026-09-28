/**
 * ONE-TIME CLEAN-UP — credentials written into `audit_logs` before the
 * redaction list covered them (28 Sep 2026).
 *
 * The live table held raw MFA secrets (`secret`, `otpauthUrl`) on 4 rows, old
 * access/refresh tokens on 3,133 rows, and one typed `confirmPassword` in
 * plaintext. `redactSensitive` now masks all of them on every NEW write; this
 * applies the very same function to the rows already there, so the clean-up
 * and the live rule cannot disagree about what counts as a credential.
 *
 * Only the credential VALUES change, to '[REDACTED]'. The action, entity, actor,
 * time and every other field of each row stay exactly as recorded.
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/_redact-audit-secrets.ts          # dry run: counts only
 *   npx tsx --tsconfig tsconfig.json src/scripts/_redact-audit-secrets.ts --apply  # write
 *
 * Prints counts and key NAMES only — never a value. Re-running is a no-op: a
 * redacted value redacts to itself, so a second pass finds nothing to change.
 */
import './_probe-env';
import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { redactSensitive } from '@/features/audit-log/audit-log.repository';

const APPLY = process.argv.includes('--apply');
const BATCH = 500;
const ACTOR = 'redact-audit-secrets-2026-09-28';

type Row = { audit_log_id: number; old_data: unknown; new_data: unknown };

function toRows<T>(r: unknown): T[] {
  if (Array.isArray(r)) return r as T[];
  return ((r as { rows?: unknown[] }).rows ?? []) as T[];
}

/** Key names whose value differs between the two copies — names, not values. */
function changedKeys(before: unknown, after: unknown, out: Map<string, number>): void {
  if (before === after) return;
  if (typeof before !== 'object' || before === null || typeof after !== 'object' || after === null) return;
  for (const [key, value] of Object.entries(before as Record<string, unknown>)) {
    const next = (after as Record<string, unknown>)[key];
    if (next === '[REDACTED]' && value !== '[REDACTED]') {
      out.set(key, (out.get(key) ?? 0) + 1);
    } else {
      changedKeys(value, next, out);
    }
  }
}

async function main() {
  const keyCounts = new Map<string, number>();
  let scanned = 0;
  let toChange = 0;
  let written = 0;
  let lastId = 0;

  for (;;) {
    // Pre-filtered to rows whose JSON text contains a credential-shaped key;
    // `redactSensitive` makes the actual decision on each one.
    const rows = toRows<Row>(
      await db.execute(sql`
        select audit_log_id, old_data, new_data
          from main.audit_logs
         where audit_log_id > ${lastId}
           and (coalesce(old_data::text, '') || coalesce(new_data::text, ''))
               ~* '"[a-z_-]*(password|token|secret|otpauth_?ur[il]|mfa_?code|otp|code|verification_?id)"\\s*:'
         order by audit_log_id
         limit ${BATCH}`),
    );
    if (rows.length === 0) break;
    lastId = Number(rows[rows.length - 1].audit_log_id);
    scanned += rows.length;

    const updates: { id: number; oldData: unknown; newData: unknown }[] = [];
    for (const row of rows) {
      const oldData = redactSensitive(row.old_data);
      const newData = redactSensitive(row.new_data);
      const changed =
        JSON.stringify(oldData) !== JSON.stringify(row.old_data) ||
        JSON.stringify(newData) !== JSON.stringify(row.new_data);
      if (!changed) continue;
      changedKeys(row.old_data, oldData, keyCounts);
      changedKeys(row.new_data, newData, keyCounts);
      updates.push({ id: Number(row.audit_log_id), oldData, newData });
    }
    toChange += updates.length;

    if (APPLY && updates.length > 0) {
      await db.transaction(async (tx) => {
        for (const u of updates) {
          await tx.execute(sql`
            update main.audit_logs
               set old_data = ${u.oldData === null || u.oldData === undefined ? null : JSON.stringify(u.oldData)}::jsonb,
                   new_data = ${u.newData === null || u.newData === undefined ? null : JSON.stringify(u.newData)}::jsonb,
                   updated_at = now(),
                   updated_by = ${ACTOR}
             where audit_log_id = ${u.id}`);
        }
      });
      written += updates.length;
    }
  }

  console.log(`mode: ${APPLY ? 'APPLY' : 'dry run (pass --apply to write)'}`);
  console.log(`rows scanned (credential-shaped key present): ${scanned}`);
  console.log(`rows holding an unredacted credential:        ${toChange}`);
  if (APPLY) console.log(`rows rewritten:                               ${written}`);
  console.log('values masked, by key name:');
  for (const [key, count] of [...keyCounts].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${key.padEnd(24)} ${count}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(String(e).slice(0, 500));
    process.exit(1);
  });
