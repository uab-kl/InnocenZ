import { Writable } from 'node:stream';
import { inspect } from 'node:util';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => {
  const state = { error: null as unknown };
  const fail = async () => {
    throw state.error;
  };
  const db = {
    insert: () => ({ values: () => ({ returning: fail }) }),
    update: () => ({
      set: () => ({
        where: () => {
          const pending = fail();
          // `.returning()` for updateUser; awaited directly for updateUserPassword.
          return Object.assign(pending, { returning: () => pending });
        },
      }),
    }),
  };
  return { state, db };
});

vi.mock('@/db/index', () => ({ db: fake.db }));
vi.mock('@/db/index.js', () => ({ db: fake.db }));
vi.mock('@/util/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/util/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import winston from 'winston';
import { DrizzleQueryError } from 'drizzle-orm';
import { logger as mockedLogger } from '@/util/logger';
import { logger as mockedLoggerJs } from '@/util/logger.js';
import { UserRepositoryClass } from '@/features/user/user.repository';
import { AuthRepositoryClass } from './auth.repository';
import { redactQueryError, safeErrorFields } from './query-error-redaction';

const HASH = '$2b$10$FAKEHASHVALUEFAKEHASHVALUEFAKEHASHVALUE';
const SECRET_PART = 'FAKEHASHVALUE';

function queryError(): DrizzleQueryError {
  const cause = Object.assign(
    new Error('duplicate key value violates unique constraint "user_phone_num_unique"'),
    {
      code: '23505',
      constraint: 'user_phone_num_unique',
      detail: 'Key (phone_num)=(+60123456789) already exists.',
    },
  );
  return new DrizzleQueryError(
    'insert into "user" ("email", "password_hash") values ($1, $2)',
    ['owner@atlas-agency.my', HASH],
    cause,
  );
}

/** A real winston logger with the SAME two formats util/logger.ts uses, writing to memory. */
function captureLogger(kind: 'dev' | 'prod') {
  const lines: string[] = [];
  const { combine, timestamp, json, printf } = winston.format;
  const format =
    kind === 'prod'
      ? combine(timestamp(), json())
      : combine(
          timestamp(),
          printf(({ level, message, timestamp: ts, ...meta }) => {
            const extra = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
            return `${ts} ${level}: ${message}${extra}`;
          }),
        );
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(String(chunk));
      callback();
    },
  });
  const logger = winston.createLogger({
    level: 'debug',
    format,
    transports: [new winston.transports.Stream({ stream })],
  });
  return { logger, lines };
}

function allLogged(): string {
  return inspect(
    [vi.mocked(mockedLogger.error).mock.calls, vi.mocked(mockedLoggerJs.error).mock.calls],
    { depth: 10, showHidden: true },
  );
}

describe('the instrument: a raw DrizzleQueryError DOES leak through winston', () => {
  // Proves the assertions below would see a hash if one were printed — a clean
  // result from a logger that never printed params would prove nothing.
  it.each(['dev', 'prod'] as const)('%s format prints the bound hash when given the raw error', (kind) => {
    const { logger, lines } = captureLogger(kind);
    logger.error('[UserRepository.createUser] Error:', queryError());
    expect(lines.join('\n')).toContain(SECRET_PART);
  });

  it('inspecting mocked logger calls (how the controller tests assert) sees a raw error\'s hash', () => {
    expect(inspect([['[X] Error:', queryError()]], { depth: 10, showHidden: true })).toContain(SECRET_PART);
  });
});

describe('safeErrorFields', () => {
  it.each(['dev', 'prod'] as const)('%s format: no bound value, still the pg code and constraint', (kind) => {
    const { logger, lines } = captureLogger(kind);
    logger.error('[UserRepository.createUser] Error:', safeErrorFields(queryError()));
    const out = lines.join('\n');
    expect(out).not.toContain(SECRET_PART);
    expect(out).not.toContain('owner@atlas-agency.my');
    // `detail` quotes the conflicting value; never printed.
    expect(out).not.toContain('+60123456789');
    expect(out).toContain('23505');
    expect(out).toContain('user_phone_num_unique');
    // The statement text (placeholders only) survives for debugging; both
    // formats JSON-escape its quotes, so match the unquoted part.
    expect(out).toContain('Failed query: insert into');
    expect(out).toContain('params: [redacted]');
  });

  it('a plain error keeps its message', () => {
    expect(safeErrorFields(new Error('connection reset'))).toEqual({ error: 'Error: connection reset' });
    expect(safeErrorFields('boom')).toEqual({ error: 'boom' });
  });
});

describe('redactQueryError', () => {
  it('scrubs message, params and stack IN PLACE, keeping class, cause and code', () => {
    const error = queryError();
    void error.stack; // formatted before the scrub, as a transaction rollback may do
    const same = redactQueryError(error);

    expect(same).toBe(error);
    expect(error).toBeInstanceOf(DrizzleQueryError);
    expect(error.message).toBe(
      'Failed query: insert into "user" ("email", "password_hash") values ($1, $2)\nparams: [redacted]',
    );
    expect(error.params).toBe('[redacted]');
    expect(String(error.stack)).not.toContain(SECRET_PART);
    expect(String(error.stack)).toContain('\n    at ');
    expect((error.cause as { code?: string }).code).toBe('23505');

    for (const kind of ['dev', 'prod'] as const) {
      const { logger, lines } = captureLogger(kind);
      logger.error('[X] Error:', error);
      expect(lines.join('\n')).not.toContain(SECRET_PART);
    }
  });

  it('is idempotent, and leaves a non-query error alone', () => {
    const error = queryError();
    redactQueryError(error);
    const once = { message: error.message, stack: error.stack };
    redactQueryError(error);
    expect({ message: error.message, stack: error.stack }).toEqual(once);

    const plain = new Error('connection reset');
    const stack = plain.stack;
    redactQueryError(plain);
    expect(plain.message).toBe('connection reset');
    expect(plain.stack).toBe(stack);
  });

  it('follows a wrapping cause', () => {
    const inner = queryError();
    const outer = new Error('transaction failed', { cause: inner });
    redactQueryError(outer);
    expect(inner.message).not.toContain(SECRET_PART);
    expect(inner.params).toBe('[redacted]');
  });
});

describe('the password writers never log — or rethrow — the hash', () => {
  beforeEach(() => {
    vi.mocked(mockedLogger.error).mockClear();
    vi.mocked(mockedLoggerJs.error).mockClear();
    fake.state.error = queryError();
  });

  it('UserRepository.createUser: logs safe fields and rethrows a scrubbed error', async () => {
    const repo = new UserRepositoryClass({} as never, {} as never);
    const thrown = await repo
      .createUser({ email: 'owner@atlas-agency.my', passwordHash: HASH } as never)
      .then(
        () => null,
        (error: unknown) => error,
      );

    expect(thrown).toBe(fake.state.error);
    expect(inspect(thrown, { depth: 10, showHidden: true })).not.toContain(SECRET_PART);
    expect(vi.mocked(mockedLogger.error)).toHaveBeenCalled();
    expect(allLogged()).not.toContain(SECRET_PART);
    expect(allLogged()).toContain('23505');
  });

  it('UserRepository.updateUser: logs safe fields and returns null', async () => {
    const repo = new UserRepositoryClass({} as never, {} as never);
    const result = await repo.updateUser({ passwordHash: HASH }, 'user-1');
    expect(result).toBeNull();
    expect(vi.mocked(mockedLogger.error)).toHaveBeenCalled();
    expect(allLogged()).not.toContain(SECRET_PART);
  });

  it('AuthRepository.updateUserPassword: rethrows a scrubbed error for every caller', async () => {
    const repo = new AuthRepositoryClass({} as never, {} as never, {} as never);
    const thrown = await repo.updateUserPassword('user-1', HASH).then(
      () => null,
      (error: unknown) => error,
    );
    expect(thrown).toBeInstanceOf(DrizzleQueryError);
    expect(inspect(thrown, { depth: 10, showHidden: true })).not.toContain(SECRET_PART);
  });
});
