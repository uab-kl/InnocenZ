/**
 * READ-ONLY. Proves the receipts feed now says which of its receipts a PR is
 * arguing with — and would fail loudly if it did not.
 *
 * The agency's Receipts sub-tab rendered a plain green "Verified" on a receipt
 * the dispute queue was showing an open claim against, because
 * `payment_voucher_receipt.status` describes the AGENCY's review and has no room
 * for the PR's opinion. `listAgencyReceipts` now attaches `disputes[]`.
 *
 * Calls the REAL handler with a stub req/res, so what is under test is the
 * shipped mapping and not a second copy of it written here. Candidates come from
 * production rows; zero candidates SKIPs loudly rather than passing.
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/_probe-receipt-dispute-badge.ts
 */
import './_probe-env';
import { sql } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { paymentVoucherController } from '../composition-root';
import { db } from '../db/index';

async function rows(statement: any): Promise<any[]> {
  const res: any = await db.execute(statement);
  return res.rows ?? res;
}

/** Captures what the handler answered with, without an HTTP server. */
function stubRes() {
  const captured: { status: number; body: any } = { status: 0, body: null };
  const res = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(body: any) {
      captured.body = body;
      return this;
    },
  };
  return { res: res as unknown as Response, captured };
}

async function main() {
  // A receipt whose voucher carries an OPEN claim, taken from live rows. The
  // dispute may name the receipt (post-0088) or name none and cover the day.
  const candidates = await rows(sql`
    SELECT d.id            AS dispute_id,
           d.receipt_id    AS dispute_receipt_id,
           d.dispute_date  AS dispute_date,
           d.component     AS component,
           v.id            AS voucher_id,
           v.agency_id     AS agency_id,
           r.id            AS receipt_id,
           r.receipt_no    AS receipt_no,
           r.status        AS receipt_status
      FROM main.payment_voucher_dispute d
      JOIN main.payment_voucher v ON v.id = d.voucher_id
      JOIN main.payment_voucher_receipt r ON r.voucher_id = v.id
     WHERE d.outcome IS NULL
       AND (d.receipt_id IS NULL OR d.receipt_id = r.id)
     ORDER BY d.raised_at DESC
     LIMIT 5`);

  console.log('\n=== Receipts sitting under an OPEN claim (live rows) ===');
  if (candidates.length === 0) {
    console.log('  NONE FOUND — this probe proves NOTHING today.');
    console.log('  Not a pass: no open dispute exists on this database, so');
    console.log('  there is no receipt that should be badged "Disputed".');
    process.exit(0);
  }
  for (const c of candidates) {
    console.log(
      `   ${c.receipt_no} (${c.receipt_status}) · claim ${String(c.dispute_id).slice(0, 8)} ` +
        `· ${c.component} on ${c.dispute_date} · names a receipt: ${c.dispute_receipt_id ? 'yes' : 'no (whole day)'}`,
    );
  }

  const target = candidates[0];

  // Somebody who can actually read this agency's feed. The handler resolves the
  // agency from the SESSION, exactly as the route does — handing it an agency id
  // directly would skip the scoping this feed depends on.
  const [member] = await rows(sql`
    SELECT au.user_id
      FROM main.agency_user au
     WHERE au.agency_id = ${target.agency_id}
     LIMIT 1`);
  if (!member) {
    console.log('\n  SKIP: that agency has no member account to read as.');
    process.exit(0);
  }

  const { res, captured } = stubRes();
  await paymentVoucherController.listAgencyReceipts(
    { user: { id: member.user_id }, query: {} } as unknown as Request,
    res,
  );
  console.log(`\n=== GET /payment-voucher/receipts → ${captured.status} ===`);
  const feed: any[] = captured.body?.data ?? [];
  console.log(`   ${feed.length} receipts for this agency`);

  const row = feed.find((r) => r.id === target.receipt_id);
  if (!row) {
    console.log(`\n  x FAIL: ${target.receipt_no} is not in the feed at all.`);
    process.exit(1);
  }

  const claims: any[] = row.disputes ?? [];
  const open = claims.filter((d) => !d.outcome);
  console.log(`\n=== ${row.receiptNo} ===`);
  console.log(`   status ......... ${row.status}   (the AGENCY's review)`);
  console.log(
    `   disputes[] ..... ${row.disputes === undefined ? 'MISSING' : `${claims.length} (${open.length} open)`}`,
  );
  for (const d of claims) {
    console.log(`     · ${d.component} on ${d.disputeDate} -> ${d.outcome ?? 'OPEN'}`);
  }

  if (row.disputes === undefined) {
    console.log('\n  x FAIL: the feed carries no `disputes` field — the badge');
    console.log('    cannot know, and the row would render "Verified" again.');
    process.exit(1);
  }
  if (!open.some((d) => d.id === target.dispute_id)) {
    console.log('\n  x FAIL: the open claim on this receipt is not linked to it.');
    process.exit(1);
  }
  console.log('\n  OK: the open claim reaches the receipt — the row badges "Disputed".');

  // The other half, and the one a badge gets wrong silently: receipts nobody is
  // arguing with must come back with an EMPTY array, not with somebody else's
  // claim. A rule matched on the date alone would fail exactly here.
  const undisputed = feed.filter((r) => (r.disputes ?? []).length === 0);
  const badged = feed.filter((r) => (r.disputes ?? []).some((d: any) => !d.outcome));
  console.log(
    `\n   ${badged.length} of ${feed.length} receipts carry an open claim; ` +
      `${undisputed.length} carry none.`,
  );
  if (badged.length === feed.length && feed.length > 1) {
    console.log('  x FAIL: EVERY receipt is badged — the match is too wide.');
    process.exit(1);
  }
  console.log('  OK: the badge is selective, not blanket.');

  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
