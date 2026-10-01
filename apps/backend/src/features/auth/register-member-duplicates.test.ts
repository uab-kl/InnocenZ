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
 *  - the code emailed to the address is spent FIRST (owner, 30 Sep 2026), so a
 *    taken email (any case / spacing) -> 409 naming the email, no insert;
 *  - a taken phone in ANY form sign-in accepts (`0…`, `60…`, `+60…`, spaced) ->
 *    409 in the general sentence (the code proves the inbox, not the phone);
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
import { OrgMemberInviteControllerClass } from './org-member-invite.controller';
import {
  SIGNUP_EMAIL_CODE_EXPIRED,
  SIGNUP_EMAIL_HAS_ACCOUNT,
  SIGNUP_NOT_COMPLETED,
} from './account-answers';
import type { SignupEmailProof } from './signup-email-code';

const NEW_USER_ID = '66666666-6666-4666-8666-666666666666';
const CODE_ID = '11111111-2222-4333-8444-555555555555';

type Account = { id: string; email: string | null; phoneNum: string | null };

/** The emailed code's spender (signup-email-code.ts): proved unless told otherwise. */
function fakeProof(answer: SignupEmailProof = { ok: true }) {
  return { redeem: vi.fn(async () => answer) };
}

function build(
  directory: Account[],
  createUser?: () => Promise<unknown>,
  proof = fakeProof(),
) {
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
    proof,
  );
  return { controller, userRepository, proof };
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
      emailCodeId: CODE_ID,
      emailCode: '123456',
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
  it('409 NAMING the email (its code proved the address), any case and spacing, and nothing inserted', async () => {
    const t = build(EXISTING);
    const res = fakeResponse();
    await t.controller.registerMember(register({ email: '  OWNER@atlas-agency.MY ' }), res);

    expect(res.statusCode).toBe(409);
    expect(res.body.message).toBe(SIGNUP_EMAIL_HAS_ACCOUNT);
    expect(t.userRepository.createUser).not.toHaveBeenCalled();
    expect(hashPassword).not.toHaveBeenCalled();
  });

  it('a made-up organisation is refused BEFORE the email is looked up — never 409-vs-404', async () => {
    // Security review, 30 Sep 2026: after the lookups, a bogus org answered
    // 409 for a taken email and 404 for a free one, creating nothing.
    const t = build(EXISTING);
    const agencyRepository = { getById: vi.fn(async () => null) };
    const proof = fakeProof();
    const unused = {} as never;
    const controller = new OrgMemberInviteControllerClass(
      unused,
      unused,
      unused,
      unused,
      agencyRepository as never,
      t.userRepository as never,
      unused,
      unused,
      { update: vi.fn(async () => ({})) } as never,
      proof,
    );
    const taken = fakeResponse();
    const join = JSON.stringify({
      kind: 'agency',
      orgId: '11111111-1111-4111-8111-111111111111',
      subRole: 'finance',
    });
    await controller.registerMember(register({ email: 'owner@atlas-agency.my', join }), taken);

    expect(taken.statusCode).toBe(404);
    expect(t.userRepository.isLoginValueTaken).not.toHaveBeenCalled();
    // Nor is the typist's code spent by a request that was never going to work.
    expect(proof.redeem).not.toHaveBeenCalled();
  });

  it('a taken PHONE gets the general sentence; both are always checked, whichever decided', async () => {
    const byEmail = build(EXISTING);
    const byPhone = build(EXISTING);
    const emailRes = fakeResponse();
    const phoneRes = fakeResponse();
    await byEmail.controller.registerMember(
      register({ email: 'owner@atlas-agency.my', phoneNum: '0112223333' }),
      emailRes,
    );
    await byPhone.controller.registerMember(register({ phoneNum: '0123456789' }), phoneRes);

    // The address was proved by its code; the phone never is here.
    expect(emailRes.body).toEqual({ success: false, message: SIGNUP_EMAIL_HAS_ACCOUNT, data: null });
    expect(phoneRes.body).toEqual({ success: false, message: SIGNUP_NOT_COMPLETED, data: null });
    // The phone is looked up even though the email already decided the answer.
    expect(byEmail.userRepository.isLoginValueTaken).toHaveBeenCalledWith('phone', '0112223333');
  });
});

describe('POST /auth/register-member — the emailed code comes first (owner, 30 Sep 2026)', () => {
  it('spends the code for the address typed — normalised — before anything is looked up', async () => {
    const t = build(EXISTING);
    const res = fakeResponse();
    await t.controller.registerMember(register({ email: '  Nadia@Example.COM ' }), res);

    expect(t.proof.redeem).toHaveBeenCalledWith({
      codeId: CODE_ID,
      code: '123456',
      email: 'nadia@example.com',
      actor: 'member-signup',
    });
    expect(res.statusCode).toBe(201);
  });

  it.each([
    ['no code', { ok: false, status: 400, message: 'Verify your email first — we will send you a 6-digit code' }],
    ['an expired code', { ok: false, status: 400, message: SIGNUP_EMAIL_CODE_EXPIRED }],
    ['too many wrong codes', { ok: false, status: 429, message: 'Too many attempts — request a new code' }],
  ] as const)('%s: the refusal as sent, and nothing looked up or created', async (_label, answer) => {
    const t = build(EXISTING, undefined, fakeProof(answer as SignupEmailProof));
    const res = fakeResponse();
    // A TAKEN email: were it looked up, the answer would be a 409.
    await t.controller.registerMember(register({ email: 'owner@atlas-agency.my' }), res);

    expect(res.statusCode).toBe(answer.status);
    expect(res.body).toEqual({ success: false, message: answer.message, data: null });
    expect(t.userRepository.isLoginValueTaken).not.toHaveBeenCalled();
    expect(t.userRepository.createUser).not.toHaveBeenCalled();
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
    expect(res.body.message).toBe(SIGNUP_NOT_COMPLETED);
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

  it('a 0060… number is the same line as +60… — refused, never a second account', async () => {
    const t = build(EXISTING);
    const res = fakeResponse();
    await t.controller.registerMember(register({ phoneNum: '0060123456789' }), res);
    expect(res.statusCode).toBe(409);
    expect(t.userRepository.createUser).not.toHaveBeenCalled();
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

  it.each(['user_phone_num_unique', 'user_email_unique'])(
    '%s -> 409 in the general sentence, never 500',
    async (constraint) => {
      const t = build([], async () => {
        throw uniqueViolation(constraint);
      });
      const res = fakeResponse();
      await t.controller.registerMember(register({ phoneNum: '0112223333' }), res);

      expect(res.statusCode).toBe(409);
      expect(res.body.message).toBe(SIGNUP_NOT_COMPLETED);
    },
  );

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
    ['012-345 6789', ['0123456789', '60123456789', '0060123456789']],
    ['+60123456789', ['60123456789', '0060123456789', '0123456789']],
    ['60123456789', ['60123456789', '0060123456789', '0123456789']],
    // The international dialling prefix is the same line (security review, 30 Sep 2026).
    ['0060123456789', ['0060123456789', '60123456789', '0123456789']],
  ])('phone %s is compared on digits against %j', async (typed, candidates) => {
    h.rows = [{ id: 'a1' }];
    await expect(repo().isLoginValueTaken('phone', typed)).resolves.toBe(true);

    expect(h.selected).toHaveLength(1);
    expect(Object.keys(h.selected[0].fields)).toEqual(['id']);
    expect(where().sql).toMatch(
      /regexp_replace\("main"\."user"\."phone_num", '\\D', '', 'g'\) in \(\$1, \$2, \$3\)/,
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
