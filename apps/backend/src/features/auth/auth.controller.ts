import { Request, Response } from 'express';
import crypto from 'node:crypto';
import { AuthRepositoryClass } from './auth.repository.js';
import { JwtControllerClass } from '@/features/jwt/jwt.controller.js';
import { Error } from '@/error/index.js';
import { isTokenBeforeCutoff } from './session-cutoff.js';
import { safeErrorFields } from './query-error-redaction.js';
import {
  isClaimablePrStub,
  isUnactivatedAccount,
  mayResetPassword,
  receiptProvesPhoneAlone,
} from './account-activation.js';
import { hashPassword, comparePassword } from '@/util/password.js';
import { logger } from '@/util/logger.js';
import { portalRoleNameForSubRole } from '@/features/rbac/portal-role-map.js';
import { portalRoleName } from '@/types/rbac-constant.js';
import {
  LoginSchema,
  RegisterSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
  ResetPasswordWithOtpSchema,
} from '@/schema/auth.schema.js';
import { UserRepositoryClass as UserRepository } from '@/features/user/user.repository.js';
import { UserProfileRepositoryClass } from '@/features/user/user-profile/user-profile.repository.js';
import { RoleRepositoryClass } from '@/features/rbac/role/role.repository.js';
import {
  dobFromNric,
  genderFromNric,
} from '@/features/pr-personnel/ic-dob.js';
import {
  portalCodeForAccountType,
  roleNameForAccountType,
  SIGNUP_ACCOUNT_TYPES,
  type SignupAccountType,
} from './signup-roles.js';
import { saveProfileImageFile } from '@/util/profile-image.js';
import { refreshUserFolder } from '@/util/user-folder.js';
import { saveOrgLogoFromBase64 } from '@/util/org-logo.js';
import { withUserProfile } from '@/util/user-profile-image.js';
import { z } from 'zod';
import { AdminMfaRepositoryClass } from '@/features/admin-mfa/admin-mfa.repository.js';
import { generateSecret, otpauthUri, verifyTotp } from '@/util/totp.js';
import {
  orgStatusDeniesSignIn,
  suspendedOrgBlock,
} from '@/features/auth/org-status.js';
import {
  isVerifiedOtpUsable,
  normalizePhoneDigits,
  PhoneVerificationRepositoryClass,
} from './phone-verification.repository.js';
import { AgencyPrRepository } from '@/features/agency/agency-pr.repository.js';
import { AgencyRepositoryClass } from '@/features/agency/agency.repository.js';
import { AgencyMemberRepositoryClass } from '@/features/agency/agency-member.repository.js';
import { OutletRepositoryClass } from '@/features/outlet/outlet.repository.js';
import { OutletMemberRepositoryClass } from '@/features/outlet/outlet-member.repository.js';
import { createDefaultRateCard } from '@/features/outlet-workspace/default-rate-card.js';
import { createStarterTemplates } from '@/features/shift-template/starter-templates.js';
import { SubscriptionRepositoryClass } from '@/features/subscription/subscription.repository.js';
import { MemberSubscriptionRepositoryClass } from '@/features/member-subscription/member-subscription.repository.js';
import {
  enrolOrgOnPlan,
  resolveEnrollablePlan,
} from '@/features/subscription/enroll-plan.js';
import { db } from '@/db/index.js';
import { SYSTEM_ACTOR } from '@/util/actor';
import { sendPasswordResetEmail } from '@/features/mailing/mailing.repository.js';
import { isProduction } from '@/features/account-code/delivery.js';
import { storedPhone, toWhatsAppDigits } from '@/features/account-code/phone.js';
import type { UserType } from '@/features/user/user.model.js';
import type { PhoneVerification } from './phone-verification.model.js';
import { env } from '@/env.js';
import {
  LOGIN_WRONG_EMAIL_OR_PASSWORD,
  LOGIN_WRONG_PHONE_OR_PASSWORD,
  SIGNUP_EMAIL_HAS_ACCOUNT,
  SIGNUP_NOT_COMPLETED,
  SIGNUP_PHONE_HAS_ACCOUNT,
  lockedOutMessage,
} from './account-answers.js';
import { SignupEmailCodesClass, type SignupEmailCodeRedeemer } from './signup-email-code.js';
import {
  FAILED_LOGIN_MEMORY_MINUTES,
  UnknownLoginLockout,
  loginIdentifierKey,
} from './unknown-login-lockout.js';

/** Reset-link lifetime. Keep the label in step with the number. */
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const RESET_TOKEN_TTL_LABEL = '1 hour';

/**
 * The soonest a refused sign-in is answered, from the moment the request began.
 *
 * A wrong password on a real account costs one more database write than a
 * guess at an identifier with no account (the failed-attempt count), and on
 * this platform's remote database that write is tens of milliseconds — enough
 * for the DELAY to say which accounts exist after the words stopped saying it.
 * Every pre-password refusal (401 wrong credentials, 429 locked) waits out this
 * floor instead. A floor, not a ceiling: a database slower than this shows
 * through again, as the sign-up code's floor does (OTP_SIGNUP_ANSWER_FLOOR_MS).
 */
export const LOGIN_REFUSAL_FLOOR_MS = 500;

/**
 * A real bcrypt hash of a secret nobody holds, compared against whenever there
 * is no hash to compare — an identifier with no account, an account with no
 * password yet — so that refusal costs the same bcrypt work as a wrong
 * password. Minted once by the same `hashPassword` every stored hash comes
 * from, so it carries the same cost factor. Its answer is never used.
 */
let dummyHashPromise: Promise<string> | null = null;
function dummyPasswordHash(): Promise<string> {
  dummyHashPromise ??= hashPassword(crypto.randomBytes(32).toString('hex')).catch((error) => {
    dummyHashPromise = null;
    throw error;
  });
  return dummyHashPromise;
}

export type AuthControllerOptions = {
  /** Failed sign-ins for identifiers with no account. One per controller unless a test brings its own. */
  unknownLoginLockout?: UnknownLoginLockout;
  /** LOGIN_REFUSAL_FLOOR_MS unless a test says otherwise. */
  loginRefusalFloorMs?: number;
  /** Injectable so tests do not really wait. */
  sleep?: (ms: number) => Promise<void>;
  /** The clock the refusal floor reads. */
  now?: () => number;
  /**
   * How work that must not hold the answer is run — the emailed reset link's
   * token and mail. Production starts it and walks away; a test collects the
   * task and awaits it. The task never rejects.
   */
  runAfterAnswer?: (task: () => Promise<void>) => void;
  /**
   * Spends the emailed code a public outlet / agency sign-up must carry
   * (`signup-email-code.ts`). Built on this controller's own code store unless
   * the composition root or a test brings one.
   */
  signupEmailCodes?: SignupEmailCodeRedeemer;
};

const realSleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

function fireAndForget(task: () => Promise<void>): void {
  void task();
}

export class AuthControllerClass {
  constructor(
    private authRepository: AuthRepositoryClass,
    private jwtController: JwtControllerClass,
    private userRepository: UserRepository,
    private userProfileRepository: UserProfileRepositoryClass,
    private roleRepository: RoleRepositoryClass,
    private adminMfaRepository: AdminMfaRepositoryClass,
    private phoneVerificationRepository: PhoneVerificationRepositoryClass,
    private agencyPrRepository: AgencyPrRepository,
    private agencyRepository: AgencyRepositoryClass,
    private agencyMemberRepository: AgencyMemberRepositoryClass,
    private outletRepository: OutletRepositoryClass,
    private outletMemberRepository: OutletMemberRepositoryClass,
    private subscriptionRepository: SubscriptionRepositoryClass,
    private memberSubscriptionRepository: MemberSubscriptionRepositoryClass,
    options: AuthControllerOptions = {},
  ) {
    this.unknownLoginLockout =
      options.unknownLoginLockout ??
      new UnknownLoginLockout({
        maxAttempts: AuthControllerClass.MAX_FAILED_ATTEMPTS,
        lockoutMinutes: AuthControllerClass.LOCKOUT_MINUTES,
      });
    this.loginRefusalFloorMs = options.loginRefusalFloorMs ?? LOGIN_REFUSAL_FLOOR_MS;
    this.sleep = options.sleep ?? realSleep;
    this.now = options.now ?? Date.now;
    this.runAfterAnswer = options.runAfterAnswer ?? fireAndForget;
    this.signupEmailCodes =
      options.signupEmailCodes ?? new SignupEmailCodesClass({ codes: phoneVerificationRepository });
  }

  private readonly signupEmailCodes: SignupEmailCodeRedeemer;
  private readonly unknownLoginLockout: UnknownLoginLockout;
  private readonly loginRefusalFloorMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly runAfterAnswer: (task: () => Promise<void>) => void;

  /** Wrong attempts before the account locks. */
  private static readonly MAX_FAILED_ATTEMPTS = 5;
  /**
   * How long the lock lasts. Long enough to make scripted guessing useless,
   * short enough that a real person who fat-fingered their password is not
   * stranded for the evening.
   */
  private static readonly LOCKOUT_MINUTES = 15;

  /**
   * SIGN IN — ONE ANSWER FOR EVERY WRONG GUESS (owner, 29 Sep 2026: "General
   * message, both").
   *
   * An identifier with no account, an account with no password yet and a wrong
   * password all get the same 401 ("Wrong email or password" / "Wrong phone
   * number or password"), after the same bcrypt work, no sooner than
   * LOGIN_REFUSAL_FLOOR_MS after the request began — and an identifier with no
   * account locks after the same five failures as a real one
   * (`UnknownLoginLockout`). This used to answer "This account is not
   * registered yet." to anybody who typed an address or a number with no
   * account behind it, which made sign-in a lookup of every account on the
   * platform.
   *
   * What depends on the account itself — inactive, a suspended organisation,
   * the second factor — is said only AFTER the password is right, to somebody
   * who has proved they hold it.
   */
  async login(req: Request, res: Response) {
    // The refusal floor is measured from here.
    const startedAt = this.now();
    try {
      logger.info('[AuthController.login] Login request received', {
        hasBody: Boolean(req.body && Object.keys(req.body).length > 0),
        contentType: req.headers['content-type'],
      });

      const parsed = LoginSchema.safeParse(req.body);
      if (!parsed.success) {
        logger.warn('[AuthController.login] Validation failed', parsed.error.issues);
        return res.status(400).json({
          success: false,
          message: parsed.error.issues[0]?.message ?? 'Please fill in all mandatory fields',
        });
      }

      const parsedBody = parsed.data;
      let loginMethod: 'email' | 'phone';
      let loginCriteria: string;

      if (parsedBody.email) {
        loginMethod = 'email';
        loginCriteria = parsedBody.email;
      } else {
        loginMethod = 'phone';
        loginCriteria = parsedBody.phoneNum!;
      }

      const wrongCredentials =
        loginMethod === 'email' ? LOGIN_WRONG_EMAIL_OR_PASSWORD : LOGIN_WRONG_PHONE_OR_PASSWORD;
      // Every refusal made before the password is known to be right: the same
      // body shape, never sooner than the floor.
      const refuse = async (status: 401 | 429, message: string) => {
        await this.padFrom(startedAt);
        return res.status(status).json({ success: false, message });
      };

      // A failed READ throws (→ 500) instead of reading as "no account": a
      // database blip must not turn somebody's right password into a strike.
      const user = await this.userRepository.getUserByLoginMethod(loginMethod, loginCriteria, {
        rethrow: true,
      });
      if (!user) {
        // Counted, locked and answered exactly as a real account would be.
        const key = loginIdentifierKey(loginMethod, loginCriteria);
        const minutesLocked = this.unknownLoginLockout.minutesLeft(key);
        if (minutesLocked !== null) {
          logger.warn('[AuthController.login] Attempt on a locked identifier');
          return refuse(429, lockedOutMessage(minutesLocked));
        }
        await comparePassword(parsedBody.password, await dummyPasswordHash());
        this.unknownLoginLockout.recordFailure(key);
        logger.warn('[AuthController.login] No account for that identifier');
        return refuse(401, wrongCredentials);
      }

      // Lockout, checked BEFORE the password compare. Checking after would let
      // an attacker keep testing passwords against a locked account and read the
      // answer from the response, which is the thing the lock exists to stop.
      if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
        // Clamped: the lock was stamped by the DATABASE's clock, and a server
        // clock a little behind it would say "16 minutes" where an identifier
        // with no account (timed by this process) can only ever say 15.
        const minutes = Math.min(
          Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000),
          AuthControllerClass.LOCKOUT_MINUTES,
        );
        logger.warn('[AuthController.login] Attempt on a locked account');
        return refuse(429, lockedOutMessage(minutes));
      }

      // An account with no password yet (a roster stub waiting to be claimed)
      // is compared against the dummy too, so it costs what a real compare
      // costs — and it always fails, whatever the compare says.
      let passwordMatches = false;
      if (user.passwordHash) {
        passwordMatches = await comparePassword(parsedBody.password, user.passwordHash);
      } else {
        await comparePassword(parsedBody.password, await dummyPasswordHash());
      }
      if (!passwordMatches) {
        logger.warn('[AuthController.login] Invalid password');
        // NOT awaited: the count is a database write an identifier with no
        // account never makes, so waiting for it would put it in the timing.
        // It never rejects (see recordFailedLogin), and the floor below gives
        // it time to land before the next guess can arrive.
        void this.recordFailedLogin(user);
        return refuse(401, wrongCredentials);
      }

      /*
       * ONLY NOW, to somebody who has proved the password: what is wrong with
       * the ACCOUNT. Both of these used to be checked before the compare, on
       * the reasoning that a refusal firing only once the password is right
       * would confirm the password to whoever tried it. It did, instead, tell
       * EVERYONE that the account exists and what state it is in, without a
       * password at all (owner, 29 Sep 2026: "General message, both"). Here a
       * guesser still meets the lockout and the one 401 above; the person told
       * "inactive" or "suspended" is the one who knows the password, and is
       * told why they cannot get in rather than led to reset a password that
       * was right.
       */
      if (user.status.toLowerCase() !== 'active') {
        logger.warn('[AuthController.login] User is not active');
        return res.status(401).json({
          success: false,
          message: 'This account is inactive.',
        });
      }

      // An ACTIVE user inside a SUSPENDED organisation was still getting in,
      // because `user.status` was the only status any auth path consulted — so
      // suspending an agency stopped nothing, and its owner and finance staff
      // kept full access, including raising payment vouchers.
      const orgBlock = await suspendedOrgBlock(user.id);
      if (orgBlock) {
        logger.warn(`[AuthController.login] Blocked by organisation status: ${user.id}`);
        return res.status(401).json({ success: false, message: orgBlock });
      }

      // Second factor, only for an enrolment the user actually CONFIRMED. An
      // unconfirmed row is an abandoned setup — challenging against it would
      // lock someone out over a QR code they never scanned.
      const mfa = await this.adminMfaRepository.getByUserId(user.id);
      if (mfa?.confirmed) {
        const code = typeof req.body?.mfaCode === 'string' ? req.body.mfaCode : '';
        if (!code) {
          // 401 with a marker, not an error: the password was right and the
          // client needs to collect a code. It carries no token.
          return res.status(401).json({
            success: false,
            message: 'Enter the 6-digit code from your authenticator app',
            data: { mfaRequired: true },
          });
        }
        if (!verifyTotp(mfa.secret, code)) {
          logger.warn('[AuthController.login] Invalid MFA code');
          // A wrong code counts toward lockout too. Otherwise the second factor
          // is the one part of login that can be brute-forced freely, and six
          // digits is only a million guesses.
          await this.recordFailedLogin(user);
          return res.status(401).json({
            success: false,
            message: 'That code is not valid',
            data: { mfaRequired: true },
          });
        }
      }

      // Cleared every gate — reset the counter so yesterday's typos do not
      // accumulate into a lockout weeks later.
      if (user.failedLoginAttempts > 0 || user.lockedUntil) {
        await this.userRepository.updateUser(
          { failedLoginAttempts: 0, lockedUntil: null, updatedBy: user.id },
          user.id,
        );
      }

      const tokenPayload = { loginMethod, loginCriteria };
      const accessToken = this.jwtController.generateAccessToken(tokenPayload);
      const refreshToken = this.jwtController.generateRefreshToken(tokenPayload);
      const decodedToken = this.jwtController.verifyToken(accessToken);

      // WHO signed in, for the audit row `platformAuditMiddleware` writes once
      // this response is sent. A login carries no bearer token — it is the
      // request that MINTS one — so the audit read nobody, and every sign-in
      // was filed under no user and no portal (28 Sep audit). Set only here,
      // after every gate has passed: a refused attempt stays anonymous, because
      // whoever typed a wrong password has not proved they are this account.
      req.user = user;

      logger.info('[AuthController.login] Login successful for user:', user.username);

      return res.status(200).json({
        success: true,
        message: 'Login successful',
        data: {
          accessToken,
          refreshToken,
          expiredAt: decodedToken.exp ? decodedToken.exp * 1000 : null,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          message: error.issues[0]?.message ?? 'Please fill in all mandatory fields',
        });
      }
      logger.error('[AuthController.login] Error:', error);
      return res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
      });
    }
  }

  /**
   * Counts a failed attempt and locks the account once the threshold is hit.
   *
   * Never throws: a bookkeeping failure must not turn a clean "invalid
   * credentials" into a 500, which would tell an attacker they had found
   * something interesting.
   *
   * The counter is NOT reset when the lock expires. It is reset by a successful
   * login — and, since 30 Sep 2026 (migration 0170), by a DAY with no wrong
   * guess (`FAILED_LOGIN_MEMORY_MINUTES`, the same day the counter for
   * identifiers with no account forgets). Someone grinding away is locked again
   * on their next wrong guess rather than handed a fresh five every fifteen
   * minutes; only old typos stop counting.
   */
  private async recordFailedLogin(user: { id: string; username: string; failedLoginAttempts: number }): Promise<void> {
    try {
      // Incremented in SQL, not from the row this request read before bcrypt:
      // N concurrent wrong guesses used to all write the same snapshot value,
      // so the threshold never tripped — and the sub-threshold branch wrote
      // lockedUntil: null, erasing a lock other requests had just earned. The
      // repository's CASE keeps an existing lock and only ever extends it.
      const row = await this.userRepository.recordFailedLoginAttempt(
        user.id,
        AuthControllerClass.MAX_FAILED_ATTEMPTS,
        AuthControllerClass.LOCKOUT_MINUTES,
        FAILED_LOGIN_MEMORY_MINUTES,
      );
      if (row && row.attempts >= AuthControllerClass.MAX_FAILED_ATTEMPTS) {
        logger.warn(
          `[AuthController] Locked ${user.username} after ${row.attempts} failed attempts`,
        );
      }
    } catch (error) {
      logger.error('[AuthController.recordFailedLogin] Error:', error);
    }
  }

  /** Wait out what is left of the sign-in refusal floor, measured from `startedAt`. */
  private async padFrom(startedAt: number): Promise<void> {
    const remaining = this.loginRefusalFloorMs - (this.now() - startedAt);
    if (remaining > 0) await this.sleep(remaining);
  }

  /**
   * Begin TOTP enrolment for the signed-in user.
   *
   * Returns the otpauth URI once, and only to the account enrolling. The secret
   * inside it is a credential: it is never logged and never returned again — a
   * user who loses the QR code restarts enrolment rather than re-reading it.
   */
  async enrollMfa(req: Request, res: Response) {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ success: false, message: Error.UNAUTHORIZED, data: null });
      }

      const secret = generateSecret();
      const row = await this.adminMfaRepository.startEnrolment(user.id, secret);
      if (!row) {
        // Already confirmed. Minting a new secret here would silently invalidate
        // the authenticator they are using right now.
        return res.status(409).json({
          success: false,
          message: 'Two-factor authentication is already set up on this account',
          data: null,
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Scan this in your authenticator app, then confirm with a code',
        data: {
          otpauthUri: otpauthUri(row.secret, user.email ?? user.username),
          // Shown so a user whose camera cannot scan can type it in.
          secret: row.secret,
        },
      });
    } catch (error) {
      logger.error('[AuthController.enrollMfa] Error:', error);
      return res
        .status(500)
        .json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /**
   * Finish enrolment by proving a code can be generated from the secret.
   *
   * Without this step an enrolment could be "on" for a secret the user never
   * successfully scanned, and the next login would lock them out of their own
   * account. The proof is the whole point of the confirm step.
   */
  async confirmMfa(req: Request, res: Response) {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ success: false, message: Error.UNAUTHORIZED, data: null });
      }

      const code = typeof req.body?.code === 'string' ? req.body.code : '';
      const row = await this.adminMfaRepository.getByUserId(user.id);
      if (!row) {
        return res
          .status(400)
          .json({ success: false, message: 'Start enrolment first', data: null });
      }
      if (row.confirmed) {
        return res
          .status(200)
          .json({ success: true, message: 'Two-factor authentication is already on', data: null });
      }
      if (!verifyTotp(row.secret, code)) {
        return res
          .status(400)
          .json({ success: false, message: 'That code is not valid — check the time on your device', data: null });
      }

      await this.adminMfaRepository.confirm(row.id);
      return res.status(200).json({
        success: true,
        message: 'Two-factor authentication is on. You will be asked for a code at every login.',
        data: null,
      });
    } catch (error) {
      logger.error('[AuthController.confirmMfa] Error:', error);
      return res
        .status(500)
        .json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /** True only if the caller is signed in AND holds the admin role. */
  private async callerIsAdmin(req: Request): Promise<boolean> {
    // optionalAuthenticateJWT leaves req.user unset for anonymous callers, bad
    // tokens and suspended accounts alike, so this reads false for all three.
    const callerId = req.user?.id;
    if (!callerId) return false;
    try {
      // Roles come from the DB, never from the token — same rule as requireRole.
      const roles = await this.authRepository.getRolesForUserIds([callerId]);
      return roles.some((r) => r.roleName === 'admin');
    } catch (error) {
      logger.error('[AuthController.callerIsAdmin] Error:', error);
      return false;
    }
  }

  /**
   * An authenticated ADMIN creating another ADMIN — the one registration that
   * may omit a phone (Fix First, 28 Sep 2026).
   *
   * The admin screen has no phone field, so it used to invent one
   * (`'+admin-' + 12 hex`) to satisfy the schema. Stripped of its letters that
   * read as a real Malaysian mobile, and every code for that admin went to it
   * by WhatsApp and SMS. Mirrors `resolveRegistrationRoleId`'s admin branch
   * exactly: an admin caller AND a `roleId` naming the admin role. Every other
   * caller — a public PR, an agency or outlet sign-up, an admin creating a
   * non-admin — must still send a phone, because for them it is the login.
   */
  private async isAdminCreatingAdmin(req: Request, roleId: string | undefined): Promise<boolean> {
    if (!roleId) return false;
    if (!(await this.callerIsAdmin(req))) return false;
    // `getRoleById` answers null on a failed read, which refuses: safe side.
    const role = await this.roleRepository.getRoleById(roleId);
    return role?.roleName === portalRoleName.ADMIN;
  }

  /**
   * The roster stub a PR's OWN sign-up with this phone may claim, or null.
   *
   * Only a never-activated account holding the `pr` role and nothing else
   * (account-activation.ts). The role read is skipped for every activated
   * account, so the ordinary "that number is already registered" path costs
   * no extra query.
   */
  private async claimablePrStub(account: UserType | null): Promise<UserType | null> {
    if (!account || !isUnactivatedAccount(account)) return null;
    const roles = await this.authRepository.getRolesForUserIds([account.id]);
    return isClaimablePrStub(account, roles.map((role) => role.roleName)) ? account : null;
  }

  /**
   * Decides which role a registration creates. The whole point of this method
   * is that a public caller never gets to name one.
   *
   * An authenticated admin may still pass an explicit `roleId` — that is the
   * admin screen creating another admin, and it is the only path that can reach
   * an elevated role. Everyone else gets the role the server derives from
   * `accountType`, which cannot spell 'admin'.
   */
  private async resolveRegistrationRoleId(
    req: Request,
    body: { accountType?: SignupAccountType; roleId?: string },
  ): Promise<{ roleId: string } | { error: { status: number; message: string } }> {
    if (body.roleId && (await this.callerIsAdmin(req))) {
      return { roleId: body.roleId };
    }

    if (body.roleId) {
      // Not an error — the web sign-up still sends one. Log it, ignore it, and
      // fall through to the account type. If this ever fires with an admin role
      // id on it, that is someone probing.
      logger.warn(
        '[AuthController.register] Ignoring client-supplied roleId from a non-admin caller',
      );
    }

    if (!body.accountType) {
      return {
        error: {
          status: 400,
          message: `accountType is required and must be one of: ${SIGNUP_ACCOUNT_TYPES.join(', ')}`,
        },
      };
    }

    const roleName = roleNameForAccountType(body.accountType);
    const portal = portalCodeForAccountType(body.accountType);
    const role = await this.roleRepository.findByNameAndPortalCode(
      roleName,
      portal,
    );
    if (!role) {
      // Default roles are seeded by scripts/init-roles.ts. Missing one
      // is a deployment fault, not something the caller did wrong.
      logger.error(
        `[AuthController.register] Role '${roleName}' @ ${portal ?? 'none'} is not seeded`,
      );
      return {
        error: { status: 500, message: 'Sign-up is not configured for this account type' },
      };
    }

    return { roleId: role.id };
  }

  /**
   * Web outlet/agency self-register: create the organisation as `pending_review`
   * and link the new user as `owner`. Package selection is not written yet —
   * admin assigns a plan on approval.
   *
   * Company address goes on `agency` / `outlet` only. The portal user gets PIC
   * name on `user_profile` — not a home address (that is for PRs).
   *
   * Returns the new org so the caller can upload the logo (needs the org id
   * for the R2 key) and write `logo_image`.
   */
  private async createOrgForSignup(
    userId: string,
    body: {
      accountType?: SignupAccountType;
      companyName?: string;
      companyRegistrationOld?: string;
      businessLicense?: string;
      companyRegistrationNew?: string;
      /** @deprecated Prefer addressLine1. */
      companyAddress?: string;
      addressLine1?: string;
      addressLine2?: string;
      city?: string;
      postcode?: string;
      state?: string;
      country?: string;
      personInCharge?: string;
      contactEmail?: string;
      email?: string;
      /** Always present on this path — `registerUser` requires it of an org sign-up. */
      phoneNum?: string;
      packageId?: string;
    },
    actor: string,
  ): Promise<{ kind: 'agency' | 'outlet'; id: string; name: string }> {
    const name = body.companyName!;
    const ssmNo = body.companyRegistrationNew!;
    const addressLine1 = body.addressLine1 ?? body.companyAddress ?? null;
    const addressLine2 = body.addressLine2 ?? null;
    const city = body.city ?? null;
    const postcode = body.postcode ?? null;
    const state = body.state ?? null;
    const country = body.country ?? null;
    const contactName = body.personInCharge ?? null;
    const contactEmail = body.contactEmail ?? body.email ?? null;
    const contactPhone = body.phoneNum ?? null;
    const accountType = body.accountType === 'agency' ? 'agency' : 'outlet';

    /**
     * The plan, resolved before either transaction opens.
     *
     * `registerUser` has already refused an unusable package, so this is the
     * same answer a second time rather than a new gate — it is re-read because
     * the enrolment needs the catalog row itself, and threading it down through
     * the caller's signature is how the pre-check and the write would come to
     * disagree the day someone adds a branch between them.
     */
    const chosen = await resolveEnrollablePlan({
      subscriptionRepository: this.subscriptionRepository,
      accountType,
      packageId: body.packageId,
    });
    if (!chosen.ok) {
      // `globalThis.Error` because this module imports its own `Error` from
      // `@/error/index.js`, which shadows the built-in and is not constructable.
      throw new globalThis.Error(
        `Sign-up package unusable at org creation: ${chosen.message}`,
      );
    }

    if (body.accountType === 'agency') {
      const agencyCode = await this.agencyRepository.generateUniqueCode();
      /**
       * ONE TRANSACTION: the agency, its first member, and its plan.
       *
       * These were three separate commits, and enrolment came last and swallowed
       * its own failure — so the way an agency came to exist holding no
       * subscription was simply that the third write did not land. Now the org
       * cannot outlive its plan: `enrolOrgOnPlan` throws, and the agency and its
       * membership roll back with it. A registration that fails is recoverable;
       * an org nobody can bill is not, because nothing reports it.
       */
      return await db.transaction(async (tx) => {
        const agency = await this.agencyRepository.create(
          {
            name,
            agencyCode,
            ssmNo,
            businessLicense: body.businessLicense ?? null,
            registrationNoOld: body.companyRegistrationOld ?? null,
            contactName,
            contactEmail,
            contactPhone,
            addressLine1,
            addressLine2,
            city,
            postcode,
            state,
            country,
            status: 'pending_review',
            createdBy: actor,
            updatedBy: actor,
          },
          tx,
        );
        await this.agencyMemberRepository.add(
          {
            agencyId: agency.id,
            userId,
            status: 'active',
            // The person who signs the organisation up owns it. Stated, never
            // defaulted — the column has no default precisely so a forgotten
            // title is a refused insert rather than a silent 'owner'.
            subRole: 'owner',
            createdBy: actor,
            updatedBy: actor,
          },
          tx,
        );
        await enrolOrgOnPlan({
          memberSubscriptionRepository: this.memberSubscriptionRepository,
          plan: chosen.plan,
          subscriberType: 'agency',
          subscriberId: agency.id,
          subscriberName: agency.name,
          actor,
          tx,
        });
        logger.info('[AuthController.register] Agency created for signup', {
          agencyId: agency.id,
          userId,
          packageId: chosen.plan.id,
        });
        return { kind: 'agency' as const, id: agency.id, name: agency.name };
      });
    }

    // ONE TRANSACTION, for the reason spelled out on the agency branch above:
    // the venue, its first member and its plan commit together or not at all.
    return await db.transaction(async (tx) => {
      const outlet = await this.outletRepository.create(
        {
          name,
          addressLine1,
          addressLine2,
          city,
          postcode,
          state,
          country: country ?? 'Malaysia',
          businessLicense: body.businessLicense ?? null,
          registrationNoOld: body.companyRegistrationOld ?? null,
          // 0155 gave these three a home. They were computed above and thrown
          // away here, which looked on screen like a venue that answered
          // nothing rather than one whose answers were discarded.
          contactName,
          contactEmail,
          contactPhone,
          ssmNo,
          status: 'pending_review',
          // `onboarded_by_agency_id` is deliberately NOT set. Sign-up no longer
          // names an agency: a venue works with as many as accept it, and each
          // one decides for itself (`agency_outlet`, 0123). The column keeps its
          // historical values for venues registered before the cutover and stays
          // null from here on.
          createdBy: actor,
          updatedBy: actor,
        },
        tx,
      );
      await this.outletMemberRepository.add(
        {
          outletId: outlet.id,
          userId,
          status: 'active',
          // The venue's creator owns it — see the agency twin above.
          subRole: 'owner',
          createdBy: actor,
          updatedBy: actor,
        },
        tx,
      );
      // No `agency_outlet` link is created here, because sign-up no longer asks
      // which agency. A new venue therefore starts with NONE and cannot post
      // until it links one in Settings and that agency approves — which is the
      // intended flow, not a gap: an agency partnership is the agency's to
      // accept, and manufacturing one from a dropdown the venue picked would
      // record a relationship nobody on the other side agreed to.
      await enrolOrgOnPlan({
        memberSubscriptionRepository: this.memberSubscriptionRepository,
        plan: chosen.plan,
        subscriberType: 'outlet',
        subscriberId: outlet.id,
        subscriberName: outlet.name,
        actor,
        tx,
      });
      // Starter event cards. Written after the venue exists, and allowed to
      // fail without taking the registration with them — see
      // starter-templates.ts: a venue that outlives its plan cannot be billed,
      // but a venue short a few example cards just makes one.
      try {
        const cards = await createStarterTemplates({
          outletId: outlet.id,
          actor,
          tx,
        });
        logger.info('[AuthController.register] Starter templates created', {
          outletId: outlet.id,
          cards,
        });
      } catch (error) {
        logger.error(
          '[AuthController.register] Starter templates failed (venue kept)',
          error,
        );
      }
      // The venue's opening rate card, on the same terms as the cards above:
      // written inside the registration transaction, allowed to fail on its
      // own. A venue that lands with no card falls back to the portal's
      // client-side default until it saves its Workspace once.
      try {
        const tiers = await createDefaultRateCard({
          outletId: outlet.id,
          actor,
          tx,
        });
        logger.info('[AuthController.register] Default rate card created', {
          outletId: outlet.id,
          tiers,
        });
      } catch (error) {
        logger.error(
          '[AuthController.register] Default rate card failed (venue kept)',
          error,
        );
      }
      logger.info('[AuthController.register] Outlet created for signup', {
        outletId: outlet.id,
        userId,
        packageId: chosen.plan.id,
      });
      return { kind: 'outlet' as const, id: outlet.id, name: outlet.name };
    });
  }

  /**
   * The PR app's step-1 "is this number free?" check — which NO LONGER SAYS
   * (owner, 29 Sep 2026: "General message, both").
   *
   * It answered 409 "That phone number already has an account" / "That ID
   * number already has an account" to anybody, for any number, before a code
   * had been sent anywhere: a public lookup of which phones and ID numbers are
   * on a PR platform. It now judges only the SHAPE of the request and answers
   * the same 200 whoever the number belongs to. A collision is reported at the
   * end, by `registerUser` — the phone by name once its code has proved it
   * (`SIGNUP_PHONE_HAS_ACCOUNT`), anything else as one general refusal.
   *
   * Kept rather than removed because PR-app builds already on phones call it
   * on step 1 and treat anything but a 2xx as a failure that stops sign-up.
   * Current builds no longer call it.
   */
  async checkRegisterAvailability(req: Request, res: Response) {
    const parsed = z
      .object({
        phoneNum: z.string().min(8, 'Phone number is required'),
        idNo: z.string().trim().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: parsed.error.issues[0]?.message ?? 'Invalid request',
        data: null,
      });
    }
    return res.status(200).json({ success: true, message: 'OK', data: null });
  }

  async registerUser(req: Request, res: Response) {
    try {
      logger.info('[AuthController.register] Register request received');
      const parsedBody = RegisterSchema.parse(req.body);

      // The phone is the login for everybody but an admin the admin screen
      // creates — see isAdminCreatingAdmin. Refused before any lookup.
      if (!parsedBody.phoneNum && !(await this.isAdminCreatingAdmin(req, parsedBody.roleId))) {
        return res.status(400).json({
          success: false,
          message: 'Phone number is required',
          data: null,
        });
      }

      // Public PR sign-up must present a verified WhatsApp OTP receipt. Admins
      // creating accounts (or outlet/agency web signup) are not on this path.
      // An admin creating an account — which also decides what a collision
      // below may say.
      const callerIsAdmin = await this.callerIsAdmin(req);
      const isPublicPr = parsedBody.accountType === 'pr' && !callerIsAdmin;
      // Kept for the stub claim below, which needs to know where the code went.
      let signupReceipt: PhoneVerification | null = null;
      if (isPublicPr) {
        if (!parsedBody.password) {
          return res.status(400).json({
            success: false,
            message: 'Password must be at least 6 characters long',
            data: null,
          });
        }
        if (!parsedBody.verificationId) {
          return res.status(400).json({
            success: false,
            message: 'Phone verification is required',
            data: null,
          });
        }
        const proof = await this.phoneVerificationRepository.getById(
          parsedBody.verificationId,
        );
        const phoneDigits = normalizePhoneDigits(parsedBody.phoneNum ?? '');
        if (!isVerifiedOtpUsable(proof, phoneDigits, 'signup')) {
          return res.status(400).json({
            success: false,
            message: 'Phone verification is missing or expired — verify again',
            data: null,
          });
        }
        signupReceipt = proof;
        // Validate before createUserWithRole — an empty profile after a 400 would
        // leave a half-registered account with a consumed OTP receipt.
        const hasProfileDetails = Boolean(
          parsedBody.fullName &&
            parsedBody.nationality &&
            parsedBody.idType &&
            parsedBody.idNo &&
            parsedBody.dob &&
            parsedBody.addressLine1 &&
            parsedBody.city &&
            parsedBody.postcode &&
            parsedBody.state &&
            parsedBody.country &&
            Array.isArray(parsedBody.languages) &&
            parsedBody.languages.length > 0,
        );
        if (!hasProfileDetails) {
          return res.status(400).json({
            success: false,
            message: 'Profile details are required for PR sign-up',
            data: null,
          });
        }
      }

      /**
       * The package is judged BEFORE anything is written — and before anything
       * is LOOKED UP.
       *
       * Registration is not transactional: the user, the org and the membership
       * are each committed as they are created, and enrolment runs last. A
       * refusal raised down there — which is where an invalid package used to be
       * noticed — would leave a half-built account whose email and phone are
       * already taken, so the person could not even retry. Validating here costs
       * a 400 and creates nothing.
       *
       * ⚠️ And ahead of the lookups below (security review, 30 Sep 2026): while
       * this and the role check ran AFTER the "is it taken" test, a request made
       * invalid on purpose — no account type, a made-up package — answered 409
       * when a value it carried was taken and 400 when none was, and created
       * nothing either way: a free lookup of any email, phone or ID number.
       * Every refusal that needs no account lookup now comes first.
       *
       * No outlet or agency may exist without a plan (owner's call, 2 Sep 2026),
       * and `ShiftController` now refuses to post for a venue holding none, so
       * letting one through would mint an account that cannot work.
       */
      if (parsedBody.accountType === 'agency' || parsedBody.accountType === 'outlet') {
        const plan = await resolveEnrollablePlan({
          subscriptionRepository: this.subscriptionRepository,
          accountType: parsedBody.accountType,
          packageId: parsedBody.packageId,
        });
        if (!plan.ok) {
          return res.status(400).json({
            success: false,
            message: plan.message,
            data: null,
          });
        }
      }

      const resolved = await this.resolveRegistrationRoleId(req, parsedBody);
      if ('error' in resolved) {
        return res.status(resolved.error.status).json({
          success: false,
          message: resolved.error.message,
          data: null,
        });
      }

      /*
       * 🔴 A PUBLIC VENUE OR AGENCY SIGN-UP PROVES ITS EMAIL FIRST (owner,
       * 30 Sep 2026: "lets go with your pick for number 2").
       *
       * A fully valid form used to create an account whenever nothing was
       * taken, so "created" against "couldn't complete" answered whether an
       * address, a phone or an ID number had an account — and left a real
       * pending venue in somebody else's name each time the answer was "free".
       * The code went only to the address typed (signup-email-code.ts). It is
       * spent HERE — after every lookup-free check, before any account lookup
       * — so each try, however it is answered, costs a fresh code from the
       * typist's own inbox. An admin creating the account is exempt, as from
       * the PR code.
       */
      const isOrgSignup =
        parsedBody.accountType === 'agency' || parsedBody.accountType === 'outlet';
      /*
       * The owner's IC and the gender ticked must agree (the owner's
       * double-confirmation, 9 Sep 2026). Judged HERE, from the request alone
       * (security review, 30 Sep 2026): it used to run after the account was
       * created, so a mismatch left a half-built account behind — and, with the
       * emailed code, a spent code and a retry told "that email already has an
       * account".
       */
      if (isOrgSignup && parsedBody.personInCharge) {
        const icGender = genderFromNric(parsedBody.idNo);
        if (icGender && parsedBody.gender && icGender !== parsedBody.gender) {
          return res.status(400).json({
            success: false,
            message: `The IC number says ${icGender} but ${parsedBody.gender} was selected — check the ID number`,
            data: null,
          });
        }
      }

      const isPublicOrg = !callerIsAdmin && isOrgSignup;
      if (isPublicOrg) {
        if (!parsedBody.email) {
          return res.status(400).json({ success: false, message: 'Email is required', data: null });
        }
        const proof = await this.signupEmailCodes.redeem({
          codeId: parsedBody.emailCodeId,
          code: parsedBody.emailCode,
          email: parsedBody.email,
          actor: SYSTEM_ACTOR,
        });
        if (!proof.ok) {
          return res
            .status(proof.status)
            .json({ success: false, message: proof.message, data: null });
        }
      }

      /*
       * 🔴 A PUBLIC PR SIGN-UP SPENDS ITS PHONE RECEIPT HERE — after every
       * lookup-free check, BEFORE the lookups, in one conditional statement
       * (owner, 30 Sep 2026, and the security review that followed).
       *
       * It used to be spent only by the account it bought, and then by a
       * refusal too — but always AFTER the lookups, so one proved phone could
       * send the same receipt with address after address, and N sign-ups sent
       * together on it each got their answer. `verified → consumed` lets
       * exactly one request past this line; every try at the lookups costs a
       * fresh code to that phone.
       */
      if (isPublicPr && parsedBody.verificationId) {
        const spent = await this.phoneVerificationRepository.transition(
          parsedBody.verificationId,
          'verified',
          { status: 'consumed', updatedBy: SYSTEM_ACTOR },
        );
        if (!spent) {
          return res.status(400).json({
            success: false,
            message: 'Phone verification is missing or expired — verify again',
            data: null,
          });
        }
      }

      // `rethrow`: a failed read is a 500 that creates nothing, never "free".
      const existingPhone = parsedBody.phoneNum
        ? await this.userRepository.getUserByLoginMethod('phone', parsedBody.phoneNum, {
            rethrow: true,
          })
        : null;
      /*
       * 🔴 A ROSTER STUB IS CLAIMED HERE — AND NOWHERE ELSE (Fix First,
       * 28 Sep 2026; account-activation.ts).
       *
       * An agency adding a PR by phone creates an account with no password
       * (`POST /pr`). That PR used to be told "already registered — sign in"
       * here, could not sign in, and could only get in through Forgot password
       * — a reset to contacts the AGENCY typed and may still change, which is
       * why no reset activates an account any more. Instead, a public PR
       * sign-up whose verified receipt proves the stub's own number takes the
       * stub over: her password, her username, her email, the roster
       * membership the agency already approved.
       *
       * Three conditions, all required: a PUBLIC PR sign-up (never an admin or
       * an organisation form); a receipt whose code went to the PHONE ALONE
       * (a code also emailed to a typed inbox proves that inbox instead); and a
       * stub that is never-activated and PR-only. Anything else on this number
       * is still the 409 below.
       */
      const claimTarget =
        isPublicPr && signupReceipt && receiptProvesPhoneAlone(signupReceipt.channel)
          ? await this.claimablePrStub(existingPhone)
          : null;

      /*
       * WHAT A COLLISION MAY SAY DEPENDS ON WHO IS ASKING (owner, 29 Sep 2026:
       * "General message, both").
       *
       * These used to name the field — "That email (…) is already registered",
       * "An account with this ID number already exists" — to anybody, which
       * made this public route a way to test any address, number or ID number
       * for an account. Now:
       *   · an ADMIN creating an account is told which field, as before;
       *   · a PR whose code reached the phone ALONE may be told the PHONE has an
       *     account (SIGNUP_PHONE_HAS_ACCOUNT) — she has just proved it is hers;
       *   · a venue or agency sign-up, whose emailed code has just proved the
       *     ADDRESS (30 Sep 2026), may be told the EMAIL has an account
       *     (SIGNUP_EMAIL_HAS_ACCOUNT);
       *   · everyone else, and every other field, gets one sentence that names
       *     none (SIGNUP_NOT_COMPLETED).
       * All three lookups run before any answer, so which one hit is not in the
       * timing either.
       *
       * ⚠️ AND THEY FAIL CLOSED (security review, 30 Sep 2026). The sign-in
       * lookup answers null for a value on file TWICE — it refuses to pick one
       * — and used to answer null for a read that failed; both read as "free",
       * so a number already on two accounts could get a third, and a blip
       * reached the unique index as a 500 only by luck. Each lookup now throws
       * on a failed read (a 500 that creates nothing), and `isLoginValueTaken`
       * — any match counts — decides "taken" whenever the sign-in lookup could
       * not name one account. `/register-member` has always asked it that way.
       */
      const [existingEmail, existingId, emailOnFile, phoneOnFile] = await Promise.all([
        parsedBody.email
          ? this.userRepository.getUserByLoginMethod('email', parsedBody.email, { rethrow: true })
          : Promise.resolve(null),
        parsedBody.idNo
          ? this.userProfileRepository.findByNormalizedIdNo(parsedBody.idNo)
          : Promise.resolve(null),
        parsedBody.email
          ? this.userRepository.isLoginValueTaken('email', parsedBody.email)
          : Promise.resolve(false),
        parsedBody.phoneNum
          ? this.userRepository.isLoginValueTaken('phone', parsedBody.phoneNum)
          : Promise.resolve(false),
      ]);
      // The stub being claimed is not "somebody else" — its own address, and
      // the IC the agency typed onto it, are the ones this sign-up replaces.
      const emailTaken = existingEmail ? existingEmail.id !== claimTarget?.id : emailOnFile;
      const phoneTaken = existingPhone ? !claimTarget : phoneOnFile;
      const idTaken = Boolean(existingId && existingId.userId !== claimTarget?.id);
      if (emailTaken || phoneTaken || idTaken) {
        const phoneProven = Boolean(
          signupReceipt && receiptProvesPhoneAlone(signupReceipt.channel),
        );
        let message = SIGNUP_NOT_COMPLETED;
        if (callerIsAdmin) {
          message = emailTaken
            ? `That email (${parsedBody.email}) is already registered. Use another one, or leave the email blank.`
            : phoneTaken
              ? `That phone number (${parsedBody.phoneNum}) is already registered. Sign in instead, or use another number.`
              : 'An account with this ID number already exists';
        } else if (phoneTaken && phoneProven) {
          message = SIGNUP_PHONE_HAS_ACCOUNT;
        } else if (emailTaken && isPublicOrg) {
          // Its code reached that inbox and was typed back: it is theirs.
          message = SIGNUP_EMAIL_HAS_ACCOUNT;
        }
        return res.status(409).json({ success: false, message, data: null });
      }

      const passwordHash = parsedBody.password ? await hashPassword(parsedBody.password) : null;
      // Prefer the caller's user id (admin creating an account). Public self-register → system.
      // A claim is the person acting on her OWN account, proven by her phone.
      const actor = claimTarget?.id ?? req.user?.id ?? SYSTEM_ACTOR;
      // Stored LOWERCASE and trimmed — every email writer does, so the unique
      // index and the case-insensitive sign-in agree about which addresses are
      // "the same".
      const email = parsedBody.email ? parsedBody.email.trim().toLowerCase() : null;

      let user: UserType;
      if (claimTarget && passwordHash) {
        // Public PR sign-up always carries a password (checked above), so this
        // is every claim; the `passwordHash` term only tells the compiler.
        const provenDigits = toWhatsAppDigits(parsedBody.phoneNum);
        const claimed = await this.authRepository.claimUnactivatedAccount({
          userId: claimTarget.id,
          passwordHash,
          username: parsedBody.username,
          // Hers or none — never the address the agency typed. See the
          // repository method for why leaving it would keep a reset door open.
          email,
          // The number she just proved, in the stored spelling.
          phoneNum: provenDigits
            ? storedPhone(provenDigits)
            : (claimTarget.phoneNum ?? parsedBody.phoneNum ?? ''),
          actor,
        });
        if (!claimed) {
          // Claimed, activated or disabled since it was read: a taken number
          // now. Said by name — every claim's code reached the phone alone.
          return res.status(409).json({
            success: false,
            message: SIGNUP_PHONE_HAS_ACCOUNT,
            data: null,
          });
        }
        user = claimed;
        logger.info('[AuthController.register] PR sign-up claimed a roster account', {
          userId: claimed.id,
        });
      } else {
        user = await this.authRepository.createUserWithRole(
          {
            email,
            // Absent only for an admin creating an admin (checked at the top).
            phoneNum: parsedBody.phoneNum ?? null,
            username: parsedBody.username,
            passwordHash,
            status: 'active',
            profileImage: null,
            createdBy: actor,
            updatedBy: actor,
          },
          resolved.roleId,
        );
      }

      // The folder cache was primed at boot, so this brand-new user is not in
      // it yet — without this their avatar and ID docs would be written to a
      // raw-uuid folder while everyone else uses `user/pr/<name>-<id8>/`.
      await refreshUserFolder(user.id);

      // A public PR's receipt was already spent before the lookups (above).

      // PR self-sign-up → agency membership request on agency_pr (user_id key).
      if (isPublicPr && parsedBody.agencyId) {
        const known = await this.agencyPrRepository.filterExistingAgencyIds([
          parsedBody.agencyId,
        ]);
        if (known.length === 1) {
          await this.agencyPrRepository.ensureLink(
            user.id,
            parsedBody.agencyId,
            actor,
            'pending',
          );
        } else {
          logger.warn(
            '[AuthController.register] Ignoring unknown agencyId on PR sign-up',
            { agencyId: parsedBody.agencyId },
          );
        }
      }

      // createUserWithRole only inserts an empty user_profile — fill identity /
      // address from the PR wizard (or any register body that sends them).
      /*
       * 🔴 WRITE WHAT ARRIVED, not all-or-nothing.
       *
       * This used to demand ten fields together, so a PR missing any ONE of
       * them had every other answer discarded — name, address, languages and
       * comcard alike — and then fell through to a 400. Since nationality, ID
       * type, birth date and ID number became optional for the PR app (owner,
       * 10 Sep 2026), that condition would have rejected the ordinary case.
       *
       * The name is the one thing worth gating on: a profile row with no name
       * is not a person, and the wizard requires it. Everything below is
       * spread in only when present, so a blank stays blank rather than
       * overwriting a value with undefined.
       */
      if (parsedBody.fullName) {
        const savedProfile = await this.userProfileRepository.update(user.id, {
          fullName: parsedBody.fullName,
          ...(parsedBody.nationality
            ? { nationality: parsedBody.nationality }
            : {}),
          ...(parsedBody.idType ? { idType: parsedBody.idType } : {}),
          ...(parsedBody.idNo ? { idNo: parsedBody.idNo } : {}),
          // The IC wins on the birth date, as it does everywhere else: when the
          // number encodes one, that is the answer, whatever the client typed.
          ...((dobFromNric(parsedBody.idNo) ?? parsedBody.dob)
            ? { dob: dobFromNric(parsedBody.idNo) ?? parsedBody.dob }
            : {}),
          ...(parsedBody.addressLine1
            ? { addressLine1: parsedBody.addressLine1 }
            : {}),
          ...(parsedBody.addressLine2 !== undefined
            ? { addressLine2: parsedBody.addressLine2 ?? null }
            : {}),
          ...(parsedBody.city ? { city: parsedBody.city } : {}),
          ...(parsedBody.postcode ? { postcode: parsedBody.postcode } : {}),
          ...(parsedBody.state ? { state: parsedBody.state } : {}),
          ...(parsedBody.country ? { country: parsedBody.country } : {}),
          ...(parsedBody.comcardHeightCm != null
            ? { comcardHeightCm: parsedBody.comcardHeightCm }
            : {}),
          ...(parsedBody.comcardWeightKg != null
            ? { comcardWeightKg: parsedBody.comcardWeightKg }
            : {}),
          ...(parsedBody.comcardBustCm != null
            ? { comcardBustCm: parsedBody.comcardBustCm }
            : {}),
          ...(parsedBody.comcardWaistCm != null
            ? { comcardWaistCm: parsedBody.comcardWaistCm }
            : {}),
          ...(parsedBody.comcardHipCm != null
            ? { comcardHipCm: parsedBody.comcardHipCm }
            : {}),
          ...(parsedBody.languages?.length
            ? { languages: parsedBody.languages }
            : {}),
          verificationStatus: 'pending',
          updatedBy: actor,
        });
        /*
         * This used to 500 when a public PR sign-up produced no stored id —
         * correct while the id was mandatory, and wrong now that it is not
         * (owner, 10 Sep 2026). What still deserves a refusal is the row not
         * being written AT ALL, which means the write failed rather than the
         * PR declining to answer.
         *
         * An id that was SENT and did not land is still a fault, so that case
         * keeps its 500: silently dropping an id someone typed is how a PR
         * ends up unable to be paid.
         */
        if (isPublicPr && !savedProfile) {
          logger.error('[AuthController.register] Profile row not written', {
            userId: user.id,
          });
          return res.status(500).json({
            success: false,
            message: 'Could not save your details — please try again',
            data: null,
          });
        }
        if (isPublicPr && parsedBody.idNo && !savedProfile?.idNo) {
          logger.error('[AuthController.register] Identity not persisted after profile update', {
            userId: user.id,
            idNo: parsedBody.idNo,
            idType: parsedBody.idType,
          });
          return res.status(500).json({
            success: false,
            message: 'Could not save ID details — please try again',
            data: null,
          });
        }
      } else if (
        (parsedBody.accountType === 'agency' || parsedBody.accountType === 'outlet') &&
        parsedBody.personInCharge
      ) {
        // Web org signup. The company ADDRESS lives on agency/outlet; the owner's
        // IDENTITY lives here, and since 9 Sep 2026 sign-up asks for it: the name
        // as printed on the IC, the id itself, and the gender.
        //
        // 🔴 THE IC IS THE AUTHORITY FOR THE BIRTH DATE, exactly as it already is
        // for a PR's age (`derivedAge`). The client sends a date; this recomputes
        // it from the number and uses its own answer, so a hand-edited request
        // cannot age its owner.
        const derivedDob = dobFromNric(parsedBody.idNo) ?? parsedBody.dob ?? null;
        const icGender = genderFromNric(parsedBody.idNo);
        // Gender is asked AND derived, and they must agree — the owner's
        // double-confirmation. Silently overwriting the person with the parity
        // digit is what this avoids: on this database that digit already
        // contradicts two accounts whose names are not ambiguous. A mismatch is
        // refused BEFORE anything is created (see the top of this handler), so
        // here the two agree or one of them is absent.
        await this.userProfileRepository.update(user.id, {
          fullName: parsedBody.personInCharge,
          ...(parsedBody.idType ? { idType: parsedBody.idType } : {}),
          ...(parsedBody.idNo ? { idNo: parsedBody.idNo } : {}),
          ...(derivedDob ? { dob: derivedDob } : {}),
          ...(icGender ?? parsedBody.gender
            ? { gender: icGender ?? parsedBody.gender }
            : {}),
          ...(parsedBody.nationality
            ? { nationality: parsedBody.nationality }
            : {}),
          updatedBy: actor,
        });
      } else if (isPublicPr) {
        // Only the NAME is required of a PR now. Everything else the wizard
        // asks for may be filled in later.
        return res.status(400).json({
          success: false,
          message: 'A full name is required for PR sign-up',
          data: null,
        });
      }

      // The logo is REQUIRED by the signup form, but its upload deliberately
      // fails open below (see the catch). Report that back so the UI can tell
      // the owner their logo did not save instead of leaving them to discover
      // a blank Settings header later.
      let logoUploadFailed = false;

      // Outlet / agency web signup — create the organisation + owner membership.
      // Previously register only wrote user + user_role + empty user_profile.
      if (parsedBody.accountType === 'agency' || parsedBody.accountType === 'outlet') {
        const org = await this.createOrgForSignup(user.id, parsedBody, actor);

        // Logo → R2, then key on agency/outlet.logo_image (not user.profileImage).
        if (parsedBody.logoBase64 && parsedBody.logoFileName) {
          try {
            const logoKey = await saveOrgLogoFromBase64({
              kind: org.kind,
              orgId: org.id,
              orgName: org.name,
              fileName: parsedBody.logoFileName,
              contentType: parsedBody.logoContentType,
              base64: parsedBody.logoBase64,
            });
            if (org.kind === 'agency') {
              await this.agencyRepository.update(org.id, {
                logoImage: logoKey,
                updatedBy: actor,
              });
            } else {
              await this.outletRepository.update(org.id, {
                logoImage: logoKey,
                updatedBy: actor,
              });
            }
          } catch (logoError) {
            // Account + org already exist — do not 400 (retry would hit
            // USER_ALREADY_EXISTS). Logo can be re-uploaded after approval.
            logoUploadFailed = true;
            logger.error('[AuthController.register] Org logo upload failed', {
              orgId: org.id,
              kind: org.kind,
              error: logoError,
            });
          }
        }
      }

      // After profile exists so R2 path can use user_profile.full_name.
      if (req.file) {
        const profileImage = await saveProfileImageFile(
          {
            id: user.id,
            fullName: parsedBody.fullName ?? parsedBody.personInCharge,
          },
          req.file,
        );
        const updatedUser = await this.userRepository.updateUser(
          { profileImage, updatedBy: actor },
          user.id,
        );
        if (updatedUser) user = updatedUser;
      }

      logger.info('[AuthController.register] User registered:', user.username);

      const profile = await this.userProfileRepository.getByUserId(user.id);

      return res.status(201).json({
        success: true,
        message: 'User registered successfully',
        data: withUserProfile(user, profile),
        // Sibling of `data`, not inside it: `data` is the user record, and this
        // is a fact about the request. Absent on PR signups, which have no org.
        logoUploadFailed,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          message: error.issues[0]?.message ?? 'Please fill in all mandatory fields',
          data: null,
        });
      }

      logger.error('[AuthController.register] Error:', safeErrorFields(error));
      return res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
      });
    }
  }

  async forgotPassword(req: Request, res: Response) {
    try {
      logger.info('[AuthController.forgotPassword] Processing forgot password request');

      const parseResult = ForgotPasswordSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          success: false,
          message: parseResult.error.issues[0]?.message ?? 'Valid email is required',
          data: null,
        });
      }

      const email = parseResult.data.email.trim();

      /**
       * One answer for every outcome — unknown address, disabled account, or a
       * link actually sent. A response that differs between them turns this
       * endpoint into an account-existence oracle for the whole platform.
       */
      const neutral = {
        success: true,
        message: 'If that email is registered, a reset link is on its way.',
        data: null,
      };

      const user = await this.userRepository.getUserByLoginMethod('email', email);
      /*
       * An account with NO PASSWORD gets the same answer as an unknown address,
       * at the same point — before any token is written or mail sent — so
       * neither the body nor the delay tells them apart. A reset replaces a
       * password; it never creates the first one (account-activation.ts): a
       * roster stub's email was typed by the agency that created it, which may
       * still change it until the PR claims the account by signing up with her
       * phone.
       */
      if (!mayResetPassword(user)) {
        logger.info('[AuthController.forgotPassword] No resettable account for that email');
        return res.status(200).json(neutral);
      }

      /*
       * THE ANSWER COMES FIRST (security review, 30 Sep 2026). The body was
       * already neutral, but a real account was answered only after its token
       * write and the mail send — about a second — and an unknown address
       * straight after the lookup: the DELAY said which addresses have
       * accounts. Every address is now answered after the same one lookup,
       * and the link is minted and mailed afterwards (`sendResetLink`), the
       * same shape as the phone reset's `answerReset`.
       */
      const answered = res.status(200).json(neutral);
      this.runAfterAnswer(() => this.sendResetLink(user, email));
      return answered;
    } catch (error) {
      logger.error('[AuthController.forgotPassword] Error:', safeErrorFields(error));
      return res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
    }
  }

  /**
   * The emailed reset link, AFTER the answer. Never throws: the answer is
   * already out, and the log is all that is left to tell.
   */
  private async sendResetLink(
    user: { id: string; email: string | null; username: string | null },
    email: string,
  ): Promise<void> {
    try {
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

      // Replaces any earlier token for this user (the repository deletes first),
      // so an old link stops working the moment a new one is requested.
      await this.authRepository.createResetPasswordToken(user.id, token, expiresAt);

      const base = env.FRONTEND_URL.replace(/\/$/, '');
      const resetPasswordLink = `${base}/reset-password?token=${encodeURIComponent(token)}`;

      try {
        const sent = await sendPasswordResetEmail({
          recipientEmail: user.email ?? email,
          name: user.username?.trim() || 'there',
          resetPasswordLink,
          expiryLabel: RESET_TOKEN_TTL_LABEL,
        });
        if (!sent) {
          /*
           * SMTP is not configured. The link is deliberately NOT returned to
           * the caller — and in PRODUCTION it is not logged either: it carries
           * the raw token, so the line was a live takeover of this account for
           * the next hour for anyone who can read the logs. Production records
           * only WHO a link was skipped for. Outside production the link is
           * still logged so a developer can finish the flow locally — the same
           * split `deliverCode` applies to one-time codes.
           */
          if (isProduction()) {
            logger.warn(
              '[AuthController.forgotPassword] Email not configured — reset link NOT delivered',
              { userId: user.id },
            );
          } else {
            logger.warn(
              '[AuthController.forgotPassword] Email not configured — reset link logged for local dev only',
              { userId: user.id, resetPasswordLink },
            );
          }
        }
      } catch (mailError) {
        // Fields only: an SMTP refusal quotes the recipient address.
        logger.error(
          '[AuthController.forgotPassword] Could not send reset email:',
          { userId: user.id, ...safeErrorFields(mailError) },
        );
      }
    } catch (error) {
      logger.error('[AuthController.forgotPassword] reset link failed after the answer:', {
        userId: user.id,
        ...safeErrorFields(error),
      });
    }
  }

  /**
   * TRADE A REFRESH TOKEN FOR A FRESH ACCESS TOKEN.
   *
   * 🔴 This endpoint never existed, and its absence was not a missing
   * convenience — it is what made the refresh token dangerous. Login minted one,
   * both clients STORED one, and nothing could ever spend it, so the only thing
   * it did was sit in `localStorage` being silently accepted as an access token
   * (both generators signed the same payload; `verifyToken` cannot tell them
   * apart). The type claim now refuses it everywhere else; this is the one door
   * it opens.
   *
   * Every gate login applies is re-applied here, because a refresh is a new
   * session and the seven days since the last one are exactly when an account
   * gets disabled, an organisation gets suspended, or a password gets changed:
   *
   *   • the token must BE a refresh token — an access token cannot extend itself;
   *   • the account must still exist and still be active;
   *   • the token must post-date the account's `sessions_valid_from`, so a
   *     password change kills the refresh token along with the access ones.
   *
   * It returns only an ACCESS token. Re-issuing the refresh token on every use
   * would make a stolen one renewable forever, which is the failure this whole
   * change is about.
   */
  async refresh(req: Request, res: Response) {
    try {
      const token =
        typeof req.body?.refreshToken === 'string'
          ? req.body.refreshToken.trim()
          : '';
      if (!token) {
        return res
          .status(400)
          .json({ success: false, message: 'refreshToken is required', data: null });
      }

      let payload: ReturnType<JwtControllerClass['verifyToken']>;
      try {
        payload = this.jwtController.verifyToken(token);
      } catch {
        // Expired or forged — one answer for both, so this cannot be used to
        // tell a real expired token from a fabricated one.
        return res
          .status(401)
          .json({ success: false, message: 'Please sign in again.', data: null });
      }

      if (payload.type !== 'refresh') {
        return res
          .status(401)
          .json({ success: false, message: 'Please sign in again.', data: null });
      }

      const user = await this.userRepository.getUserByLoginMethod(
        payload.loginMethod,
        payload.loginCriteria,
      );
      if (!user || user.status !== 'active') {
        return res
          .status(401)
          .json({ success: false, message: 'Please sign in again.', data: null });
      }

      const issuedAt =
        typeof payload.iat === 'number' ? new Date(payload.iat * 1000) : null;
      if (isTokenBeforeCutoff(issuedAt, user.sessionsValidFrom)) {
        return res
          .status(401)
          .json({ success: false, message: 'Please sign in again.', data: null });
      }

      const accessToken = this.jwtController.generateAccessToken({
        loginMethod: payload.loginMethod,
        loginCriteria: payload.loginCriteria,
      });
      const decoded = this.jwtController.verifyToken(accessToken);
      // The audit row's actor, as on login: the refresh token rides in the BODY,
      // so the audit middleware found no bearer and filed the renewal anonymously.
      req.user = user;
      return res.status(200).json({
        success: true,
        message: 'Session refreshed',
        data: {
          accessToken,
          expiredAt: decoded.exp ? decoded.exp * 1000 : null,
        },
      });
    } catch (error) {
      logger.error('[AuthController.refresh] Error:', error);
      return res
        .status(500)
        .json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async me(req: Request, res: Response) {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ success: false, message: Error.UNAUTHORIZED, data: null });
      }

      /*
       * NO ROLE IS MINTED HERE ANY MORE. `/auth/me` used to call
       * `ensurePortalRolesFromMembership`, which granted a portal role to any
       * account holding an active membership without one — so a signed-in
       * request QUIETLY CREATED AUTHORITY. See the tombstone in
       * `auth.repository.ts` for why that was an escalation after 0160, and
       * where the one case it was really covering is now fixed instead.
       *
       * A read must stay a read. This handler answers what the account HAS;
       * granting is the job of sign-up, invite acceptance, or an admin.
       */

      const roles = await this.authRepository.getRolesForUserIds([user.id]);
      const profile = await this.userProfileRepository.getByUserId(user.id);

      const portals = [
        ...new Set(roles.map((r) => r.portalCode).filter((c): c is string => Boolean(c))),
      ];

      /**
       * WHICH organisations this person actually works in.
       *
       * `portals` says what KIND of portal they may open; it cannot say which
       * agency or venue, and a person may staff several. The client needs the
       * list to decide whether to ask them to choose after signing in — one
       * organisation goes straight through, two or more must be asked, because
       * the server would otherwise pick the oldest and never mention it.
       *
       * ⚠️ EVERY membership is returned, not only the active ones, and each
       * says whether it can be ENTERED (owner, 10 Sep 2026: *"remember need
       * for the user to see that the organisation which is banned which is
       * not"*).
       *
       * This list used to be filtered to `status: 'active'`, on the reasoning
       * that offering a dead membership produces a choice the scope resolver
       * then refuses. That reasoning is right about ENTERING and wrong about
       * SHOWING. Deactivation is per-organisation: somebody removed from one
       * agency while still working at another simply saw that agency vanish,
       * with nothing to distinguish "you were deactivated here" from "this
       * organisation never existed". Silence is the one answer that leaves
       * them with no idea whether to contact anyone.
       *
       * So the answer is CARRIED rather than filtered, and `enterable` is
       * computed HERE — once, on the server — so no client has to re-derive
       * which combination of two statuses means "you may work here".
       *
       * ⚠️ `enterable` is NOT `orgStatus === 'active'`. `orgStatusDeniesSignIn`
       * is the login gate's own rule and denies `inactive` ONLY:
       * `pending_review` and `suspended` keep a deliberate profile-only
       * session, so greying those out would lock owners out of the settings
       * screen they are meant to reach. Shared with the gate for exactly that
       * reason — two spellings would drift, and the drift shows up as a picker
       * that disagrees with the door.
       */
      const [allAgencyMemberships, allOutletMemberships] = await Promise.all([
        this.agencyMemberRepository.listMembershipsByUserIds([user.id]),
        this.outletMemberRepository.listMembershipsByUserIds([user.id]),
      ]);
      /*
       * ⚠️ A DECLINED REQUEST IS NOT AN ORGANISATION YOU BELONG TO (0162).
       *
       * Owner, 11 Sep 2026: "if in approval been declined cannot be the orgs
       * member".
       *
       * The note above explains why a DEACTIVATED membership is carried rather
       * than filtered: somebody removed from one agency while still working at
       * another deserves to see WHY that agency stopped letting them in, and
       * silence leaves them with nobody to contact. Every word of that is about
       * a relationship that EXISTED and ended.
       *
       * `rejected` is the opposite case. They asked to join and were turned
       * down, so there is no relationship to explain — and listing the
       * organisation, even greyed out, tells them they have standing there that
       * they do not. It is also the same rule the organisation's own roster
       * now applies from the other side, which is what keeps the two screens
       * telling one story.
       */
      const agencyMemberships = allAgencyMemberships.filter(
        (m) => m.status !== 'rejected',
      );
      const outletMemberships = allOutletMemberships.filter(
        (m) => m.status !== 'rejected',
      );
      /*
       * ⚠️ A DECLINED REQUEST IS NOT AN ORGANISATION — IT IS AN ANSWER.
       *
       * Owner, 11 Sep 2026: "if decline then that user can log in but need will
       * show that … the orgs is decline your request".
       *
       * Two of the owner's rules meet here and only look contradictory. A
       * declined person must NOT appear to belong to that organisation — no
       * card in the picker, nothing enterable, which is why `rejected` is
       * filtered out of `organisations` above. But they are still owed the
       * OUTCOME of a request they made: silence leaves somebody refreshing a
       * "waiting" page forever for an answer that already came.
       *
       * So it travels in its own list with its own meaning. `organisations` is
       * "where you belong"; this is "what happened to what you asked for".
       * Carrying a declined row inside `organisations` with a flag would have
       * put it one missed check away from being rendered as a membership.
       */
      const declinedRequests = [
        ...allAgencyMemberships
          .filter((m) => m.status === 'rejected')
          .map((m) => ({ kind: 'agency' as const, name: m.agencyName })),
        ...allOutletMemberships
          .filter((m) => m.status === 'rejected')
          .map((m) => ({ kind: 'outlet' as const, name: m.outletName })),
      ];

      /**
       * ⚠️ PERMISSIONS COME FROM THE MEMBERSHIP LANE, NOT THE ROLE ROWS.
       *
       * This used to be `getUserPermissions(user.id)` — the union of the
       * account's `user_role` rows — which answers "what may this person do
       * ANYWHERE". Authority here belongs to the lane they hold IN AN
       * ORGANISATION, and on real accounts the two had drifted: a venue's
       * Finance head and its Ops Head both still carried an `Owner` role row
       * from an earlier grant, so this endpoint handed them `settings:update`
       * and the portals offered the Edit button, the Pay button and the
       * payment method — the three the owner's rule reserves for the owner.
       *
       * The server never honoured it (`requirePermission` reads the lane), so
       * every write was refused; it was the SCREEN that lied. Owner, 12 Sep
       * 2026: "the web matrix must not lie to user and always must follow the
       * database that actually what can access what cannot."
       *
       * Admin keeps its role-row grants: an admin acts on organisations rather
       * than within one, so there is no membership lane to read.
       */
      const lanePairs = [
        /*
         * ACTIVE only. `agencyMemberships` / `outletMemberships` keep `pending`
         * and `inactive` so the chooser can show somebody they are waiting or
         * switched off — but a lane that cannot sign in must not carry grants.
         */
        ...agencyMemberships
          .filter((m) => m.status === 'active')
          .map((m) => ({
            roleName: portalRoleNameForSubRole('agency', m.subRole ?? ''),
            portalCode: 'agency',
            orgId: m.agencyId,
          })),
        ...outletMemberships
          .filter((m) => m.status === 'active')
          .map((m) => ({
            roleName: portalRoleNameForSubRole('outlet', m.subRole ?? ''),
            portalCode: 'outlet',
            orgId: m.outletId,
          })),
        ...roles
          .filter((r) => r.portalCode === 'admin')
          // Admin acts ON organisations, not within one — no org to tag.
          .map((r) => ({
            roleName: r.roleName,
            portalCode: 'admin',
            orgId: null as string | null,
          })),
      ];
      const byRole = await this.authRepository.permissionsForRoleNames(
        // De-duplicated: two venues on the same lane is one set of grants.
        [
          ...new Map(
            lanePairs.map((p) => [`${p.portalCode}/${p.roleName}`, p]),
          ).values(),
        ],
      );

      /**
       * ⚠️ EVERY GRANT CARRIES THE ORGANISATION IT CAME FROM.
       *
       * A flat union is wrong the moment somebody holds DIFFERENT lanes in two
       * organisations. Owner at venue A and Director at venue B unions to the
       * owner's set, and the portals — which pick by portal, not by venue —
       * then showed the Director at B the Edit, Post Job, Seal Shift and Log
       * Sales controls. The server refused every one (`requirePermission`
       * resolves the acting org and reads THAT venue's lane), so it was the
       * screen lying again, in the one case the lane change had not covered.
       *
       * So the answer is per organisation: the same role's grants repeated for
       * each org that holds that lane, tagged with `orgId`. The client keeps
       * only the grants for the organisation it is actually in.
       */
      const grantsFor = (portalCode: string, roleName: string) =>
        byRole.filter(
          (g) => g.portalCode === portalCode && g.roleName === roleName,
        );
      const permissions = lanePairs.flatMap((pair) =>
        grantsFor(pair.portalCode, pair.roleName).map((g) => ({
          ...g,
          orgId: pair.orgId ?? null,
        })),
      );

      const organisations = [
        ...agencyMemberships.map((m) => ({
          kind: 'agency' as const,
          id: m.agencyId,
          name: m.agencyName,
          // The BRAND, so the chooser is a glance and not a read.
          logoImage: m.logoImage ?? null,
          subRole: m.subRole,
          memberCode: m.memberCode ?? null,
          /** This person's standing INSIDE the organisation. */
          membershipStatus: m.status,
          /** The organisation's own standing on the platform. */
          orgStatus: m.agencyStatus,
          enterable:
            m.status === 'active' && !orgStatusDeniesSignIn(m.agencyStatus),
        })),
        ...outletMemberships.map((m) => ({
          kind: 'outlet' as const,
          id: m.outletId,
          name: m.outletName,
          logoImage: m.logoImage ?? null,
          subRole: m.subRole,
          memberCode: m.memberCode ?? null,
          membershipStatus: m.status,
          orgStatus: m.outletStatus,
          enterable:
            m.status === 'active' && !orgStatusDeniesSignIn(m.outletStatus),
        })),
      ];

      return res.status(200).json({
        success: true,
        message: 'OK',
        data: {
          ...withUserProfile(user, profile),
          portals,
          organisations,
          // The ANSWER to a request, not a place they belong — see above.
          declinedRequests,
          roles: roles.map((r) => ({
            id: r.roleId,
            roleName: r.roleName,
            portalId: r.portalId,
            portalCode: r.portalCode,
          })),
          permissions: permissions.map((p) => ({
            moduleId: p.moduleId,
            moduleName: p.moduleName,
            moduleKey: p.moduleKey,
            permissionId: p.permissionId,
            permissionType: p.permissionType,
            /*
             * WHICH console the grant is for. Without it the portals cannot tell
             * an agency `settings:update` from an outlet one — see the field's
             * note in `schema/rbac.schema.ts`.
             */
            portalCode: p.portalCode ?? null,
            /** WHICH organisation this grant is for — null for admin. */
            orgId: p.orgId ?? null,
          })),
        },
      });
    } catch (error) {
      logger.error('[AuthController.me] Error:', error);
      return res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
    }
  }

  /**
   * Save the caller's UI language (migration 0122).
   *
   * Self-only by construction: the id comes from the verified token, never from
   * the body or the path, so there is no route shape in which one account can
   * set another's language. That is why this carries no role guard — every
   * signed-in role (admin, agency, outlet, PR) may set their own.
   *
   * The allow-list IS the validation. A varchar(16) column would happily store
   * junk, and a locale no dictionary answers to renders a portal full of
   * `undefined` — so an unknown tag is a 400, not a silent write.
   */
  async updateLocale(req: Request, res: Response) {
    /** `zh` = Simplified. Mirrors apps/mobile/src/i18n/locale-prefs.ts. */
    const SUPPORTED_LOCALES = ['en', 'zh'] as const;

    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ success: false, message: Error.UNAUTHORIZED, data: null });
      }

      const parsed = z.object({ locale: z.enum(SUPPORTED_LOCALES) }).safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          message: `locale must be one of: ${SUPPORTED_LOCALES.join(', ')}`,
          data: null,
        });
      }

      const updated = await this.userRepository.updateUser(
        { preferredLocale: parsed.data.locale, updatedBy: user.id },
        user.id,
      );

      if (!updated) {
        return res.status(500).json({
          success: false,
          message: Error.INTERNAL_SERVER_ERROR,
          data: null,
        });
      }

      return res.status(200).json({
        success: true,
        message: 'OK',
        data: { preferredLocale: updated.preferredLocale },
      });
    } catch (error) {
      logger.error('[AuthController.updateLocale] Error:', error);
      return res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
    }
  }

  async resetPassword(req: Request, res: Response) {
    try {
      logger.info('[AuthController.resetPassword] Processing password reset');

      const parseResult = ResetPasswordSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          success: false,
          message: parseResult.error.issues[0]?.message ?? 'Validation failed',
          data: null,
        });
      }

      const { token, password } = parseResult.data;
      const resetToken = await this.authRepository.getPasswordResetToken(token);

      const invalidLink = () =>
        res.status(400).json({
          success: false,
          message: 'Reset link is invalid or has expired.',
          data: null,
        });

      if (!resetToken || resetToken.expiresAt < new Date()) {
        return invalidLink();
      }

      /*
       * RE-READ THE ACCOUNT BEFORE WRITING. The token was checked for existence
       * and age only, so a link issued to an account that was disabled since —
       * or to a password-less roster stub, before the stub rule shipped — still
       * wrote a password. A reset replaces a password; it never creates the
       * first one (account-activation.ts). Answered as an invalid link.
       */
      const account = await this.userRepository.getUserById(resetToken.userId);
      if (!mayResetPassword(account)) {
        // A null read may be a blip rather than a gone account, so the token is
        // only spent when the account was actually read and refused.
        if (account) await this.authRepository.deletePasswordResetToken(token);
        logger.warn('[AuthController.resetPassword] Refused: account not resettable', {
          userId: resetToken.userId,
        });
        return invalidLink();
      }

      const passwordHash = await hashPassword(password);
      // A reset proves control of the mailbox, so a lock earned by guessing
      // the OLD password must not keep the owner out of the new one.
      await this.authRepository.updateUserPassword(resetToken.userId, passwordHash, {
        updatedBy: resetToken.userId,
        clearLockout: true,
      });
      await this.authRepository.deletePasswordResetToken(token);

      logger.info('[AuthController.resetPassword] Password reset for userId:', resetToken.userId);
      return res.status(200).json({
        success: true,
        message: 'Password reset successfully.',
        data: null,
      });
    } catch (error) {
      logger.error('[AuthController.resetPassword] Error:', safeErrorFields(error));
      return res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
    }
  }

  /**
   * PR forgot-password via WhatsApp OTP. Consumes a verified
   * purpose=forgot_password receipt from POST /auth/otp/verify.
   */
  async resetPasswordWithOtp(req: Request, res: Response) {
    try {
      const parsed = ResetPasswordWithOtpSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          message: parsed.error.issues[0]?.message ?? 'Validation failed',
          data: null,
        });
      }

      const phoneNum = normalizePhoneDigits(parsed.data.phoneNum);
      const proof = await this.phoneVerificationRepository.getById(parsed.data.verificationId);
      if (!isVerifiedOtpUsable(proof, phoneNum, 'forgot_password')) {
        return res.status(400).json({
          success: false,
          message: 'Phone verification is missing or expired — verify again',
          data: null,
        });
      }

      const user = await this.userRepository.getUserByLoginMethod('phone', phoneNum);
      /*
       * ⚠️ NOT A WAY TO ACTIVATE AN ACCOUNT (Fix First, 28 Sep 2026). This path
       * proves possession of the number, and it used to be the only door a
       * roster stub (active, NO password) had — which is why it may not be one
       * any more: the stub's number was typed by the agency that created it,
       * and the agency may re-point it until the account is claimed. The
       * decision recorded in account-activation.ts: PR SIGN-UP already verifies
       * the phone by OTP, so a stub is claimed THERE (`registerUser`, with a
       * code sent to the phone alone), and every reset — this one included —
       * requires a password already on file. A stub is answered exactly as a
       * number with no account. `send` never issues it a forgot_password code
       * in the first place; this is the second lock.
       */
      if (!mayResetPassword(user)) {
        return res.status(400).json({
          success: false,
          message: 'No active account for this number',
          data: null,
        });
      }

      /*
       * PR-ONLY. This legacy path proves control of ONE phone number and
       * nothing else; everybody else is sent to POST /auth/password/forgot/start.
       * Checked AFTER the verified receipt, so this cannot be used to learn an
       * account's roles without first holding its phone.
       *
       * ⚠️ This is NOT protection against a SIM swap, and must not be read as
       * one. forgot/start sends ONE code to WhatsApp, SMS and email together,
       * and forgot/complete accepts that code from whichever channel it was
       * read on — so whoever holds the owner's SIM receives it by SMS or
       * WhatsApp and can finish the reset without the mailbox. A code-based
       * reset is only as strong as the WEAKEST contact on file. What the
       * restriction buys is one reset flow for organisation roles (a
       * lockout-clearing, session-cutting, notified one), not a second factor.
       * Requiring codes from two channels for non-PR accounts would be the
       * SIM-swap defence; that is an owner's product decision, not built.
       */
      const roles = await this.authRepository.getRolesForUserIds([user.id]);
      const onlyPr =
        roles.length > 0 && roles.every((role) => role.roleName === portalRoleName.PR);
      if (!onlyPr) {
        return res.status(403).json({
          success: false,
          message: 'Use Forgot password on the sign-in page',
          data: null,
        });
      }

      const passwordHash = await hashPassword(parsed.data.password);
      await this.authRepository.updateUserPassword(user.id, passwordHash, {
        updatedBy: user.id,
        clearLockout: true,
      });
      await this.phoneVerificationRepository.update(proof.id, {
        status: 'consumed',
        updatedBy: user.id,
      });

      logger.info('[AuthController.resetPasswordWithOtp] Password reset for userId:', user.id);
      return res.status(200).json({
        success: true,
        message: 'Password updated. You can sign in with the new password.',
        data: null,
      });
    } catch (error) {
      logger.error('[AuthController.resetPasswordWithOtp] Error:', safeErrorFields(error));
      return res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
    }
  }

  /*
   * SIGNED-IN PASSWORD CHANGE MOVED to features/account-code/
   * password-change.controller.ts (route: POST /auth/password/change). It now
   * re-issues the caller's token pair, cuts the other sessions at a
   * second-floored cutoff, caps the password at bcrypt's 72 bytes and sends a
   * best-effort notice — and its tests construct it with fakes, which this
   * 14-dependency controller cannot offer.
   */


}
