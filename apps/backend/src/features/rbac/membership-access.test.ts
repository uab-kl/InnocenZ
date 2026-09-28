import { getTableName, type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * WHAT A MEMBERSHIP CHANGE MUST ALSO CHANGE — `membership-access.ts`.
 *
 * The finding (28 Sep 2026): demoting a member did not reduce what the server
 * let them do. The old prune only ran for somebody with ONE membership of that
 * kind, invite acceptance only ever added, and a failed title write still came
 * back 200. Pinned here:
 *
 *  - the recompute leaves EXACTLY one role per distinct active lane — it adds
 *    what is missing, removes what is stale, touches nothing on another portal;
 *  - it runs inside the caller's transaction, lock first, grant before revoke;
 *  - a falsy membership write, an unseeded role or a failed revoke aborts the
 *    whole change (the transaction rejects, so the caller rolls back);
 *  - pending invitations are withdrawn by org + address + `pending`, and only
 *    when the change is a new title or a departure.
 */

const h = vi.hoisted(() => ({
  tx: null as unknown,
  rolledBack: 0,
}));

vi.mock('@/db/index', () => ({
  db: {
    // One connection's worth of behaviour: run the callback against the fake
    // transaction; a throw is what drizzle turns into ROLLBACK.
    transaction: async (cb: (tx: unknown) => Promise<unknown>) => {
      try {
        return await cb(h.tx);
      } catch (error) {
        h.rolledBack += 1;
        throw error;
      }
    },
  },
}));
vi.mock('@/util/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  changeWithdrawsInvites,
  commitMembershipChange,
  MembershipChangeNotSavedError,
  planPortalRoleSync,
  PortalRoleNotSeededError,
  type PortalRoleRef,
  type PortalRoleStore,
  portalRoleStore,
  resyncPortalRoles,
  syncPortalRoles,
} from './membership-access';

const AGENCY_ROLES: PortalRoleRef[] = [
  { roleId: 'a-owner', roleName: 'Owner' },
  { roleId: 'a-finance', roleName: 'Finance' },
  { roleId: 'a-director', roleName: 'Director' },
  { roleId: 'a-guarantor', roleName: 'Guarantor' },
];
const OUTLET_ROLES: PortalRoleRef[] = [
  { roleId: 'o-owner', roleName: 'Owner' },
  { roleId: 'o-finance', roleName: 'Finance' },
  { roleId: 'o-ops', roleName: 'Ops Head' },
  { roleId: 'o-director', roleName: 'Director' },
  { roleId: 'o-guarantor', roleName: 'Guarantor' },
];
const role = (roles: PortalRoleRef[], name: string) =>
  roles.find((r) => r.roleName === name)!;

describe('planPortalRoleSync — one role per distinct ACTIVE lane, nothing else', () => {
  it('a demotion at the only agency swaps the role', () => {
    const plan = planPortalRoleSync({
      org: 'agency',
      activeLanes: ['director'],
      held: [role(AGENCY_ROLES, 'Owner')],
      defined: AGENCY_ROLES,
    });
    expect(plan.grant.map((r) => r.roleName)).toEqual(['Director']);
    expect(plan.revoke.map((r) => r.roleName)).toEqual(['Owner']);
    expect(plan.missing).toEqual([]);
  });

  it('THE BUG: owner at A demoted to director while director at B loses the Owner role', () => {
    // The old prune skipped this case outright ("elsewhere.length > 0").
    const plan = planPortalRoleSync({
      org: 'agency',
      activeLanes: ['director', 'director'],
      held: [role(AGENCY_ROLES, 'Owner'), role(AGENCY_ROLES, 'Director')],
      defined: AGENCY_ROLES,
    });
    expect(plan.grant).toEqual([]);
    expect(plan.revoke.map((r) => r.roleName)).toEqual(['Owner']);
  });

  it('a legitimate second title elsewhere is KEPT', () => {
    const plan = planPortalRoleSync({
      org: 'agency',
      activeLanes: ['finance', 'owner'],
      held: [role(AGENCY_ROLES, 'Owner'), role(AGENCY_ROLES, 'Director')],
      defined: AGENCY_ROLES,
    });
    expect(plan.grant.map((r) => r.roleName)).toEqual(['Finance']);
    expect(plan.revoke.map((r) => r.roleName)).toEqual(['Director']);
  });

  it('three venues on one lane need ONE row', () => {
    const plan = planPortalRoleSync({
      org: 'outlet',
      activeLanes: ['finance', 'finance', 'finance'],
      held: [],
      defined: OUTLET_ROLES,
    });
    expect(plan.grant.map((r) => r.roleName)).toEqual(['Finance']);
  });

  it('no active membership left takes every role on that portal away', () => {
    const plan = planPortalRoleSync({
      org: 'outlet',
      activeLanes: [],
      held: [role(OUTLET_ROLES, 'Owner'), role(OUTLET_ROLES, 'Ops Head')],
      defined: OUTLET_ROLES,
    });
    expect(plan.grant).toEqual([]);
    expect(plan.revoke.map((r) => r.roleName).sort()).toEqual(['Ops Head', 'Owner']);
  });

  it('already right is a no-op — reading it twice changes nothing', () => {
    const plan = planPortalRoleSync({
      org: 'outlet',
      activeLanes: ['operations_head'],
      held: [role(OUTLET_ROLES, 'Ops Head')],
      defined: OUTLET_ROLES,
    });
    expect(plan).toEqual({ grant: [], revoke: [], missing: [] });
  });

  it('every real lane maps to its seeded role on both portals', () => {
    for (const [lane, name] of [
      ['owner', 'Owner'],
      ['finance', 'Finance'],
      ['director', 'Director'],
      ['guarantor', 'Guarantor'],
    ] as const) {
      const agency = planPortalRoleSync({ org: 'agency', activeLanes: [lane], held: [], defined: AGENCY_ROLES });
      expect(agency.grant.map((r) => r.roleName)).toEqual([name]);
      const outlet = planPortalRoleSync({ org: 'outlet', activeLanes: [lane], held: [], defined: OUTLET_ROLES });
      expect(outlet.grant.map((r) => r.roleName)).toEqual([name]);
    }
    const ops = planPortalRoleSync({ org: 'outlet', activeLanes: ['operations_head'], held: [], defined: OUTLET_ROLES });
    expect(ops.grant.map((r) => r.roleName)).toEqual(['Ops Head']);
  });

  it('an unknown lane resolves to the view-only Director, never Owner', () => {
    const plan = planPortalRoleSync({ org: 'agency', activeLanes: ['cashier'], held: [], defined: AGENCY_ROLES });
    expect(plan.grant.map((r) => r.roleName)).toEqual(['Director']);
  });

  it('names compare case-insensitively, as the unique index on role does', () => {
    const plan = planPortalRoleSync({
      org: 'agency',
      activeLanes: ['owner'],
      held: [{ roleId: 'a-owner', roleName: 'owner' }],
      defined: [{ roleId: 'a-owner', roleName: 'OWNER' }],
    });
    expect(plan).toEqual({ grant: [], revoke: [], missing: [] });
  });

  it('a lane whose role is not seeded is reported, not silently skipped', () => {
    const plan = planPortalRoleSync({
      org: 'agency',
      activeLanes: ['guarantor'],
      held: [],
      defined: AGENCY_ROLES.filter((r) => r.roleName !== 'Guarantor'),
    });
    expect(plan.missing).toEqual(['Guarantor']);
  });
});

/** An in-memory store: roles on EVERY portal, so a leak across portals would show. */
function memoryStore(initial: {
  lanes: Partial<Record<'agency' | 'outlet', string[]>>;
  held: Array<{ roleId: string; portal: 'agency' | 'outlet' | 'admin' | null; roleName: string }>;
}) {
  const log: string[] = [];
  const held = [...initial.held];
  const store: PortalRoleStore = {
    async lockAccount() {
      log.push('lock');
    },
    async activeLanes(_userId, org) {
      log.push(`lanes:${org}`);
      return initial.lanes[org] ?? [];
    },
    async definedRoles(org) {
      return org === 'agency' ? AGENCY_ROLES : OUTLET_ROLES;
    },
    async heldRoles(_userId, org) {
      return held.filter((r) => r.portal === org).map(({ roleId, roleName }) => ({ roleId, roleName }));
    },
    async grant(_userId, roleId, actor) {
      log.push(`grant:${roleId}:${actor}`);
      const ref = [...AGENCY_ROLES, ...OUTLET_ROLES].find((r) => r.roleId === roleId)!;
      held.push({ ...ref, portal: roleId.startsWith('a-') ? 'agency' : 'outlet' });
    },
    async revoke(_userId, roleId) {
      log.push(`revoke:${roleId}`);
      held.splice(held.findIndex((r) => r.roleId === roleId), 1);
    },
  };
  return { store, log, held };
}

describe('syncPortalRoles — the recompute, against a store', () => {
  it('locks first, reads the lanes, grants before it revokes', async () => {
    const m = memoryStore({
      lanes: { agency: ['director'] },
      held: [{ roleId: 'a-owner', portal: 'agency', roleName: 'Owner' }],
    });
    const out = await syncPortalRoles(m.store, { userId: 'u1', org: 'agency', actor: 'owner-1' });
    expect(m.log).toEqual(['lock', 'lanes:agency', 'grant:a-director:owner-1', 'revoke:a-owner']);
    expect(out).toEqual({ granted: ['Director'], revoked: ['Owner'] });
  });

  it('NEVER touches admin, pr, or the other org portal', async () => {
    const m = memoryStore({
      lanes: { agency: [] },
      held: [
        { roleId: 'admin', portal: 'admin', roleName: 'admin' },
        { roleId: 'pr', portal: null, roleName: 'pr' },
        { roleId: 'o-owner', portal: 'outlet', roleName: 'Owner' },
        { roleId: 'a-owner', portal: 'agency', roleName: 'Owner' },
      ],
    });
    await syncPortalRoles(m.store, { userId: 'u1', org: 'agency', actor: 'x' });
    expect(m.held.map((r) => r.roleId).sort()).toEqual(['admin', 'o-owner', 'pr']);
  });

  it('an unseeded lane throws BEFORE any write', async () => {
    const m = memoryStore({ lanes: { agency: ['guarantor'] }, held: [] });
    m.store.definedRoles = async () => AGENCY_ROLES.filter((r) => r.roleName !== 'Guarantor');
    await expect(
      syncPortalRoles(m.store, { userId: 'u1', org: 'agency', actor: 'x' }),
    ).rejects.toBeInstanceOf(PortalRoleNotSeededError);
    expect(m.log.some((l) => l.startsWith('grant') || l.startsWith('revoke'))).toBe(false);
  });
});

describe('changeWithdrawsInvites', () => {
  const current = { subRole: 'finance' };
  it('a removal always withdraws', () => expect(changeWithdrawsInvites(current)).toBe(true));
  it('a new title withdraws', () => expect(changeWithdrawsInvites(current, { subRole: 'director' })).toBe(true));
  it('leaving the team withdraws', () => expect(changeWithdrawsInvites(current, { status: 'inactive' })).toBe(true));
  it('reinstating with the SAME title does not', () =>
    expect(changeWithdrawsInvites(current, { subRole: 'finance', status: 'active' })).toBe(false));
  it('an empty change does not', () => expect(changeWithdrawsInvites(current, {})).toBe(false));
});

// ── The real drizzle store and the transaction, through a recording fake tx ──

type Call = {
  op: 'execute' | 'select' | 'insert' | 'delete' | 'update';
  table?: string;
  joins: string[];
  where?: SQL;
  values?: unknown;
  set?: Record<string, unknown>;
  sql?: SQL;
};

const render = (condition: SQL | undefined) => new PgDialect().sqlToQuery(condition as SQL);

/**
 * Just enough of a drizzle transaction to run `portalRoleStore` and
 * `withdrawPendingInvites` for real: every builder method records itself, and
 * awaiting the chain answers from `rows`.
 */
function recordingTx(rows: {
  lanes: string[];
  defined: PortalRoleRef[];
  held: PortalRoleRef[];
  invitesWithdrawn?: number;
  failDelete?: boolean;
}) {
  const calls: Call[] = [];
  const answer = (call: Call): unknown => {
    if (call.op === 'select' && (call.table === 'agency_user' || call.table === 'outlet_user')) {
      return rows.lanes.map((subRole) => ({ subRole }));
    }
    if (call.op === 'select' && call.table === 'role') return rows.defined;
    if (call.op === 'select' && call.table === 'user_role') return rows.held;
    if (call.op === 'insert') return [{ id: 'new-user-role', ...(call.values as object) }];
    if (call.op === 'delete') {
      if (rows.failDelete) throw new Error('delete failed');
      return [];
    }
    if (call.op === 'update') {
      return Array.from({ length: rows.invitesWithdrawn ?? 0 }, (_, i) => ({ id: `inv-${i}` }));
    }
    return [];
  };
  const chain = (call: Call) => {
    calls.push(call);
    const builder = {
      from(table: never) {
        call.table = getTableName(table);
        return builder;
      },
      innerJoin(table: never) {
        call.joins.push(getTableName(table));
        return builder;
      },
      where(condition: SQL) {
        call.where = condition;
        return builder;
      },
      values(values: unknown) {
        call.values = values;
        return builder;
      },
      set(values: Record<string, unknown>) {
        call.set = values;
        return builder;
      },
      returning() {
        return builder;
      },
      then(resolve: (v: unknown) => void, reject: (e: unknown) => void) {
        try {
          resolve(answer(call));
        } catch (error) {
          reject(error);
        }
      },
    };
    return builder;
  };
  const tx = {
    execute: async (sqlChunk: SQL) => {
      calls.push({ op: 'execute', joins: [], sql: sqlChunk });
      return { rows: [] };
    },
    select: () => chain({ op: 'select', joins: [] }),
    insert: (table: never) => chain({ op: 'insert', table: getTableName(table), joins: [] }),
    delete: (table: never) => chain({ op: 'delete', table: getTableName(table), joins: [] }),
    update: (table: never) => chain({ op: 'update', table: getTableName(table), joins: [] }),
  };
  return { tx, calls };
}

describe('portalRoleStore — the queries the recompute runs', () => {
  it('reads ACTIVE memberships of the kind, and only this portal’s roles', async () => {
    const { tx, calls } = recordingTx({ lanes: ['owner'], defined: AGENCY_ROLES, held: [] });
    const store = portalRoleStore(tx as never);

    await store.activeLanes('user-1', 'agency');
    const lanes = calls.at(-1)!;
    expect(lanes.table).toBe('agency_user');
    expect(render(lanes.where).params).toEqual(['user-1', 'active']);

    await store.activeLanes('user-1', 'outlet');
    expect(calls.at(-1)!.table).toBe('outlet_user');

    await store.heldRoles('user-1', 'outlet');
    const held = calls.at(-1)!;
    expect(held.table).toBe('user_role');
    // INNER joins through role → portal, filtered to the portal code: admin
    // (admin portal) and pr (no portal) cannot come back from this query.
    expect(held.joins).toEqual(['role', 'portal']);
    expect(render(held.where).params).toEqual(['user-1', 'outlet']);

    await store.definedRoles('agency');
    const defined = calls.at(-1)!;
    expect(defined.table).toBe('role');
    expect(render(defined.where).params).toEqual(['agency']);
  });

  it('takes a transaction-scoped advisory lock keyed on the account', async () => {
    const { tx, calls } = recordingTx({ lanes: [], defined: [], held: [] });
    await portalRoleStore(tx as never).lockAccount('user-1');
    const q = render(calls[0].sql);
    expect(q.sql).toContain('pg_advisory_xact_lock');
    expect(q.params).toEqual(['portal-roles:user-1']);
  });
});

describe('commitMembershipChange — one transaction or nothing', () => {
  beforeEach(() => {
    h.rolledBack = 0;
  });

  it('write, recompute, withdraw — in that order, on the same transaction', async () => {
    const rec = recordingTx({
      // After the write: director at A (just demoted) and director at B.
      lanes: ['director', 'director'],
      defined: AGENCY_ROLES,
      held: [role(AGENCY_ROLES, 'Owner'), role(AGENCY_ROLES, 'Director')],
      invitesWithdrawn: 1,
    });
    h.tx = rec.tx;
    const write = vi.fn(async (tx: unknown) => {
      expect(tx).toBe(rec.tx);
      return { id: 'membership-1' };
    });

    const out = await commitMembershipChange({
      org: 'agency',
      orgId: 'agency-A',
      userId: 'user-1',
      actor: 'owner-9',
      withdrawInvitesFor: '  Finance@Atlas.MY ',
      write,
    });

    expect(out).toEqual({ id: 'membership-1' });
    expect(write).toHaveBeenCalledTimes(1);
    expect(rec.calls.map((c) => `${c.op}:${c.table ?? ''}`)).toEqual([
      'execute:',
      'select:agency_user',
      'select:role',
      'select:user_role',
      'delete:user_role',
      'update:org_member_invite',
    ]);
    // The stale Owner row is the one deleted.
    expect(render(rec.calls[4].where).params).toEqual(['user-1', 'a-owner']);
    // Withdrawn by org + NORMALISED address + pending, stamped with who did it.
    const withdraw = rec.calls[5];
    expect(render(withdraw.where).params).toEqual(['agency-A', 'finance@atlas.my', 'pending']);
    expect(render(withdraw.where).sql).toContain('"agency_id"');
    expect(withdraw.set).toMatchObject({ status: 'cancelled', updatedBy: 'owner-9' });
    expect(h.rolledBack).toBe(0);
  });

  it('a new lane is GRANTED with the audit pair set to the actor', async () => {
    const rec = recordingTx({ lanes: ['finance'], defined: OUTLET_ROLES, held: [] });
    h.tx = rec.tx;
    await commitMembershipChange({
      org: 'outlet',
      orgId: 'venue-1',
      userId: 'user-2',
      actor: 'owner-3',
      withdrawInvitesFor: null,
      write: async () => ({ id: 'm' }),
    });
    const insert = rec.calls.find((c) => c.op === 'insert')!;
    expect(insert.table).toBe('user_role');
    expect(insert.values).toEqual({
      userId: 'user-2',
      roleId: 'o-finance',
      createdBy: 'owner-3',
      updatedBy: 'owner-3',
    });
    // No address given: no invitation is touched.
    expect(rec.calls.some((c) => c.table === 'org_member_invite')).toBe(false);
  });

  it('a write that came back EMPTY aborts before any role is touched', async () => {
    const rec = recordingTx({ lanes: ['owner'], defined: AGENCY_ROLES, held: [] });
    h.tx = rec.tx;
    await expect(
      commitMembershipChange({
        org: 'agency',
        orgId: 'agency-A',
        userId: 'user-1',
        actor: 'owner-9',
        withdrawInvitesFor: 'x@y.z',
        write: async () => null,
      }),
    ).rejects.toBeInstanceOf(MembershipChangeNotSavedError);
    expect(rec.calls).toEqual([]);
    expect(h.rolledBack).toBe(1);
  });

  it('a revoke that failed aborts the change — it is not swallowed', async () => {
    const rec = recordingTx({
      lanes: [],
      defined: AGENCY_ROLES,
      held: [role(AGENCY_ROLES, 'Owner')],
      failDelete: true,
    });
    h.tx = rec.tx;
    await expect(
      commitMembershipChange({
        org: 'agency',
        orgId: 'agency-A',
        userId: 'user-1',
        actor: 'owner-9',
        withdrawInvitesFor: 'x@y.z',
        write: async () => true,
      }),
    ).rejects.toBeInstanceOf(MembershipChangeNotSavedError);
    expect(rec.calls.some((c) => c.table === 'org_member_invite')).toBe(false);
    expect(h.rolledBack).toBe(1);
  });

  it('an unseeded lane aborts the change', async () => {
    const rec = recordingTx({
      lanes: ['guarantor'],
      defined: AGENCY_ROLES.filter((r) => r.roleName !== 'Guarantor'),
      held: [],
    });
    h.tx = rec.tx;
    await expect(
      commitMembershipChange({
        org: 'agency',
        orgId: 'agency-A',
        userId: 'user-1',
        actor: 'owner-9',
        withdrawInvitesFor: null,
        write: async () => true,
      }),
    ).rejects.toBeInstanceOf(PortalRoleNotSeededError);
    expect(rec.calls.some((c) => c.op === 'insert' || c.op === 'delete')).toBe(false);
  });

  it('resyncPortalRoles runs the same recompute in a transaction of its own', async () => {
    const rec = recordingTx({ lanes: ['director'], defined: AGENCY_ROLES, held: [role(AGENCY_ROLES, 'Owner')] });
    h.tx = rec.tx;
    const out = await resyncPortalRoles({ userId: 'user-1', org: 'agency', actor: 'user-1' });
    expect(out).toEqual({ granted: ['Director'], revoked: ['Owner'] });
    expect(rec.calls[0].op).toBe('execute');
  });
});
