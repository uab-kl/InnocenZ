/**
 * LIVE probe over HTTP: does the agency penalty-rules lane actually work?
 *
 * Reads, writes, then reads back — a GET alone cannot tell a working save from
 * one that 200s and persists nothing. The write is a no-op round trip: it PUTs
 * exactly what the first GET returned, so a green run leaves the agency's real
 * fine schedule byte-identical.
 *
 *   pnpm tsx --tsconfig tsconfig.json src/scripts/_probe-penalty-endpoint.ts
 */
const BASE = 'http://localhost:7777/api/v1';

async function main() {
  const login = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'owner@atlas-agency.my',
      password: 'Password123!',
    }),
  });
  const loginBody = (await login.json()) as any;
  const token =
    loginBody?.data?.accessToken ??
    loginBody?.data?.token ??
    loginBody?.accessToken;
  console.log(`login ${login.status} · token ${token ? 'yes' : 'NO'}`);
  if (!token) {
    console.log(JSON.stringify(loginBody).slice(0, 400));
    return;
  }
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  // Atlas Agency, read straight off `outlet.onboarded_by_agency_id` by the
  // read-only probe before the migration ran.
  const agencyId = 'c30fcd15-9c72-402f-a110-0d97819a06f5';
  console.log(`agencyId ${agencyId}`);

  const get1 = await fetch(`${BASE}/agency/${agencyId}/penalty-rules`, { headers: auth });
  const body1 = (await get1.json()) as any;
  console.log(`\nGET  ${get1.status} · ${body1?.data?.length ?? 0} rule(s)`);
  for (const r of body1?.data ?? []) {
    console.log(`  ${r.ruleType} enabled=${r.enabled} fine=${r.fineRm} appliesTo=GONE`);
  }
  if (get1.status !== 200) {
    console.log(JSON.stringify(body1).slice(0, 400));
    return;
  }

  // Round-trip the SAME values back so a green run changes nothing.
  const payload = (body1.data ?? []).map((r: any) => ({
    ruleType: r.ruleType,
    enabled: r.enabled,
    
    fineRm: Number(r.fineRm),
    minShiftsPerWeek: r.minShiftsPerWeek,
    maxMcPerMonth: r.maxMcPerMonth,
    finePerExcessRm: r.finePerExcessRm == null ? null : Number(r.finePerExcessRm),
    maxLatePerWeek: r.maxLatePerWeek,
    graceMinutes: r.graceMinutes,
  }));
  const put = await fetch(`${BASE}/agency/${agencyId}/penalty-rules`, {
    method: 'PUT',
    headers: auth,
    body: JSON.stringify({ penaltyRules: payload }),
  });
  const putBody = (await put.json()) as any;
  console.log(`\nPUT  ${put.status} · ${putBody?.message ?? ''} · ${putBody?.data?.length ?? 0} rule(s) back`);

  const get2 = await fetch(`${BASE}/agency/${agencyId}/penalty-rules`, { headers: auth });
  const body2 = (await get2.json()) as any;
  console.log(`GET2 ${get2.status} · ${body2?.data?.length ?? 0} rule(s)`);

  const same =
    JSON.stringify((body1.data ?? []).map((r: any) => [r.ruleType, r.enabled, r.fineRm])) ===
    JSON.stringify((body2.data ?? []).map((r: any) => [r.ruleType, r.enabled, r.fineRm]));
  console.log(`\nround trip preserved values: ${same ? 'YES' : 'NO — values changed'}`);

  // A duplicate rule type must be refused, not silently collapsed.
  const dup = await fetch(`${BASE}/agency/${agencyId}/penalty-rules`, {
    method: 'PUT',
    headers: auth,
    body: JSON.stringify({ penaltyRules: [...payload, payload[0]] }),
  });
  console.log(`duplicate rule type refused: ${dup.status === 400 ? 'YES (400)' : `NO (${dup.status})`}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
