/**
 * READ-ONLY. Does the outlet redaction DISCRIMINATE, or did it blank the field
 * for everybody?
 *
 * A privacy fix that hides a column from all callers is not a privacy fix, it is
 * an outage waiting to be reported as one — the agency roster reads `icNo`, and
 * the payroll lane reads the check-in coordinates. So the assertion is
 * two-sided:
 *
 *   OUTLET  must NOT see icNo / dob / lat / lng / cancelFee*
 *   AGENCY  MUST still see them
 *
 * Both halves have to hold. If the agency column is empty the test reports
 * INCONCLUSIVE rather than passing, because a field that is null for everyone
 * proves nothing about redaction.
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/_probe-redaction-counter-test.ts
 */
import './_probe-env';

const BASE = process.env.PROBE_API ?? 'http://localhost:7777/api/v1';
const OUTLET = { email: 'emhub@emhub.test', password: 'Password123!' };
const AGENCY = { email: 'owner@atlas-agency.my', password: 'Password123!' };

async function tokenFor(cred: { email: string; password: string }): Promise<string> {
  const r = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cred),
  });
  const j = (await r.json()) as { data?: { accessToken?: string } };
  if (!j.data?.accessToken) throw new Error(`login failed for ${cred.email}: HTTP ${r.status}`);
  return j.data.accessToken;
}

async function rows(token: string, path: string): Promise<Record<string, unknown>[]> {
  const r = await fetch(`${BASE}${path}?pageSize=200`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const j = (await r.json()) as { data?: unknown };
  return Array.isArray(j.data) ? (j.data as Record<string, unknown>[]) : [];
}

function populated(list: Record<string, unknown>[], field: string): number {
  return list.filter((row) => {
    const [head, tail] = field.split('.');
    const v = tail
      ? ((row[head!] as Record<string, unknown> | null) ?? {})[tail]
      : row[head!];
    return v !== null && v !== undefined && v !== '';
  }).length;
}

async function main() {
  const [outletTok, agencyTok] = await Promise.all([tokenFor(OUTLET), tokenFor(AGENCY)]);

  const checks: { path: string; fields: string[] }[] = [
    { path: '/pr', fields: ['icNo', 'profile.dob'] },
    {
      path: '/shift-assignment',
      fields: ['checkInLat', 'checkInLng', 'checkOutLat', 'cancelFeeRm', 'cancelFeeVoucherId'],
    },
  ];

  let failures = 0;
  let inconclusive = 0;

  for (const { path, fields } of checks) {
    const outletRows = await rows(outletTok, path);
    const agencyRows = await rows(agencyTok, path);
    console.log(
      `\n=== ${path} — outlet ${outletRows.length} rows / agency ${agencyRows.length} rows ===`,
    );
    for (const f of fields) {
      const o = populated(outletRows, f);
      const a = populated(agencyRows, f);
      let verdict: string;
      if (a === 0) {
        verdict = 'INCONCLUSIVE (agency sees none either — nothing to redact)';
        inconclusive += 1;
      } else if (o === 0) {
        verdict = 'PASS (hidden from outlet, still visible to agency)';
      } else {
        verdict = '*** FAIL — still leaking to the outlet ***';
        failures += 1;
      }
      console.log(
        `  ${f.padEnd(20)} outlet=${String(o).padStart(3)}  agency=${String(a).padStart(3)}  ${verdict}`,
      );
    }
  }

  console.log(
    `\n${failures === 0 ? 'NO LEAKS' : `${failures} LEAK(S)`}` +
      `${inconclusive > 0 ? ` — ${inconclusive} field(s) inconclusive (no live data to hide)` : ''}`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
