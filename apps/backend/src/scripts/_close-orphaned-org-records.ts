/**
 * ONE-TIME CLEAN-UP — requests and subscriptions that name an organisation which
 * no longer exists (22 Oct 2026).
 *
 * The admin dashboard read "2 need attention", one of them "Finish quote: Bear
 * Lounge", for an outlet found in neither `outlet` nor `agency`.
 * `admin_request.subscriber_id` and `member_subscription.subscriber_id` carry no
 * foreign key (each points into one of two tables), so nothing in the schema
 * closes a row when its organisation goes.
 *
 * ⚠️ WHAT THE ROWS SAID (probe `_probe-orphaned-org-records.ts`, 22 Oct): the
 * Bear Lounge row was NOT left behind by a deleted venue. Its org id was minted
 * by `randomUUID()` in `seed-sample-activity.ts` and never named any outlet; no
 * audit row mentions it. The 29 Sep "DELETE outlet" audit entry is a DELETE on
 * a sub-path of a venue that still exists. There is no outlet or agency delete
 * route in the API at all. The same seed rows are category [1] of
 * `cleanup-test-data-29sep.ts`, which DELETES them; this script closes them
 * instead, and either may run first — each is a no-op on what the other did.
 *
 * What it does, per row whose organisation is gone:
 *   - admin_request still awaiting an answer (pending / contacted) → 'declined',
 *     with a system note appended to `remarks` (an admin's own text is kept);
 *   - member_subscription still live (active / past_due) → 'cancelled',
 *     `ended_at` stamped (kept if one was already set);
 *   - everything already answered / cancelled / expired → untouched (history).
 * Invoices on those subscriptions are COUNTED, never touched — whether one is
 * owed is a billing decision, not a script's.
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/_close-orphaned-org-records.ts          # dry run
 *   npx tsx --tsconfig tsconfig.json src/scripts/_close-orphaned-org-records.ts --apply  # write
 *
 * The dry run is one `begin read only` transaction. `--apply` runs ONE
 * transaction: it re-selects, writes with "still open AND org still gone"
 * re-asserted in every WHERE, and rolls back unless each write touched exactly
 * its row. `updated_at` / `updated_by` are stamped. Re-running changes nothing:
 * a closed row no longer matches.
 *
 * Prints table, id, status, org type and id, and the org NAME the row carries —
 * never a contact name, phone or e-mail.
 */
import './_probe-env';
import { and, count, inArray, not, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  AWAITING_ANSWER,
  requestOrgStillExists,
} from '@/features/admin-request/admin-request.repository';
import { AdminRequestTable } from '@/features/admin-request/admin-request.model';
import type { DbTransaction } from '@/types/db-transaction';
import {
  appendRemark,
  type OrphanRow,
  orphanNote,
  planOrphans,
} from './_close-orphaned-org-records-rules';

const APPLY = process.argv.includes('--apply');
const ACTOR = 'close-orphaned-org-records-2026-10-22';

function toRows<T>(r: unknown): T[] {
  if (Array.isArray(r)) return r as T[];
  return ((r as { rows?: unknown[] }).rows ?? []) as T[];
}

/** The org a row names is in neither table its type points at. `x` = the row's alias. */
const ORG_GONE = sql`(
  (x.subscriber_type::text = 'outlet' and not exists (select 1 from main.outlet o where o.id = x.subscriber_id))
  or (x.subscriber_type::text = 'agency' and not exists (select 1 from main.agency a where a.id = x.subscriber_id)))`;

type Found = OrphanRow & {
  name: string;
  remarks: string | null;
  ended: boolean;
};

async function findOrphans(tx: DbTransaction, lock: boolean): Promise<Found[]> {
  const forUpdate = lock ? sql`for update of x` : sql``;
  const requests = toRows<Found>(
    await tx.execute(sql`
      select 'admin_request' as "table", x.id, x.status::text as status,
             x.subscriber_type::text as "orgType", x.subscriber_id::text as "orgId",
             x.subscriber_name as name, x.remarks, false as ended
        from main.admin_request x
       where x.subscriber_id is not null and ${ORG_GONE}
       order by x.created_at, x.id ${forUpdate}`),
  );
  const subscriptions = toRows<Found>(
    await tx.execute(sql`
      select 'member_subscription' as "table", x.id, x.status::text as status,
             x.subscriber_type::text as "orgType", x.subscriber_id::text as "orgId",
             x.subscriber_name as name, null as remarks, x.ended_at is not null as ended
        from main.member_subscription x
       where ${ORG_GONE}
       order by x.started_at, x.id ${forUpdate}`),
  );
  return [...requests, ...subscriptions];
}

async function main() {
  const today = new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
  const note = orphanNote(today);

  await db.transaction(async (tx) => {
    if (!APPLY) {
      await tx.execute(sql`set transaction read only`);
      const [ro] = toRows<{ ro: string }>(
        await tx.execute(
          sql`select current_setting('transaction_read_only') as ro`,
        ),
      );
      if (ro?.ro !== 'on')
        throw new Error('dry run is not read-only — refusing to continue');
    }

    const rows = await findOrphans(tx, APPLY);
    const plan = planOrphans(rows);
    const byId = new Map(rows.map((row) => [row.id, row]));

    // The instrument check: the SAME clause the admin queues now apply
    // (`requestOrgStillExists`), asked through the query builder. It must find
    // exactly the open requests the raw SQL above calls orphaned, or one of the
    // two is wrong and nothing below should be trusted.
    const [hidden] = await tx
      .select({ n: count() })
      .from(AdminRequestTable)
      .where(
        and(
          inArray(AdminRequestTable.status, AWAITING_ANSWER),
          not(requestOrgStillExists()),
        ),
      );
    if ((hidden?.n ?? 0) !== plan.decline.length) {
      throw new Error(
        `instrument mismatch: queue clause hides ${hidden?.n ?? 0} open request(s), raw scan found ${plan.decline.length}`,
      );
    }

    const [invoices] = toRows<{ total: number; unpaid: number }>(
      await tx.execute(sql`
        select count(*)::int as total, count(*) filter (where i.status = 'unpaid')::int as unpaid
          from main.subscription_invoice i
          join main.member_subscription x on x.id = i.member_subscription_id
         where ${ORG_GONE}`),
    );

    console.log(`mode: ${APPLY ? 'APPLY' : 'dry run (pass --apply to write)'}`);
    console.log(
      `rows naming an organisation that does not exist: ${rows.length}`,
    );
    for (const row of rows) {
      const action = plan.decline.includes(row)
        ? "→ 'declined' + system note"
        : plan.cancel.includes(row)
          ? "→ 'cancelled', ended_at stamped"
          : '— left as is (already answered / ended)';
      console.log(
        `  ${row.table.padEnd(19)} ${row.id}  ${row.status.padEnd(9)} ${row.orgType} ${row.orgId}  "${row.name}"  ${action}`,
      );
    }
    console.log(`open requests to decline:             ${plan.decline.length}`);
    console.log(`live subscriptions to cancel:         ${plan.cancel.length}`);
    console.log(`rows left untouched (history):        ${plan.leave.length}`);
    console.log(
      `invoices on those subscriptions:      ${invoices?.total ?? 0} (unpaid ${invoices?.unpaid ?? 0}) — not touched here`,
    );
    console.log(
      `open requests the admin queues no longer count (same clause): ${hidden?.n ?? 0}`,
    );
    console.log(`system note: ${note}`);

    if (!APPLY) return;

    let written = 0;
    for (const row of plan.decline) {
      const remarks = appendRemark(byId.get(row.id)?.remarks ?? null, note);
      const result = await tx.execute(sql`
        update main.admin_request x
           set status = 'declined', remarks = ${remarks}, updated_at = now(), updated_by = ${ACTOR}
         where x.id = ${row.id} and x.status in ('pending', 'contacted') and ${ORG_GONE}`);
      const n = Number((result as { rowCount?: number | null }).rowCount ?? 0);
      if (n !== 1)
        throw new Error(
          `admin_request ${row.id}: expected 1 row, wrote ${n} — rolled back`,
        );
      written += n;
    }
    for (const row of plan.cancel) {
      const result = await tx.execute(sql`
        update main.member_subscription x
           set status = 'cancelled', ended_at = coalesce(x.ended_at, now()), updated_at = now(), updated_by = ${ACTOR}
         where x.id = ${row.id} and x.status in ('active', 'past_due') and ${ORG_GONE}`);
      const n = Number((result as { rowCount?: number | null }).rowCount ?? 0);
      if (n !== 1)
        throw new Error(
          `member_subscription ${row.id}: expected 1 row, wrote ${n} — rolled back`,
        );
      written += n;
    }
    console.log(`rows written: ${written}`);
  });
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(String(e instanceof Error ? e.message : e).slice(0, 500));
    process.exit(1);
  });
