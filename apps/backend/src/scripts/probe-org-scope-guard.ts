/**
 * Fires the SCOPED ORG-OWNER guard (`d513e5c`) against a running server.
 *
 * The hole it closed: `agencyOwnerOnly` asked "are you an active owner?" and
 * never compared the membership to `req.params.id`, so any agency owner could
 * rewrite any agency and any outlet owner could move another venue's geo-fence.
 *
 * SAFE ON THE SHARED DATABASE, by construction:
 *   - Every cross-tenant case sends the TARGET'S OWN CURRENT VALUES, read back
 *     immediately before. If the guard works the request is refused and nothing
 *     is written; if the guard were absent or stale, the write is idempotent and
 *     corrupts nothing. A probe for a guard must be harmless when the guard is
 *     the thing that is broken.
 *   - The two `200` cases re-send a row's own values to itself, so the only
 *     lasting change is `updated_at` / `updated_by`.
 *   - The cross-tenant DELETE geo-fence is deliberately SKIPPED: it is the one
 *     case with no idempotent form, and if the guard failed it would unfence a
 *     venue that every check-in is measured against.
 *
 * STALE-SERVER TRAP: /health answering 200 says nothing about which code is
 * running. A 403 alone does not prove the fix either — the OLD guard also 403s,
 * just for a different reason. So every refusal is matched on its MESSAGE, which
 * only the new code can produce.
 *   npx tsx --tsconfig tsconfig.json src/scripts/probe-org-scope-guard.ts
 */
import '@/env.js';

const BASE = process.env.PROBE_API_URL ?? 'http://localhost:7777/api/v1';
const AGENCY_EMAIL = process.env.PROBE_AGENCY_EMAIL ?? 'owner@atlas-agency.my';
const OUTLET_EMAIL = process.env.PROBE_OUTLET_EMAIL ?? 'owner@velvet23.my';
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

type Body = { message?: string; data?: unknown };

async function call(
  path: string,
  init: RequestInit & { token?: string } = {},
): Promise<{ status: number; body: Body }> {
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
  return (res.body.data as { accessToken?: string } | undefined)?.accessToken ?? null;
}

/** Only defined, non-empty strings — the update schemas are `.optional()`, not nullable. */
function echoFields(row: Record<string, unknown>, keys: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of keys) {
    const v = row[k];
    if (typeof v === 'string' && v.length > 0) out[k] = v;
  }
  return out;
}

async function main() {
  console.log(`\nSCOPED ORG-OWNER GUARD — live over HTTP against ${BASE}\n`);

  const agencyToken = await login(AGENCY_EMAIL, ORG_PASSWORD);
  if (!agencyToken) {
    console.error(`  ABORT — could not log in as ${AGENCY_EMAIL}`);
    process.exit(1);
  }
  const outletToken = await login(OUTLET_EMAIL, ORG_PASSWORD);
  if (!outletToken) {
    console.error(`  ABORT — could not log in as ${OUTLET_EMAIL}`);
    process.exit(1);
  }
  const adminToken =
    process.env.DEFAULT_ADMIN_EMAIL && process.env.DEFAULT_ADMIN_PASSWORD
      ? await login(process.env.DEFAULT_ADMIN_EMAIL, process.env.DEFAULT_ADMIN_PASSWORD)
      : null;
  console.log(`  (logged in: agency, outlet${adminToken ? ', admin' : ', NO admin'})\n`);

  const agencyList = ((await call('/agency', { token: agencyToken })).body.data ??
    []) as Array<Record<string, unknown>>;
  const outletList = ((await call('/outlet', { token: outletToken })).body.data ??
    []) as Array<Record<string, unknown>>;

  const ownAgency = agencyList.find((a) => /atlas/i.test((a.name as string) ?? '')) ?? null;
  const otherAgency = agencyList.find((a) => !/atlas/i.test((a.name as string) ?? '')) ?? null;
  const ownOutlet = outletList.find((o) => /velvet/i.test((o.name as string) ?? '')) ?? null;
  const otherOutlet = outletList.find((o) => !/velvet/i.test((o.name as string) ?? '')) ?? null;

  console.log(`  agencies visible: ${agencyList.length} · outlets visible: ${outletList.length}\n`);

  // ---- 1. cross-tenant agency write ---------------------------------------
  if (!otherAgency) {
    skip('agency cross-tenant PUT', 'no second agency on this database — cannot compare');
  } else {
    const id = otherAgency.id as string;
    const echo = echoFields(otherAgency, [
      'name',
      'ssmNo',
      'contactName',
      'contactEmail',
      'contactPhone',
    ]);
    const res = await call(`/agency/${id}`, {
      method: 'PUT',
      token: agencyToken,
      body: JSON.stringify(echo),
    });
    check(
      'agency owner → PUT another agency',
      res.status === 403 && /not a member of this organisation/i.test(res.body.message ?? ''),
      `${res.status} "${res.body.message ?? ''}" (target ${(otherAgency.name as string) ?? id})`,
    );
  }

  // ---- 2. status is refused, not dropped ----------------------------------
  if (!ownAgency) {
    skip('agency status refusal', "could not identify the owner's own agency");
  } else {
    const id = ownAgency.id as string;
    const res = await call(`/agency/${id}`, {
      method: 'PUT',
      token: agencyToken,
      body: JSON.stringify({ ...echoFields(ownAgency, ['name']), status: 'active' }),
    });
    check(
      'agency owner → PUT own agency WITH status',
      res.status === 403 && /status is set by admin approval/i.test(res.body.message ?? ''),
      `${res.status} "${res.body.message ?? ''}"`,
    );
  }

  // ---- 3. the happy path (the only writing case) --------------------------
  if (!ownAgency) {
    skip('agency own PUT', "could not identify the owner's own agency");
  } else {
    const id = ownAgency.id as string;
    const echo = echoFields(ownAgency, [
      'name',
      'ssmNo',
      'contactName',
      'contactEmail',
      'contactPhone',
    ]);
    const res = await call(`/agency/${id}`, {
      method: 'PUT',
      token: agencyToken,
      body: JSON.stringify(echo),
    });
    check(
      'agency owner → PUT OWN agency (same values)',
      res.status === 200,
      `${res.status} "${res.body.message ?? ''}" — echoed ${Object.keys(echo).join(', ')}`,
    );
  }

  // ---- 4/5. cross-tenant outlet write + geo-fence --------------------------
  if (!otherOutlet) {
    skip('outlet cross-tenant PUT', 'no second outlet visible — cannot compare');
    skip('outlet cross-tenant geo-fence PATCH', 'no second outlet visible');
  } else {
    const id = otherOutlet.id as string;
    const res = await call(`/outlet/${id}`, {
      method: 'PUT',
      token: outletToken,
      body: JSON.stringify(echoFields(otherOutlet, ['name', 'address', 'contactPhone'])),
    });
    check(
      'outlet owner → PUT another outlet',
      res.status === 403 && /not a member of this organisation/i.test(res.body.message ?? ''),
      `${res.status} "${res.body.message ?? ''}" (target ${(otherOutlet.name as string) ?? id})`,
    );

    // ⚠️ The columns are `lat`/`lng`/`geoFenceRadius`. The first run of this
    // probe guessed `geoFenceLat`/`latitude` and reported SKIP "target venue has
    // no pin" — a PROBE defect wearing the costume of a fact about the data, on
    // the one case that matters most here. Every outlet is pinned. pg `decimal`
    // arrives as a string, so coerce before sending.
    const lat = otherOutlet.lat == null ? null : Number(otherOutlet.lat);
    const lng = otherOutlet.lng == null ? null : Number(otherOutlet.lng);
    const radius = otherOutlet.geoFenceRadius == null ? 50 : Number(otherOutlet.geoFenceRadius);
    if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) {
      skip('outlet cross-tenant geo-fence PATCH', 'target venue genuinely has no pin to echo back');
    } else {
      const fence = await call(`/outlet/${id}/geo-fence`, {
        method: 'PATCH',
        token: outletToken,
        body: JSON.stringify({ lat, lng, geoFenceRadius: radius }),
      });
      check(
        'outlet owner → PATCH another venue geo-fence',
        fence.status === 403 && /not a member of this organisation/i.test(fence.body.message ?? ''),
        `${fence.status} "${fence.body.message ?? ''}"`,
      );
    }
  }

  skip(
    'outlet owner → DELETE another venue geo-fence',
    'no idempotent form: if the guard failed this would unfence a live venue',
  );

  // ---- 6. outlet happy path ------------------------------------------------
  if (!ownOutlet) {
    skip('outlet own PUT', "could not identify the operator's own outlet");
  } else {
    const id = ownOutlet.id as string;
    const echo = echoFields(ownOutlet, ['name', 'address', 'contactPhone']);
    const res = await call(`/outlet/${id}`, {
      method: 'PUT',
      token: outletToken,
      body: JSON.stringify(echo),
    });
    check(
      'outlet owner → PUT OWN outlet (same values)',
      res.status === 200,
      `${res.status} "${res.body.message ?? ''}" — echoed ${Object.keys(echo).join(', ')}`,
    );
  }

  // ---- 7. admin must NOT be caught by the scope test ------------------------
  // The check that matters most on a denial rule: nothing newly locked out.
  if (!adminToken || !otherAgency) {
    skip('admin → PUT an agency', 'no admin credentials in env, or no agency to target');
  } else {
    const id = otherAgency.id as string;
    const res = await call(`/agency/${id}`, {
      method: 'PUT',
      token: adminToken,
      body: JSON.stringify(
        echoFields(otherAgency, ['name', 'ssmNo', 'contactName', 'contactEmail', 'contactPhone']),
      ),
    });
    check(
      'admin → PUT an agency they hold no membership in',
      res.status === 200,
      `${res.status} "${res.body.message ?? ''}" — isAdmin must short-circuit ahead of the scope test`,
    );
  }

  console.log(`\n  ${passed} passed · ${failed} failed · ${skipped} skipped\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
