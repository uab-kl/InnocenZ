import type { Request, Response } from 'express';
import { DrizzleQueryError, type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `POST /auth/register-member` refuses a sign-in value another account holds.
 *
 * The email was checked with `getUserByLoginMethod`, which answers null when TWO
 * accounts match; the phone was not checked at all, so a taken number reached
 * the INSERT and `user_phone_num_unique` made it a 500 — or, spelled differently
 * from the stored copy (`0123456789` vs `+60123456789`), passed the index and
 * created a second account for the same line.
 *
 * Pinned here:
 *  - a taken email (any case / spacing) -> 409, the existing sentence, no insert;
 *  - a taken phone in ANY form sign-in accepts (`0…`, `60…`, `+60…`, spaced) ->
 *    409 'That phone number is already used by another account', no insert;
 *  - a number already held by two accounts is taken, not free;
 *  - the unique index losing a race is still a 409, never a 500;
 *  - `UserRepository.isLoginValueTaken` asks the database with sign-in's own
 *    normalisation and selects the id only.
 */

const h = vi.hoisted(() => ({
  selected: [] as { fields: Record<string, unknown>; condition: unknown }[],
  rows: [] as { id: string }[],
}));

vi.mock('@/db/index', () => ({
  db: {
    select: (fields: Record<string, unknown>) => ({
      from: () => ({
        where: (condition: unknown) => ({
          limit: async () => {
            h.selected.push({ fields, condition });
            return h.rows;
          },
        }),
      }),
    }),
  },
}));
vi.mock('@/util/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/util/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
// No real bcrypt, and no R2 upload, in a unit test.
vi.mock('@/util/password.js', () => ({ hashPassword: vi.fn(async () => 'hashed-for-test') }));
vi.mock('@/util/profile-image.js', () => ({ saveProfileImageFile: vi.fn() }));

import { hashPassword } from '@/util/password.js';
import { phoneLoginCandidates, UserRepositoryClass } from '@/features/user/user.repository';
import {
  OrgMemberInviteControllerClass,
  REGISTER_MEMBER_EMAIL_TAKEN,
  REGISTER_MEMBER_PHONE_TAKEN,
} from './org-member-invite.controller';

const NEW_USER_ID = '66666666-6666-4666-8666-666666666666';

type Account = { id: string; email: string | null; phoneNum: string | null };

function build(directory: Account[], createUser?: () => Promise<unknown>) {
  const userRepository = {
    // The REAL matching rule, as the repository applies it in SQL: email
    // lower/trim equality; phone digits against `phoneLoginCandidates`; ANY
    // match is taken (two matches included).
    isLoginValueTaken: vi.fn(async (method: 'email' | 'phone', value: string) => {
      if (method === 'email') {
        const needle = value.trim().toLowerCase();
        return directory.some((a) => (a.email ?? '').trim().toLowerCase() === needle);
      }
      const candidates = phoneLoginCandidates(value);
      return (
        candidates.length > 0 &&
        directory.some((a) => candidates.includes((a.phoneNum ?? '').replace(/\D/g, '')))
      );
    }),
    // The OLD question. Answers null the way it does for an ambiguous match, so
    // a controller still relying on it would let the duplicate through.
    getUserByLoginMethod: vi.fn(async () => null),
    createUser: vi.fn(createUser ?? (async () => ({ id: NEW_USER_ID }))),
    updateUser: vi.fn(async () => ({})),
  };
  const userProfileRepository = { update: vi.fn(async () => ({})) };
  const unused = {} as never;
  const controller = new OrgMemberInviteControllerClass(
    unused,
    unused,
    unused,
    unused,
    unused,
    userRepository as never,
    unused,
    unused,
    userProfileRepository as never,
  );
  return { controller, userRepository };
}

function fakeResponse() {
  const res = {
    statusCode: 0,
    body: null as unknown as { success: boolean; message: string; data: unknown },
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: { success: boolean; message: string; data: unknown }) {
      res.body = payload;
      return res;
    },
  };
  return res as unknown as Response & typeof res;
}

function register(fields: Record<string, string>) {
  return {
    body: {
      name: 'Nadia Rahman',
      email: 'nadia@example.com',
      password: 'secret123',
      confirmPassword: 'secret123',
      ...fields,
    },
  } as unknown as Request;
}

const EXISTING: Account[] = [
  { id: 'a1', email: 'Owner@Atlas-Agency.my', phoneNum: '+60123456789' },
  { id: 'a2', email: 'finance@atlas-agency.my', phoneNum: '0198887777' },
];

beforeEach(() => {
  vi.mocked(hashPassword).mockClear();
});

describe('POST /auth/register-member — duplicate email', () => {
  it('409 with the existing sentence, any case and spacing, and nothing inserted', async () => {
    const t = build(EXISTING);
    const res = fakeResponse();
    await t.controller.registerMember(register({ email: '  OWNER@atlas-agency.MY ' }), res);

    expect(res.statusCode).toBe(409);
    expect(res.body.message).toBe('That email already has an account — sign in instead.');
    expect(REGISTER_MEMBER_EMAIL_TAKEN).toBe(res.body.message);
    expect(t.userRepository.createUser).not.toHaveBeenCalled();
    expect(hashPassword).not.toHaveBeenCalled();
  });
});

describe('POST /auth/register-member — duplicate phone', () => {
  it.each([
    ['local 0… against stored +60…', '0123456789'],
    ['60… against stored +60…', '60123456789'],
    ['spaced local form', '012-345 6789'],
    ['+60… against stored 0…', '+60198887777'],
    ['60… against stored 0…', '60198887777'],
  ])('%s -> 409, nothing inserted', async (_label, phoneNum) => {
    const t = build(EXISTING);
    const res = fakeResponse();
    await t.controller.registerMember(register({ phoneNum }), res);

    expect(res.statusCode).toBe(409);
    expect(res.body.message).toBe('That phone number is already used by another account');
    expect(REGISTER_MEMBER_PHONE_TAKEN).toBe(res.body.message);
    expect(t.userRepository.isLoginValueTaken).toHaveBeenCalledWith('phone', phoneNum);
    expect(t.userRepository.createUser).not.toHaveBeenCalled();
    expect(hashPassword).not.toHaveBeenCalled();
  });

  it('a number already on TWO accounts is taken — the login lookup would have said free', async () => {
    const t = build([
      { id: 'b1', email: null, phoneNum: '0171234567' },
      { id: 'b2', email: null, phoneNum: '+60171234567' },
    ]);
    const res = fakeResponse();
    await t.controller.registerMember(register({ phoneNum: '60171234567' }), res);

    expect(res.statusCode).toBe(409);
    expect(t.userRepository.createUser).not.toHaveBeenCalled();
    expect(t.userRepository.getUserByLoginMethod).not.toHaveBeenCalled();
  });

  it('a free email and phone still register (201) — the check is not a blanket refusal', async () => {
    const t = build(EXISTING);
    const res = fakeResponse();
    await t.controller.registerMember(register({ phoneNum: '0112223333' }), res);

    expect(res.statusCode).toBe(201);
    expect(t.userRepository.createUser).toHaveBeenCalledTimes(1);
  });

  it('no phone given: only the email is checked', async () => {
    const t = build(EXISTING);
    const res = fakeResponse();
    await t.controller.registerMember(register({}), res);

    expect(res.statusCode).toBe(201);
    expect(t.userRepository.isLoginValueTaken).toHaveBeenCalledTimes(1);
    expect(t.userRepository.isLoginValueTaken).toHaveBeenCalledWith('email', 'nadia@example.com');
  });
});

describe('POST /auth/register-member — a race lost at the unique index', () => {
  function uniqueViolation(constraint: string) {
    return new DrizzleQueryError(
      'insert into "user" ("email", "phone_num", "password_hash") values ($1, $2, $3)',
      ['nadia@example.com', '0112223333', 'hashed-for-test'],
      Object.assign(new Error(`duplicate key value violates unique constraint "${constraint}"`), {
        code: '23505',
        constraint,
      }),
    );
  }

  it.each([
    ['user_phone_num_unique', 'That phone number is already used by another account'],
    ['user_email_unique', 'That email already has an account — sign in instead.'],
  ])('%s -> 409, never 500', async (constraint, message) => {
    const t = build([], async () => {
      throw uniqueViolation(constraint);
    });
    const res = fakeResponse();
    await t.controller.registerMember(register({ phoneNum: '0112223333' }), res);

    expect(res.statusCode).toBe(409);
    expect(res.body.message).toBe(message);
  });

  it('any other database error is still a 500', async () => {
    const t = build([], async () => {
      throw Object.assign(new Error('connection reset'), { code: '08006' });
    });
    const res = fakeResponse();
    await t.controller.registerMember(register({}), res);

    expect(res.statusCode).toBe(500);
  });
});

describe('UserRepository.isLoginValueTaken — the SQL', () => {
  beforeEach(() => {
    h.selected.length = 0;
    h.rows = [];
  });

  const repo = () => new UserRepositoryClass({} as never, {} as never);
  const where = () => new PgDialect().sqlToQuery(h.selected[0].condition as SQL);

  it.each([
    ['012-345 6789', ['0123456789', '60123456789']],
    ['+60123456789', ['60123456789', '0123456789']],
    ['60123456789', ['60123456789', '0123456789']],
  ])('phone %s is compared on digits against %j', async (typed, candidates) => {
    h.rows = [{ id: 'a1' }];
    await expect(repo().isLoginValueTaken('phone', typed)).resolves.toBe(true);

    expect(h.selected).toHaveLength(1);
    expect(Object.keys(h.selected[0].fields)).toEqual(['id']);
    expect(where().sql).toMatch(
      /regexp_replace\("main"\."user"\."phone_num", '\\D', '', 'g'\) in \(\$1, \$2\)/,
    );
    expect(where().params).toEqual(candidates);
  });

  it('email is compared trimmed and lowercased', async () => {
    await expect(repo().isLoginValueTaken('email', '  Owner@Atlas-Agency.MY ')).resolves.toBe(false);
    expect(where().sql).toMatch(/lower\(btrim\("main"\."user"\."email"\)\) = \$1/);
    expect(where().params).toEqual(['owner@atlas-agency.my']);
  });

  it('a value that cannot match anything asks nothing', async () => {
    await expect(repo().isLoginValueTaken('phone', '12345')).resolves.toBe(false);
    await expect(repo().isLoginValueTaken('email', '   ')).resolves.toBe(false);
    expect(h.selected).toHaveLength(0);
  });
});
