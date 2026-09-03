/**
 * ONE-TIME BACKFILL — the voucher date on the two vouchers raised before
 * `getOrCreateCurrentWeekDraft` learned to stamp one (3 Sep 2026).
 *
 * The date used is the voucher's OWN `created_at`, read in Kuala Lumpur time:
 * the day it was actually raised, which is exactly what `klToday()` would have
 * written had the fix existed then. Nothing is invented and nothing is guessed.
 *
 * Guarded on `issued_date IS NULL`, so re-running cannot re-date a voucher that
 * already carries one — the same shape as the `paid_at` stamp.
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
      select voucher_no, issued_date,
             (created_at at time zone 'Asia/Kuala_Lumpur')::date::text as would_be
        from main.payment_voucher
       where voucher_no in ('PV-000009','PV-000010') order by voucher_no`),
  );
  console.log('BEFORE:', JSON.stringify(before));

  const updated = toRows<Record<string, unknown>>(
    await db.execute(sql`
      update main.payment_voucher
         set issued_date = (created_at at time zone 'Asia/Kuala_Lumpur')::date,
             updated_at  = now()
       where voucher_no in ('PV-000009','PV-000010')
         and issued_date is null
      returning voucher_no, issued_date`),
  );
  console.log('UPDATED:', JSON.stringify(updated));

  const after = toRows<Record<string, unknown>>(
    await db.execute(sql`
      select voucher_no, issued_date from main.payment_voucher
       where voucher_no in ('PV-000009','PV-000010') order by voucher_no`),
  );
  console.log('AFTER:', JSON.stringify(after));
}

main().then(() => process.exit(0)).catch((e) => { console.error(String(e).slice(0,500)); process.exit(1); });
