/**
 * Does an agency's Manage-PR profile edit actually PERSIST? (0089)
 *
 * The bug: the editor collected 14 fields, the web hook forwarded 4, and zod
 * stripped anything unknown while still returning 200 — so Race, KPI tier, Pay
 * class and the rest were discarded and the screen reported a save that never
 * happened. Four of them (place / years_exp / kpi_tier / pay_class) had no
 * column ANYWHERE until 0089 added them to `agency_pr`.
 *
 * SAFE ON THE SHARED DATABASE: reads the target PR first, writes probe values,
 * verifies the read-back, then RESTORES every original value it captured. The
 * only lasting change is `updated_at` / `updated_by`. It aborts before writing
 * anything if it cannot read the PR back.
 *
 * STALE-SERVER TRAP: a 200 proves nothing here — the OLD code also returned 200
 * while dropping the fields. That is the entire bug. So this asserts on the
 * READ-BACK values, and reports SKIP (never PASS) if the roster half is absent.
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/probe-pr-profile-save.ts
 */
import '@/env.js';

const BASE = process.env.PROBE_API_URL ?? 'http://localhost:7777/api/v1';
const AGENCY_EMAIL = process.env.PROBE_AGENCY_EMAIL ?? 'owner@atlas-agency.my';
const ORG_PASSWORD = process.env.PROBE_ORG_PASSWORD ?? 'Password123!';

let passed = 0;
let failed = 0;
let skipped = 0;

function check(label: string, ok: boolean, detail: string) {
  if (ok) {
    passed++;
    console.log(`  PASS  ${label} — ${detail}`);
  } else {
    failed++;
    console.log(`  FAIL  ${label} — ${detail}`);
  }
}

function skip(label: string, why: string) {
  skipped++;
  console.log(`  SKIP  ${label} — ${why}`);
}

type Body = { message?: string; data?: any };

async function call(path: string, init: RequestInit & { token?: string } = {}) {
  const { token, ...rest } = init;
  const res = await fetch(`${BASE}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(rest.headers ?? {}),
    },
  });
  let body: Body = {};
  try {
    body = (await res.json()) as Body;
  } catch {
    body = {};
  }
  return { status: res.status, body };
}

async function login(email: string, password: string): Promise<string | null> {
  const res = await call('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  return res.body.data?.accessToken ?? null;
}

async function main() {
  console.log(`\nMANAGE-PR PROFILE SAVE — live over HTTP against ${BASE}\n`);

  const token = await login(AGENCY_EMAIL, ORG_PASSWORD);
  if (!token) {
    console.error(`  ABORT — could not log in as ${AGENCY_EMAIL}`);
    process.exit(1);
  }

  const list = await call('/pr?pageSize=50', { token });
  const prs: any[] = list.body.data ?? [];
  // A PR with a linked user account: the user_profile half has nowhere to go
  // without one, and this probe must exercise both halves.
  const target = prs.find((p) => p.userId);
  if (!target) {
    skip('target PR', 'no PR on this roster has a linked user account');
    console.log(`\n  ${passed} passed, ${failed} failed, ${skipped} skipped\n`);
    return;
  }
  console.log(`  target: ${target.nickname ?? target.name} (${target.id})\n`);

  const before = (await call(`/pr/${target.id}`, { token })).body.data;
  if (!before) {
    console.error('  ABORT — could not read the PR back; writing nothing.');
    process.exit(1);
  }

  // Is the roster half even in the response? Absence here means a stale server
  // or an unapplied migration, NOT a passing test.
  const hasRosterKey = Object.hasOwn(before, 'roster');
  if (!hasRosterKey) {
    skip('roster in read', 'GET /pr/:id has no `roster` key — server is running pre-0089 code');
  }

  const originalProfile = {
    race: before.profile?.race ?? null,
    languages: before.profile?.languages ?? null,
    comcardHeightCm: before.profile?.comcardHeightCm ?? null,
    comcardWeightKg: before.profile?.comcardWeightKg ?? null,
  };
  const originalRoster = {
    place: before.roster?.place ?? null,
    yearsExp: before.roster?.yearsExp ?? null,
    kpiTier: before.roster?.kpiTier ?? null,
    payClass: before.roster?.payClass ?? null,
  };
  const originalTier = before.tier;

  const probe = {
    race: 'ProbeRace',
    languages: ['English', 'Hokkien'],
    comcardHeightCm: 161,
    comcardWeightKg: 46,
    place: 'ProbeTown',
    yearsExp: 7,
    kpiTier: 'C',
    payClass: 'commission_only',
    tier: 'tier_4',
  };

  const wrote = await call(`/pr/${target.id}`, {
    method: 'PUT',
    token,
    body: JSON.stringify(probe),
  });
  check('PUT accepted', wrote.status === 200, `status ${wrote.status} ${wrote.body.message ?? ''}`);

  const after = (await call(`/pr/${target.id}`, { token })).body.data;

  // --- user_profile half ---
  check(
    'race persisted',
    after?.profile?.race === probe.race,
    `read back ${JSON.stringify(after?.profile?.race)}`,
  );
  check(
    'languages persisted',
    JSON.stringify(after?.profile?.languages) === JSON.stringify(probe.languages),
    `read back ${JSON.stringify(after?.profile?.languages)}`,
  );
  check(
    'height persisted',
    after?.profile?.comcardHeightCm === probe.comcardHeightCm,
    `read back ${after?.profile?.comcardHeightCm}`,
  );
  check(
    'weight persisted',
    after?.profile?.comcardWeightKg === probe.comcardWeightKg,
    `read back ${after?.profile?.comcardWeightKg}`,
  );

  // --- pr half (the field the client simply forgot to send) ---
  check('tier persisted', after?.tier === probe.tier, `read back ${after?.tier}`);

  // --- agency_pr half (0089) ---
  if (hasRosterKey) {
    check(
      'place persisted',
      after?.roster?.place === probe.place,
      `read back ${JSON.stringify(after?.roster?.place)}`,
    );
    check(
      'yearsExp persisted',
      after?.roster?.yearsExp === probe.yearsExp,
      `read back ${after?.roster?.yearsExp}`,
    );
    check(
      'kpiTier persisted',
      after?.roster?.kpiTier === probe.kpiTier,
      `read back ${after?.roster?.kpiTier}`,
    );
    check(
      'payClass persisted',
      after?.roster?.payClass === probe.payClass,
      `read back ${after?.roster?.payClass}`,
    );
  } else {
    skip('roster round-trip', 'no roster key to compare');
  }

  // --- restore ---
  const restore: Record<string, unknown> = { tier: originalTier };
  for (const [k, v] of Object.entries({ ...originalProfile, ...originalRoster })) {
    if (v !== null && v !== undefined) restore[k] = v;
  }
  const restored = await call(`/pr/${target.id}`, {
    method: 'PUT',
    token,
    body: JSON.stringify(restore),
  });
  console.log(
    `\n  restored ${Object.keys(restore).join(', ')} -> status ${restored.status}` +
      `\n  (fields that were null before this run keep the probe value — there was nothing to restore)`,
  );

  console.log(`\n  ${passed} passed, ${failed} failed, ${skipped} skipped\n`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
