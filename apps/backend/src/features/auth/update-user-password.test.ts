import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => {
  const state = { sets: [] as Array<Record<string, unknown>>, client: '' };
  const client = (name: string) => ({
    name,
    update: () => ({
      set: (set: Record<string, unknown>) => {
        state.sets.push(set);
        state.client = name;
        return { where: async () => undefined };
      },
    }),
  });
  return { state, db: client('db'), tx: client('tx') };
});

vi.mock('@/db/index', () => ({ db: fake.db }));
vi.mock('@/db/index.js', () => ({ db: fake.db }));
vi.mock('@/util/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/util/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { AuthRepositoryClass } from './auth.repository';

/** The one write every password path shares. */
describe('AuthRepository.updateUserPassword', () => {
  const repo = new AuthRepositoryClass({} as never, {} as never, {} as never);

  beforeEach(() => {
    fake.state.sets = [];
    fake.state.client = '';
  });

  it('stamps sessions_valid_from FLOORED to the second and returns it', async () => {
    const cutoff = await repo.updateUserPassword('user-1', 'hash', {
      cutoff: new Date('2026-09-17T10:00:00.987Z'),
    });
    expect(cutoff.toISOString()).toBe('2026-09-17T10:00:00.000Z');
    expect(fake.state.sets[0]).toMatchObject({ passwordHash: 'hash', sessionsValidFrom: cutoff });
  });

  it('floors "now" when no cutoff is given', async () => {
    const cutoff = await repo.updateUserPassword('user-1', 'hash');
    expect(cutoff.getTime() % 1000).toBe(0);
  });

  it('a RESET clears the lockout and names who wrote it', async () => {
    await repo.updateUserPassword('user-1', 'hash', { updatedBy: 'user-1', clearLockout: true });
    expect(fake.state.sets[0]).toMatchObject({
      failedLoginAttempts: 0,
      lockedUntil: null,
      updatedBy: 'user-1',
    });
  });

  it('a signed-in change leaves the lockout columns alone unless asked', async () => {
    await repo.updateUserPassword('user-1', 'hash', { updatedBy: 'user-1' });
    expect(fake.state.sets[0]).not.toHaveProperty('failedLoginAttempts');
    expect(fake.state.sets[0]).not.toHaveProperty('lockedUntil');
  });

  it('writes inside the given transaction', async () => {
    await repo.updateUserPassword('user-1', 'hash', { tx: fake.tx as never });
    expect(fake.state.client).toBe('tx');
  });
});
