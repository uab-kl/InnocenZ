import crypto from 'node:crypto';
import { Request, Response } from 'express';
import { z } from 'zod';
import { logger } from '@/util/logger.js';
import {
  codesMatch,
  hashOtpCode,
  normalizePhoneDigits,
  PhoneVerificationRepositoryClass,
} from './phone-verification.repository.js';
import {
  phoneVerificationPurposeValues,
  type PhoneVerificationPurpose,
} from './phone-verification.model.js';
import { sendWhatsAppOtp, whatsappSendConfigured } from '@/features/whatsapp/whatsapp-client.js';
import { UserRepositoryClass } from '@/features/user/user.repository.js';

const SendSchema = z.object({
  phoneNum: z.string().min(8, 'Phone number is required'),
  channel: z.enum(['whatsapp']).optional().default('whatsapp'),
  purpose: z.enum(phoneVerificationPurposeValues).optional().default('signup'),
});

const VerifySchema = z.object({
  phoneNum: z.string().min(8, 'Phone number is required'),
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
  purpose: z.enum(phoneVerificationPurposeValues).optional().default('signup'),
});

const EXPIRES_IN_SEC = 5 * 60;
const RESEND_AFTER_SEC = 60;
const MAX_VERIFY_ATTEMPTS = 5;

export class OtpControllerClass {
  constructor(
    private phoneVerificationRepository: PhoneVerificationRepositoryClass,
    private userRepository: UserRepositoryClass,
  ) {}

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
      const purpose: PhoneVerificationPurpose = parsed.data.purpose;
      if (phoneNum.length < 8) {
        return res.status(400).json({
          success: false,
          message: 'Invalid phone number',
          data: null,
        });
      }

      if (purpose === 'forgot_password') {
        const user = await this.userRepository.getUserByLoginMethod('phone', phoneNum);
        if (!user || user.status.toLowerCase() !== 'active') {
          // Same shape as a real send so callers cannot probe accounts cheaply,
          // but no WhatsApp message goes out.
          return res.status(200).json({
            success: true,
            message: 'If that number is registered, a code was sent on WhatsApp.',
            data: { expiresInSec: EXPIRES_IN_SEC, resendAfterSec: RESEND_AFTER_SEC },
          });
        }
      }

      if (purpose === 'change_phone') {
        const actor = req.user;
        if (!actor) {
          return res.status(401).json({
            success: false,
            message: 'Sign in required to change phone number',
            data: null,
          });
        }
        const currentDigits = normalizePhoneDigits(actor.phoneNum ?? '');
        if (currentDigits && currentDigits === phoneNum) {
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
      const actor = req.user?.id ?? phoneNum;
      await this.phoneVerificationRepository.expirePendingForPhone(phoneNum, purpose, actor);

      const row = await this.phoneVerificationRepository.create({
        phoneNum,
        codeHash: hashOtpCode(code),
        channel: 'whatsapp',
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

      if (!whatsappSendConfigured()) {
        if (process.env.NODE_ENV === 'production') {
          await this.phoneVerificationRepository.update(row.id, {
            status: 'expired',
            updatedBy: actor,
          });
          return res.status(503).json({
            success: false,
            message: 'WhatsApp verification is not configured',
            data: null,
          });
        }
        logger.warn('[OtpController.send] WhatsApp not configured — OTP logged for local dev only', {
          phoneNum,
          purpose,
          code,
        });
      } else {
        const sent = await sendWhatsAppOtp(phoneNum, code, purpose);
        if (!sent.ok) {
          await this.phoneVerificationRepository.update(row.id, {
            status: 'expired',
            updatedBy: actor,
          });
          return res.status(502).json({
            success: false,
            message: sent.error,
            data: null,
          });
        }
        if (sent.messageId) {
          await this.phoneVerificationRepository.update(row.id, {
            waMessageId: sent.messageId,
            updatedBy: actor,
          });
        }
      }

      return res.status(200).json({
        success: true,
        message: 'OTP sent',
        data: { expiresInSec: EXPIRES_IN_SEC, resendAfterSec: RESEND_AFTER_SEC },
      });
    } catch (error) {
      logger.error('[OtpController.send] Error:', error);
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
      const purpose: PhoneVerificationPurpose = parsed.data.purpose;
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
          updatedBy: phoneNum,
        });
        return res.status(429).json({
          success: false,
          message: 'Too many attempts — request a new code',
          data: null,
        });
      }

      if (!codesMatch(parsed.data.code, row.codeHash)) {
        await this.phoneVerificationRepository.update(row.id, {
          attempts: row.attempts + 1,
          updatedBy: phoneNum,
        });
        return res.status(401).json({
          success: false,
          message: 'Invalid code',
          data: null,
        });
      }

      const verified = await this.phoneVerificationRepository.update(row.id, {
        status: 'verified',
        verifiedAt: new Date(),
        updatedBy: phoneNum,
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
      logger.error('[OtpController.verify] Error:', error);
      return res.status(500).json({
        success: false,
        message: 'Could not verify OTP',
        data: null,
      });
    }
  }
}
