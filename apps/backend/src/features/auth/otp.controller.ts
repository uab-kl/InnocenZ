import crypto from 'node:crypto';
import { Request, Response } from 'express';
import { z } from 'zod';
import { logger } from '@/util/logger.js';
import { safeErrorFields } from './query-error-redaction.js';
import {
  CODE_DELIVERY_FAILED_MESSAGE,
  channelColumn,
  deliverCode,
  plannedChannels,
  type DeliverCodeInput,
  type DeliverCodeResult,
} from '@/features/account-code/delivery.js';
import { SYSTEM_ACTOR } from '@/util/actor';
import {
  codesMatch,
  hashOtpCode,
  normalizePhoneDigits,
  PhoneVerificationRepositoryClass,
} from './phone-verification.repository.js';
import {
  publicOtpPurposeValues,
  type PublicOtpPurpose,
} from './phone-verification.model.js';
import { UserRepositoryClass } from '@/features/user/user.repository.js';

/**
 * The PUBLIC purposes only — `publicOtpPurposeValues`, NOT every purpose a row
 * can carry. The account-code purposes (reset_password, contact_change_*,
 * password_change) are keyed on an account and bound to it; accepting them here
 * would let anybody who types a phone number mint or spend one. `change_phone`
 * was dropped: a phone change now needs the current password first.
 *
 * Exported so that split is asserted by a test rather than trusted.
 *
 * ⚠️ `email` is OPTIONAL and, when present, the SAME code is emailed as well as
 * WhatsApped (owner, 21 Sep 2026: "must be the same otp"). It is the address
 * the person is signing up with, typed on the same wizard step as the number.
 *
 * ⚠️ THIS ENDPOINT IS PUBLIC AND UNAUTHENTICATED, so an address in this field
 * is an address a stranger can make the server mail. What bounds it:
 *   • `otpSendPerEmailLimiter` — 3/hour keyed on the RECIPIENT, added with this
 *     field precisely because the IP and phone budgets do not bound the inbox;
 *   • `purpose=forgot_password` IGNORES this field entirely (see `send`) and
 *     mails the address on the ACCOUNT instead, so the only purpose that can
 *     address a stranger is a sign-up the person is standing in front of.
 */
export const OtpSendSchema = z.object({
  phoneNum: z.string().min(8, 'Phone number is required'),
  channel: z.enum(['whatsapp']).optional().default('whatsapp'),
  purpose: z.enum(publicOtpPurposeValues).optional().default('signup'),
  // An empty string is ABSENT, not invalid — the sign-up wizard sends every
  // key and leaves some blank (the `blankIsAbsent` pattern in auth.schema.ts).
  email: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z
      .string()
      .trim()
      .toLowerCase()
      .max(254, 'Enter a valid email address')
      .pipe(z.email('Enter a valid email address'))
      .optional(),
  ),
});

export const OtpVerifySchema = z.object({
  phoneNum: z.string().min(8, 'Phone number is required'),
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
  purpose: z.enum(publicOtpPurposeValues).optional().default('signup'),
});

const SendSchema = OtpSendSchema;
const VerifySchema = OtpVerifySchema;

/**
 * TEN MINUTES — the same as every other code in the product (owner, 21 Sep
 * 2026: "make signup 10 minutes also"). It used to be five, which made sign-up
 * the only flow with its own lifetime: one product, two answers to "how long do
 * I have?", and the shorter one on the step a brand-new user is least practised
 * at.
 *
 * Matches RESET_CODE_TTL_SEC, NEW_CONTACT_CODE_TTL_SEC and
 * PASSWORD_CHANGE_CODE_TTL_SEC in features/account-code.
 */
const EXPIRES_IN_SEC = 10 * 60;
const RESEND_AFTER_SEC = 60;
const MAX_VERIFY_ATTEMPTS = 5;

export class OtpControllerClass {
  constructor(
    private phoneVerificationRepository: PhoneVerificationRepositoryClass,
    private userRepository: UserRepositoryClass,
    /**
     * The fan-out. Injected so a test can read the destinations it was handed
     * without standing up WhatsApp or SMTP; production always gets the real one.
     */
    private deliver: (input: DeliverCodeInput) => Promise<DeliverCodeResult> = deliverCode,
  ) {}

  /**
   * SEND A PUBLIC OTP — sign-up verification, and the legacy PR-app reset.
   *
   * ⚠️ 21 Sep 2026, TWO CHANGES, both worth knowing before reading the code:
   *
   *  1. It no longer calls `sendWhatsAppOtp` itself. It goes through
   *     `deliverCode`, the same fan-out every account-code flow uses, so ONE
   *     code now reaches WhatsApp, SMS and email together (owner: "must be the
   *     same otp"). A side effect worth stating: this endpoint now HONOURS
   *     `OTP_DELIVERY_LOG_ONLY`, which it never did — it always really sent,
   *     even while every other flow was logging. In development with
   *     `OTP_DELIVERY_LOG_ONLY=sms` that means SMS is logged here too, instead
   *     of this one endpoint quietly billing a real provider.
   *  2. WHOSE EMAIL is not the same question for both purposes, and this is the
   *     open-relay boundary:
   *       • `signup` mails the address in the BODY — that is the whole point,
   *         and the person is standing in front of the wizard that typed it.
   *         Bounded by `otpSendPerEmailLimiter` (3/h per recipient) and, below,
   *         refused outright when that address already has an account.
   *       • `forgot_password` IGNORES the body's email and mails the address on
   *         the ACCOUNT. Nothing a caller types can address a stranger, and it
   *         is the more correct answer anyway: a reset code belongs to the
   *         account's own contacts, not to whatever the request asked for.
   */
  async send(req: Request, res: Response) {
    try {
      const parsed = SendSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          message: parsed.error.issues[0]?.message ?? 'Invalid request',
          data: null,
        });
      }

      const phoneNum = normalizePhoneDigits(parsed.data.phoneNum);
      const purpose: PublicOtpPurpose = parsed.data.purpose;
      if (phoneNum.length < 8) {
        return res.status(400).json({
          success: false,
          message: 'Invalid phone number',
          data: null,
        });
      }

      // Who the email half of this code is addressed to. See the note above.
      let email: string | null = null;
      let name: string | null = null;

      if (purpose === 'forgot_password') {
        const user = await this.userRepository.getUserByLoginMethod('phone', phoneNum);
        if (!user || user.status.toLowerCase() !== 'active') {
          // Same shape as a real send so callers cannot probe accounts cheaply,
          // but nothing goes out.
          return res.status(200).json({
            success: true,
            message: 'If that number is registered, a code was sent on WhatsApp.',
            data: { expiresInSec: EXPIRES_IN_SEC, resendAfterSec: RESEND_AFTER_SEC },
          });
        }
        // The ACCOUNT's email, never the body's.
        email = user.email?.trim() || null;
        name = user.username ?? null;
      }

      if (purpose === 'signup') {
        const taken = await this.userRepository.getUserByLoginMethod('phone', phoneNum);
        if (taken) {
          return res.status(409).json({
            success: false,
            message: 'That phone number already has an account',
            data: null,
          });
        }
        email = parsed.data.email ?? null;
        if (email) {
          /*
           * ⚠️ A sign-up code must never land in the inbox of somebody who
           * already HAS an account — that is mail a stranger can aim, and the
           * registration would fail on this address later anyway. The same
           * refusal this endpoint already gives for a taken phone number, so it
           * discloses nothing it did not already disclose.
           */
          const emailTaken = await this.userRepository.getUserByLoginMethod('email', email);
          if (emailTaken) {
            return res.status(409).json({
              success: false,
              message: 'That email already has an account',
              data: null,
            });
          }
        }
      }

      const existing = await this.phoneVerificationRepository.findActivePending(
        phoneNum,
        purpose,
      );
      if (existing) {
        const ageSec = (Date.now() - existing.createdAt.getTime()) / 1000;
        if (ageSec < RESEND_AFTER_SEC) {
          const wait = Math.ceil(RESEND_AFTER_SEC - ageSec);
          return res.status(429).json({
            success: false,
            message: `Wait ${wait}s before requesting another code`,
            data: null,
          });
        }
      }

      const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
      const actor = req.user?.id ?? SYSTEM_ACTOR;
      await this.phoneVerificationRepository.expirePendingForPhone(phoneNum, purpose, actor);

      const destinations = { phone: phoneNum, email };
      const row = await this.phoneVerificationRepository.create({
        phoneNum,
        codeHash: hashOtpCode(code),
        // What it will actually be TRIED on, not a hardcoded 'whatsapp'.
        channel: channelColumn(plannedChannels(destinations)),
        purpose,
        status: 'pending',
        attempts: 0,
        expiresAt: new Date(Date.now() + EXPIRES_IN_SEC * 1000),
        verifiedAt: null,
        waMessageId: null,
        createdBy: actor,
        updatedBy: actor,
      });

      if (!row) {
        return res.status(500).json({
          success: false,
          message: 'Could not create verification',
          data: null,
        });
      }

      const delivery = await this.deliver({
        code,
        purpose,
        purposeLabel: purpose === 'signup' ? 'Register' : 'Password reset',
        validMinutes: EXPIRES_IN_SEC / 60,
        ...destinations,
        name,
      });
      if (!delivery.ok) {
        // A code that reached nobody must not look like a code on its way.
        await this.phoneVerificationRepository.update(row.id, {
          status: 'expired',
          updatedBy: actor,
        });
        return res.status(503).json({
          success: false,
          message: CODE_DELIVERY_FAILED_MESSAGE,
          data: null,
        });
      }
      if (delivery.waMessageId) {
        await this.phoneVerificationRepository.update(row.id, {
          waMessageId: delivery.waMessageId,
          updatedBy: actor,
        });
      }

      return res.status(200).json({
        success: true,
        message: 'OTP sent',
        data: {
          expiresInSec: EXPIRES_IN_SEC,
          resendAfterSec: RESEND_AFTER_SEC,
          // Masked, per channel — so the screen can say exactly where to look.
          sentTo: delivery.sentTo,
        },
      });
    } catch (error) {
      logger.error('[OtpController.send] Error:', safeErrorFields(error));
      return res.status(500).json({
        success: false,
        message: 'Could not send OTP',
        data: null,
      });
    }
  }

  async verify(req: Request, res: Response) {
    try {
      const parsed = VerifySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          message: parsed.error.issues[0]?.message ?? 'Invalid request',
          data: null,
        });
      }

      const phoneNum = normalizePhoneDigits(parsed.data.phoneNum);
      const purpose: PublicOtpPurpose = parsed.data.purpose;
      const row = await this.phoneVerificationRepository.findActivePending(phoneNum, purpose);
      if (!row) {
        return res.status(400).json({
          success: false,
          message: 'No active code for this number — request a new one',
          data: null,
        });
      }

      if (row.attempts >= MAX_VERIFY_ATTEMPTS) {
        await this.phoneVerificationRepository.update(row.id, {
          status: 'expired',
          updatedBy: SYSTEM_ACTOR,
        });
        return res.status(429).json({
          success: false,
          message: 'Too many attempts — request a new code',
          data: null,
        });
      }

      if (!codesMatch(parsed.data.code, row.codeHash)) {
        // Atomic, capped in the same statement. `row.attempts + 1` here was a
        // lost update — concurrent wrong guesses all wrote the same snapshot
        // value and the 5-attempt cap never engaged, on the endpoint whose
        // verified id is the password reset's sole proof. An empty result
        // means another request already spent the budget: answer 429, not
        // another free guess.
        const counted = await this.phoneVerificationRepository.countFailedAttempt(
          row.id,
          MAX_VERIFY_ATTEMPTS,
        );
        if (!counted) {
          await this.phoneVerificationRepository.update(row.id, {
            status: 'expired',
            updatedBy: SYSTEM_ACTOR,
          });
          return res.status(429).json({
            success: false,
            message: 'Too many attempts — request a new code',
            data: null,
          });
        }
        // 400, NOT 401. The web client signs a person out on ANY 401, so a
        // mistyped digit used to end the session of anybody signed in while
        // verifying. A wrong code is a bad request, not a bad credential.
        return res.status(400).json({
          success: false,
          message: 'Invalid code',
          data: null,
        });
      }

      const verified = await this.phoneVerificationRepository.update(row.id, {
        status: 'verified',
        verifiedAt: new Date(),
        updatedBy: SYSTEM_ACTOR,
      });

      if (!verified) {
        return res.status(500).json({
          success: false,
          message: 'Could not store verification',
          data: null,
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Phone verified',
        data: { verificationId: verified.id },
      });
    } catch (error) {
      logger.error('[OtpController.verify] Error:', safeErrorFields(error));
      return res.status(500).json({
        success: false,
        message: 'Could not verify OTP',
        data: null,
      });
    }
  }
}
