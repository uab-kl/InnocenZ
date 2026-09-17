import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { UserControllerClass } from '@/features/user/user.controller';
import type { UserRepositoryClass } from '@/features/user/user.repository';
import type { UserProfileRepositoryClass } from '@/features/user/user-profile/user-profile.repository';

/**
 * `PATCH /user/:id` and the sign-in contact (contract §5).
 *
 * This route used to write `user.email` from the body with no code to either
 * address. It now ignores an UNCHANGED email (the phone's profile form sends
 * the whole record back on every save) and refuses a changed one — including
 * clearing it — with 400 BEFORE any write, pointing at Security settings.
 *
 * The assertions are on what the CONTROLLER hands the repository, because that
 * is the write that would have re-pointed somebody's reset codes.
 */

const USER_ID = '11111111-1111-4111-8111-111111111111';

function account(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    username: 'vicky',
    email: 'Owner@Atlas-Agency.my',
    phoneNum: '+60123456789',
    passwordHash: 'hash',
    profileImage: null,
    status: 'active',
    ...overrides,
  };
}

function fakes(existing = account()) {
  const updateUser = vi.fn(async (patch: Record<string, unknown>) => ({
    ...existing,
    ...patch,
  }));
  const userRepository = {
    getUserById: vi.fn(async () => existing),
    updateUser,
  } as unknown as UserRepositoryClass & { updateUser: typeof updateUser };
  const profileUpdate = vi.fn(async () => ({}));
  const userProfileRepository = {
    getByUserId: vi.fn(async () => null),
    createEmpty: vi.fn(async () => ({})),
    update: profileUpdate,
  } as unknown as UserProfileRepositoryClass & { update: typeof profileUpdate };
  return { userRepository, userProfileRepository, updateUser, profileUpdate };
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

function patchRequest(body: Record<string, unknown>) {
  return {
    params: { id: USER_ID },
    body,
    user: { id: USER_ID },
  } as unknown as Request;
}

describe('PATCH /user/:id — sign-in email and phone', () => {
  it('ignores the same email in a different case: 200 and no email in the write', async () => {
    const { userRepository, userProfileRepository, updateUser } = fakes();
    const controller = new UserControllerClass(userRepository, userProfileRepository);
    const res = fakeResponse();

    await controller.updateProfile(
      patchRequest({ username: 'vicky', email: '  owner@atlas-agency.MY ' }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(updateUser).toHaveBeenCalledTimes(1);
    const [patch] = updateUser.mock.calls[0];
    expect(patch).not.toHaveProperty('email');
    expect(patch).not.toHaveProperty('phoneNum');
    expect(patch).toMatchObject({ username: 'vicky' });
  });

  it('refuses a different email with 400 and never calls updateUser', async () => {
    const { userRepository, userProfileRepository, updateUser, profileUpdate } = fakes();
    const controller = new UserControllerClass(userRepository, userProfileRepository);
    const res = fakeResponse();

    await controller.updateProfile(
      patchRequest({ username: 'vicky', fullName: 'Victoria Tan', email: 'attacker@example.com' }),
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe('Change your email from Security settings');
    expect(updateUser).not.toHaveBeenCalled();
    // Nothing else in the same request lands either — the refusal is first.
    expect(profileUpdate).not.toHaveBeenCalled();
  });

  it("refuses '' when an email exists (clearing is a change)", async () => {
    const { userRepository, userProfileRepository, updateUser } = fakes();
    const controller = new UserControllerClass(userRepository, userProfileRepository);
    const res = fakeResponse();

    await controller.updateProfile(patchRequest({ username: 'vicky', email: '' }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe('Change your email from Security settings');
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("accepts '' when the account has no email (nothing changes)", async () => {
    const { userRepository, userProfileRepository, updateUser } = fakes(
      account({ email: null }),
    );
    const controller = new UserControllerClass(userRepository, userProfileRepository);
    const res = fakeResponse();

    await controller.updateProfile(patchRequest({ username: 'vicky', email: '' }), res);

    expect(res.statusCode).toBe(200);
    expect(updateUser.mock.calls[0][0]).not.toHaveProperty('email');
  });

  it('refuses a different phone with 400 and never calls updateUser', async () => {
    const { userRepository, userProfileRepository, updateUser } = fakes();
    const controller = new UserControllerClass(userRepository, userProfileRepository);
    const res = fakeResponse();

    await controller.updateProfile(
      patchRequest({ username: 'vicky', phoneNum: '+60199999999' }),
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe('Change your phone from Security settings');
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('ignores the same phone written another way (local 0-prefix)', async () => {
    const { userRepository, userProfileRepository, updateUser } = fakes();
    const controller = new UserControllerClass(userRepository, userProfileRepository);
    const res = fakeResponse();

    await controller.updateProfile(
      patchRequest({ username: 'vicky', phoneNum: '012-345 6789' }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(updateUser.mock.calls[0][0]).not.toHaveProperty('phoneNum');
  });

  it('still refuses another person\'s record with 403 before looking at the email', async () => {
    const { userRepository, userProfileRepository, updateUser } = fakes();
    const controller = new UserControllerClass(userRepository, userProfileRepository);
    const res = fakeResponse();

    await controller.updateProfile(
      {
        params: { id: USER_ID },
        body: { username: 'vicky', email: 'attacker@example.com' },
        user: { id: '22222222-2222-4222-8222-222222222222' },
      } as unknown as Request,
      res,
    );

    expect(res.statusCode).toBe(403);
    expect(updateUser).not.toHaveBeenCalled();
    expect(userRepository.getUserById).not.toHaveBeenCalled();
  });
});
