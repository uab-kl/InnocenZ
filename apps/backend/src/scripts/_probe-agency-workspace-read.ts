/**
 * READ-ONLY. Fires the exact two reads the agency portal now makes for the
 * "Rates by PR tier" table on Manage Outlet, as a real AGENCY owner against a
 * running server:
 *
 * 1. `GET /outlet` — the agency's outlet directory. The new
 *    `useAgencyOutletWorkspace` hook resolves an outlet NAME to an id through
 *    this list; if the outlet is missing here the workspace can never be
 *    fetched, and the panel correctly shows nothing rather than demo money.
 * 2. `GET /outlet-workspace/:outletId` — the SAME row the outlet portal writes
 *    from its Workspace screen. The claim under test: the agency screen used to
 *    read the local demo store instead, so an outlet's edited rates never
 *    appeared there. This asserts an agency token can read the real ladder.
 *
 * Nothing is written — a login plus two GETs.
 *   npx tsx --tsconfig tsconfig.json src/scripts/_probe-agency-workspace-read.ts
 */
import '@/env.js';

const BASE = process.env.PROBE_API_URL ?? 'http://localhost:7777/api/v1';
const AGENCY_EMAIL = process.env.PROBE_AGENCY_EMAIL ?? 'owner@atlas-agency.my';
const ORG_PASSWORD = process.env.PROBE_ORG_PASSWORD ?? 'Password123!';
const OUTLET_NAME = process.env.PROBE_OUTLET_NAME ?? 'Testing 2';

type Body = { message?: string; data?: unknown };

async function call(path: string, token?: string): Promise<{ status: number; body: Body }> {
  const res = await fetch(`${BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Body };
}

async function main() {
  const loginRes = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: AGENCY_EMAIL, password: ORG_PASSWORD }),
  });
  const login = (await loginRes.json()) as { data?: { accessToken?: string } };
  const token = login.data?.accessToken;
  console.log('LOGIN', AGENCY_EMAIL, loginRes.status, token ? 'token ok' : 'NO TOKEN');
  if (!token) {
    console.log(JSON.stringify(login).slice(0, 400));
    process.exit(1);
  }

  const dir = await call('/outlet?pageSize=200', token);
  const outlets = (dir.body.data ?? []) as { id: string; name: string }[];
  console.log('\n1) OUTLET DIRECTORY:', dir.status, `${outlets.length} outlets`);
  const match = outlets.find((o) => o.name === OUTLET_NAME);
  console.log('   resolved', JSON.stringify(OUTLET_NAME), '->', match?.id ?? 'NOT IN DIRECTORY');
  if (!match) process.exit(1);

  const ws = await call(`/outlet-workspace/${match.id}`, token);
  console.log('\n2) GET /outlet-workspace/:outletId ->', ws.status);
  const record = ws.body.data as
    | {
        tierRates?: {
          kind: string;
          tier: string | null;
          dailyWage?: string | null;
          wagePerHour?: string | null;
          drinkPct: string;
          happyHourDrinkPct: string | null;
          tipPct: string;
        }[];
      }
    | null
    | undefined;
  if (!record?.tierRates) {
    console.log('   NO WORKSPACE BODY:', JSON.stringify(ws.body).slice(0, 400));
    process.exit(1);
  }
  for (const r of record.tierRates) {
    console.log(
      `   ${(r.tier ?? r.kind).padEnd(16)} wage=${r.dailyWage ?? r.wagePerHour ?? '—'}  nh=${r.drinkPct}%  hh=${r.happyHourDrinkPct ?? '—'}%  tips=${r.tipPct}%`,
    );
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
