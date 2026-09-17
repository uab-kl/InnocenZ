import { Request, Response } from 'express';
import crypto from 'node:crypto';
import { AuthRepositoryClass } from './auth.repository.js';
import { JwtControllerClass } from '@/features/jwt/jwt.controller.js';
import { Error } from '@/error/index.js';
import { isTokenBeforeCutoff } from './session-cutoff.js';
import { safeErrorFields } from './query-error-redaction.js';
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
import { env } from '@/env.js';

/** Reset-link lifetime. Keep the label in step with the number. */
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const RESET_TOKEN_TTL_LABEL = '1 hour';

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
  ) {}

  /** Wrong attempts before the account locks. */
  private static readonly MAX_FAILED_ATTEMPTS = 5;
  /**
   * How long the lock lasts. Long enough to make scripted guessing useless,
   * short enough that a real person who fat-fingered their password is not
   * stranded for the evening.
   */
  private static readonly LOCKOUT_MINUTES = 15;

  async login(req: Request, res: Response) {
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

      const user = await this.userRepository.getUserByLoginMethod(loginMethod, loginCriteria);
      if (!user) {
        logger.warn('[AuthController.login] User not found');
        return res.status(401).json({
          success: false,
          message: 'This account is not registered yet.',
        });
      }

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
      //
      // Checked after `user.status` and BEFORE the password compare, matching
      // the lockout below: a refusal that only fires once the password is right
      // would confirm the password to anyone who tried it.
      const orgBlock = await suspendedOrgBlock(user.id);
      if (orgBlock) {
        logger.warn(`[AuthController.login] Blocked by organisation status: ${user.id}`);
        return res.status(401).json({ success: false, message: orgBlock });
      }

      // Lockout, checked BEFORE the password compare. Checking after would let
      // an attacker keep testing passwords against a locked account and read the
      // answer from the response, which is the thing the lock exists to stop.
      if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
        const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
        logger.warn('[AuthController.login] Attempt on a locked account');
        return res.status(429).json({
          success: false,
          message: `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
        });
      }

      if (!user.passwordHash || !(await comparePassword(parsedBody.password, user.passwordHash))) {
        logger.warn('[AuthController.login] Invalid password');
        await this.recordFailedLogin(user);
        return res.status(401).json({
          success: false,
          message: 'Wrong password',
        });
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
   * The counter is NOT reset when the lock expires. It is reset only by a
   * successful login, so someone grinding away gets locked again on their next
   * wrong guess rather than being handed a fresh budget of five every
   * fifteen minutes.
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
      phoneNum: string;
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
    const contactPhone = body.phoneNum;
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
   * Public PR sign-up gate for step 1: refuse phones / ID numbers that already
   * belong to an account so the wizard does not burn five steps on a duplicate.
   */
  async checkRegisterAvailability(req: Request, res: Response) {
    try {
      const parsed = z
        .object({
          phoneNum: z.string().min(8, 'Phone number is required'),
          /*
           * OPTIONAL since 10 Sep 2026: a PR may sign up without an ID at all,
           * so this gate can only answer the half it was given. The phone is
           * still checked, because that IS the PR's login.
           */
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

      const phoneNum = normalizePhoneDigits(parsed.data.phoneNum);
      const conflicts: { field: 'phone' | 'idNo'; message: string }[] = [];

      if (phoneNum.length >= 8) {
        const existingPhone = await this.userRepository.getUserByLoginMethod('phone', phoneNum);
        if (existingPhone) {
          conflicts.push({
            field: 'phone',
            message: 'That phone number already has an account. Sign in, or use another number.',
          });
        }
      }

      // Only ask when there is something to ask about. An absent id cannot
      // collide with anything, and `findByNormalizedIdNo('')` would be a
      // question about every blank profile on the platform.
      if (parsed.data.idNo && parsed.data.idNo.length >= 4) {
        const existingId = await this.userProfileRepository.findByNormalizedIdNo(
          parsed.data.idNo,
        );
        if (existingId) {
          conflicts.push({
            field: 'idNo',
            message: 'That ID number already has an account. Sign in, or check the number.',
          });
        }
      }

      if (conflicts.length > 0) {
        return res.status(409).json({
          success: false,
          message: conflicts.map((c) => c.message).join(' '),
          data: { conflicts },
        });
      }

      return res.status(200).json({
        success: true,
        message: 'OK',
        data: { available: true },
      });
    } catch (error) {
      logger.error('[AuthController.checkRegisterAvailability] Error:', error);
      return res.status(500).json({
        success: false,
        message: 'Could not check registration details',
        data: null,
      });
    }
  }

  async registerUser(req: Request, res: Response) {
    try {
      logger.info('[AuthController.register] Register request received');
      const parsedBody = RegisterSchema.parse(req.body);

      // Public PR sign-up must present a verified WhatsApp OTP receipt. Admins
      // creating accounts (or outlet/agency web signup) are not on this path.
      const isPublicPr =
        parsedBody.accountType === 'pr' && !(await this.callerIsAdmin(req));
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
        const phoneDigits = normalizePhoneDigits(parsedBody.phoneNum);
        if (!isVerifiedOtpUsable(proof, phoneDigits, 'signup')) {
          return res.status(400).json({
            success: false,
            message: 'Phone verification is missing or expired — verify again',
            data: null,
          });
        }
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

      // Name the offending field. Both of these used to return the same bare
      // USER_ALREADY_EXISTS on the last step of a 6-step form, for a value typed
      // back on step 1 — leaving no way to tell which field to change.

      if (parsedBody.email) {
        const existingEmail = await this.userRepository.getUserByLoginMethod('email', parsedBody.email);
        if (existingEmail) {
          return res.status(409).json({
            success: false,
            message: `That email (${parsedBody.email}) is already registered. Use another one, or leave the email blank.`,
            data: null,
          });
        }
      }

      const existingPhone = await this.userRepository.getUserByLoginMethod('phone', parsedBody.phoneNum);
      if (existingPhone) {
        return res.status(409).json({
          success: false,
          message: `That phone number (${parsedBody.phoneNum}) is already registered. Sign in instead, or use another number.`,
          data: null,
        });
      }

      if (parsedBody.idNo) {
        const existingId = await this.userProfileRepository.findByNormalizedIdNo(parsedBody.idNo);
        if (existingId) {
          return res.status(409).json({
            success: false,
            message: 'An account with this ID number already exists',
            data: null,
          });
        }
      }

      /**
       * The package is judged BEFORE anything is written.
       *
       * Registration is not transactional: the user, the org and the membership
       * are each committed as they are created, and enrolment runs last. A
       * refusal raised down there — which is where an invalid package used to be
       * noticed — would leave a half-built account whose email and phone are
       * already taken, so the person could not even retry. Validating here costs
       * a 400 and creates nothing.
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

      const passwordHash = parsedBody.password ? await hashPassword(parsedBody.password) : null;
      // Prefer the caller's user id (admin creating an account). Public self-register → system.
      const actor = req.user?.id ?? SYSTEM_ACTOR;

      let user = await this.authRepository.createUserWithRole(
        {
          // Stored LOWERCASE and trimmed — every email writer does, so the
          // unique index and the case-insensitive sign-in agree about which
          // addresses are "the same".
          email: parsedBody.email ? parsedBody.email.trim().toLowerCase() : null,
          phoneNum: parsedBody.phoneNum,
          username: parsedBody.username,
          passwordHash,
          status: 'active',
          profileImage: null,
          createdBy: actor,
          updatedBy: actor,
        },
        resolved.roleId,
      );

      // The folder cache was primed at boot, so this brand-new user is not in
      // it yet — without this their avatar and ID docs would be written to a
      // raw-uuid folder while everyone else uses `user/pr/<name>-<id8>/`.
      await refreshUserFolder(user.id);

      if (isPublicPr && parsedBody.verificationId) {
        await this.phoneVerificationRepository.update(parsedBody.verificationId, {
          status: 'consumed',
          updatedBy: actor,
        });
      }

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
        // contradicts two accounts whose names are not ambiguous.
        if (icGender && parsedBody.gender && icGender !== parsedBody.gender) {
          return res.status(400).json({
            success: false,
            message: `The IC number says ${icGender} but ${parsedBody.gender} was selected — check the ID number`,
            data: null,
          });
        }
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
      if (!user || user.status.toLowerCase() !== 'active') {
        logger.info('[AuthController.forgotPassword] No active account for that email');
        return res.status(200).json(neutral);
      }

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
          // SMTP is not configured. The link is deliberately NOT returned to
          // the caller — log it so a dev can still finish the flow locally.
          logger.warn(
            '[AuthController.forgotPassword] Email not configured — reset link only logged:',
            resetPasswordLink,
          );
        }
      } catch (mailError) {
        // A dead mailbox must not tell the caller whether the account exists.
        logger.error('[AuthController.forgotPassword] Could not send reset email:', mailError);
      }

      return res.status(200).json(neutral);
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

      if (!resetToken || resetToken.expiresAt < new Date()) {
        return res.status(400).json({
          success: false,
          message: 'Reset link is invalid or has expired.',
          data: null,
        });
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
      if (!user || user.status.toLowerCase() !== 'active') {
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

  /**
   * RETIRED: the one-step phone change.
   *
   * It accepted a code verified on the NEW number (purpose=change_phone) and
   * wrote it. That proves the new number works; it does not prove the person
   * holding the session owns the account — anybody with an unlocked phone and
   * the app open could move the account to a number they control, and from
   * there reset the password. Changing a phone now takes a code to the CURRENT
   * contacts first: POST /auth/contact-change/start → verify-identity → confirm.
   *
   * Kept as a route, answering 400 with an instruction, so an app build still
   * on someone's phone shows a sentence instead of a 404 or a silent failure.
   */
  async changePhoneWithOtp(_req: Request, res: Response) {
    return res.status(400).json({
      success: false,
      message: 'Changing your phone now needs a code to your current contacts — please update the app',
      data: null,
    });
  }
}
