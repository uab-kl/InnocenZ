import { Request, Response } from 'express';
import crypto from 'node:crypto';
import { AuthRepositoryClass } from './auth.repository.js';
import { JwtControllerClass } from '@/features/jwt/jwt.controller.js';
import { Error } from '@/error/index.js';
import { hashPassword, comparePassword } from '@/util/password.js';
import { logger } from '@/util/logger.js';
import {
  LoginSchema,
  RegisterSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
  ResetPasswordWithOtpSchema,
  ChangePasswordSchema,
  ChangePhoneWithOtpSchema,
} from '@/schema/auth.schema.js';
import { UserRepositoryClass as UserRepository } from '@/features/user/user.repository.js';
import { UserProfileRepositoryClass } from '@/features/user/user-profile/user-profile.repository.js';
import { RoleRepositoryClass } from '@/features/rbac/role/role.repository.js';
import {
  roleNameForAccountType,
  SIGNUP_ACCOUNT_TYPES,
  type SignupAccountType,
} from './signup-roles.js';
import { saveProfileImageFile } from '@/util/profile-image.js';
import { withUserProfile } from '@/util/user-profile-image.js';
import { z } from 'zod';
import { AdminMfaRepositoryClass } from '@/features/admin-mfa/admin-mfa.repository.js';
import { generateSecret, otpauthUri, verifyTotp } from '@/util/totp.js';
import { suspendedOrgBlock } from '@/features/auth/org-status.js';
import {
  isVerifiedOtpUsable,
  normalizePhoneDigits,
  PhoneVerificationRepositoryClass,
} from './phone-verification.repository.js';
import { AgencyPrRepository } from '@/features/agency/agency-pr.repository.js';

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
          { failedLoginAttempts: 0, lockedUntil: null, updatedBy: user.username },
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
      const attempts = (user.failedLoginAttempts ?? 0) + 1;
      const lock = attempts >= AuthControllerClass.MAX_FAILED_ATTEMPTS;
      await this.userRepository.updateUser(
        {
          failedLoginAttempts: attempts,
          lockedUntil: lock
            ? new Date(Date.now() + AuthControllerClass.LOCKOUT_MINUTES * 60_000)
            : null,
          updatedBy: user.username,
        },
        user.id,
      );
      if (lock) {
        logger.warn(`[AuthController] Locked ${user.username} after ${attempts} failed attempts`);
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
    const role = await this.roleRepository.getRoleByName(roleName);
    if (!role) {
      // The four default roles are seeded by scripts/init-roles.ts. Missing one
      // is a deployment fault, not something the caller did wrong.
      logger.error(`[AuthController.register] Role '${roleName}' is not seeded`);
      return {
        error: { status: 500, message: 'Sign-up is not configured for this account type' },
      };
    }

    return { roleId: role.id };
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

      if (parsedBody.email) {
        const existingEmail = await this.userRepository.getUserByLoginMethod('email', parsedBody.email);
        if (existingEmail) {
          return res.status(409).json({
            success: false,
            message: Error.USER_ALREADY_EXISTS,
          });
        }
      }

      const existingPhone = await this.userRepository.getUserByLoginMethod('phone', parsedBody.phoneNum);
      if (existingPhone) {
        return res.status(409).json({
          success: false,
          message: Error.USER_ALREADY_EXISTS,
        });
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
      const actor = parsedBody.email ?? parsedBody.phoneNum;

      let user = await this.authRepository.createUserWithRole(
        {
          email: parsedBody.email ?? null,
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

      if (req.file) {
        const profileImage = saveProfileImageFile(user.id, req.file);
        const updatedUser = await this.userRepository.updateUser(
          { profileImage, updatedBy: actor },
          user.id,
        );
        if (updatedUser) user = updatedUser;
      }

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
      if (
        parsedBody.fullName &&
        parsedBody.nationality &&
        parsedBody.idType &&
        parsedBody.idNo &&
        parsedBody.dob &&
        parsedBody.addressLine1 &&
        parsedBody.city &&
        parsedBody.postcode &&
        parsedBody.state &&
        parsedBody.country
      ) {
        await this.userProfileRepository.update(user.id, {
          fullName: parsedBody.fullName,
          nationality: parsedBody.nationality,
          idType: parsedBody.idType,
          idNo: parsedBody.idNo,
          dob: parsedBody.dob,
          addressLine1: parsedBody.addressLine1,
          addressLine2: parsedBody.addressLine2 ?? null,
          city: parsedBody.city,
          postcode: parsedBody.postcode,
          state: parsedBody.state,
          country: parsedBody.country,
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
      }

      logger.info('[AuthController.register] User registered:', user.username);

      const profile = await this.userProfileRepository.getByUserId(user.id);

      return res.status(201).json({
        success: true,
        message: 'User registered successfully',
        data: withUserProfile(user, profile),
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          message: error.issues[0]?.message ?? 'Please fill in all mandatory fields',
          data: null,
        });
      }

      logger.error('[AuthController.register] Error:', error);
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

      const { email } = parseResult.data;
      const user = await this.userRepository.getUserByLoginMethod('email', email ?? '');

      if (!user || user.status.toLowerCase() !== 'active') {
        return res.status(200).json({
          success: true,
          message: 'If that email exists, a reset link has been sent.',
          data: null,
        });
      }

      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      await this.authRepository.createResetPasswordToken(user.id, token, expiresAt);

      const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
      logger.info('[AuthController.forgotPassword] Reset link generated:', resetUrl);

      return res.status(200).json({
        success: true,
        message: 'Reset password link will be sent.',
        data: { resetUrl, token },
      });
    } catch (error) {
      logger.error('[AuthController.forgotPassword] Error:', error);
      return res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
    }
  }

  async me(req: Request, res: Response) {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ success: false, message: Error.UNAUTHORIZED, data: null });
      }

      const roles = await this.authRepository.getRolesForUserIds([user.id]);
      const permissions = await this.authRepository.getUserPermissions(user.id);
      const profile = await this.userProfileRepository.getByUserId(user.id);

      return res.status(200).json({
        success: true,
        message: 'OK',
        data: {
          ...withUserProfile(user, profile),
          roles: roles.map((r) => ({ id: r.roleId, roleName: r.roleName })),
          permissions: permissions.map((p) => ({
            moduleId: p.moduleId,
            moduleName: p.moduleName,
            permissionId: p.permissionId,
            permissionType: p.permissionType,
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
      await this.authRepository.updateUserPassword(resetToken.userId, passwordHash);
      await this.authRepository.deletePasswordResetToken(token);

      logger.info('[AuthController.resetPassword] Password reset for userId:', resetToken.userId);
      return res.status(200).json({
        success: true,
        message: 'Password reset successfully.',
        data: null,
      });
    } catch (error) {
      logger.error('[AuthController.resetPassword] Error:', error);
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

      const passwordHash = await hashPassword(parsed.data.password);
      await this.authRepository.updateUserPassword(user.id, passwordHash);
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
      logger.error('[AuthController.resetPasswordWithOtp] Error:', error);
      return res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
    }
  }

  /** Signed-in change password (current password proof — no OTP). */
  async changePassword(req: Request, res: Response) {
    try {
      const actor = req.user;
      if (!actor) {
        return res.status(401).json({ success: false, message: Error.UNAUTHORIZED, data: null });
      }

      const parsed = ChangePasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          message: parsed.error.issues[0]?.message ?? 'Validation failed',
          data: null,
        });
      }

      const user = await this.userRepository.getUserById(actor.id);
      if (!user?.passwordHash) {
        return res.status(400).json({
          success: false,
          message: 'This account cannot change password here',
          data: null,
        });
      }

      const ok = await comparePassword(parsed.data.currentPassword, user.passwordHash);
      if (!ok) {
        return res.status(401).json({
          success: false,
          message: 'Current password is incorrect',
          data: null,
        });
      }

      const passwordHash = await hashPassword(parsed.data.newPassword);
      await this.authRepository.updateUserPassword(user.id, passwordHash);

      return res.status(200).json({
        success: true,
        message: 'Password updated',
        data: null,
      });
    } catch (error) {
      logger.error('[AuthController.changePassword] Error:', error);
      return res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
    }
  }

  /**
   * Signed-in change phone. OTP must have been verified on the NEW number
   * (purpose=change_phone). Updates user.phone_num — source of truth for login.
   */
  async changePhoneWithOtp(req: Request, res: Response) {
    try {
      const actor = req.user;
      if (!actor) {
        return res.status(401).json({ success: false, message: Error.UNAUTHORIZED, data: null });
      }

      const parsed = ChangePhoneWithOtpSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          message: parsed.error.issues[0]?.message ?? 'Validation failed',
          data: null,
        });
      }

      const phoneNum = normalizePhoneDigits(parsed.data.phoneNum);
      const proof = await this.phoneVerificationRepository.getById(parsed.data.verificationId);
      if (!isVerifiedOtpUsable(proof, phoneNum, 'change_phone')) {
        return res.status(400).json({
          success: false,
          message: 'Phone verification is missing or expired — verify again',
          data: null,
        });
      }

      const currentDigits = normalizePhoneDigits(actor.phoneNum ?? '');
      if (currentDigits === phoneNum) {
        return res.status(400).json({
          success: false,
          message: 'That is already your phone number',
          data: null,
        });
      }

      const taken = await this.userRepository.getUserByLoginMethod('phone', phoneNum);
      if (taken && taken.id !== actor.id) {
        return res.status(409).json({
          success: false,
          message: 'That phone number is already in use',
          data: null,
        });
      }

      const storedPhone = `+${phoneNum}`;
      const updated = await this.userRepository.updateUser(
        { phoneNum: storedPhone, updatedBy: actor.id },
        actor.id,
      );
      if (!updated) {
        return res.status(500).json({
          success: false,
          message: 'Could not update phone number',
          data: null,
        });
      }

      await this.phoneVerificationRepository.update(proof.id, {
        status: 'consumed',
        updatedBy: actor.id,
      });

      const profile = await this.userProfileRepository.getByUserId(actor.id);
      return res.status(200).json({
        success: true,
        message: 'Phone number updated',
        data: withUserProfile(updated, profile),
      });
    } catch (error) {
      logger.error('[AuthController.changePhoneWithOtp] Error:', error);
      return res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
    }
  }
}
