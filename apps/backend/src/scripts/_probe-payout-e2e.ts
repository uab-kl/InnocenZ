import './_probe-env';
import { sql } from 'drizzle-orm';
import { db } from '../db/index';

/**
 * THE WHOLE PAYOUT LANE, END TO END, ON THROWAWAY DATA.
 *
 * Everything runs against a SYNTHETIC voucher (`PV-PROBE-E2E`) so the
 * signed -> paid write-back can be proven without moving a real PR's money
 * record. Cleanup runs in a `finally` and again on error.
 */
const API = 'http://localhost:7777/api/v1';
const VNO = 'PV-PROBE-E2E';

async function cleanup(
  prUserId: string | null,
  savedBank: { n: string | null; a: string | null },
) {
  await db.execute(sql`
    delete from main.payout_batch where id in (
      select pb.id from main.payout_batch pb
       join main.payout_batch_item pbi on pbi.batch_id = pb.id
       join main.payment_voucher pv on pv.id = pbi.voucher_id
      where pv.voucher_no = ${VNO})`);
  await db.execute(sql`delete from main.payment_voucher where voucher_no = ${VNO}`);
  if (prUserId) {
    await db.execute(sql`
      delete from main.notification
       where user_id = ${prUserId}::uuid and kind = 'payment_voucher_paid'
         and created_at > now() - interval '10 minutes'`);
    await db.execute(sql`
      update main.user_profile set bank_name = ${savedBank.n}, bank_account_no = ${savedBank.a}
       where user_id = ${prUserId}::uuid`);
  }
  const left: any = await db.execute(
    sql`select count(*)::int as n from main.payment_voucher where voucher_no = ${VNO}`,
  );
  console.log(`cleanup: probe vouchers left = ${(left.rows ?? left)[0]?.n}`);
}

async function main() {
  const ag: any = await db.execute(
    sql`select id from main.agency where agency_code = 'AGY001' limit 1`,
  );
  const agencyId = (ag.rows ?? ag)[0]?.id;
  const pr: any = await db.execute(sql`
    select u.id, up.bank_name, up.bank_account_no
      from main."user" u join main.user_profile up on up.user_id = u.id
     where u.email = 'pr.vicky@innocenz.demo' limit 1`);
  const prRow = (pr.rows ?? pr)[0];
  if (!agencyId || !prRow) {
    console.log('SKIP: Atlas or Vicky missing — asserts nothing');
    process.exit(1);
  }
  const prUserId: string = prRow.id;
  const savedBank = { n: prRow.bank_name ?? null, a: prRow.bank_account_no ?? null };

  const token = (
    await (
      await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'owner@atlas-agency.my', password: 'Password123!' }),
      })
    ).json()
  )?.data?.accessToken;
  if (!token) {
    console.log('SKIP: agency login failed');
    process.exit(1);
  }
  const H = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };

  let ok = true;
  const check = (label: string, pass: boolean, detail = '') => {
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`);
    if (!pass) ok = false;
  };

  try {
    await db.execute(sql`
      update main.user_profile set bank_name = 'Maybank', bank_account_no = '512345678901'
       where user_id = ${prUserId}::uuid`);

    const ins: any = await db.execute(sql`
      insert into main.payment_voucher
        (agency_id, user_id, pr_id, voucher_no, pr_name, status, net,
         week_start, week_end, pr_signed_at, finance_head_signed_at, created_by, updated_by)
      values (${agencyId}::uuid, ${prUserId}::uuid, ${prUserId}::uuid, ${VNO},
              'PROBE E2E', 'signed', '12.34', '2026-06-07', '2026-06-13', now(), now(), 'probe', 'probe')
      returning id`);
    const voucherId = (ins.rows ?? ins)[0]?.id;
    console.log(`created synthetic SIGNED voucher ${VNO} (${voucherId}) net=12.34\n`);

    const cand = await (
      await fetch(`${API}/payout-batch/candidates?weekStart=2026-06-07&weekEnd=2026-06-13`, {
        headers: H,
      })
    ).json();
    check(
      'candidates finds it and marks it payable',
      cand?.data?.summary?.ready === 1,
      JSON.stringify(cand?.data?.summary),
    );

    // --- 0142 guards: cancel releases, and a second live run is refused ---
    const draftRes = await fetch(`${API}/payout-batch`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ weekStart: '2026-06-07', weekEnd: '2026-06-13', method: 'ibg' }),
    });
    const draft = (await draftRes.json())?.data;
    check('a draft can be created', draftRes.status === 201, draft?.reference);

    const dup = await fetch(`${API}/payout-batch`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ weekStart: '2026-06-07', weekEnd: '2026-06-13', method: 'ibg' }),
    });
    check('a SECOND run for the same voucher is refused (not silently double-paid)',
      dup.status === 409, `${dup.status}: ${(await dup.json())?.message?.slice(0, 60)}`);

    // THE ACTUAL RACE. The sequential duplicate above is caught by the
    // read-time `alreadyBatched` check, which proves nothing about the index.
    // Two SIMULTANEOUS creates both pass that read, so only the partial unique
    // index from 0142 can stop the second — this is the only way to fire it.
    await fetch(`${API}/payout-batch/${draft.id}/cancel`, { method: 'POST', headers: H });
    const body = JSON.stringify({
      weekStart: '2026-06-07', weekEnd: '2026-06-13', method: 'ibg',
    });
    const raced = await Promise.all([
      fetch(`${API}/payout-batch`, { method: 'POST', headers: H, body }),
      fetch(`${API}/payout-batch`, { method: 'POST', headers: H, body }),
    ]);
    const codes = raced.map((r) => r.status).sort();
    check(
      'a CONCURRENT double-create is stopped by the database, not by luck',
      codes[0] === 201 && codes[1] === 409,
      `statuses ${codes.join('+')}`,
    );
    // Whichever won holds the voucher; cancel it so the rest of the run is clean.
    for (const r of raced) {
      if (r.status !== 201) continue;
      const won = (await r.json())?.data;
      if (won?.id) {
        await fetch(`${API}/payout-batch/${won.id}/cancel`, { method: 'POST', headers: H });
      }
    }

    // `draft` was already cancelled above to stage the race, so make a fresh
    // one to prove the cancel path rather than re-cancelling a dead batch.
    const draft2 = (
      await (
        await fetch(`${API}/payout-batch`, { method: 'POST', headers: H, body })
      ).json()
    )?.data;
    const cancelRes = await fetch(`${API}/payout-batch/${draft2.id}/cancel`, {
      method: 'POST', headers: H,
    });
    check('a draft can be cancelled', cancelRes.status === 200,
      (await cancelRes.json())?.message);

    const freed = await (
      await fetch(`${API}/payout-batch/candidates?weekStart=2026-06-07&weekEnd=2026-06-13`, {
        headers: H,
      })
    ).json();
    check('cancelling RELEASES the voucher back to the pool',
      freed?.data?.summary?.ready === 1, JSON.stringify(freed?.data?.summary));

    const createRes = await fetch(`${API}/payout-batch`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ weekStart: '2026-06-07', weekEnd: '2026-06-13', method: 'ibg' }),
    });
    const created = await createRes.json();
    const batch = created?.data;
    check(
      'create returns 201 with one item',
      createRes.status === 201 && batch?.items?.length === 1,
      `${createRes.status} ref=${batch?.reference} total=${batch?.totalAmount}`,
    );
    if (!batch?.id) throw new Error('no batch to continue with');

    const csvRes = await fetch(`${API}/payout-batch/${batch.id}/export.csv`, { headers: H });
    const csv = await csvRes.text();
    check('export.csv returns a file', csvRes.status === 200 && csv.includes('Account Number'));
    check(
      'CSV quotes the account number (leading zeros survive Excel)',
      csv.includes('"512345678901"'),
    );
    check('CSV carries the amount unformatted', csv.includes('12.34'));
    console.log('   CSV:\n' + csv.split('\r\n').map((l) => '     ' + l).join('\n'));

    const afterExport = await (
      await fetch(`${API}/payout-batch/${batch.id}`, { headers: H })
    ).json();
    check(
      'download moved batch to exported and items to sent',
      afterExport?.data?.status === 'exported' &&
        afterExport?.data?.items?.[0]?.status === 'sent',
      `${afterExport?.data?.status}/${afterExport?.data?.items?.[0]?.status}`,
    );

    const prov = await fetch(`${API}/payout-batch/${batch.id}/submit-provider`, {
      method: 'POST',
      headers: H,
    });
    const provJson = await prov.json();
    check(
      'submit-provider 501s with instructions when no key is set',
      prov.status === 501,
      provJson?.message?.slice(0, 70),
    );

    const itemId = afterExport?.data?.items?.[0]?.id;
    const settleRes = await fetch(`${API}/payout-batch/${batch.id}/settle`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({
        settlements: [{ itemId, status: 'paid', bankRef: 'PROBE-IBG-0001' }],
      }),
    });
    const settled = await settleRes.json();
    check('settle closes the batch', settled?.data?.status === 'settled', settled?.message);

    const vrow: any = await db.execute(sql`
      select status, paid_at, bank_ref from main.payment_voucher where id = ${voucherId}::uuid`);
    const v = (vrow.rows ?? vrow)[0];
    check(
      'voucher moved signed -> paid with the bank ref',
      v?.status === 'paid' && !!v?.paid_at && v?.bank_ref === 'PROBE-IBG-0001',
      `${v?.status} ref=${v?.bank_ref}`,
    );

    const nrow: any = await db.execute(sql`
      select count(*)::int as n from main.notification
       where user_id = ${prUserId}::uuid and kind = 'payment_voucher_paid'
         and created_at > now() - interval '5 minutes'`);
    check('the PR was notified they were paid', Number((nrow.rows ?? nrow)[0]?.n) >= 1);

    console.log(`\n${ok ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED'}`);
  } finally {
    await cleanup(prUserId, savedBank);
  }
  process.exit(ok ? 0 : 1);
}

main().catch(async (e) => {
  console.error('PROBE ERROR', e);
  try {
    await db.execute(sql`delete from main.payment_voucher where voucher_no = ${VNO}`);
  } catch {
    /* best effort */
  }
  process.exit(1);
});
