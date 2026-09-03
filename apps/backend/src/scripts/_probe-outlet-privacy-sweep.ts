/**
 * READ-ONLY. What PR-private data can an OUTLET token actually read?
 *
 * Fires every outlet-reachable GET on the v1 router with a real outlet session
 * and deep-scans the JSON that comes back for fields a venue has no business
 * seeing — identity documents, contact details, payroll, and above all the PR's
 * DISCIPLINE record (penalties, deductions, cancellation fees), which the owner
 * ruled out of the outlet's view on 3 Sept 2026.
 *
 * Reads only. Values are REDACTED in the output (type + length + first char):
 * this runs against the shared database, and an audit must not reprint the
 * personal data it is complaining about.
 *
 * A 401/403/404 is a PASS — the guard held. The interesting rows are 200s
 * carrying a flagged key.
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/_probe-outlet-privacy-sweep.ts [email] [password]
 */
import './_probe-env';

const BASE = process.env.PROBE_API ?? 'http://localhost:7777/api/v1';
const EMAIL = process.argv[2] ?? 'emhub@emhub.test';
const PASSWORD = process.argv[3] ?? 'Password123!';

/**
 * Field names a venue must not receive about a PR.
 *
 * Matched on the KEY, case-insensitively, as a substring — deliberately broad,
 * because a sweep that under-reports is worse than one a human has to triage.
 * Every hit is read by hand afterwards; false positives are expected and fine.
 */
const SENSITIVE: Record<string, RegExp> = {
  // ⚠️ `ic` needs the `icno`/`icnum` alternatives spelled out. `\bic\b` does
  // NOT match `icNo` — the boundary fails against the following `N` — and that
  // gap is what let the first run of this sweep report `/pr` as carrying only a
  // phone and a DOB when it was also handing out IC NUMBERS.
  'identity doc': /icno|icnum|icnumber|\bic\b|nric|passport|idphoto|idcard/i,
  'date of birth': /dob|dateofbirth|birthdate|birthday/i,
  contact: /phone|mobile|whatsapp|telegram|emergencycontact|nextofkin/i,
  'home address': /^address$|homeaddress|residential/i,
  email: /email/i,
  'bank / payout': /bank|accountno|accountnumber|payout|iban|swift/i,
  // Precise LOCATION of a person at a time. The redactor's own note says
  // "coordinates stay closed"; nothing was checking that they were.
  geolocation: /\blat\b|\blng\b|latitude|longitude|checkinlat|checkinlng|accuracym|distancem/i,
  'DISCIPLINE penalty': /penalt|fine|cancelfee|cancel_fee|strike|warning|blacklist|suspend/i,
  'DISCIPLINE deduction': /deduction|deduct/i,
  'payroll to PR': /netpay|takehome|voucher|payslip/i,
  // `leaveProofPhotos` is a photographed medical certificate. It matches none
  // of the obvious medical words, so name the field shape itself.
  'medical / leave': /medical|leavereason|leavenote|sickcert|leaveproof|leavestatus|\bmc\b/i,
  credential: /password|hash|secret|token|otp/i,
};

interface Hit {
  label: string;
  path: string;
  redacted: string;
}

function redact(v: unknown): string {
  if (v === null) return 'null';
  if (typeof v === 'boolean') return `bool:${v}`;
  if (typeof v === 'number') return `num(${String(v).length} digits)`;
  if (typeof v === 'string') return `str[len ${v.length}] "${v[0]}..."`;
  if (Array.isArray(v)) return `array[${v.length}]`;
  return 'object';
}

/** Walks the payload, reporting keys that match the vocabulary AND carry a value. */
function scan(node: unknown, path: string, out: Hit[], seen: Set<string>): void {
  if (node === null || node === undefined) return;
  if (Array.isArray(node)) {
    // EVERY element, not a sample.
    //
    // This took the first two rows, on the reasoning that a roster repeats one
    // shape. It does not: a field is disclosed if ANY row carries it, and the
    // sparse ones are exactly the sensitive ones. The live `/shift-assignment`
    // list has a cancellation penalty on 1 row of 35 — invisible to a 2-row
    // sample, which is how the first run of this sweep called that endpoint
    // clean while it was serving a PR's fine and their GPS coordinates.
    node.forEach((v, i) => scan(v, `${path}[${i}]`, out, seen));
    return;
  }
  if (typeof node !== 'object') return;
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    const here = path ? `${path}.${k}` : k;
    for (const [label, re] of Object.entries(SENSITIVE)) {
      if (!re.test(k)) continue;
      // An absent, empty or zero value is not a disclosure.
      if (v === null || v === undefined || v === '' || v === 0 || v === false) continue;
      const key = `${label}|${k}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ label, path: here, redacted: redact(v) });
    }
    if (v && typeof v === 'object') scan(v, here, out, seen);
  }
}

function dataOf(body: unknown): unknown {
  return (body as { data?: unknown } | null)?.data ?? body;
}

function listOf(body: unknown): Record<string, unknown>[] {
  const d = dataOf(body);
  return Array.isArray(d) ? (d as Record<string, unknown>[]) : [];
}

async function main() {
  const loginRes = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const login = (await loginRes.json()) as { data?: { accessToken?: string } };
  const token = login.data?.accessToken;
  if (!token) throw new Error(`login failed for ${EMAIL}: HTTP ${loginRes.status}`);
  console.log(`\nSigned in as ${EMAIL} (outlet)`);

  const get = async (p: string) => {
    // Ask for the WHOLE list, not the default first page.
    //
    // `/pr` and `/user` default to pageSize=10. Sweeping the default answers
    // "what is on page one", which is not the question — an outlet that can
    // page can read the lot, and the first run of this sweep undercounted
    // `/pr` at 10 rows when the caller can pull 44 across two agencies.
    const url = `${BASE}${p}${p.includes('?') ? '&' : '?'}pageSize=200`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    let body: unknown = null;
    try {
      body = await r.json();
    } catch {
      /* a non-JSON response (file export) — nothing to scan */
    }
    return { status: r.status, body };
  };

  // Discover REAL ids, so the ':id' routes are actually exercised. A sweep that
  // only ever hits "not found" on a made-up uuid proves nothing.
  const report = await get('/shift-sale/report');
  const prId = (
    (dataOf(report.body) as { costByPrDay?: { prId: string }[] } | null)?.costByPrDay ?? []
  )[0]?.prId;
  const assignmentId = listOf((await get('/shift-assignment')).body)[0]?.id as string | undefined;
  const shiftId = listOf((await get('/shift')).body)[0]?.id as string | undefined;
  const outletId = listOf((await get('/outlet')).body)[0]?.id as string | undefined;
  const agRow = listOf((await get('/agency-outlet/mine')).body)[0] ?? {};
  const agencyId = (agRow.agencyId ?? agRow.id) as string | undefined;

  console.log(
    `discovered ids — pr:${prId ? 'y' : 'NO'} assignment:${assignmentId ? 'y' : 'NO'} ` +
      `shift:${shiftId ? 'y' : 'NO'} outlet:${outletId ? 'y' : 'NO'} agency:${agencyId ? 'y' : 'NO'}`,
  );

  const paths = [
    '/user',
    '/user/me/signature',
    '/pr',
    prId && `/pr/${prId}`,
    '/pr/mine/penalties',
    '/pr/mine/penalty-rules',
    prId && `/pr/${prId}/penalties`,
    '/shift-assignment',
    '/shift-assignment/mine',
    '/shift-assignment/attendance-fixes',
    '/shift-assignment/overtime/pending',
    assignmentId && `/shift-assignment/${assignmentId}`,
    assignmentId && `/shift-assignment/${assignmentId}/replacement-candidates`,
    '/shift',
    shiftId && `/shift/${shiftId}`,
    '/shift-sale',
    '/shift-sale/report',
    '/rating',
    '/notification',
    '/notification/unread-count',
    '/special-service',
    '/special-service/summary',
    '/special-service/mine',
    '/outlet-transaction',
    '/outlet-transaction/summary',
    '/subscription',
    '/member-subscription',
    '/member-subscription/summary',
    '/subscription-invoice',
    '/payment-method',
    '/collection-invoice',
    '/cutlost',
    '/shift-template',
    '/admin-request',
    '/admin-request/pending-count',
    '/outlet',
    '/outlet/memberships',
    outletId && `/outlet/${outletId}`,
    outletId && `/outlet/${outletId}/members`,
    outletId && `/outlet-workspace/${outletId}`,
    '/agency-outlet/mine',
    agencyId && `/agency/${agencyId}`,
    '/agency',
    '/agency/memberships',
    agencyId && `/agency/${agencyId}/prs`,
    agencyId && `/agency/${agencyId}/penalty-rules`,
    agencyId && `/agency/${agencyId}/penalty-proposals`,
    agencyId && `/agency/${agencyId}/uncharged`,
    '/payment-voucher',
    '/payout-batch',
    '/pr-availability/mine',
    '/outlet-swap',
    '/outlet-swap/mine',
    '/platform-config',
    '/rbac/role',
  ].filter(Boolean) as string[];

  const findings: { path: string; hits: Hit[] }[] = [];
  const refused: string[] = [];
  const clean: string[] = [];

  for (const p of paths) {
    const { status, body } = await get(p);
    if (status >= 400) {
      refused.push(`${p} -> ${status}`);
      continue;
    }
    const hits: Hit[] = [];
    scan(dataOf(body), '', hits, new Set());
    if (hits.length === 0) clean.push(p);
    else findings.push({ path: p, hits });
  }

  console.log('\n========== REACHABLE, CARRYING FLAGGED FIELDS ==========');
  for (const f of findings) {
    console.log(`\n${f.path}`);
    for (const h of f.hits) console.log(`    [${h.label}] ${h.path} = ${h.redacted}`);
  }
  console.log('\n========== REACHABLE, NOTHING FLAGGED ==========');
  console.log(`  ${clean.join('\n  ') || '(none)'}`);
  console.log('\n========== REFUSED (guard held) ==========');
  console.log(`  ${refused.join('\n  ') || '(none)'}`);
  console.log(
    `\nSwept ${paths.length} paths — ${findings.length} carrying flagged fields, ` +
      `${clean.length} clean, ${refused.length} refused.`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
