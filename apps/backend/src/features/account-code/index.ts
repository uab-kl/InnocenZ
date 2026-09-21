import {
  authRepository,
  jwtController,
  orgMemberInviteRepository,
  phoneVerificationRepository,
  userRepository,
} from '@/composition-root.js';
import { comparePassword, hashPassword } from '@/util/password.js';
import { normalizeInviteEmail } from '@/util/org-member-invite.js';
import { AccountCodeRepositoryClass } from './account-code.repository.js';
import { ContactChangeControllerClass } from './contact-change.controller.js';
import { deliverCode } from './delivery.js';
import { ForgotPasswordControllerClass } from './forgot-password.controller.js';
import { accountNotices } from './notices.js';
import { PasswordChangeControllerClass } from './password-change.controller.js';

/**
 * Wiring for the account-code controllers.
 *
 * Built HERE from the composition root's singletons rather than inside
 * composition-root.ts: only the auth routes use these controllers, and the
 * controllers themselves take every dependency as a parameter so their tests
 * construct them with fakes and never load this file.
 */

export const accountCodeRepository = new AccountCodeRepositoryClass(authRepository);

const shared = {
  users: userRepository,
  codes: phoneVerificationRepository,
  accounts: accountCodeRepository,
  deliver: (input: Parameters<typeof deliverCode>[0]) => deliverCode(input),
  notices: accountNotices,
  hashPassword,
  now: () => Date.now(),
};

export const forgotPasswordController = new ForgotPasswordControllerClass(shared);

export const contactChangeController = new ContactChangeControllerClass({
  ...shared,
  jwt: jwtController,
  // Only THIS controller and the password change get a password comparator —
  // the forgot-password flow has no business holding one, so it stays out of
  // `shared`.
  comparePassword,
  countPendingInvites: async (email: string) =>
    (await orgMemberInviteRepository.listPendingByEmail(normalizeInviteEmail(email))).length,
});

/**
 * The signed-in password change. It takes `accounts` — not `passwords` — because
 * the code row and the password hash are written in ONE transaction
 * (`completePasswordChange`), exactly as the logged-out reset and the contact
 * change do. A spent code with an unchanged password would strand the person;
 * a changed password with a live code would let the same code be used twice.
 */
export const passwordChangeController = new PasswordChangeControllerClass({
  ...shared,
  jwt: jwtController,
  comparePassword,
});
