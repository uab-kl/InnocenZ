/**
 * ONE-TIME BACKFILL — the signer's NAME on vouchers signed before
 * `financeSignVoucher` learned to resolve it (3 Sep 2026).
 *
 * These rows hold the signer's UUID in `finance_head_name`, so the printed
 * voucher named its approver "96cb6034-…". The replacement is read through the
 * account that id points at, using the SAME precedence the export bundle uses
 * for the PR's name — profile full name, then username. Nothing is invented:
 * a row whose id resolves to no name is left exactly as it is.
 *
 * Guarded on the value LOOKING like a uuid, so a voucher already carrying a
 * real name is never touched.
 */
import './_probe-env';
import { sql } from 'drizzle-orm';
import { db } from '@/db';

function toRows<T>(r: unknown): T[] {
  if (Array.isArray(r)) return r as T[];
  return ((r as { rows?: unknown[] }).rows ?? []) as T[];
}

async function main() {
  const before = toRows<Record<string, unknown>>(
    await db.execute(sql`
      select voucher_no, finance_head_name from main.payment_voucher
       where finance_head_name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       order by voucher_no`),
  );
  console.log('UUID-NAMED VOUCHERS:', JSON.stringify(before));

  const updated = toRows<Record<string, unknown>>(
    await db.execute(sql`
      update main.payment_voucher pv
         set finance_head_name = resolved.name,
             updated_at = now()
        from (
          select u.id,
                 coalesce(nullif(trim(p.full_name), ''), nullif(trim(u.username), '')) as name
            from main."user" u
            left join main.user_profile p on p.user_id = u.id
        ) resolved
       where pv.finance_head_name = resolved.id::text
         and resolved.name is not null
      returning pv.voucher_no, pv.finance_head_name`),
  );
  console.log('UPDATED:', JSON.stringify(updated));

  const after = toRows<Record<string, unknown>>(
    await db.execute(sql`
      select voucher_no, finance_head_name from main.payment_voucher
       where voucher_no in ('PV-000009','PV-000010') order by voucher_no`),
  );
  console.log('AFTER:', JSON.stringify(after));
}

main().then(() => process.exit(0)).catch((e) => { console.error(String(e).slice(0,600)); process.exit(1); });
