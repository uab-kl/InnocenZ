import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { boundCodeMatches, generateAccountCode, hashBoundCode } from '@/features/account-code/code.js';
import { deliverCode, type DeliverCodeResult } from '@/features/account-code/delivery.js';
import { logger } from '@/util/logger.js';
import {
  CODE_INVALID,
  CODE_TOO_MANY_ATTEMPTS,
  SIGNUP_EMAIL_CODE_EXPIRED,
  SIGNUP_EMAIL_CODE_REQUIRED,
  SIGNUP_EMAIL_CODE_SEND_FAILED,
  SIGNUP_EMAIL_CODE_SENT,
} from './account-answers.js';
import type { PhoneVerificationRepositoryClass } from './phone-verification.repository.js';
import { safeErrorFields } from './query-error-redaction.js';

/**
 * PROOF BEFORE A VENUE, AGENCY OR TEAM-MEMBER ACCOUNT IS CREATED (owner,
 * 30 Sep 2026 — "lets go with your pick for number 2").
 *
 * `/auth/register` (outlet / agency) and `/auth/register-member` created an
 * account for any fully valid form, so "created" against "We couldn't complete
 * sign-up" told a stranger whether an email, phone or ID number was on the
 * platform — and left a real account in somebody else's name each time the
 * answer was "free". A PR sign-up already had to prove its phone.
 *
 * Now the sign-up must carry a code emailed to the address it names:
 *   · `send` mails a code to WHATEVER address is typed and answers the same
 *     sentence for every one — it looks no account up at all, so neither the
 *     words nor the timing depend on one. Only whoever reads that inbox can use
 *     the code.
 *   · `redeem` is called by the two sign-up routes after their lookup-free
 *     checks and BEFORE any account lookup. It spends the code on success, so
 *     each try — whatever it is answered — costs the typist a fresh code (3 an
 *     hour per address, `otpSendPerEmailLimiter`).
 *
 * What proving the email buys: nobody can test or take an address they cannot
 * read, and a sign-up whose address IS taken may now be told so by name
 * (SIGNUP_EMAIL_HAS_ACCOUNT).
 *
 * ⚠️ WHAT IT DOES NOT BUY — the owner chose this knowingly (option (b) of three,
 * 30 Sep 2026). The code proves the INBOX, not the phone or the ID number on the
 * same form. Somebody who proves their own inbox can still type a stranger's
 * phone or IC: a taken one answers the general SIGNUP_NOT_COMPLETED, a free one
 * CREATES the account — holding that stranger's phone and IC. What changed is
 * the price: one fresh code from a real inbox per try (3 an hour per mailbox).
 * Closing it is a phone code too (option (c)) and/or IC clashes sent to the
 * admin's approval instead of refused on the form.
 *
 * Rows live on `main.phone_verification` with purpose `signup_email` (a
 * varchar value — no migration). `phone_num` is NOT NULL and there is no phone
 * here, so it carries `signupEmailAnchor(email)`: a hash, never the address.
 */

export const SIGNUP_EMAIL_CODE_TTL_SEC = 10 * 60;
export const SIGNUP_EMAIL_CODE_RESEND_SEC = 60;
export const SIGNUP_EMAIL_CODE_MAX_ATTEMPTS = 5;

const PURPOSE = 'signup_email' as const;
/** `created_by` / `updated_by` of a code nobody signed in to ask for. */
const SENDER = 'signup-email-code';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIX_DIGITS = /^\d{6}$/;

const SendSchema = z.object({
  email: z.string().trim().max(254).email('Enter a valid email address'),
});

/** How every sign-up writer compares addresses: trimmed and lower-case. */
export function normaliseSignupEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * The `phone_num` of an email code: which inbox it is for, without storing the
 * inbox. Letters make it a value `toWhatsAppDigits` refuses, so it can never
 * become a delivery target, and it never equals a real number's digits.
 */
export function signupEmailAnchor(email: string): string {
  const digest = crypto.createHash('sha256').update(normaliseSignupEmail(email), 'utf8').digest('hex');
  return `email:${digest}`;
}

export type SignupEmailProof = { ok: true } | { ok: false; status: 400 | 429; message: string };

/** What the two sign-up routes need: spend a code for the address they were given. */
export type SignupEmailCodeRedeemer = {
  redeem(input: {
    codeId?: string | null;
    code?: string | null;
    email: string;
    actor: string;
  }): Promise<SignupEmailProof>;
};

type CodeStore = Pick<
  PhoneVerificationRepositoryClass,
  'create' | 'findActivePending' | 'getById' | 'countFailedAttempt' | 'transition'
>;

export type SignupEmailCodeDeps = {
  codes: CodeStore;
  /** `deliverCode` with the email channel only; a test brings its own. */
  deliver?: (input: { email: string; code: string; validMinutes: number }) => Promise<Pick<DeliverCodeResult, 'ok'>>;
  now?: () => number;
  generateCode?: () => string;
};

function refuse(status: 400 | 429, message: string): SignupEmailProof {
  return { ok: false, status, message };
}

function mailCode(input: { email: string; code: string; validMinutes: number }) {
  return deliverCode({
    email: input.email,
    code: input.code,
    purpose: PURPOSE,
    purposeLabel: 'finish signing up',
    validMinutes: input.validMinutes,
  });
}

export class SignupEmailCodesClass implements SignupEmailCodeRedeemer {
  private readonly codes: CodeStore;
  private readonly deliver: NonNullable<SignupEmailCodeDeps['deliver']>;
  private readonly now: () => number;
  private readonly generateCode: () => string;

  constructor(deps: SignupEmailCodeDeps) {
    this.codes = deps.codes;
    this.deliver = deps.deliver ?? mailCode;
    this.now = deps.now ?? Date.now;
    this.generateCode = deps.generateCode ?? generateAccountCode;
  }

  /** POST /auth/signup-email-code — `{ email }`. */
  async send(req: Request, res: Response) {
    const parsed = SendSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res
        .status(400)
        .json({ success: false, message: 'Enter a valid email address', data: null });
    }
    const email = normaliseSignupEmail(parsed.data.email);
    const anchor = signupEmailAnchor(email);
    const sendFailed = () =>
      res.status(503).json({ success: false, message: SIGNUP_EMAIL_CODE_SEND_FAILED, data: null });
    try {
      /*
       * A resend inside the window is refused. Measured on this address's own
       * codes, so it says nothing about any account.
       *
       * ⚠️ A resend does NOT expire the earlier code (security review, 30 Sep
       * 2026). Anybody may request a code for any address, so "the newest code
       * kills the last one" let a stranger re-send every minute and void the
       * code the real owner was typing. Each code keeps its own ten minutes and
       * its own five tries; the per-mailbox budget bounds how many exist.
       */
      const open = await this.codes.findActivePending(anchor, PURPOSE);
      if (open) {
        const waitSec = Math.ceil(
          (open.createdAt.getTime() + SIGNUP_EMAIL_CODE_RESEND_SEC * 1000 - this.now()) / 1000,
        );
        if (waitSec > 0) {
          return res.status(429).json({
            success: false,
            message: `Wait ${waitSec}s before requesting another code`,
            data: null,
          });
        }
      }

      const code = this.generateCode();
      const row = await this.codes.create({
        phoneNum: anchor,
        codeHash: hashBoundCode(code, PURPOSE, email),
        channel: 'email',
        purpose: PURPOSE,
        status: 'pending',
        attempts: 0,
        expiresAt: new Date(this.now() + SIGNUP_EMAIL_CODE_TTL_SEC * 1000),
        createdBy: SENDER,
        updatedBy: SENDER,
      });
      if (!row) return sendFailed();

      const delivery = await this.deliver({
        email,
        code,
        validMinutes: SIGNUP_EMAIL_CODE_TTL_SEC / 60,
      });
      if (!delivery.ok) {
        // A code that reached nobody must not look like one on its way.
        await this.codes.transition(row.id, 'pending', { status: 'expired', updatedBy: SENDER });
        return sendFailed();
      }
      return res.status(200).json({
        success: true,
        message: SIGNUP_EMAIL_CODE_SENT,
        data: {
          codeId: row.id,
          expiresInSec: SIGNUP_EMAIL_CODE_TTL_SEC,
          resendAfterSec: SIGNUP_EMAIL_CODE_RESEND_SEC,
        },
      });
    } catch (error) {
      logger.error('[SignupEmailCodes.send] Error:', safeErrorFields(error));
      return sendFailed();
    }
  }

  /**
   * Spend the code `codeId` for `email`. Every try counts against the row (5,
   * then it is dead); a right one is marked consumed in one conditional
   * statement, so two sign-ups sent together cannot both use it.
   */
  async redeem(input: {
    codeId?: string | null;
    code?: string | null;
    email: string;
    actor: string;
  }): Promise<SignupEmailProof> {
    const codeId = input.codeId?.trim() ?? '';
    const code = input.code?.trim() ?? '';
    if (!codeId || !code) return refuse(400, SIGNUP_EMAIL_CODE_REQUIRED);
    if (!UUID.test(codeId)) return refuse(400, SIGNUP_EMAIL_CODE_EXPIRED);

    const row = await this.codes.getById(codeId);
    if (
      !row ||
      row.purpose !== PURPOSE ||
      row.status !== 'pending' ||
      row.expiresAt.getTime() <= this.now()
    ) {
      return refuse(400, SIGNUP_EMAIL_CODE_EXPIRED);
    }

    /*
     * EVERY TRY IS COUNTED BEFORE IT IS COMPARED (security review, 30 Sep 2026).
     * Comparing first and counting only a miss let requests sent together all
     * read "under the cap", compare, and only then count — sixty at once had
     * sixty guesses at a five-guess code. The increment is conditional
     * (`attempts < MAX`) and atomic, so however many are in flight, at most MAX
     * ever reach the comparison; the rest are refused without one.
     */
    const counted = await this.codes.countFailedAttempt(row.id, SIGNUP_EMAIL_CODE_MAX_ATTEMPTS);
    if (!counted) {
      await this.codes.transition(row.id, 'pending', { status: 'expired', updatedBy: input.actor });
      return refuse(429, CODE_TOO_MANY_ATTEMPTS);
    }

    // Bound to the address: a code sent to one inbox is wrong for any other.
    const email = normaliseSignupEmail(input.email);
    if (!SIX_DIGITS.test(code) || !boundCodeMatches(row.codeHash, code, PURPOSE, email)) {
      if (counted.attempts >= SIGNUP_EMAIL_CODE_MAX_ATTEMPTS) {
        await this.codes.transition(row.id, 'pending', { status: 'expired', updatedBy: input.actor });
        return refuse(429, CODE_TOO_MANY_ATTEMPTS);
      }
      return refuse(400, CODE_INVALID);
    }

    const spent = await this.codes.transition(row.id, 'pending', {
      status: 'consumed',
      verifiedAt: new Date(this.now()),
      updatedBy: input.actor,
    });
    return spent ? { ok: true } : refuse(400, SIGNUP_EMAIL_CODE_EXPIRED);
  }
}
