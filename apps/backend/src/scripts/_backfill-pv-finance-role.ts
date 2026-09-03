/**
 * ONE-TIME BACKFILL — the capacity a signature was given in (0149).
 *
 * Vouchers signed before `finance_head_role` existed record WHO signed but not
 * AS WHAT, and the UI printed a hardcoded "Finance Head" beside the name — so
 * an owner's signature was labelled as the finance head's.
 *
 * The role is read through the account whose name is on the voucher. Rows whose
 * name matches no account, or whose account holds no role, are left NULL: the
 * document then says who signed without claiming a title, which is the honest
 * answer and the one the renderer is written for.
 */
import './_probe-env';
import { sql } from 'drizzle-orm';
import { db } from '@/db';

function toRows<T>(r: unknown): T[] {
  if (Array.isArray(r)) return r as T[];
  return ((r as { rows?: unknown[] }).rows ?? []) as T[];
}

async function main() {
  const updated = toRows<Record<string, unknown>>(
    await db.execute(sql`
      update main.payment_voucher pv
         set finance_head_role = signer.role_name,
             updated_at = now()
        from (
          select coalesce(nullif(trim(p.full_name), ''), nullif(trim(u.username), '')) as name,
                 r.role_name
            from main."user" u
            left join main.user_profile p on p.user_id = u.id
            join main.user_role ur on ur.user_id = u.id
            join main.role r on r.id = ur.role_id
        ) signer
       where pv.finance_head_name = signer.name
         and pv.finance_head_role is null
      returning pv.voucher_no, pv.finance_head_name, pv.finance_head_role`),
  );
  console.log('UPDATED:', JSON.stringify(updated, null, 1));
}

main().then(() => process.exit(0)).catch((e) => { console.error(String(e).slice(0,600)); process.exit(1); });
