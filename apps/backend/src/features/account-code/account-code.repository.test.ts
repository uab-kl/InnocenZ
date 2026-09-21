import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The transactional writes, against a recording fake of drizzle's builder.
 * What matters here is WHAT is written together and on WHICH condition —
 * the SQL itself is drizzle's job.
 */
const fake = vi.hoisted(() => {
  const state = {
    updates: [] as Array<{ table: unknown; set: Record<string, unknown> }>,
    /** Rows each successive `.returning()` resolves to. */
    returningQueue: [] as unknown[][],
    selectQueue: [] as unknown[][],
    committed: false,
  };
  const builder = (client: 'db' | 'tx') => ({
    update: (table: unknown) => ({
      set: (set: Record<string, unknown>) => {
        state.updates.push({ table, set });
        const where = () => {
          const promise = Promise.resolve(undefined) as Promise<undefined> & {
            returning: () => Promise<unknown[]>;
          };
          promise.returning = async () => state.returningQueue.shift() ?? [];
          return promise;
        };
        return { where };
      },
    }),
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => state.selectQueue.shift() ?? [] }),
      }),
    }),
    client,
  });
  const db = {
    ...builder('db'),
    transaction: async <T>(work: (tx: unknown) => Promise<T>): Promise<T> => {
      const result = await work(builder('tx'));
      state.committed = true;
      return result;
    },
  };
  return { state, db };
});

vi.mock('@/db/index.js', () => ({ db: fake.db }));
vi.mock('@/db/index', () => ({ db: fake.db }));
vi.mock('@/util/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/util/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { AccountCodeRepositoryClass, isUniqueViolation } from './account-code.repository';
import { UserTable } from '@/features/user/user.model';
import { PhoneVerificationTable } from '@/features/auth/phone-verification.model';

beforeEach(() => {
  fake.state.updates = [];
  fake.state.returningQueue = [];
  fake.state.selectQueue = [];
  fake.state.committed = false;
});

describe('completePasswordReset', () => {
  it('spends the row, then writes the password with the lockout CLEARED, in one transaction', async () => {
    const updateUserPassword = vi.fn(async () => new Date('2026-09-17T10:00:00.000Z'));
    const repo = new AccountCodeRepositoryClass({ updateUserPassword } as never);
    fake.state.returningQueue.push([{ id: 'row-1' }]);
    const cutoff = new Date('2026-09-17T10:00:00.000Z');

    const outcome = await repo.completePasswordReset({
      requestId: 'row-1',
      userId: 'user-1',
      passwordHash: 'hash:new',
      cutoff,
    });

    expect(outcome).toBe('ok');
    expect(fake.state.updates[0].table).toBe(PhoneVerificationTable);
    expect(fake.state.updates[0].set).toMatchObject({ status: 'consumed', updatedBy: 'user-1' });
    expect(updateUserPassword).toHaveBeenCalledWith('user-1', 'hash:new', {
      tx: expect.objectContaining({ client: 'tx' }),
      updatedBy: 'user-1',
      clearLockout: true,
      cutoff,
    });
    expect(fake.state.committed).toBe(true);
  });

  it('writes NO password when the row was already spent', async () => {
    const updateUserPassword = vi.fn();
    const repo = new AccountCodeRepositoryClass({ updateUserPassword } as never);
    fake.state.returningQueue.push([]);
    const outcome = await repo.completePasswordReset({
      requestId: 'row-1',
      userId: 'user-1',
      passwordHash: 'hash:new',
      cutoff: new Date(),
    });
    expect(outcome).toBe('already_used');
    expect(updateUserPassword).not.toHaveBeenCalled();
    expect(fake.state.committed).toBe(false);
  });
});

/**
 * ONE code row since the identity step was retired (owner, 21 Sep 2026): the
 * row addressed by `rowId` is the new-contact code, and nothing else is spent.
 */
describe('applyContactChange', () => {
  const input = {
    rowId: 'new-1',
    userId: 'user-1',
    kind: 'email' as const,
    value: 'new@x.my',
    cutoff: new Date('2026-09-17T10:00:00.000Z'),
  };

  it('spends the one row, then writes the email, the cutoff and updated_by together', async () => {
    const repo = new AccountCodeRepositoryClass({ updateUserPassword: vi.fn() } as never);
    fake.state.returningQueue.push([{ id: 'new-1' }], [{ id: 'user-1', email: 'new@x.my' }]);
    fake.state.selectQueue.push([]); // not taken

    const result = await repo.applyContactChange(input);

    expect(result).toEqual({ status: 'ok', user: { id: 'user-1', email: 'new@x.my' } });
    // Exactly two writes: the code row, then the account — no second spend.
    expect(fake.state.updates).toHaveLength(2);
    const [spendRow, writeUser] = fake.state.updates;
    expect(spendRow.table).toBe(PhoneVerificationTable);
    expect(spendRow.set).toMatchObject({ status: 'consumed', updatedBy: 'user-1' });
    expect(writeUser.table).toBe(UserTable);
    expect(writeUser.set).toMatchObject({
      email: 'new@x.my',
      sessionsValidFrom: input.cutoff,
      updatedBy: 'user-1',
    });
    expect(writeUser.set).not.toHaveProperty('phoneNum');
    expect(fake.state.committed).toBe(true);
  });

  it('writes the phone — and only the phone — for a phone change', async () => {
    const repo = new AccountCodeRepositoryClass({ updateUserPassword: vi.fn() } as never);
    fake.state.returningQueue.push([{ id: 'new-1' }], [{ id: 'user-1', phoneNum: '+60198765432' }]);
    fake.state.selectQueue.push([]);

    const result = await repo.applyContactChange({ ...input, kind: 'phone', value: '+60198765432' });

    expect(result).toEqual({ status: 'ok', user: { id: 'user-1', phoneNum: '+60198765432' } });
    const writeUser = fake.state.updates[1];
    expect(writeUser.set).toMatchObject({ phoneNum: '+60198765432' });
    expect(writeUser.set).not.toHaveProperty('email');
  });

  it('is "already_used" when the row was spent by a racing confirm', async () => {
    const repo = new AccountCodeRepositoryClass({ updateUserPassword: vi.fn() } as never);
    fake.state.returningQueue.push([]);
    expect(await repo.applyContactChange(input)).toEqual({ status: 'already_used' });
    expect(fake.state.updates.some((u) => u.table === UserTable)).toBe(false);
    expect(fake.state.committed).toBe(false);
  });

  it('is "taken" when another account holds the value inside the transaction', async () => {
    const repo = new AccountCodeRepositoryClass({ updateUserPassword: vi.fn() } as never);
    fake.state.returningQueue.push([{ id: 'new-1' }]);
    fake.state.selectQueue.push([{ id: 'someone-else' }]);
    expect(await repo.applyContactChange(input)).toEqual({ status: 'taken' });
    expect(fake.state.updates.some((u) => u.table === UserTable)).toBe(false);
    expect(fake.state.committed).toBe(false);
  });

  it('is "already_used" when the account itself vanished mid-flow — nothing is committed', async () => {
    const repo = new AccountCodeRepositoryClass({ updateUserPassword: vi.fn() } as never);
    fake.state.returningQueue.push([{ id: 'new-1' }], []);
    fake.state.selectQueue.push([]);
    expect(await repo.applyContactChange(input)).toEqual({ status: 'already_used' });
    expect(fake.state.committed).toBe(false);
  });
});

describe('isUniqueViolation', () => {
  it('reads 23505 on the error or on its cause (drizzle wraps pg errors)', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
    expect(isUniqueViolation({ cause: { code: '23505' } })).toBe(true);
    expect(isUniqueViolation({ code: '23503' })).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
});

