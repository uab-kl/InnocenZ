/**
 * Fires the OVERTIME refusals against a running server.
 *
 * Every case here is a REFUSAL, and that is the whole point: a refusal writes
 * nothing, so this proves the lane over HTTP without putting a single row on the
 * shared database. The one path deliberately NOT exercised is a successful
 * approval — that writes real money onto a real voucher and is the owner's call.
 *
 * KEPT rather than thrown away, unlike most probes here: it mutates nothing, so
 * it is safe to re-run against the shared database any time the overtime lane
 * or its guards are touched. Needs a backend running and reachable.
 *   npx tsx --tsconfig tsconfig.json src/scripts/probe-overtime-refusals.ts
 */
import '@/env.js';

const BASE = process.env.PROBE_API_URL ?? 'http://localhost:7777/api/v1';
const EMAIL = process.env.DEFAULT_ADMIN_EMAIL;
const PASSWORD = process.env.DEFAULT_ADMIN_PASSWORD;

// A syntactically valid uuid that cannot name a row — for the 404 arm.
const ABSENT_UUID = '00000000-0000-4000-8000-000000000000';

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, detail: string) {
  if (ok) {
    passed++;
    console.log(`  PASS  ${label} — ${detail}`);
  } else {
    failed++;
    console.log(`  FAIL  ${label} — ${detail}`);
  }
}

async function call(
  path: string,
  init: RequestInit & { token?: string } = {},
): Promise<{ status: number; body: { message?: string; data?: unknown } }> {
  const { token, ...rest } = init;
  const res = await fetch(`${BASE}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(rest.headers ?? {}),
    },
  });
  let body: { message?: string; data?: unknown } = {};
  try {
    body = (await res.json()) as typeof body;
  } catch {
    body = {};
  }
  return { status: res.status, body };
}

async function main() {
  if (!EMAIL || !PASSWORD) {
    console.error('DEFAULT_ADMIN_EMAIL / DEFAULT_ADMIN_PASSWORD are not set — cannot log in.');
    process.exit(1);
  }

  console.log(`\nOVERTIME REFUSALS — live over HTTP against ${BASE}\n`);

  const login = await call('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const token = (login.body.data as { accessToken?: string } | undefined)?.accessToken;
  if (!token) {
    console.error(`Login failed (${login.status}): ${login.body.message ?? 'no message'}`);
    process.exit(1);
  }
  console.log('  (logged in as admin)\n');

  // Guards against the trap in memory: the backend on 7777 may be someone
  // else's process running stale code while answering /health 200. A 404 here
  // means the routes under test do not exist on this server, so every refusal
  // below would "pass" for entirely the wrong reason.
  const routeProbe = await call('/shift-assignment/overtime/pending', { token });
  if (routeProbe.status === 404) {
    console.error('  ABORT — /shift-assignment/overtime/pending is 404 on this server.');
    console.error('  It is running code older than the overtime build. Start your own backend.');
    process.exit(1);
  }

  // 1. admin with no agencyId is a 400, not a silent empty list.
  check(
    'admin without agencyId',
    routeProbe.status === 400 && /agencyId is required/i.test(routeProbe.body.message ?? ''),
    `${routeProbe.status} "${routeProbe.body.message}"`,
  );

  // 2. the worklist itself, scoped to a real agency.
  const assignments = await call('/shift-assignment?pageSize=1', { token });
  const firstAssignment = (
    assignments.body.data as Array<{ id: string; agencyId: string }> | undefined
  )?.[0];
  if (!firstAssignment) {
    console.error('  ABORT — no shift assignments on this database to probe against.');
    process.exit(1);
  }

  const worklist = await call(
    `/shift-assignment/overtime/pending?agencyId=${firstAssignment.agencyId}`,
    { token },
  );
  const claims = (worklist.body.data as unknown[] | undefined) ?? [];
  check(
    'the worklist answers for a real agency',
    worklist.status === 200 && Array.isArray(claims),
    `${worklist.status} with ${claims.length} pending claim(s)`,
  );

  // Every claim must arrive PRICED — the screen is forbidden from deriving its
  // own figure, so a null amount would make that rule unimplementable.
  // Reported as SKIPPED rather than PASSED when the list is empty. A check that
  // goes green over zero rows asserts nothing, and dressing that up as a pass is
  // precisely the kind of green signal this project has been bitten by.
  const unpriced = (claims as Array<{ amount?: string; week?: unknown }>).filter(
    (c) => !c.amount || !c.week,
  );
  if (claims.length === 0) {
    console.log(
      '  SKIP  every claim arrives priced and week-stamped — no pending claims exist, so this asserts nothing',
    );
  } else {
    check(
      'every claim arrives priced and week-stamped',
      unpriced.length === 0,
      `${claims.length - unpriced.length}/${claims.length} carry both amount and week`,
    );
  }

  // 3. a decision that is neither approve nor reject is a 400.
  const badDecision = await call(`/shift-assignment/${firstAssignment.id}/overtime`, {
    method: 'PATCH',
    token,
    body: JSON.stringify({ decision: 'maybe' }),
  });
  check(
    'a bogus decision is refused',
    badDecision.status === 400 && /approve/.test(badDecision.body.message ?? ''),
    `${badDecision.status} "${badDecision.body.message}"`,
  );

  // 4. an absent assignment is a 404.
  const absent = await call(`/shift-assignment/${ABSENT_UUID}/overtime`, {
    method: 'PATCH',
    token,
    body: JSON.stringify({ decision: 'reject' }),
  });
  check(
    'an assignment that does not exist is a 404',
    absent.status === 404,
    `${absent.status} "${absent.body.message}"`,
  );

  // 5. a shift carrying NO overtime claim is a 409. This arm proves that "no
  // claim" is told apart from a malformed request — the distinction a screen
  // needs in order to decide whether to re-fetch.
  const noClaim = await call(`/shift-assignment/${firstAssignment.id}/overtime`, {
    method: 'PATCH',
    token,
    body: JSON.stringify({ decision: 'approve' }),
  });
  check(
    'a shift with no overtime claim is a 409, not a 400 and not a 0.00 line',
    noClaim.status === 409,
    `${noClaim.status} "${noClaim.body.message}"`,
  );

  console.log(`\n${passed} passed, ${failed} failed\n`);
  console.log('NOT exercised on purpose: a successful APPROVAL. That writes real');
  console.log('money onto a real voucher on the shared database.\n');
  process.exit(failed === 0 ? 0 : 1);
}

void main();
