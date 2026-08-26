/**
 * Fires the new DELETE /rbac/role/:id against a running server.
 *
 * SAFE ON THE SHARED DATABASE, by construction:
 *   - It deletes ONLY a role it just created, named with a probe- prefix and a
 *     timestamp so a crashed run leaves an identifiable orphan, not a mystery.
 *   - The seeded-role case sends the DELETE at outlet Owner and PASSES only on
 *     a 409 whose message the new code alone can produce; if the guard were
 *     missing, Owner has live grants and the FKs are ON DELETE NO ACTION, so
 *     Postgres itself would refuse — the probe cannot destroy it even by
 *     failing.
 *   - The blocked-delete case grants the throwaway role ONE permission, expects
 *     the 409 naming it, then clears the grant and deletes for real.
 *
 * STALE-SERVER TRAP (same as probe-org-scope-guard): every refusal is matched
 * on its MESSAGE, which only the new code can produce — a bare status is not
 * proof the new router is loaded.
 *   npx tsx --tsconfig tsconfig.json src/scripts/_probe-role-delete.ts
 */
import '@/env.js';

const BASE = process.env.PROBE_API_URL ?? 'http://localhost:7777/api/v1';

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

type Body = { success?: boolean; message?: string; data?: unknown };

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
  const data = res.body.data as { accessToken?: string; access_token?: string } | undefined;
  return data?.accessToken ?? data?.access_token ?? null;
}

function deletedSentence(message: string, name: string): boolean {
  return message.includes(name) && /deleted/i.test(message);
}

async function main() {
  if (!process.env.DEFAULT_ADMIN_EMAIL || !process.env.DEFAULT_ADMIN_PASSWORD) {
    console.log('DEFAULT_ADMIN_EMAIL / DEFAULT_ADMIN_PASSWORD not in env — cannot run.');
    process.exit(2);
  }
  const admin = await login(process.env.DEFAULT_ADMIN_EMAIL, process.env.DEFAULT_ADMIN_PASSWORD);
  if (!admin) {
    console.log('Admin login failed — cannot run.');
    process.exit(2);
  }

  // 1. The list stamps isSeeded on every row.
  const list = await call('/rbac/role', { token: admin });
  const roles = (list.body.data ?? []) as Array<{
    id: string;
    roleName: string;
    status: string;
    isSeeded?: boolean;
  }>;
  const seeded = roles.filter((r) => r.isSeeded === true);
  const custom = roles.filter((r) => r.isSeeded !== true);
  check(
    'list stamps isSeeded',
    list.status === 200 && seeded.length > 0 && roles.every((r) => typeof r.isSeeded === 'boolean'),
    `${roles.length} roles, ${seeded.length} seeded, custom: ${custom.map((r) => r.roleName).join(', ') || 'none'}`,
  );

  // 2. A seeded role refuses with the built-in sentence.
  const owner = seeded.find((r) => r.roleName.toLowerCase() === 'owner');
  if (owner) {
    const res = await call(`/rbac/role/${owner.id}`, { method: 'DELETE', token: admin });
    check(
      'seeded role refused',
      res.status === 409 && /built into the platform/.test(res.body.message ?? ''),
      `${res.status} "${res.body.message ?? ''}"`,
    );
  } else {
    check('seeded role refused', false, 'no seeded Owner in list to fire at');
  }

  // 3. Create a throwaway role on the outlet portal.
  const portals = await call('/rbac/portal', { token: admin });
  const outletPortal = ((portals.body.data ?? []) as Array<{ id: string; code: string }>).find(
    (p) => p.code === 'outlet',
  );
  const name = `probe-del-${Date.now()}`;
  const created = await call('/rbac/role', {
    method: 'POST',
    token: admin,
    body: JSON.stringify({ roleName: name, portalId: outletPortal?.id ?? null }),
  });
  const roleId = (created.body.data as { id?: string } | undefined)?.id;
  check(
    'throwaway role created',
    (created.status === 201 || created.status === 200) && !!roleId,
    `${created.status} id=${roleId ?? 'none'}`,
  );
  if (!roleId) {
    console.log(`\n${passed} passed, ${failed} failed — aborting before delete cases.`);
    process.exit(failed ? 1 : 0);
  }

  // 4. Grant it ONE permission, then expect the delete to refuse and NAME it.
  const perms = await call('/rbac/permission?page=1&pageSize=1', { token: admin });
  const firstPerm = ((perms.body.data ?? []) as Array<{ id: string }>)[0];
  let blockedChecked = false;
  if (firstPerm) {
    const grant = await call(`/rbac/role-permission/update/${roleId}`, {
      method: 'PUT',
      token: admin,
      body: JSON.stringify({ permissionIds: [firstPerm.id] }),
    });
    if (grant.status === 200) {
      const res = await call(`/rbac/role/${roleId}`, { method: 'DELETE', token: admin });
      check(
        'referenced role refused, blocker named',
        res.status === 409 && /1 module permission/.test(res.body.message ?? ''),
        `${res.status} "${res.body.message ?? ''}"`,
      );
      blockedChecked = true;
      await call(`/rbac/role-permission/update/${roleId}`, {
        method: 'PUT',
        token: admin,
        body: JSON.stringify({ permissionIds: [] }),
      });
    }
  }
  if (!blockedChecked) {
    check(
      'referenced role refused, blocker named',
      false,
      'could not grant a permission to set the case up',
    );
  }

  // 5. Unreferenced now — the delete succeeds and names the role.
  const del = await call(`/rbac/role/${roleId}`, { method: 'DELETE', token: admin });
  check(
    'unreferenced custom role deleted',
    del.status === 200 && deletedSentence(del.body.message ?? '', name),
    `${del.status} "${del.body.message ?? ''}"`,
  );

  // 6. And it is genuinely gone.
  const gone = await call(`/rbac/role/${roleId}`, { token: admin });
  check('deleted role is gone', gone.status === 404, `GET after delete -> ${gone.status}`);

  console.log(`\n${passed} passed, ${failed} failed.`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error('probe crashed:', err);
  process.exit(2);
});
