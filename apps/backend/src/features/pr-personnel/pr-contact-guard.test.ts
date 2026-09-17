import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// A brand-new stub mints its PR code in the database; nothing here may reach it.
vi.mock('@/util/member-code', () => ({ ensurePersonCode: vi.fn(async () => undefined) }));

import { PrControllerClass } from '@/features/pr-personnel/pr.controller';
import { phoneLoginCandidates } from '@/features/user/user.repository';

/**
 * The agency's PR writers and the sign-in contact (contract §5).
 *
 * `PUT /pr/:id` wrote `user.email` / `user.phone_num` from the Manage PR form,
 * and `POST /pr` handed `ensureOpsBridge` the typed phone AND email — `null` for
 * a blank one — which wrote both onto whichever EXISTING account the phone or
 * email matched. An agency could therefore re-point a signed-up PR's reset
 * codes, and merely adding her by phone wiped her email.
 *
 * Rules pinned here:
 *  - a changed value on an ACTIVATED account (password set) -> 403, no writes;
 *  - an unchanged value (any case / formatting) -> ignored, the rest saves;
 *  - a never-activated stub may be corrected by an admin, or by the agency that
 *    created it while no other agency rosters it — any other agency -> 403;
 *  - the correction is one conditional write made FIRST; its refusal is a
 *    403 / 409, never a 200 over a write that did not land;
 *  - POST /pr with a raw userId from a non-admin -> 403;
 *  - POST /pr finds an account whose phone is on file with a `00` prefix.
 */

const PR_ID = '33333333-3333-4333-8333-333333333333';
const AGENCY_ID = '44444444-4444-4444-8444-444444444444';
const AGENCY_CALLER = '55555555-5555-4555-8555-555555555555';
/** Another member of the caller's agency — invited the stub, then went home. */
const AGENCY_COLLEAGUE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_AGENCY_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OTHER_AGENCY_MEMBER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ADMIN_CALLER = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

type Account = {
  id: string;
  username: string;
  email: string | null;
  phoneNum: string | null;
  passwordHash: string | null;
  createdBy: string;
};

function activatedAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: PR_ID,
    username: 'vicky',
    email: 'vicky@example.com',
    phoneNum: '+60123456789',
    passwordHash: 'bcrypt-hash',
    // What every live roster account carries today: a seed label, not a person.
    createdBy: 'seed-wwm-prs',
    ...overrides,
  };
}

/** A never-activated stub, invited by a member of the caller's own agency. */
function ownStub(overrides: Partial<Account> = {}): Account {
  return activatedAccount({ passwordHash: null, createdBy: AGENCY_COLLEAGUE, ...overrides });
}

function prRow() {
  return {
    id: PR_ID,
    userId: PR_ID,
    agencyId: AGENCY_ID,
    name: 'Victoria Tan',
    nickname: 'vicky',
    tier: 'tier_1',
    status: 'active',
    rejectReason: null,
    phone: '+60123456789',
    email: 'vicky@example.com',
    icNo: null,
    profile: null,
    roster: null,
  };
}

/** Every agency each person is a member of (`agency_user`). */
const AGENCY_MEMBERSHIPS: Record<string, string[]> = {
  [AGENCY_CALLER]: [AGENCY_ID],
  [AGENCY_COLLEAGUE]: [AGENCY_ID],
  [OTHER_AGENCY_MEMBER]: [OTHER_AGENCY_ID],
};

function build(options: {
  account: Account | null;
  roles?: string[];
  /**
   * The accounts `getUserByLoginMethod` searches, with the REAL matching rule:
   * email lower/trim equality, phone digits against `phoneLoginCandidates`,
   * null on ambiguity. An exact `method:value` fake could not see a `00` miss.
   */
  directory?: Account[];
  /** Agencies with an `agency_pr` row for the account (default: the caller's). */
  rosterAgencyIds?: string[];
  /** What the conditional contact write reports. */
  stubWrite?: 'updated' | 'activated' | 'email_taken' | 'phone_taken';
  /** What `userRepository.updateUser` answers (null = it swallowed an error). */
  updateUserResult?: Account | null;
}) {
  const prRepository = {
    getById: vi.fn(async () => prRow()),
    update: vi.fn(async () => prRow()),
    ensureOpsBridge: vi.fn(async () => prRow()),
    listMembershipAgencyIds: vi.fn(async () => options.rosterAgencyIds ?? [AGENCY_ID]),
    writeStubSignInContact: vi.fn(async () => options.stubWrite ?? 'updated'),
  };
  const agencyMemberRepository = {
    listByUser: vi.fn(async (userId: string) =>
      (AGENCY_MEMBERSHIPS[userId] ?? []).map((agencyId) => ({ agencyId, status: 'active' })),
    ),
  };
  const authRepository = {
    getRolesForUserIds: vi.fn(async () =>
      (options.roles ?? ['agency']).map((roleName) => ({ roleName })),
    ),
  };
  const outletMemberRepository = { listByUser: vi.fn(async () => []) };
  const agencyPrRepository = {
    upsertLink: vi.fn(async () => undefined),
    updateMembership: vi.fn(async () => undefined),
    upsertRosterProfile: vi.fn(async () => undefined),
  };
  const directory = options.directory ?? [];
  const userRepository = {
    getUserById: vi.fn(async () => options.account),
    getUserByLoginMethod: vi.fn(async (method: string, value: string) => {
      const matches =
        method === 'email'
          ? directory.filter(
              (a) => (a.email ?? '').trim().toLowerCase() === value.trim().toLowerCase(),
            )
          : directory.filter((a) =>
              phoneLoginCandidates(value).includes((a.phoneNum ?? '').replace(/\D/g, '')),
            );
      return matches.length === 1 ? matches[0] : null;
    }),
    updateUser: vi.fn(async () =>
      options.updateUserResult === undefined ? options.account : options.updateUserResult,
    ),
    createUser: vi.fn(async () => ({ id: '66666666-6666-4666-8666-666666666666' })),
  };
  const userProfileRepository = {
    update: vi.fn(async () => ({})),
    getByUserId: vi.fn(async () => null),
    createEmpty: vi.fn(async () => ({})),
  };
  const userRoleRepository = { assignRoleToUser: vi.fn(async () => undefined) };
  const roleRepository = { getRoleByName: vi.fn(async () => null) };
  const unused = {} as never;

  const controller = new PrControllerClass(
    prRepository as never,
    agencyMemberRepository as never,
    authRepository as never,
    outletMemberRepository as never,
    agencyPrRepository as never,
    unused,
    unused,
    unused,
    userRepository as never,
    userProfileRepository as never,
    userRoleRepository as never,
    roleRepository as never,
    unused,
  );
  return {
    controller,
    prRepository,
    agencyMemberRepository,
    agencyPrRepository,
    userRepository,
    userProfileRepository,
  };
}

function fakeResponse() {
  const res = {
    statusCode: 0,
    body: null as unknown as { success: boolean; message: string },
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: { success: boolean; message: string }) {
      res.body = payload;
      return res;
    },
  };
  return res as unknown as Response & typeof res;
}

function request(
  body: Record<string, unknown>,
  params: Record<string, string> = {},
  callerId = AGENCY_CALLER,
) {
  return {
    params,
    body,
    query: {},
    user: { id: callerId },
    header: () => undefined,
  } as unknown as Request;
}

const NOT_YOURS = 'Only the PR can change their sign-in email or phone';

describe('PUT /pr/:id — sign-in email and phone', () => {
  it('refuses a changed email on an activated account with 403 and writes nothing', async () => {
    const t = build({ account: activatedAccount() });
    const res = fakeResponse();

    await t.controller.update(
      request({ email: 'agency-pick@example.com', name: 'Victoria Tan', tier: 'tier_2' }, { id: PR_ID }),
      res,
    );

    expect(res.statusCode).toBe(403);
    expect(res.body.message).toBe(NOT_YOURS);
    expect(t.prRepository.writeStubSignInContact).not.toHaveBeenCalled();
    expect(t.userRepository.updateUser).not.toHaveBeenCalled();
    expect(t.userProfileRepository.update).not.toHaveBeenCalled();
    expect(t.agencyPrRepository.updateMembership).not.toHaveBeenCalled();
    expect(t.prRepository.update).not.toHaveBeenCalled();
  });

  it('refuses a changed phone on an activated account with 403', async () => {
    const t = build({ account: activatedAccount() });
    const res = fakeResponse();

    await t.controller.update(request({ phone: '+60199999999' }, { id: PR_ID }), res);

    expect(res.statusCode).toBe(403);
    expect(t.prRepository.writeStubSignInContact).not.toHaveBeenCalled();
    expect(t.prRepository.update).not.toHaveBeenCalled();
  });

  it('saves the rest when email and phone come back unchanged (case / formatting)', async () => {
    const t = build({ account: activatedAccount() });
    const res = fakeResponse();

    await t.controller.update(
      request(
        { email: 'VICKY@Example.com', phone: '012-345 6789', tier: 'tier_2' },
        { id: PR_ID },
      ),
      res,
    );

    expect(res.statusCode).toBe(200);
    // No sign-in contact write at all — and not through the repository either.
    expect(t.prRepository.writeStubSignInContact).not.toHaveBeenCalled();
    expect(t.userRepository.updateUser).not.toHaveBeenCalled();
    const [, repoPatch] = t.prRepository.update.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
    ];
    expect(repoPatch).not.toHaveProperty('email');
    expect(repoPatch).not.toHaveProperty('phone');
    expect(t.agencyPrRepository.updateMembership).toHaveBeenCalledWith(
      AGENCY_ID,
      PR_ID,
      expect.objectContaining({ tier: 'tier_2' }),
      AGENCY_CALLER,
    );
  });

  it("accepts email '' for a PR with no email on file (the editor sends the whole form)", async () => {
    const t = build({ account: activatedAccount({ email: null }) });
    const res = fakeResponse();

    await t.controller.update(
      request({ email: '', phone: '+60123456789', race: 'Chinese' }, { id: PR_ID }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(t.prRepository.writeStubSignInContact).not.toHaveBeenCalled();
    expect(t.userRepository.updateUser).not.toHaveBeenCalled();
    expect(t.userProfileRepository.update).toHaveBeenCalled();
  });

  it("refuses email '' on an activated account that has one (clearing is a change)", async () => {
    const t = build({ account: activatedAccount() });
    const res = fakeResponse();

    await t.controller.update(request({ email: '' }, { id: PR_ID }), res);

    expect(res.statusCode).toBe(403);
    expect(t.prRepository.writeStubSignInContact).not.toHaveBeenCalled();
  });

  it('lets the creating agency correct its never-activated stub, stored lowercase, written first', async () => {
    const t = build({ account: ownStub() });
    const res = fakeResponse();

    await t.controller.update(
      request(
        { email: 'Corrected@Example.com', phone: '0198887777', tier: 'tier_2' },
        { id: PR_ID },
      ),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(t.prRepository.writeStubSignInContact).toHaveBeenCalledWith(
      PR_ID,
      { email: 'corrected@example.com', phoneNum: '+60198887777' },
      AGENCY_CALLER,
    );
    // Before any other write, so a refusal it meets leaves nothing half-saved.
    expect(t.prRepository.writeStubSignInContact.mock.invocationCallOrder[0]).toBeLessThan(
      t.agencyPrRepository.updateMembership.mock.invocationCallOrder[0],
    );
    // The contact never travels through the error-swallowing user write.
    expect(t.userRepository.updateUser).not.toHaveBeenCalled();
    const [, repoPatch] = t.prRepository.update.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
    ];
    expect(repoPatch).not.toHaveProperty('email');
  });

  it("refuses to correct a stub another agency's member created (the takeover path)", async () => {
    const t = build({ account: ownStub({ createdBy: OTHER_AGENCY_MEMBER }) });
    const res = fakeResponse();

    await t.controller.update(
      request({ email: 'agency-b-inbox@example.com', tier: 'tier_2' }, { id: PR_ID }),
      res,
    );

    expect(res.statusCode).toBe(403);
    expect(res.body.message).toBe(NOT_YOURS);
    expect(t.prRepository.writeStubSignInContact).not.toHaveBeenCalled();
    expect(t.userProfileRepository.update).not.toHaveBeenCalled();
    expect(t.agencyPrRepository.updateMembership).not.toHaveBeenCalled();
    expect(t.prRepository.update).not.toHaveBeenCalled();
  });

  it('refuses the creating agency once another agency also rosters the stub', async () => {
    const t = build({ account: ownStub(), rosterAgencyIds: [AGENCY_ID, OTHER_AGENCY_ID] });
    const res = fakeResponse();

    await t.controller.update(request({ email: 'fixed@example.com' }, { id: PR_ID }), res);

    expect(res.statusCode).toBe(403);
    expect(t.prRepository.writeStubSignInContact).not.toHaveBeenCalled();
  });

  it('refuses an agency for a stub no person created, and lets an admin correct it', async () => {
    const seeded = ownStub({ createdBy: 'system' });

    const agency = build({ account: seeded });
    const agencyRes = fakeResponse();
    await agency.controller.update(request({ email: 'fixed@example.com' }, { id: PR_ID }), agencyRes);
    expect(agencyRes.statusCode).toBe(403);
    expect(agency.prRepository.writeStubSignInContact).not.toHaveBeenCalled();
    // A label is never handed to the uuid-column lookup (that is a cast error).
    expect(agency.agencyMemberRepository.listByUser).not.toHaveBeenCalledWith('system');

    const admin = build({ account: seeded, roles: ['admin'] });
    const adminRes = fakeResponse();
    await admin.controller.update(
      request({ email: 'fixed@example.com', agencyId: AGENCY_ID }, { id: PR_ID }, ADMIN_CALLER),
      adminRes,
    );
    expect(adminRes.statusCode).toBe(200);
    expect(admin.prRepository.writeStubSignInContact).toHaveBeenCalledWith(
      PR_ID,
      { email: 'fixed@example.com' },
      ADMIN_CALLER,
    );
  });

  it('refuses a correction to an email another account holds with 409, before writing', async () => {
    const other = activatedAccount({ id: '77777777-7777-4777-8777-777777777777', email: 'taken@example.com' });
    const t = build({ account: ownStub(), directory: [other] });
    const res = fakeResponse();

    await t.controller.update(request({ email: 'Taken@Example.com' }, { id: PR_ID }), res);

    expect(res.statusCode).toBe(409);
    expect(res.body.message).toBe('That email is already used by another account');
    expect(t.prRepository.writeStubSignInContact).not.toHaveBeenCalled();
    expect(t.prRepository.update).not.toHaveBeenCalled();
  });

  it('refuses a phone held by an account on file with a 00 prefix with 409', async () => {
    const other = activatedAccount({
      id: '77777777-7777-4777-8777-777777777777',
      email: null,
      phoneNum: '0060198887777',
    });
    const t = build({ account: ownStub(), directory: [other] });
    const res = fakeResponse();

    await t.controller.update(request({ phone: '019-888 7777' }, { id: PR_ID }), res);

    expect(res.statusCode).toBe(409);
    expect(res.body.message).toBe('That phone number is already used by another account');
    expect(t.prRepository.writeStubSignInContact).not.toHaveBeenCalled();
  });

  it('answers 403 when the account was activated between the check and the write', async () => {
    const t = build({ account: ownStub(), stubWrite: 'activated' });
    const res = fakeResponse();

    await t.controller.update(
      request({ email: 'fixed@example.com', name: 'Victoria Tan', tier: 'tier_2' }, { id: PR_ID }),
      res,
    );

    expect(res.statusCode).toBe(403);
    expect(res.body.message).toBe(NOT_YOURS);
    expect(t.userProfileRepository.update).not.toHaveBeenCalled();
    expect(t.agencyPrRepository.updateMembership).not.toHaveBeenCalled();
    expect(t.prRepository.update).not.toHaveBeenCalled();
  });

  it('answers 409 — not 200 "Profile saved" — when the unique index refuses the write', async () => {
    // The pre-check saw no holder (e.g. getUserByLoginMethod answered null on
    // an ambiguous match); the database still said no.
    const t = build({ account: ownStub(), stubWrite: 'email_taken' });
    const res = fakeResponse();

    await t.controller.update(
      request({ email: 'fixed@example.com', nickname: 'vix' }, { id: PR_ID }),
      res,
    );

    expect(res.statusCode).toBe(409);
    expect(res.body.message).toBe('That email is already used by another account');
    expect(t.userRepository.updateUser).not.toHaveBeenCalled();
    expect(t.prRepository.update).not.toHaveBeenCalled();
  });

  it('answers 500 when the nickname write is swallowed, instead of "Profile saved"', async () => {
    const t = build({ account: activatedAccount(), updateUserResult: null });
    const res = fakeResponse();

    await t.controller.update(request({ nickname: 'vix' }, { id: PR_ID }), res);

    expect(t.userRepository.updateUser).toHaveBeenCalledWith(
      { username: 'vix', updatedBy: AGENCY_CALLER },
      PR_ID,
    );
    expect(res.statusCode).toBe(500);
    expect(t.prRepository.update).not.toHaveBeenCalled();
  });
});

describe('POST /pr — existing accounts keep their sign-in contact', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('refuses a raw userId from a non-admin caller with 403', async () => {
    const t = build({ account: activatedAccount() });
    const res = fakeResponse();

    await t.controller.create(request({ name: 'Victoria Tan', userId: PR_ID }), res);

    expect(res.statusCode).toBe(403);
    expect(t.userRepository.getUserById).not.toHaveBeenCalled();
    expect(t.prRepository.ensureOpsBridge).not.toHaveBeenCalled();
    expect(t.agencyPrRepository.upsertLink).not.toHaveBeenCalled();
  });

  it('matching an activated account by phone never writes its email or phone', async () => {
    const account = activatedAccount();
    const t = build({ account, directory: [account] });
    const res = fakeResponse();

    // Blank email: the old path passed `email: null` and wiped hers.
    await t.controller.create(request({ name: 'Victoria Tan', phone: '0123456789' }), res);

    expect(res.statusCode).toBe(201);
    expect(t.userRepository.createUser).not.toHaveBeenCalled();
    expect(t.userRepository.updateUser).not.toHaveBeenCalled();
    expect(t.prRepository.writeStubSignInContact).not.toHaveBeenCalled();
    const [bridge] = t.prRepository.ensureOpsBridge.mock.calls[0] as unknown as [
      Record<string, unknown>,
    ];
    expect(bridge.userId).toBe(PR_ID);
    expect(bridge.email).toBeUndefined();
    expect(bridge.phone).toBeUndefined();
  });

  it('matching an activated account with its own email in another case is not a change', async () => {
    const account = activatedAccount();
    const t = build({ account, directory: [account] });
    const res = fakeResponse();

    await t.controller.create(
      request({ name: 'Victoria Tan', phone: '+60 12-345 6789', email: 'Vicky@Example.COM' }),
      res,
    );

    expect(res.statusCode).toBe(201);
    expect(t.prRepository.writeStubSignInContact).not.toHaveBeenCalled();
    const [bridge] = t.prRepository.ensureOpsBridge.mock.calls[0] as unknown as [
      Record<string, unknown>,
    ];
    expect(bridge.email).toBeUndefined();
    expect(bridge.phone).toBeUndefined();
  });

  it('matching an activated account with a DIFFERENT email is refused with 403 before any write', async () => {
    const account = activatedAccount();
    const t = build({ account, directory: [account] });
    const res = fakeResponse();

    await t.controller.create(
      request({ name: 'Victoria Tan', phone: '0123456789', email: 'agency-pick@example.com' }),
      res,
    );

    expect(res.statusCode).toBe(403);
    expect(res.body.message).toBe(NOT_YOURS);
    expect(t.userProfileRepository.update).not.toHaveBeenCalled();
    expect(t.agencyPrRepository.upsertLink).not.toHaveBeenCalled();
    expect(t.prRepository.ensureOpsBridge).not.toHaveBeenCalled();
    expect(t.prRepository.writeStubSignInContact).not.toHaveBeenCalled();
    expect(t.userRepository.updateUser).not.toHaveBeenCalled();
  });

  it("agency B typing agency A's stub phone plus its own email is refused with 403, nothing written", async () => {
    const stubOfA = ownStub({ createdBy: OTHER_AGENCY_MEMBER, email: null });
    const t = build({ account: stubOfA, directory: [stubOfA], rosterAgencyIds: [OTHER_AGENCY_ID] });
    const res = fakeResponse();

    await t.controller.create(
      request({ name: 'Victoria Tan', phone: '0123456789', email: 'agency-b-inbox@example.com' }),
      res,
    );

    expect(res.statusCode).toBe(403);
    expect(res.body.message).toBe(NOT_YOURS);
    expect(t.prRepository.writeStubSignInContact).not.toHaveBeenCalled();
    expect(t.userProfileRepository.update).not.toHaveBeenCalled();
    expect(t.agencyPrRepository.upsertLink).not.toHaveBeenCalled();
    expect(t.prRepository.ensureOpsBridge).not.toHaveBeenCalled();
    expect(t.userRepository.createUser).not.toHaveBeenCalled();
  });

  it('the creating agency re-inviting its stub with a corrected email writes it first, not via the bridge', async () => {
    const stub = ownStub({ email: 'typo@example.con' });
    const t = build({ account: stub, directory: [stub] });
    const res = fakeResponse();

    await t.controller.create(
      request({ name: 'Victoria Tan', phone: '0123456789', email: 'Vicky@Example.com' }),
      res,
    );

    expect(res.statusCode).toBe(201);
    expect(t.prRepository.writeStubSignInContact).toHaveBeenCalledWith(
      PR_ID,
      { email: 'vicky@example.com' },
      AGENCY_CALLER,
    );
    expect(t.prRepository.writeStubSignInContact.mock.invocationCallOrder[0]).toBeLessThan(
      t.agencyPrRepository.upsertLink.mock.invocationCallOrder[0],
    );
    const [bridge] = t.prRepository.ensureOpsBridge.mock.calls[0] as unknown as [
      Record<string, unknown>,
    ];
    expect(bridge.email).toBeUndefined();
    expect(bridge.phone).toBeUndefined();
  });

  it('a stub correction that loses a race is refused before the link is written', async () => {
    // Matched by its email; the typed phone is a correction the pre-check let
    // through and the unique index then refused.
    const stub = ownStub();
    const t = build({ account: stub, directory: [stub], stubWrite: 'phone_taken' });
    const res = fakeResponse();

    await t.controller.create(
      request({ name: 'Victoria Tan', email: 'vicky@example.com', phone: '0198887777' }),
      res,
    );

    expect(t.userRepository.createUser).not.toHaveBeenCalled();
    expect(t.prRepository.writeStubSignInContact).toHaveBeenCalledWith(
      PR_ID,
      { phoneNum: '+60198887777' },
      AGENCY_CALLER,
    );
    expect(res.statusCode).toBe(409);
    expect(res.body.message).toBe('That phone number is already used by another account');
    expect(t.agencyPrRepository.upsertLink).not.toHaveBeenCalled();
    expect(t.prRepository.ensureOpsBridge).not.toHaveBeenCalled();
  });

  it.each([
    ['00123456789', '00123456789'],
    ['0060123456789', '+60 12-345 6789'],
  ])(
    'finds the account whose phone is on file as %s (typed %s) instead of creating a duplicate',
    async (onFile, typed) => {
      const account = activatedAccount({ phoneNum: onFile, email: null });
      const t = build({ account, directory: [account] });
      const res = fakeResponse();

      await t.controller.create(request({ name: 'Victoria Tan', phone: typed }), res);

      expect(res.statusCode).toBe(201);
      expect(t.userRepository.createUser).not.toHaveBeenCalled();
      const [bridge] = t.prRepository.ensureOpsBridge.mock.calls[0] as unknown as [
        Record<string, unknown>,
      ];
      expect(bridge.userId).toBe(PR_ID);
      // Same line: nothing to write.
      expect(t.prRepository.writeStubSignInContact).not.toHaveBeenCalled();
    },
  );

  it('a fallback spelling never hands back a DIFFERENT line', async () => {
    // `phoneLoginCandidates('0060123456789')` also yields 60060123456789 — a
    // different number by the normaliser, which must not be adopted.
    const differentLine = activatedAccount({ phoneNum: '+60060123456789', email: null });
    const t = build({ account: null, directory: [differentLine] });
    const res = fakeResponse();

    await t.controller.create(request({ name: 'New Person', phone: '0060123456789' }), res);

    expect(res.statusCode).toBe(201);
    expect(t.userRepository.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ phoneNum: '+60123456789' }),
    );
  });

  it('a brand-new PR is still created, email lowercase and phone +digits', async () => {
    const t = build({ account: null });
    const res = fakeResponse();

    await t.controller.create(
      request({ name: 'New Person', phone: '012 222 3333', email: 'New.Person@Example.com' }),
      res,
    );

    expect(res.statusCode).toBe(201);
    expect(t.userRepository.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'new.person@example.com',
        phoneNum: '+60122223333',
        passwordHash: null,
        createdBy: AGENCY_CALLER,
      }),
    );
    expect(t.prRepository.ensureOpsBridge).toHaveBeenCalledTimes(1);
  });

  it('an admin may still attach an account by userId', async () => {
    const t = build({ account: activatedAccount(), roles: ['admin'] });
    const res = fakeResponse();

    await t.controller.create(
      request({ name: 'Victoria Tan', userId: PR_ID, agencyId: AGENCY_ID }, {}, ADMIN_CALLER),
      res,
    );

    expect(res.statusCode).toBe(201);
    const [bridge] = t.prRepository.ensureOpsBridge.mock.calls[0] as unknown as [
      Record<string, unknown>,
    ];
    expect(bridge.userId).toBe(PR_ID);
    expect(bridge.email).toBeUndefined();
  });
});
