/**
 * Fires the MEMBER-MANAGEMENT guards against a running server.
 *
 * The member writes were admin-only until org owners were given them. Three
 * checks now stack, and each is fired here:
 *   1. route scope  — you own the org in `:id`                         (403)
 *   2. controller   — `:memberId` belongs to THAT org                  (404)
 *   3. guardMemberChange — never strand an org without an active owner (409)
 *
 * Check 2 is the subtle one and the reason this probe exists: the scope guard
 * validates `:id` while the write targets `:memberId`, so an owner passing their
 * OWN org id and a FOREIGN member id would otherwise pass every gate.
 *
 * SAFE ON THE SHARED DATABASE: every case is a refusal except one, and a
 * refusal writes nothing. The single writing case re-sends a member's CURRENT
 * subRole to itself, so it is idempotent — only `updated_at`/`updated_by` move.
 * No member is created or deleted by this script.
 *   npx tsx --tsconfig tsconfig.json src/scripts/probe-member-management.ts
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

type Member = { id: string; subRole: string; status: string; username?: string };

async function main() {
  console.log(`\nMEMBER MANAGEMENT GUARDS — live over HTTP against ${BASE}\n`);

  const agencyToken = await login(AGENCY_EMAIL, ORG_PASSWORD);
  const outletToken = await login(OUTLET_EMAIL, ORG_PASSWORD);
  if (!agencyToken || !outletToken) {
    console.error('  ABORT — could not log in as the agency and outlet owners');
    process.exit(1);
  }
  const adminToken =
    process.env.DEFAULT_ADMIN_EMAIL && process.env.DEFAULT_ADMIN_PASSWORD
      ? await login(process.env.DEFAULT_ADMIN_EMAIL, process.env.DEFAULT_ADMIN_PASSWORD)
      : null;

  const agencies = ((await call('/agency', { token: agencyToken })).body.data ?? []) as Array<{
    id: string;
    name: string;
  }>;
  const outlets = ((await call('/outlet', { token: outletToken })).body.data ?? []) as Array<{
    id: string;
    name: string;
  }>;
  const ownAgency = agencies.find((a) => /atlas/i.test(a.name));
  const otherAgency = agencies.find((a) => !/atlas/i.test(a.name));
  const ownOutlet = outlets.find((o) => /velvet/i.test(o.name));

  if (!ownAgency) {
    console.error("  ABORT — could not identify the caller's own agency");
    process.exit(1);
  }

  const membersOf = async (agencyId: string, token: string) =>
    ((await call(`/agency/${agencyId}/members`, { token })).body.data ?? []) as Member[];

  const ownMembers = await membersOf(ownAgency.id, agencyToken);
  const ownOwner = ownMembers.find((m) => m.subRole === 'owner' && m.status === 'active');
  const ownFinance = ownMembers.find((m) => m.subRole === 'finance');
  const activeOwners = ownMembers.filter((m) => m.subRole === 'owner' && m.status === 'active');
  console.log(
    `  own agency members: ${ownMembers.length} (active owners: ${activeOwners.length})\n`,
  );

  // ---- 1. the subtle one: own org id, FOREIGN member id --------------------
  if (!otherAgency) {
    skip('foreign :memberId under own :id', 'no second agency on this database');
  } else {
    const foreign = await membersOf(otherAgency.id, agencyToken);
    const victim = foreign[0];
    if (!victim) {
      skip('foreign :memberId under own :id', 'the other agency has no members to name');
    } else {
      const res = await call(`/agency/${ownAgency.id}/members/${victim.id}`, {
        method: 'PUT',
        token: agencyToken,
        body: JSON.stringify({ subRole: victim.subRole }),
      });
      check(
        'own :id + FOREIGN :memberId PUT → refused',
        res.status === 404,
        `${res.status} "${res.body.message ?? ''}" (target belonged to ${otherAgency.name})`,
      );
      const del = await call(`/agency/${ownAgency.id}/members/${victim.id}`, {
        method: 'DELETE',
        token: agencyToken,
      });
      check(
        'own :id + FOREIGN :memberId DELETE → refused',
        del.status === 404,
        `${del.status} "${del.body.message ?? ''}"`,
      );
      const still = await membersOf(otherAgency.id, agencyToken);
      check(
        'the foreign member still exists after both attempts',
        still.some((m) => m.id === victim.id),
        `${still.length} members remain in ${otherAgency.name}`,
      );
    }
  }

  // ---- 2. last-owner guard -------------------------------------------------
  if (!ownOwner) {
    skip('last-owner guard', 'no active owner row found to target');
  } else if (activeOwners.length !== 1) {
    skip(
      'last-owner guard',
      `agency has ${activeOwners.length} active owners — the rule only bites at exactly 1`,
    );
  } else {
    const demote = await call(`/agency/${ownAgency.id}/members/${ownOwner.id}`, {
      method: 'PUT',
      token: agencyToken,
      body: JSON.stringify({ subRole: 'finance' }),
    });
    check(
      'demoting the LAST active owner → refused',
      demote.status === 409 && /last active owner/i.test(demote.body.message ?? ''),
      `${demote.status} "${demote.body.message ?? ''}"`,
    );

    const remove = await call(`/agency/${ownAgency.id}/members/${ownOwner.id}`, {
      method: 'DELETE',
      token: agencyToken,
    });
    check(
      'removing the LAST active owner → refused',
      remove.status === 409 && /last active owner/i.test(remove.body.message ?? ''),
      `${remove.status} "${remove.body.message ?? ''}"`,
    );

    const deactivate = await call(`/agency/${ownAgency.id}/members/${ownOwner.id}`, {
      method: 'PUT',
      token: agencyToken,
      body: JSON.stringify({ status: 'suspended' }),
    });
    check(
      'deactivating the LAST active owner → refused',
      deactivate.status === 409 && /last active owner/i.test(deactivate.body.message ?? ''),
      `${deactivate.status} "${deactivate.body.message ?? ''}"`,
    );

    const after = await membersOf(ownAgency.id, agencyToken);
    const stillOwner = after.find((m) => m.id === ownOwner.id);
    check(
      'the owner row is untouched after three refusals',
      stillOwner?.subRole === 'owner' && stillOwner?.status === 'active',
      `subRole=${stillOwner?.subRole} status=${stillOwner?.status}`,
    );
  }

  // ---- 3. a non-owner may not write members --------------------------------
  // Fired with the OUTLET owner's token against the AGENCY: they hold no agency
  // membership at all, so the org-level role gate should refuse first.
  {
    const res = await call(`/agency/${ownAgency.id}/members/${ownOwner?.id ?? 'x'}`, {
      method: 'PUT',
      token: outletToken,
      body: JSON.stringify({ subRole: 'finance' }),
    });
    check(
      'an outlet operator writing AGENCY members → refused',
      res.status === 403,
      `${res.status} "${res.body.message ?? ''}"`,
    );
  }

  // ---- 4. the happy path (idempotent: re-sends the member's own subRole) ----
  if (!ownFinance) {
    skip('owner updates a member of their own agency', 'no finance member to re-send');
  } else {
    const res = await call(`/agency/${ownAgency.id}/members/${ownFinance.id}`, {
      method: 'PUT',
      token: agencyToken,
      body: JSON.stringify({ subRole: ownFinance.subRole }),
    });
    check(
      'owner updates a member of their OWN agency (same value)',
      res.status === 200,
      `${res.status} "${res.body.message ?? ''}" — re-sent subRole=${ownFinance.subRole}`,
    );
  }

  // ---- 5. admin must still pass -------------------------------------------
  if (!adminToken || !ownFinance) {
    skip('admin updates a member', 'no admin credentials, or no member to re-send');
  } else {
    const res = await call(`/agency/${ownAgency.id}/members/${ownFinance.id}`, {
      method: 'PUT',
      token: adminToken,
      body: JSON.stringify({ subRole: ownFinance.subRole }),
    });
    check(
      'admin updates a member of an agency they do not belong to',
      res.status === 200,
      `${res.status} — isAdmin must short-circuit ahead of every scope test`,
    );
  }

  // ---- 6. the outlet side, cross-venue -------------------------------------
  if (!ownOutlet) {
    skip('outlet cross-venue :memberId', "could not identify the operator's own outlet");
  } else {
    const otherOutlet = outlets.find((o) => !/velvet/i.test(o.name));
    if (!otherOutlet) {
      skip('outlet cross-venue :memberId', 'no second outlet visible');
    } else {
      const foreign = ((await call(`/outlet/${otherOutlet.id}/members`, { token: outletToken })).body
        .data ?? []) as Member[];
      if (foreign.length === 0) {
        skip('outlet cross-venue :memberId', `${otherOutlet.name} has no members to name`);
      } else {
        const res = await call(`/outlet/${ownOutlet.id}/members/${foreign[0].id}`, {
          method: 'PUT',
          token: outletToken,
          body: JSON.stringify({ subRole: foreign[0].subRole }),
        });
        check(
          'outlet: own :id + FOREIGN :memberId → refused',
          res.status === 404,
          `${res.status} "${res.body.message ?? ''}" (target belonged to ${otherOutlet.name})`,
        );
      }
    }
  }

  console.log(`\n  ${passed} passed · ${failed} failed · ${skipped} skipped\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
