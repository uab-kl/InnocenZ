/**
 * ONE-TIME CLEAN-UP — the test data the 28–29 Sep audit left on innocenz-test.
 *
 * Owner, 29 Sep 2026: "do the live checks, then continue with the rest except
 * the receipt one…". The clean-up is the OWNER's to run — Claude may not write
 * to the shared database (docs/claude-memory/shared-db-writes-need-the-user.md) —
 * so this is a dry run unless told otherwise:
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/cleanup-test-data-29sep.ts                      # dry run
 *   npx tsx --tsconfig tsconfig.json src/scripts/cleanup-test-data-29sep.ts --apply --i-know-this-is-a-test-db              # default set
 *   npx tsx --tsconfig tsconfig.json src/scripts/cleanup-test-data-29sep.ts --apply --i-know-this-is-a-test-db --only=5,9   # just those
 *   npx tsx --tsconfig tsconfig.json src/scripts/cleanup-test-data-29sep.ts --help
 *
 * EVERY CATEGORY WAS RE-DERIVED FROM THE ROWS (audit entries are leads): each
 * prints whether its lead held, and a lead that no longer holds is a no-op.
 *
 * The dry run is ONE `begin read only` transaction, asserted before the first
 * read. `--apply` runs each category in its OWN transaction: it re-selects its
 * rows inside that transaction, writes with the selection's own conditions
 * re-asserted in every WHERE, re-selects again, and ROLLS BACK unless the write
 * count matches and nothing is left. Each changed row gets one `audit_logs` row
 * (one batch_id per category, user_agent = this script) — an UPDATE records the
 * changed columns, a DELETE the whole row, so a delete can be restored with
 * `jsonb_populate_record(null::main.<table>, old_data)`. Invoices ([3]/[3b]) are
 * VOIDED since 0169, never deleted (owner, 29 Sep 2026: "Add Void"). `--apply`
 * refuses to run against a database whose name has no `test` token.
 *
 * Prints ids, voucher / receipt / invoice numbers, dates, statuses and amounts
 * only — never a name, IC, phone or e-mail.
 */
import './_probe-env';
import { randomUUID } from 'node:crypto';
import { type SQL, sql } from 'drizzle-orm';
import { paymentDueDate, klToday } from '@/features/payment-voucher/payment-voucher-week';
import { REPEAT_WINDOW_MS } from '@/features/notification/repeat-delivery';
import type { DbTransaction } from '@/types/db-transaction';
import { voidNote } from '@/features/subscription-invoice/invoice-void';
import {
  applyRefusal,
  type CategoryRef,
  chooseShiftToKeep,
  GAP_INVOICE_VOID_REASON,
  groupRepeatNotices,
  isBeforeLaneCalendar,
  isFictionalSeedAnchor,
  laneCalendarStart,
  type LaneRow,
  type NoticeRow,
  parseCleanupArgs,
  preCalendarInvoiceAction,
  raceRewrite,
  resolveCategoryKeys,
  safeActor,
  SEED_ACTOR,
  SEED_INVOICE_VOID_REASON,
} from './cleanup-test-data-29sep-rules';

const ACTOR = 'cleanup-test-data-29sep';
const AUDIT_IP = 'local-script';
const KL = sql.raw(`'Asia/Kuala_Lumpur'`);
/** The duplicate 17 Aug shift pair named by the audit. */
const DUPLICATE_SHIFTS = ['2ed03fd8-069a-448f-bde8-5f3ef0723d71', 'a91c04f4-6acf-4ce4-8b3f-01c93dc6a197'] as const;
/** Children of `shift` that describe the POST (cascade harmlessly), not work done on it. */
const SHIFT_CONFIG_CHILDREN = new Set(['main.shift_agency', 'main.shift_pay_tier', 'main.shift_pr_request', 'main.shift_drink_menu']);
/** `LEAVE_APPROVED_BLOCK_REASON` in shift-assignment.controller.ts (not exported). */
const LEAVE_BLOCK_REASON = 'MC / leave approved';
const TEST_MORNING = '2026-09-28';

type Ctx = { tx: DbTransaction; today: string; keepShift: string | null; apply: boolean };
type AuditEntry = { action: 'UPDATE' | 'DELETE'; entity: string; entityId: string; oldData: unknown; newData?: unknown };
type AuditWriter = (entry: AuditEntry) => Promise<void>;
type Plan = { count: number; lines: string[]; write?: (audit: AuditWriter) => Promise<number> };
type Category = CategoryRef & { title: string; applyText: string; reportOnly?: boolean; plan: (ctx: Ctx) => Promise<Plan> };

function toRows<T>(r: unknown): T[] {
  if (Array.isArray(r)) return r as T[];
  return ((r as { rows?: unknown[] }).rows ?? []) as T[];
}
async function query<T>(ctx: Ctx, statement: SQL): Promise<T[]> {
  return toRows<T>(await ctx.tx.execute(statement));
}
const uuidList = (ids: readonly string[]) => sql`array[${sql.join(ids.map((id) => sql`${id}`), sql`, `)}]::uuid[]`;
/**
 * A timestamptz as epoch milliseconds. Drizzle's node-postgres session hands
 * raw `execute` results back with timestamps as unparsed STRINGS, so every
 * instant this script compares is fetched through here and rebuilt with `asDate`.
 */
const epochMs = (column: SQL) => sql`(extract(epoch from ${column}) * 1000)::float8`;
const asDate = (ms: number | string | null): Date | null => (ms === null ? null : new Date(Number(ms)));
const lead = (expected: string, found: string) => `lead: ${expected} · found: ${found}`;
/** One write that must touch exactly one row, or the category rolls back. */
function exactlyOne<T>(rows: T[], what: string): T {
  if (rows.length !== 1) throw new Error(`${what}: expected 1 row, wrote ${rows.length}`);
  return rows[0] as T;
}

// ─── [1] "[Demo]" admin requests for organisations that do not exist ────────

type DemoRequest = { id: string; type: string; status: string; subscriber_type: string; subscriber_id: string; created_day: string };
const DEMO_REQUEST_WHERE = sql`
  r.created_by = ${SEED_ACTOR} and r.message like '[Demo]%' and r.subscriber_id is not null
  and not exists (select 1 from main.outlet o where o.id = r.subscriber_id)
  and not exists (select 1 from main.agency a where a.id = r.subscriber_id)
  and not exists (select 1 from main.member_subscription m where m.admin_request_id = r.id)`;

async function planDemoRequests(ctx: Ctx): Promise<Plan> {
  const rows = await query<DemoRequest>(ctx, sql`
    select r.id, r.type::text as type, r.status::text as status, r.subscriber_type::text as subscriber_type,
           r.subscriber_id, to_char(r.created_at at time zone ${KL}, 'YYYY-MM-DD') as created_day
      from main.admin_request r where ${DEMO_REQUEST_WHERE} order by r.created_at, r.id`);
  const [real] = await query<{ n: number }>(ctx, sql`
    select count(*)::int as n from main.admin_request r where r.message like '[Demo]%'
       and (exists (select 1 from main.outlet o where o.id = r.subscriber_id) or exists (select 1 from main.agency a where a.id = r.subscriber_id))`);
  return {
    count: rows.length,
    lines: [
      lead('8 rows', `${rows.length}`),
      ...rows.map((r) => `${r.id}  ${r.type.padEnd(22)} ${r.status.padEnd(9)} ${r.subscriber_type} ${r.subscriber_id} (no such org)  created ${r.created_day}`),
      `left: ${real?.n ?? 0} "[Demo]" row(s) whose organisation exists`,
    ],
    write: async (audit) => {
      for (const r of rows) {
        const gone = await query<{ row: unknown }>(ctx, sql`
          delete from main.admin_request r where r.id = ${r.id} and ${DEMO_REQUEST_WHERE} returning to_jsonb(r.*) as row`);
        await audit({ action: 'DELETE', entity: 'admin-request', entityId: r.id, oldData: exactlyOne(gone, r.id).row });
      }
      return rows.length;
    },
  };
}

// ─── [2] Seeded ledger rows whose billing anchor predates their org ─────────

type SeedRow = {
  id: string; subscriber_type: string; subscriber_id: string; status: string; open: boolean; created_by: string;
  anchor_ms: number | null; org_created_ms: number | null; anchor_day: string | null; org_day: string | null;
  invoices: number; real_rows: number;
};

const isFictional = (r: { created_by: string; anchor_ms: number | null; org_created_ms: number | null }) =>
  isFictionalSeedAnchor({ createdBy: r.created_by, billingStartsAt: asDate(r.anchor_ms), orgCreatedAt: asDate(r.org_created_ms) });

async function seedLedgerRows(ctx: Ctx): Promise<SeedRow[]> {
  return query<SeedRow>(ctx, sql`
    select m.id, m.subscriber_type::text as subscriber_type, m.subscriber_id, m.status::text as status,
           m.ended_at is null as open, m.created_by, ${epochMs(sql`m.billing_starts_at`)} as anchor_ms,
           ${epochMs(sql`coalesce(o.created_at, a.created_at)`)} as org_created_ms,
           to_char(m.billing_starts_at at time zone ${KL}, 'YYYY-MM-DD') as anchor_day,
           to_char(coalesce(o.created_at, a.created_at) at time zone ${KL}, 'YYYY-MM-DD') as org_day,
           (select count(*)::int from main.subscription_invoice i where i.member_subscription_id = m.id) as invoices,
           (select count(*)::int from main.member_subscription x where x.subscriber_type = m.subscriber_type
              and x.subscriber_id = m.subscriber_id and x.created_by <> ${SEED_ACTOR}) as real_rows
      from main.member_subscription m
      left join main.outlet o on m.subscriber_type = 'outlet' and o.id = m.subscriber_id
      left join main.agency a on m.subscriber_type = 'agency' and a.id = m.subscriber_id
     where m.created_by = ${SEED_ACTOR} and coalesce(o.id, a.id) is not null
     order by m.subscriber_id, m.started_at`);
}

async function planSeedAnchors(ctx: Ctx): Promise<Plan> {
  const all = await seedLedgerRows(ctx);
  const rows = all.filter(isFictional);
  const lines = [lead('4 seed-sample rows relinked to real orgs', `${all.length} relinked · ${rows.length} still anchored before their org existed`)];
  for (const r of rows) {
    lines.push(`${r.id}  ${r.subscriber_type} ${r.subscriber_id}  ${r.status}${r.open ? ' (open)' : ''}  anchor ${r.anchor_day} → NULL  (org created ${r.org_day})  ${r.invoices} invoice(s)`);
    if (r.open && r.real_rows === 0) {
      lines.push(`   ⚠ this is the org's ONLY plan row: its lane is then invoiced by nothing until an admin sets the real start (PUT /member-subscription/${r.id} {billingStartsAt}) — the 03:00 invoice job names it every morning`);
    }
  }
  return {
    count: rows.length,
    lines,
    write: async (audit) => {
      for (const r of rows) {
        // The selection's own condition, re-asserted — not an exact timestamp
        // match, which a microsecond the JS Date cannot hold would defeat.
        const done = await query<{ id: string }>(ctx, sql`
          update main.member_subscription m set billing_starts_at = null, updated_at = now(), updated_by = ${ACTOR}
           where m.id = ${r.id} and m.created_by = ${SEED_ACTOR} and m.billing_starts_at is not null
             and m.billing_starts_at < coalesce(
                   (select o.created_at from main.outlet o where m.subscriber_type = 'outlet' and o.id = m.subscriber_id),
                   (select a.created_at from main.agency a where m.subscriber_type = 'agency' and a.id = m.subscriber_id))
          returning m.id`);
        exactlyOne(done, r.id);
        await audit({
          action: 'UPDATE', entity: 'member-subscription', entityId: r.id,
          oldData: { id: r.id, billingStartsAt: asDate(r.anchor_ms) }, newData: { id: r.id, billingStartsAt: null },
        });
      }
      return rows.length;
    },
  };
}

// ─── [3] / [3b] Invoices only the seeded anchors created ────────────────────

type LaneSource = {
  id: string; subscriber_type: string; subscriber_id: string; subscription_id: string | null; kind: string; created_by: string;
  started_ms: number; ended_ms: number | null; anchor_ms: number | null; billing_cycle: string; org_created_ms: number | null;
};
type InvoiceRow = {
  id: string; invoice_no: string; member_subscription_id: string; period_start: string; period_end: string;
  amount: string; status: string; payments: number; credit_refs: number; note: string | null;
};
type Lane = { key: string; rows: LaneSource[]; firstPeriodStart: string | null; stillFictional: boolean };

async function seededLanes(ctx: Ctx): Promise<Lane[]> {
  const rows = await query<LaneSource>(ctx, sql`
    with seed_orgs as (
      select distinct m.subscriber_type, m.subscriber_id from main.member_subscription m
       where m.created_by = ${SEED_ACTOR}
         and (exists (select 1 from main.outlet o where m.subscriber_type = 'outlet' and o.id = m.subscriber_id)
           or exists (select 1 from main.agency a where m.subscriber_type = 'agency' and a.id = m.subscriber_id)))
    select m.id, m.subscriber_type::text as subscriber_type, m.subscriber_id, m.subscription_id,
           coalesce(s.kind::text, 'plan') as kind, m.created_by, ${epochMs(sql`m.started_at`)} as started_ms,
           ${epochMs(sql`m.ended_at`)} as ended_ms, ${epochMs(sql`m.billing_starts_at`)} as anchor_ms,
           m.billing_cycle::text as billing_cycle, ${epochMs(sql`coalesce(o.created_at, a.created_at)`)} as org_created_ms
      from main.member_subscription m
      join seed_orgs so on so.subscriber_type = m.subscriber_type and so.subscriber_id = m.subscriber_id
      left join main.subscription s on s.id = m.subscription_id
      left join main.outlet o on m.subscriber_type = 'outlet' and o.id = m.subscriber_id
      left join main.agency a on m.subscriber_type = 'agency' and a.id = m.subscriber_id`);
  const byLane = new Map<string, LaneSource[]>();
  for (const row of rows) {
    // The invoice job's own lane key: the plan, or each add-on product apart.
    const key = [row.subscriber_type, row.subscriber_id, row.kind === 'addon' ? `addon:${row.subscription_id}` : 'plan'].join('|');
    byLane.set(key, [...(byLane.get(key) ?? []), row]);
  }
  const lanes: Lane[] = [];
  for (const [key, laneRows] of byLane) {
    if (!laneRows.some((r) => r.created_by === SEED_ACTOR)) continue;
    const calendar = laneCalendarStart(laneRows.map((r): LaneRow => ({
      startedAt: new Date(Number(r.started_ms)), endedAt: asDate(r.ended_ms), billingStartsAt: asDate(r.anchor_ms),
      billingCycle: r.billing_cycle, fictionalAnchor: isFictional(r),
    })));
    lanes.push({ key, rows: laneRows, firstPeriodStart: calendar.firstPeriodStart, stillFictional: laneRows.some(isFictional) });
  }
  return lanes.sort((a, b) => a.key.localeCompare(b.key));
}

async function planPreCalendarInvoices(ctx: Ctx, onSeedRows: boolean): Promise<Plan> {
  const lanes = await seededLanes(ctx);
  const lines: string[] = [];
  const items: InvoiceRow[] = [];
  for (const lane of lanes) {
    const ids = lane.rows.map((r) => r.id);
    const seedIds = new Set(lane.rows.filter((r) => r.created_by === SEED_ACTOR).map((r) => r.id));
    const invoices = await query<InvoiceRow>(ctx, sql`
      select i.id, i.invoice_no, i.member_subscription_id, i.period_start::text as period_start, i.period_end::text as period_end,
             i.amount::text as amount, i.status::text as status, i.note,
             (select count(*)::int from main.subscription_payment p where p.subscription_invoice_id = i.id) as payments,
             (select count(*)::int from main.subscription_credit c where c.source_invoice_id = i.id or c.applied_to_invoice_id = i.id) as credit_refs
        from main.subscription_invoice i where i.member_subscription_id = any(${uuidList(ids)}) order by i.period_start, i.invoice_no`);
    const mine = invoices.filter((i) => isBeforeLaneCalendar(i.period_start, lane.firstPeriodStart) && seedIds.has(i.member_subscription_id) === onSeedRows);
    if (mine.length === 0) continue;
    const [type, orgId] = lane.key.split('|');
    lines.push(`lane ${type} ${orgId} · calendar once the seed anchor is withdrawn starts ${lane.firstPeriodStart ?? 'nowhere (no real anchor — never invoiced)'}`);
    if (ctx.apply && lane.stillFictional) {
      lines.push('   REFUSED: the seed anchor still stands on this lane (run seed-anchors first) — the 03:00 invoice job would re-mint every one of these');
      continue;
    }
    for (const i of mine) {
      const action = preCalendarInvoiceAction({ status: i.status, payments: i.payments, creditRefs: i.credit_refs });
      const tail =
        action === 'leave'
          ? '  → LEFT (paid, or a payment/credit points at it)'
          : action === 'already-void'
            ? '  → already void (done)'
            : '';
      lines.push(`   ${i.invoice_no}  ${i.period_start}..${i.period_end}  RM ${i.amount.padStart(8)}  ${i.status}  row ${i.member_subscription_id}${tail}`);
      if (action === 'void') items.push(i);
    }
  }
  if (!ctx.apply && lanes.some((l) => l.stillFictional) && items.length > 0) {
    lines.push('prerequisite: seed-anchors runs first in the same --apply; applied without it, this category refuses');
  }
  const reason = onSeedRows ? SEED_INVOICE_VOID_REASON : GAP_INVOICE_VOID_REASON;
  return {
    count: items.length,
    lines: [onSeedRows ? lead('16 unpaid invoices', `${items.length} on the seed-sample rows`) : 'beyond the lead: same cause, on the org\'s own row', ...lines],
    /*
     * VOIDED, NOT DELETED (owner, 29 Sep 2026: "Add Void"; migration 0169). The
     * row stays — so what was once charged stays on record and the period's slot
     * stays taken, which a delete gave back to the nightly job — with its status
     * `void` and "Voided: <reason>" after whatever its note said. Every guard of
     * the delete is kept: the same conditions re-asserted in the WHERE, exactly
     * one row per write, one audit row each (an UPDATE, old → new).
     */
    write: async (audit) => {
      for (const i of items) {
        const note = voidNote(i.note, reason);
        const changed = await query<{ id: string }>(ctx, sql`
          update main.subscription_invoice i
             set status = 'void', note = ${note}, updated_at = now(), updated_by = ${ACTOR}
           where i.id = ${i.id} and i.status = 'unpaid'
             and not exists (select 1 from main.subscription_payment p where p.subscription_invoice_id = i.id)
             and not exists (select 1 from main.subscription_credit c where c.source_invoice_id = i.id or c.applied_to_invoice_id = i.id)
          returning i.id`);
        exactlyOne(changed, i.invoice_no);
        await audit({
          action: 'UPDATE', entity: 'subscription-invoice', entityId: i.id,
          oldData: { id: i.id, invoiceNo: i.invoice_no, status: i.status, note: i.note },
          newData: { id: i.id, invoiceNo: i.invoice_no, status: 'void', note },
        });
      }
      return items.length;
    },
  };
}

// ─── [4] The duplicate 17 Aug shift ─────────────────────────────────────────

type ShiftRow = { id: string; outlet_id: string; agency_id: string; shift_date: string; slot: string | null; status: string; quantity: number; created_ms: number; posted: string; created_by: string };
type ShiftChild = { child: string; col: string };

async function shiftChildren(ctx: Ctx): Promise<ShiftChild[]> {
  const rows = await query<ShiftChild>(ctx, sql`
    select distinct c.conrelid::regclass::text as child, a.attname as col
      from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
     where c.contype = 'f' and c.confrelid = 'main.shift'::regclass order by 1, 2`);
  // Names come from the catalogue, but are still checked before sql.raw.
  return rows.filter((r) => /^main\.[a-z_]+$/.test(r.child) && /^[a-z_]+$/.test(r.col));
}

async function childCounts(ctx: Ctx, children: ShiftChild[], shiftId: string) {
  const counts: Record<string, number> = {};
  for (const { child, col } of children) {
    const [row] = await query<{ n: number }>(ctx, sql`select count(*)::int as n from ${sql.raw(child)} where ${sql.raw(col)} = ${shiftId}`);
    counts[`${child}.${col}`] = row?.n ?? 0;
  }
  const substantive = Object.entries(counts).filter(([k]) => !SHIFT_CONFIG_CHILDREN.has(k.slice(0, k.lastIndexOf('.')))).reduce((s, [, n]) => s + n, 0);
  return { counts, substantive };
}

async function planDuplicateShift(ctx: Ctx): Promise<Plan> {
  const shifts = await query<ShiftRow>(ctx, sql`
    select s.id, s.outlet_id, s.agency_id, s.shift_date::text as shift_date, s.slot, s.status::text as status, s.quantity,
           ${epochMs(sql`s.created_at`)} as created_ms, to_char(s.created_at at time zone ${KL}, 'YYYY-MM-DD HH24:MI:SS') as posted, s.created_by
      from main.shift s where s.id = any(${uuidList(DUPLICATE_SHIFTS)}) order by s.created_at`);
  const [a, b] = shifts;
  if (!a || !b) return { count: 0, lines: [lead('a duplicate pair 2ed03fd8/a91c04f4', `${shifts.length} of the 2 exist — already clean, nothing to do`)] };
  const duplicate = a.outlet_id === b.outlet_id && a.agency_id === b.agency_id && a.shift_date === b.shift_date
    && (a.slot ?? '') === (b.slot ?? '') && Math.abs(Number(a.created_ms) - Number(b.created_ms)) <= 10 * 60_000;
  if (!duplicate) return { count: 0, lines: ['lead no longer holds: the two shifts differ in venue, agency, date or slot — nothing to do'] };
  const children = await shiftChildren(ctx);
  const tally = { [a.id]: await childCounts(ctx, children, a.id), [b.id]: await childCounts(ctx, children, b.id) };
  const lines = [lead('duplicate pair — keep the one with assignments/money', 'duplicate confirmed')];
  for (const s of [a, b]) {
    const t = tally[s.id];
    const nonZero = Object.entries(t?.counts ?? {}).filter(([, n]) => n > 0).map(([k, n]) => `${k.replace('main.', '')}=${n}`).join(' ');
    lines.push(`${s.id}  ${s.shift_date} ${s.slot ?? ''}  ${s.status}  qty ${s.quantity}  posted ${s.posted} by ${safeActor(s.created_by)}  attached: ${nonZero || 'nothing'}`);
  }
  const choice = chooseShiftToKeep({ id: a.id, substantive: tally[a.id]?.substantive ?? 0 }, { id: b.id, substantive: tally[b.id]?.substantive ?? 0 }, ctx.keepShift);
  if (choice.kind !== 'keep') {
    lines.push(choice.kind === 'tie'
      ? `NO-OP: ${choice.reason}, so the rule cannot choose. Owner decides: pass --keep-shift=${a.id.slice(0, 8)} or --keep-shift=${b.id.slice(0, 8)} to delete the other (the later post is the venue's last word).`
      : `NO-OP: ${choice.reason}`);
    return { count: 0, lines };
  }
  lines.push(`keep ${choice.keep} (${choice.reason}) · DELETE ${choice.drop} — a delete is the house "withdraw" (shift has no void state); cascades only its ${[...SHIFT_CONFIG_CHILDREN].map((c) => c.replace('main.', '')).join('/')} rows; no one is notified`);
  return {
    count: 1,
    lines,
    write: async (audit) => {
      const rowsOf: Record<string, unknown[]> = {};
      for (const { child, col } of children.filter((c) => SHIFT_CONFIG_CHILDREN.has(c.child))) {
        rowsOf[child] = (await query<{ row: unknown }>(ctx, sql`select to_jsonb(t.*) as row from ${sql.raw(child)} t where ${sql.raw(col)} = ${choice.drop}`)).map((r) => r.row);
      }
      if ((await childCounts(ctx, children, choice.drop)).substantive > 0) throw new Error(`${choice.drop} gained attached work — refusing`);
      const gone = await query<{ row: unknown }>(ctx, sql`delete from main.shift s where s.id = ${choice.drop} returning to_jsonb(s.*) as row`);
      await audit({ action: 'DELETE', entity: 'shift', entityId: choice.drop, oldData: { shift: exactlyOne(gone, choice.drop).row, children: rowsOf } });
      return 1;
    },
  };
}

// ─── [5] Receipts the Sunday job verified on vouchers it then held ──────────

type HeldReceipt = { id: string; receipt_no: string; source: string; voucher_no: string | null; agency_id: string; verified_at: string };
const HELD_RECEIPT_WHERE = sql`r.status = 'verified' and r.updated_by = 'weekly-payout-job' and v.status = 'pending_review'`;

async function planHeldReceipts(ctx: Ctx): Promise<Plan> {
  const rows = await query<HeldReceipt>(ctx, sql`
    select r.id, r.receipt_no, r.source, v.voucher_no, v.agency_id, to_char(r.updated_at at time zone ${KL}, 'YYYY-MM-DD HH24:MI') as verified_at
      from main.payment_voucher_receipt r join main.payment_voucher v on v.id = r.voucher_id
     where ${HELD_RECEIPT_WHERE} order by r.receipt_no`);
  const [left] = await query<{ nos: string | null }>(ctx, sql`
    select string_agg(r.receipt_no || ' (' || v.status::text || ')', ', ' order by r.receipt_no) as nos
      from main.payment_voucher_receipt r join main.payment_voucher v on v.id = r.voucher_id
     where r.status = 'verified' and r.updated_by = 'weekly-payout-job' and v.status <> 'pending_review'`);
  return {
    count: rows.length,
    lines: [
      lead('5 receipts (RCP-000018, -20, -22, -23, -36)', rows.map((r) => r.receipt_no).join(', ') || 'none'),
      ...rows.map((r) => `${r.receipt_no}  ${r.source.padEnd(6)} on ${r.voucher_no ?? '(unnumbered)'} (agency ${r.agency_id}, still pending_review)  verified by the job ${r.verified_at} → approved`),
      `left: job-verified receipts on vouchers that DID leave review — verified is right: ${left?.nos ?? 'none'}`,
    ],
    write: async (audit) => {
      for (const r of rows) {
        exactlyOne(await query<{ id: string }>(ctx, sql`
          update main.payment_voucher_receipt r set status = 'approved', updated_at = now(), updated_by = ${ACTOR}
            from main.payment_voucher v where r.id = ${r.id} and v.id = r.voucher_id and ${HELD_RECEIPT_WHERE} returning r.id`), r.receipt_no);
        await audit({
          action: 'UPDATE', entity: 'payment-voucher-receipt', entityId: r.id,
          oldData: { id: r.id, receiptNo: r.receipt_no, status: 'verified', updatedBy: 'weekly-payout-job' },
          newData: { id: r.id, receiptNo: r.receipt_no, status: 'approved' },
        });
      }
      return rows.length;
    },
  };
}

// ─── [6] Voucher signer stored as an e-mail ─────────────────────────────────

type SignerRow = { id: string; voucher_no: string | null; agency_id: string; status: string; role: string | null; signed_at: string | null;
  old_name: string; signer_id: string | null; display_name: string | null; matches: number; member_of_agency: boolean };

async function planSignerEmail(ctx: Ctx): Promise<Plan> {
  const rows = await query<SignerRow>(ctx, sql`
    select v.id, v.voucher_no, v.agency_id, v.status::text as status, v.finance_head_role as role,
           to_char(v.finance_head_signed_at at time zone ${KL}, 'YYYY-MM-DD HH24:MI') as signed_at, v.finance_head_name as old_name,
           u.id as signer_id, coalesce(nullif(trim(p.full_name), ''), nullif(trim(u.username), '')) as display_name,
           (select count(*)::int from main."user" x where lower(x.email) = lower(trim(v.finance_head_name))) as matches,
           exists (select 1 from main.agency_user au where au.user_id = u.id and au.agency_id = v.agency_id) as member_of_agency
      from main.payment_voucher v
      left join main."user" u on lower(u.email) = lower(trim(v.finance_head_name))
      left join main.user_profile p on p.user_id = u.id
     where v.finance_head_name like '%@%' order by v.voucher_no, v.agency_id`);
  // The display name is read to be WRITTEN, never printed.
  const ok = rows.filter((r) => r.matches === 1 && r.signer_id && r.display_name && !r.display_name.includes('@') && r.member_of_agency);
  return {
    count: ok.length,
    lines: [
      lead('PV-000003 and PV-000004', ok.map((r) => r.voucher_no).join(', ') || 'none'),
      ...rows.map((r) => ok.includes(r)
        ? `${r.voucher_no} (agency ${r.agency_id}, ${r.status}, signed ${r.signed_at})  name: e-mail → display name of account ${r.signer_id} (profile name, else username — as financeSignVoucher resolves it); role stays ${r.role ?? 'NULL'}`
        : `${r.voucher_no} (agency ${r.agency_id})  LEFT: the e-mail resolves to ${r.matches} account(s) with a usable name at this agency`),
      'role left NULL on purpose: the capacity at signing (4–5 Aug) was never recorded, and the model forbids guessing it — the web then prints the agency name without a title',
      'note: a PDF archived in R2 before this keeps the e-mail until re-rendered (backfill-pv-pdfs.ts)',
    ],
    write: async (audit) => {
      for (const r of ok) {
        exactlyOne(await query<{ id: string }>(ctx, sql`
          update main.payment_voucher v set finance_head_name = ${r.display_name}, updated_at = now(), updated_by = ${ACTOR}
           where v.id = ${r.id} and v.finance_head_name = ${r.old_name} returning v.id`), String(r.voucher_no));
        await audit({
          action: 'UPDATE', entity: 'payment-voucher', entityId: r.id,
          oldData: { id: r.id, voucherNo: r.voucher_no, financeHeadName: r.old_name },
          newData: { id: r.id, voucherNo: r.voucher_no, financeHeadName: r.display_name },
        });
      }
      return ok.length;
    },
  };
}

// ─── [7] Legacy blank voucher due dates ─────────────────────────────────────

type DueRow = { id: string; voucher_no: string | null; agency_id: string; status: string; week_start: string | null; week_end: string | null; dow: number | null; plus7: string | null };

async function planDueDates(ctx: Ctx): Promise<Plan> {
  const rows = await query<DueRow>(ctx, sql`
    select v.id, v.voucher_no, v.agency_id, v.status::text as status, v.week_start::text as week_start, v.week_end::text as week_end,
           extract(dow from v.week_start)::int as dow, (v.week_end + 7)::text as plus7
      from main.payment_voucher v where v.due_date is null order by v.week_start, v.voucher_no`);
  // backfill-voucher-due-dates.ts writes week_end + 7 for Sun-anchored weeks;
  // paymentDueDate is the same rule the generator and the send path use. A row
  // where the two disagree is left for a person, never guessed.
  const due = (r: DueRow) => (r.week_end && r.dow === 0 ? paymentDueDate(r.week_end) : null);
  const ok = rows.filter((r) => due(r) !== null && due(r) === r.plus7);
  const [issued] = await query<{ nos: string | null }>(ctx, sql`
    select string_agg(coalesce(voucher_no, id::text) || ' (agency ' || left(agency_id::text, 8) || ')', ', ' order by voucher_no) as nos
      from main.payment_voucher where issued_date is null`);
  return {
    count: ok.length,
    lines: [
      lead('legacy blank due dates (backfill-voucher-due-dates.ts)', `${ok.length} to fill, ${rows.length - ok.length} skipped`),
      ...rows.map((r) => ok.includes(r)
        ? `${r.voucher_no} (agency ${r.agency_id}, ${r.status})  week ${r.week_start}..${r.week_end} → due ${due(r)}`
        : `${r.voucher_no} (agency ${r.agency_id})  SKIP: week_start is not a Sunday — re-anchor first (reanchor-voucher-weeks.ts)`),
      `left: issued dates have no source — still blank on ${issued?.nos ?? 'none'}`,
    ],
    write: async (audit) => {
      for (const r of ok) {
        exactlyOne(await query<{ id: string }>(ctx, sql`
          update main.payment_voucher v set due_date = ${due(r)}::date, updated_at = now(), updated_by = ${ACTOR}
           where v.id = ${r.id} and v.due_date is null and v.week_end = ${r.week_end}::date and extract(dow from v.week_start) = 0
          returning v.id`), String(r.voucher_no));
        await audit({ action: 'UPDATE', entity: 'payment-voucher', entityId: r.id,
          oldData: { id: r.id, voucherNo: r.voucher_no, dueDate: null }, newData: { id: r.id, voucherNo: r.voucher_no, dueDate: due(r) } });
      }
      return ok.length;
    },
  };
}

// ─── [8] Notices delivered twice ────────────────────────────────────────────

async function planDuplicateNotices(ctx: Ctx): Promise<Plan> {
  const windowSeconds = REPEAT_WINDOW_MS / 1000;
  const raw = await query<{ id: string; user_id: string; kind: string; title: string; body: string | null; payload: unknown; created_ms: number; read_ms: number | null }>(ctx, sql`
    select n.id, n.user_id, n.kind::text as kind, n.title, n.body, n.payload,
           ${epochMs(sql`n.created_at`)} as created_ms, ${epochMs(sql`n.read_at`)} as read_ms
      from main.notification n
     where exists (select 1 from main.notification m
                    where m.id <> n.id and m.user_id = n.user_id and m.kind = n.kind and m.title = n.title
                      and m.body is not distinct from n.body and m.payload is not distinct from n.payload
                      and abs(extract(epoch from (m.created_at - n.created_at))) <= ${windowSeconds})`);
  const rows: NoticeRow[] = raw.map((r) => ({
    id: r.id, userId: r.user_id, kind: r.kind, title: r.title, body: r.body, payload: r.payload,
    createdAt: new Date(Number(r.created_ms)), readAt: asDate(r.read_ms),
  }));
  const groups = groupRepeatNotices(rows, REPEAT_WINDOW_MS).sort((x, y) => x.keep.createdAt.getTime() - y.keep.createdAt.getTime());
  const drops = groups.flatMap((g) => g.drop.map((d) => ({ keep: g.keep, drop: d })));
  const byKind = new Map<string, number>();
  for (const { keep } of drops) {
    const day = new Date(keep.createdAt.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);
    byKind.set(`${day} ${keep.kind}`, (byKind.get(`${day} ${keep.kind}`) ?? 0) + 1);
  }
  return {
    count: drops.length,
    lines: [
      lead('13 Sep: 7 tier, 4 day-review, 1 join pair', [...byKind].map(([k, n]) => `${k} ×${n}`).join(' · ') || 'none'),
      ...drops.map(({ keep, drop }) => `${keep.kind.padEnd(26)} user ${keep.userId}  keep ${keep.id}  DELETE ${drop.id} (+${((drop.createdAt.getTime() - keep.createdAt.getTime()) / 1000).toFixed(3)} s)`),
      ...groups.flatMap((g) => g.leftRead.map((r) => `LEFT ${r.id}: the person read this copy, not the original ${g.keep.id}`)),
      'DELETE is the only honest fix: a notification has no state but read_at, and marking the copy read still lists the notice twice',
    ],
    write: async (audit) => {
      for (const { keep, drop } of drops) {
        const gone = await query<{ row: unknown }>(ctx, sql`
          delete from main.notification n where n.id = ${drop.id} and exists (select 1 from main.notification k where k.id = ${keep.id})
          returning to_jsonb(n.*) as row`);
        await audit({ action: 'DELETE', entity: 'notification', entityId: drop.id, oldData: exactlyOne(gone, drop.id).row });
      }
      return drops.length;
    },
  };
}

// ─── [9] Race spellings ─────────────────────────────────────────────────────

async function planRaceCase(ctx: Ctx): Promise<Plan> {
  const rows = await query<{ id: string; user_id: string; race: string }>(ctx, sql`
    select p.id, p.user_id, p.race from main.user_profile p where p.race is not null order by p.id`);
  const changes = rows.flatMap((r) => {
    const next = raceRewrite(r.race);
    return next === null ? [] : [{ ...r, next }];
  });
  const mapping = new Map<string, number>();
  for (const c of changes) mapping.set(`${JSON.stringify(c.race)} → ${JSON.stringify(c.next)}`, (mapping.get(`${JSON.stringify(c.race)} → ${JSON.stringify(c.next)}`) ?? 0) + 1);
  return {
    count: changes.length,
    lines: [
      lead('case variants such as "chinese" vs "Chinese"', [...mapping].map(([k, n]) => `${k} ×${n}`).join(' · ') || 'none'),
      `profiles (ids only — which id holds which value is not printed): ${changes.map((c) => c.id).join(', ') || 'none'}`,
      'canonical = the spelling the app prints (raceLabel / translations.ts `races`); free text the app does not know is never rewritten',
    ],
    write: async (audit) => {
      for (const c of changes) {
        exactlyOne(await query<{ id: string }>(ctx, sql`
          update main.user_profile p set race = ${c.next}, updated_at = now(), updated_by = ${ACTOR}
           where p.id = ${c.id} and p.race = ${c.race} returning p.id`), c.id);
        await audit({ action: 'UPDATE', entity: 'user-profile', entityId: c.id,
          oldData: { id: c.id, userId: c.user_id, race: c.race }, newData: { id: c.id, userId: c.user_id, race: c.next } });
      }
      return changes.length;
    },
  };
}

// ─── [10] Owner decides — listed, never written ─────────────────────────────

async function planOwnerDecides(ctx: Ctx): Promise<Plan> {
  const lines: string[] = [];
  const list = async (heading: string, statement: SQL, format: (r: Record<string, unknown>) => string) => {
    const rows = await query<Record<string, unknown>>(ctx, statement);
    lines.push(`${heading}: ${rows.length}`, ...rows.map((r) => `   ${format(r)}`));
  };
  await list('check-ins still open from an earlier day', sql`
    select sa.id, sa.shift_id, s.shift_date::text as day, sa.status::text as status, sa.agency_id, sa.user_id,
           to_char(sa.check_in_at at time zone ${KL}, 'YYYY-MM-DD HH24:MI') as since
      from main.shift_assignment sa join main.shift s on s.id = sa.shift_id
     where sa.check_in_at is not null and sa.check_out_at is null and s.shift_date < ${ctx.today}::date order by sa.check_in_at`,
    (r) => `assignment ${r.id} (shift ${r.shift_id}, ${r.day}, ${r.status}) agency ${r.agency_id} PR ${r.user_id} — checked in ${r.since}, never out. A check-out seals a wage, so it is a person's call`);
  await list('receipts whose printed date is 16 Jun', sql`
    select r.receipt_no, r.status::text as status, r.source, v.voucher_no, v.agency_id, v.status::text as voucher_status,
           (select count(*)::int from main.payment_voucher_line l where l.receipt_id = r.id) as lines
      from main.payment_voucher_receipt r join main.payment_voucher v on v.id = r.voucher_id
     where r.receipt_date = '2026-06-16' order by r.receipt_no`,
    (r) => `${r.receipt_no} ${r.source} ${r.status} · ${r.voucher_no} (agency ${r.agency_id}, ${r.voucher_status}) · ${r.lines} line(s)`);
  await list('stale copied org names — member_subscription.subscriber_name (a deliberate snapshot)', sql`
    select m.id, m.subscriber_id, m.ended_at is null as open from main.member_subscription m
      left join main.outlet o on m.subscriber_type = 'outlet' and o.id = m.subscriber_id
      left join main.agency a on m.subscriber_type = 'agency' and a.id = m.subscriber_id
     where coalesce(o.name, a.name) is not null and m.subscriber_name is distinct from coalesce(o.name, a.name) order by m.subscriber_id, m.started_at`,
    (r) => `${r.id} org ${r.subscriber_id}${r.open ? ' (open)' : ''}`);
  await list('stale copied org names — admin_request.subscriber_name', sql`
    select r.id, r.subscriber_id, r.status::text as status from main.admin_request r
      left join main.outlet o on r.subscriber_type = 'outlet' and o.id = r.subscriber_id
      left join main.agency a on r.subscriber_type = 'agency' and a.id = r.subscriber_id
     where coalesce(o.name, a.name) is not null and r.subscriber_name is distinct from coalesce(o.name, a.name) order by r.subscriber_id, r.created_at`,
    (r) => `${r.id} org ${r.subscriber_id} ${r.status}`);
  await list('voucher outlet names that match no outlet (voucher header / lines)', sql`
    select v.voucher_no, v.agency_id, (v.outlet is not null and not exists (select 1 from main.outlet o where o.name = v.outlet)) as header,
           (select count(*)::int from main.payment_voucher_line l where l.voucher_id = v.id and l.outlet is not null
               and not exists (select 1 from main.outlet o where o.name = l.outlet)) as lines
      from main.payment_voucher v
     where (v.outlet is not null and not exists (select 1 from main.outlet o where o.name = v.outlet))
        or exists (select 1 from main.payment_voucher_line l where l.voucher_id = v.id and l.outlet is not null
                     and not exists (select 1 from main.outlet o where o.name = l.outlet))
     order by v.voucher_no, v.agency_id`,
    (r) => `${r.voucher_no} (agency ${r.agency_id}) header ${r.header ? 'stale' : 'ok'} · ${r.lines} line(s)`);
  await list('MC day-blocks whose excused shift is gone', sql`
    select pa.id, pa.user_id, pa.unavailable_date::text as day, to_char(pa.created_at at time zone ${KL}, 'YYYY-MM-DD HH24:MI') as since
      from main.pr_availability pa
     where pa.reason = ${LEAVE_BLOCK_REASON}
       and not exists (select 1 from main.shift_assignment sa join main.shift s on s.id = sa.shift_id
                        where sa.user_id = pa.user_id and s.shift_date = pa.unavailable_date and sa.leave_status = 'approved')
     order by pa.unavailable_date`,
    (r) => `pr_availability ${r.id} PR ${r.user_id} blocked ${r.day} (since ${r.since}) — deleting the row reopens the day${String(r.day) < ctx.today ? '; the date has passed' : ''}`);
  await list(`voucher sends / payments recorded on the ${TEST_MORNING} test morning`, sql`
    select a.audit_log_id, a.entity_id, a.new_data->>'status' as became, v.voucher_no, v.agency_id, v.status::text as now,
           to_char(a.created_at at time zone ${KL}, 'HH24:MI') as at, v.finance_head_signed_at is not null as signed, v.bank_ref is not null as ref
      from main.audit_logs a join main.payment_voucher v on v.id::text = a.entity_id
     where a.entity = 'payment-voucher' and a.action = 'UPDATE' and a.new_data->>'status' in ('sent', 'paid')
       and to_char(a.created_at at time zone ${KL}, 'YYYY-MM-DD') = ${TEST_MORNING} order by a.created_at`,
    (r) => `${r.voucher_no} (agency ${r.agency_id}) → ${r.became} at ${r.at} (audit ${r.audit_log_id}); now ${r.now}${r.became === 'paid' ? `, agency signature ${r.signed ? 'yes' : 'NONE'}, bank ref ${r.ref ? 'yes' : 'none'}` : ''}`);
  await list(`penalties voided on ${TEST_MORNING}`, sql`
    select p.id, p.agency_id, p.pr_id, p.rule_type::text as rule, p.week_start::text as week, p.fine_rm::text as fine,
           to_char(p.voided_at at time zone ${KL}, 'HH24:MI') as at
      from main.penalty_charge p where to_char(p.voided_at at time zone ${KL}, 'YYYY-MM-DD') = ${TEST_MORNING}`,
    (r) => `penalty_charge ${r.id} RM ${r.fine} ${r.rule} week ${r.week} (agency ${r.agency_id}, PR ${r.pr_id}) voided at ${r.at}`);
  await list(`memberships changed on ${TEST_MORNING}`, sql`
    select m.kind, m.id, m.org_id, m.user_id, m.sub_role, m.status, to_char(m.updated_at at time zone ${KL}, 'HH24:MI') as at,
           (select string_agg(coalesce(x.new_data->>'subRole', '?') || '/' || coalesce(x.new_data->>'status', '?') || ' @' ||
                   to_char(x.created_at at time zone ${KL}, 'MM-DD HH24:MI') || ' (audit ' || x.audit_log_id || ')', ' → ' order by x.created_at)
              from main.audit_logs x where x.new_data->>'id' = m.id::text) as trail
      from (select 'agency' as kind, id, agency_id as org_id, user_id, sub_role, status, updated_at from main.agency_user
            union all select 'outlet', id, outlet_id, user_id, sub_role, status, updated_at from main.outlet_user) m
     where to_char(m.updated_at at time zone ${KL}, 'YYYY-MM-DD') = ${TEST_MORNING} order by m.updated_at`,
    (r) => `${r.kind}_user ${r.id} (org ${r.org_id}, user ${r.user_id}) now ${r.sub_role}/${r.status} since ${r.at}; audit trail: ${r.trail ?? 'none'}`);
  return { count: 0, lines: [...lines, 'report only — nothing here is written, with or without --apply'] };
}

// ─── Catalogue and runner ───────────────────────────────────────────────────

const CATALOGUE: Category[] = [
  { key: 'demo-requests', num: '1', defaultOn: true, title: '"[Demo]" admin_request rows for organisations that do not exist', plan: planDemoRequests,
    applyText: 'DELETE them — admin_request has no void state, and every status still lists the row in the admin inbox/history' },
  { key: 'seed-anchors', num: '2', defaultOn: true, title: 'seed-sample member_subscription rows relinked to real orgs', plan: planSeedAnchors,
    applyText: 'withdraw the fictional billing anchor (billing_starts_at → NULL, the documented "not yet billable" state); the rows stay as plan history' },
  { key: 'seed-invoices', num: '3', defaultOn: true, title: 'unpaid invoices billed from those anchors, before the org existed', plan: (ctx) => planPreCalendarInvoices(ctx, true),
    applyText: `VOID them (status → void, "Voided: ${SEED_INVOICE_VOID_REASON}" on the note) — the row and its period slot stay; needs seed-anchors first` },
  { key: 'gap-invoices', num: '3b', defaultOn: false, title: 'the same artefact on the org\'s own row (weeks it held no plan)', plan: (ctx) => planPreCalendarInvoices(ctx, false),
    applyText: `VOID them, like [3] ("Voided: ${GAP_INVOICE_VOID_REASON}") — only when named in --only` },
  { key: 'duplicate-shift', num: '4', defaultOn: true, title: 'the duplicate 17 Aug shift', plan: planDuplicateShift,
    applyText: 'DELETE the copy without work attached — the house "withdraw"; a tie needs --keep-shift' },
  { key: 'held-receipts', num: '5', defaultOn: true, title: 'receipts the Sunday job verified on vouchers it held', plan: planHeldReceipts,
    applyText: 'status verified → approved (what the fixed job leaves on a held voucher)' },
  { key: 'signer-email', num: '6', defaultOn: true, title: 'vouchers whose signer is stored as an e-mail', plan: planSignerEmail,
    applyText: 'finance_head_name → the signer account\'s display name' },
  { key: 'due-dates', num: '7', defaultOn: true, title: 'legacy blank voucher due dates', plan: planDueDates,
    applyText: 'due_date → week_end + 7 (backfill-voucher-due-dates.ts / paymentDueDate); issued dates stay blank' },
  { key: 'duplicate-notices', num: '8', defaultOn: true, title: 'notices delivered twice', plan: planDuplicateNotices,
    applyText: 'DELETE the later copy of each, keeping the first' },
  { key: 'race-case', num: '9', defaultOn: true, title: 'user_profile.race case variants', plan: planRaceCase,
    applyText: 'race → the canonical spelling the app prints' },
  { key: 'owner-decides', num: '10', defaultOn: true, reportOnly: true, title: 'owner decides — listed only', plan: planOwnerDecides,
    applyText: 'nothing (report only)' },
];

function printCategory(cat: Category, plan: Plan): void {
  console.log(`\n━━ [${cat.num}] ${cat.key} — ${cat.title}${cat.defaultOn ? '' : '  (OPT-IN: applied only when named in --only)'}`);
  console.log(`   --apply: ${cat.applyText}`);
  console.log(`   rows to change: ${cat.reportOnly ? '— (report only)' : plan.count}`);
  for (const line of plan.lines) console.log(`   ${line}`);
}

function printHelp(): void {
  console.log('cleanup-test-data-29sep — dry run by default; --apply --i-know-this-is-a-test-db writes; --only=<key|num,...>; --keep-shift=<id>\n');
  for (const cat of CATALOGUE) {
    console.log(`  ${cat.num.padEnd(3)} ${cat.key.padEnd(18)} ${cat.defaultOn ? '' : '(opt-in) '}${cat.title}\n      --apply: ${cat.applyText}`);
  }
}

async function main(): Promise<void> {
  const parsed = parseCleanupArgs(process.argv.slice(2));
  if (!parsed.ok) throw new Error(parsed.error);
  const { args } = parsed;
  if (args.help) return printHelp();
  const selection = resolveCategoryKeys(args.only, CATALOGUE);
  if (!selection.ok) throw new Error(selection.error);
  // A plain dry run shows EVERY category, opt-in ones included, so the owner
  // sees everything before choosing; --apply without --only runs the default set.
  const selected = CATALOGUE.filter((c) => (!args.apply && !args.only) || selection.keys.includes(c.key));
  const refusal = applyRefusal({
    apply: args.apply,
    ackTestDb: args.ackTestDb,
    databaseName: process.env.POSTGRES_DB,
  });
  if (refusal) throw new Error(refusal);

  const { db } = await import('@/db');
  const today = klToday();
  console.log(`cleanup-test-data-29sep — ${args.apply ? 'APPLY (one transaction per category)' : 'DRY RUN (read-only transaction; pass --apply --i-know-this-is-a-test-db to write)'}`);
  console.log(`database: ${process.env.POSTGRES_DB ?? '(unset)'} · KL today ${today} · categories: ${selected.map((c) => c.num).join(', ')}`);

  if (!args.apply) {
    await db.transaction(async (tx) => {
      const [mode] = toRows<{ ro: string }>(await tx.execute(sql`select current_setting('transaction_read_only') as ro`));
      if (mode?.ro !== 'on') throw new Error('the dry-run transaction is not read-only — stopping before any read');
      const ctx: Ctx = { tx, today, keepShift: args.keepShift, apply: false };
      for (const cat of selected) printCategory(cat, await cat.plan(ctx));
    }, { accessMode: 'read only' });
    console.log('\nDRY RUN — nothing written. Apply: npx tsx --tsconfig tsconfig.json src/scripts/cleanup-test-data-29sep.ts --apply --i-know-this-is-a-test-db [--only=...]');
    return;
  }

  const { AuditLogRepositoryClass } = await import('@/features/audit-log/audit-log.repository');
  const auditRepository = new AuditLogRepositoryClass();
  let failed = 0;
  for (const cat of selected) {
    try {
      await db.transaction(async (tx) => {
        const ctx: Ctx = { tx, today, keepShift: args.keepShift, apply: true };
        const before = await cat.plan(ctx);
        printCategory(cat, before);
        if (cat.reportOnly || before.count === 0 || !before.write) return;
        const batchId = randomUUID();
        const audit: AuditWriter = async (entry) => {
          await auditRepository.createAuditLog({ userId: null, role: null, portal: null, ...entry, batchId, ipAddress: AUDIT_IP, userAgent: ACTOR }, tx);
        };
        const written = await before.write(audit);
        const after = await cat.plan(ctx);
        console.log(`   before ${before.count} → written ${written} → after ${after.count}`);
        if (written !== before.count || after.count !== 0) throw new Error('counts do not reconcile — rolling this category back');
        console.log(`   COMMITTED · audit_logs batch_id ${batchId}`);
      });
    } catch (error) {
      failed += 1;
      console.error(`   [${cat.num}] ROLLED BACK — ${String(error instanceof Error ? error.message : error).slice(0, 300)}`);
    }
  }
  if (failed > 0) throw new Error(`${failed} category(ies) rolled back — see above`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(String(error instanceof Error ? error.message : error).slice(0, 500));
    process.exit(1);
  });
