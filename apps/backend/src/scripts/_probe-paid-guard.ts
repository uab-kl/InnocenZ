const API = 'http://localhost:7777/api/v1';
const OWNERS = ['owner@atlas-agency.my', 'owner@delta-agency.my', 'hello@starline.my'];

async function login(email: string) {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'Password123!' }),
  });
  const j: any = await r.json().catch(() => ({}));
  return j?.data?.accessToken ?? j?.data?.token ?? j?.token ?? null;
}

async function main() {
  let token: string | null = null, who = '';
  let vouchers: any[] = [];
  for (const email of OWNERS) {
    const t = await login(email);
    if (!t) { console.log(`login FAILED ${email}`); continue; }
    const r = await fetch(`${API}/payment-voucher`, { headers: { authorization: `Bearer ${t}` } });
    if (r.status === 404) { console.log('ABORT: route 404s — stale server?'); process.exit(1); }
    const j: any = await r.json().catch(() => ({}));
    const list = j?.data?.items ?? j?.data ?? [];
    console.log(`${email}: ${r.status}, ${Array.isArray(list) ? list.length : '?'} vouchers`);
    if (Array.isArray(list) && list.length) { token = t; who = email; vouchers = list; break; }
  }
  if (!token) { console.log('SKIP: no agency owner sees any voucher — asserts nothing'); process.exit(1); }

  const targets = vouchers.filter((v) => v.status !== 'signed' && v.status !== 'paid');
  if (!targets.length) { console.log('SKIP: no non-signed voucher to refuse — asserts nothing'); process.exit(1); }
  console.log(`\nactor=${who}  candidates=${targets.map((v: any) => `${v.voucherNo}:${v.status}`).join(', ')}\n`);

  let refused = 0;
  for (const v of targets) {
    const r = await fetch(`${API}/payment-voucher/${v.id}`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'paid', bankRef: 'PROBE-SHOULD-NEVER-LAND' }),
    });
    const j: any = await r.json().catch(() => ({}));
    console.log(`PUT paid on ${v.voucherNo} (${v.status}) -> ${r.status}: ${j?.message}`);
    if (r.status === 409) refused++;

    // Nothing may have been written: re-read and assert the row is untouched.
    const after = await fetch(`${API}/payment-voucher/${v.id}`, { headers: { authorization: `Bearer ${token}` } });
    const aj: any = await after.json().catch(() => ({}));
    const row = aj?.data ?? {};
    const clean = row.status === v.status && !row.paidAt && row.bankRef !== 'PROBE-SHOULD-NEVER-LAND';
    console.log(`   after: status=${row.status} paidAt=${row.paidAt ?? 'null'} bankRef=${row.bankRef ?? 'null'}  ${clean ? 'UNCHANGED ✓' : 'MUTATED ✗'}\n`);
    if (!clean) { console.log('FAIL: the refusal wrote something'); process.exit(1); }
  }
  console.log(refused === targets.length
    ? `PASS: ${refused}/${targets.length} refused with 409, nothing written`
    : `FAIL: only ${refused}/${targets.length} refused`);
  process.exit(refused === targets.length ? 0 : 1);
}
main().catch((e) => { console.error('PROBE ERROR', e); process.exit(1); });

export {}; // module scope: keeps top-level `login` out of the global script namespace
