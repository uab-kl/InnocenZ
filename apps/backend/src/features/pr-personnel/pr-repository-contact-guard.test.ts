import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

/**
 * The LAST gate: `ensureOpsBridge`, `prRepository.update` and
 * `writeStubSignInContact` themselves.
 *
 * The HTTP writers refuse a changed sign-in contact with 403 before calling
 * in, but `ensureOpsBridge` has other callers (the agency approval in
 * `agency.controller`, the assign lane in `shift-assignment.controller`). This
 * pins that no caller can use the bridge to rewrite an activated account's
 * email or phone, that an unchanged value costs no write at all, and that every
 * sign-in contact write carries `password_hash IS NULL` in its own WHERE — the
 * decision reads the row a statement earlier, and a PR can set a password in
 * between.
 *
 * The database is a recording fake — nothing here opens a connection.
 */

const h = vi.hoisted(() => ({
  account: null as null | {
    email: string | null;
    phoneNum: string | null;
    passwordHash: string | null;
  },
  updates: [] as { table: unknown; patch: Record<string, unknown>; condition: unknown }[],
  /** Rows a `.returning()` update reports — [] is "the WHERE matched nothing". */
  returningRows: [{ id: 'row' }] as { id: string }[],
  /** Thrown by a `.returning()` update, when set. */
  returningError: null as unknown,
}));

vi.mock('@/db/index', () => {
  const db = {
    insert: vi.fn(() => ({
      values: () => ({ onConflictDoUpdate: async () => undefined }),
    })),
    update: vi.fn((table: unknown) => ({
      set: (patch: Record<string, unknown>) => ({
        where: (condition: unknown) => {
          h.updates.push({ table, patch, condition });
          return {
            // Awaited directly by the agency_pr / user_profile writes.
            then: (resolve: (value: undefined) => void) => resolve(undefined),
            returning: async () => {
              if (h.returningError) throw h.returningError;
              return h.returningRows;
            },
          };
        },
      }),
    })),
    select: vi.fn(() => ({
      from: () => ({
        where: () => ({ limit: async () => (h.account ? [h.account] : []) }),
      }),
    })),
  };
  return { db };
});

import { PrRepositoryClass } from './pr.repository';
import { UserTable } from '@/features/user/user.model';

const USER_ID = '88888888-8888-4888-8888-888888888888';
const AGENCY_ID = '99999999-9999-4999-8999-999999999999';

function repository() {
  const repo = new PrRepositoryClass();
  // The synthetic read-back joins four tables; it is not what is under test.
  vi.spyOn(repo, 'getByUserId').mockResolvedValue({ id: USER_ID } as never);
  return repo;
}

function userTableWrites() {
  return h.updates.filter((u) => u.table === UserTable);
}

/** The WHERE of a recorded write, as the SQL Postgres would receive. */
function whereSql(condition: unknown): string {
  return new PgDialect().sqlToQuery(condition as SQL).sql;
}

describe('PrRepository sign-in contact guard', () => {
  beforeEach(() => {
    h.updates.length = 0;
    h.account = null;
    h.returningRows = [{ id: USER_ID }];
    h.returningError = null;
  });

  it('ensureOpsBridge never rewrites an activated account (the old null-wipe)', async () => {
    h.account = { email: 'vicky@example.com', phoneNum: '+60123456789', passwordHash: 'hash' };
    await repository().ensureOpsBridge({
      userId: USER_ID,
      agencyId: AGENCY_ID,
      actor: 'agency-owner',
      phone: '+60199999999',
      email: null,
    });
    expect(userTableWrites()).toEqual([]);
  });

  it('ensureOpsBridge with the values already on file writes nothing to user', async () => {
    // What agency.controller passes on approval: the account's own values.
    h.account = { email: 'vicky@example.com', phoneNum: '+60123456789', passwordHash: null };
    await repository().ensureOpsBridge({
      userId: USER_ID,
      agencyId: AGENCY_ID,
      actor: 'agency-owner',
      phone: '+60123456789',
      email: 'vicky@example.com',
    });
    expect(userTableWrites()).toEqual([]);
  });

  it('ensureOpsBridge may still correct a never-activated stub — only while it has no password', async () => {
    h.account = { email: null, phoneNum: '+60123456789', passwordHash: null };
    await repository().ensureOpsBridge({
      userId: USER_ID,
      agencyId: AGENCY_ID,
      actor: 'agency-owner',
      email: 'Fixed@Example.com',
    });
    const writes = userTableWrites();
    expect(writes).toHaveLength(1);
    expect(writes[0].patch).toMatchObject({ email: 'fixed@example.com', updatedBy: 'agency-owner' });
    expect(writes[0].patch).not.toHaveProperty('phoneNum');
    expect(whereSql(writes[0].condition)).toMatch(/"password_hash" is null/);
  });

  it('ensureOpsBridge does not throw when the stub was activated before the write (0 rows)', async () => {
    h.account = { email: null, phoneNum: '+60123456789', passwordHash: null };
    h.returningRows = [];
    await expect(
      repository().ensureOpsBridge({
        userId: USER_ID,
        agencyId: AGENCY_ID,
        actor: 'agency-owner',
        email: 'fixed@example.com',
      }),
    ).resolves.toEqual({ id: USER_ID });
  });

  it('update() drops an email change on an activated account', async () => {
    h.account = { email: 'vicky@example.com', phoneNum: '+60123456789', passwordHash: 'hash' };
    const repo = repository();
    await repo.update(USER_ID, { email: 'other@example.com', updatedBy: 'admin-1' });
    expect(userTableWrites()).toEqual([]);
  });

  it("update()'s stub write is conditional on password_hash IS NULL too", async () => {
    h.account = { email: 'vicky@example.com', phoneNum: '+60123456789', passwordHash: null };
    await repository().update(USER_ID, { email: 'other@example.com', updatedBy: 'admin-1' });
    const writes = userTableWrites();
    expect(writes).toHaveLength(1);
    expect(whereSql(writes[0].condition)).toMatch(/"password_hash" is null/);
  });
});

describe('PrRepository.writeStubSignInContact', () => {
  beforeEach(() => {
    h.updates.length = 0;
    h.returningRows = [{ id: USER_ID }];
    h.returningError = null;
  });

  it('writes the patch in ONE statement whose WHERE requires no password', async () => {
    const outcome = await repository().writeStubSignInContact(
      USER_ID,
      { email: 'fixed@example.com' },
      'agency-owner',
    );
    expect(outcome).toBe('updated');
    const writes = userTableWrites();
    expect(writes).toHaveLength(1);
    expect(writes[0].patch).toMatchObject({ email: 'fixed@example.com', updatedBy: 'agency-owner' });
    const where = whereSql(writes[0].condition);
    expect(where).toMatch(/"id" = \$1/);
    expect(where).toMatch(/"password_hash" is null/);
  });

  it("answers 'activated' when the WHERE matched nothing (a password was set in between)", async () => {
    h.returningRows = [];
    await expect(
      repository().writeStubSignInContact(USER_ID, { email: 'fixed@example.com' }, 'agency-owner'),
    ).resolves.toBe('activated');
  });

  it('names the field a unique violation was about — drizzle hides the pg error in .cause', async () => {
    h.returningError = Object.assign(new Error('Failed query'), {
      cause: { code: '23505', constraint: 'user_phone_num_unique' },
    });
    await expect(
      repository().writeStubSignInContact(
        USER_ID,
        { email: 'fixed@example.com', phoneNum: '+60198887777' },
        'agency-owner',
      ),
    ).resolves.toBe('phone_taken');

    h.returningError = { code: '23505', constraint: 'user_email_unique' };
    await expect(
      repository().writeStubSignInContact(
        USER_ID,
        { email: 'fixed@example.com', phoneNum: '+60198887777' },
        'agency-owner',
      ),
    ).resolves.toBe('email_taken');
  });

  it('throws any other database error for the controller 500 — it is never swallowed', async () => {
    h.returningError = Object.assign(new Error('connection reset'), { code: '08006' });
    await expect(
      repository().writeStubSignInContact(USER_ID, { email: 'fixed@example.com' }, 'agency-owner'),
    ).rejects.toThrow('connection reset');
  });

  it('writes nothing for an empty patch', async () => {
    await expect(repository().writeStubSignInContact(USER_ID, {}, 'agency-owner')).resolves.toBe(
      'updated',
    );
    expect(userTableWrites()).toEqual([]);
  });
});
