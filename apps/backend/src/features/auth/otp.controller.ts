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
  type PhoneVerification,
  type PublicOtpPurpose,
} from './phone-verification.model.js';
import { mayResetPassword } from './account-activation.js';
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
const SEND_FAILED_MESSAGE = 'Could not send OTP';

/**
 * The floor under every LEGACY reset verify (`purpose: forgot_password`). A
 * wrong guess at a real code costs a database write that a stand-in does not
 * (`noteResetStandIn`); without a floor the DELAY would say which one it was.
 * The same 500 ms as `/auth/password/forgot/*` (FORGOT_MIN_RESPONSE_MS).
 */
export const RESET_VERIFY_FLOOR_MS = 500;

/** A remembered reset "code" for a number that got none — see `noteResetStandIn`. */
type ResetStandIn = { createdAt: number; expiresAt: number; attempts: number; open: boolean };
const MAX_RESET_STAND_INS = 20_000;

/**
 * THE FLOOR UNDER EVERY SIGN-UP ANSWER (29 Sep 2026, the owner's item 5: "Even
 * out response time on sign-up codes").
 *
 * A sign-up whose typed email is WITHHELD — it belongs to another account, or
 * the number is a stub being claimed — is sent without the email leg, and
 * `deliverCode` waits only for the legs it runs (`Promise.all`). The SMTP leg is
 * the slowest, so such a request used to answer measurably sooner than the same
 * request naming a free address: the DELAY said "that email has an account",
 * which the body was careful not to. Every sign-up answer after the lookups —
 * 200, 409, 429, 500, 503 — now waits until this long after the request began.
 * The 400s do not: they are decided by the body alone, before any lookup.
 *
 * WHY 2.5 s. It is set from what a send COSTS, not from the providers' timeouts
 * below — those exist to cut a HANG and are far longer than a working send.
 * Measured 29 Sep 2026 from a development machine against the live hosts,
 * sending nothing: Brevo's SMTP relay is ~85 ms a round trip and ~0.55 s to EHLO
 * over TLS, and a nodemailer send adds AUTH, MAIL, RCPT, DATA and the body
 * (~0.45 s more) plus the relay's acceptance — a send of ~1.1-1.5 s. The Graph
 * API edge answers in ~0.2-0.3 s before Meta's own processing. 2.5 s is the
 * slowest leg's usual time with a second to spare. SMS has no provider yet.
 *
 * ⚠️ A FLOOR, NOT A CEILING. A send slower than 2.5 s still shows through — but
 * since 30 Sep 2026 a hung provider no longer waits out its library default
 * (Node: 10 s to connect + 300 s for headers; nodemailer 7: 2 min to connect,
 * 10 min idle). `WHATSAPP_SEND_TIMEOUT_MS` (whatsapp-client.ts) ends the whole
 * Graph call at 10 s. The Brevo transport (brevo.repository.ts) gives up after
 * `BREVO_CONNECTION_TIMEOUT_MS` 10 s to connect, `BREVO_GREETING_TIMEOUT_MS`
 * 10 s more for the greeting, or `BREVO_SOCKET_TIMEOUT_MS` 20 s of silence
 * mid-send, with DNS bounded at `BREVO_DNS_TIMEOUT_MS` 5 s a query (cached
 * 5 min). WORST CASE for a hang is therefore ~20 s on the email leg (10 s on
 * WhatsApp), after which the leg reports `failed` exactly as a refusal does.
 */
export const OTP_SIGNUP_ANSWER_FLOOR_MS = 2_500;

/**
 * THE ONE ANSWER a code request gets, whoever the number or address belongs to
 * (28 Sep 2026 audit: this public route told a stranger which EMAILS have
 * accounts — a sign-up naming one got "That email already has an account").
 *
 * Nothing in it may depend on an account existing: no per-channel `sentTo`
 * (its email entry appeared only when the address was free, and for a reset it
 * showed the ACCOUNT's masked address to whoever typed the phone), and one
 * message per purpose. Neither client reads more than the two numbers.
 */
export function otpSendAnswer(purpose: PublicOtpPurpose) {
  return {
    success: true,
    message:
      purpose === 'forgot_password'
        ? 'If that number is registered, a code was sent on WhatsApp.'
        : 'OTP sent',
    data: { expiresInSec: EXPIRES_IN_SEC, resendAfterSec: RESEND_AFTER_SEC },
  };
}

/** A status and body, decided before it is written — so the sign-up floor can sit between. */
type OtpAnswer = { status: number; body: unknown };

function failure(status: number, message: string): OtpAnswer {
  return { status, body: { success: false, message, data: null } };
}

function write(res: Response, answer: OtpAnswer) {
  return res.status(answer.status).json(answer.body);
}

/** One code to mint and send. `email` is already decided — see `send` for whose. */
type CodeRequest = {
  phoneNum: string;
  purpose: PublicOtpPurpose;
  email: string | null;
  name: string | null;
  actor: string;
};

type Minted =
  | { kind: 'too_soon'; waitSec: number }
  | { kind: 'not_created' }
  | { kind: 'minted'; row: PhoneVerification; code: string };

/** What `issueCode` did; `issued` carries whatever the fan-out reported. */
type Issued =
  | Exclude<Minted, { kind: 'minted' }>
  | { kind: 'issued'; rowId: string; delivery: DeliverCodeResult };

export type OtpControllerOptions = {
  /**
   * The fan-out. Injected so a test can read the destinations it was handed
   * without standing up WhatsApp or SMTP; production always gets the real one.
   */
  deliver?: (input: DeliverCodeInput) => Promise<DeliverCodeResult>;
  /**
   * How work that must not hold the answer is run — a reset's mint and
   * delivery. Production starts it and walks away (`fireAndForget`); a test
   * collects the tasks, looks at the world between the answer and the work,
   * then awaits them. Whatever runs it, the task never rejects (`afterAnswer`).
   */
  runAfterAnswer?: (task: () => Promise<void>) => void;
  /** OTP_SIGNUP_ANSWER_FLOOR_MS unless a test says otherwise. */
  signupAnswerFloorMs?: number;
  /** RESET_VERIFY_FLOOR_MS unless a test says otherwise. */
  resetVerifyFloorMs?: number;
  /** Injectable so tests do not really wait. */
  sleep?: (ms: number) => Promise<void>;
  /** The clock the floor and the resend window read. */
  now?: () => number;
};

function fireAndForget(task: () => Promise<void>): void {
  void task();
}

const realSleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

export class OtpControllerClass {
  private readonly deliver: (input: DeliverCodeInput) => Promise<DeliverCodeResult>;
  private readonly runAfterAnswer: (task: () => Promise<void>) => void;
  private readonly signupAnswerFloorMs: number;
  private readonly resetVerifyFloorMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  /** The mint in progress per purpose and phone — see `oneAtATime`. */
  private readonly minting = new Map<string, Promise<void>>();
  /** Legacy reset numbers that got no code, per typed digits — see `noteResetStandIn`. */
  private readonly resetStandIns = new Map<string, ResetStandIn>();

  constructor(
    private phoneVerificationRepository: PhoneVerificationRepositoryClass,
    private userRepository: UserRepositoryClass,
    options: OtpControllerOptions = {},
  ) {
    this.deliver = options.deliver ?? deliverCode;
    this.runAfterAnswer = options.runAfterAnswer ?? fireAndForget;
    this.signupAnswerFloorMs = options.signupAnswerFloorMs ?? OTP_SIGNUP_ANSWER_FLOOR_MS;
    this.resetVerifyFloorMs = options.resetVerifyFloorMs ?? RESET_VERIFY_FLOOR_MS;
    this.sleep = options.sleep ?? realSleep;
    this.now = options.now ?? Date.now;
  }

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
   *         left off the send — silently — when that address already has an
   *         account.
   *       • `forgot_password` IGNORES the body's email and mails the address on
   *         the ACCOUNT. Nothing a caller types can address a stranger, and it
   *         is the more correct answer anyway: a reset code belongs to the
   *         account's own contacts, not to whatever the request asked for.
   *
   * ⚠️ 29 Sep 2026 — AND WHEN IT ANSWERS (the owner's item 5: "Close the
   * password-reset timing gap. Even out response time on sign-up codes."). A
   * reset is answered straight after its one lookup and its code is sent
   * afterwards (`answerReset`); every sign-up answer waits out
   * OTP_SIGNUP_ANSWER_FLOOR_MS from the moment the request began
   * (`answerSignup`). Only the MOMENT changed — every status and message is the
   * one it was.
   */
  async send(req: Request, res: Response) {
    // The sign-up floor is measured from here.
    const startedAt = this.now();
    try {
      const parsed = SendSchema.safeParse(req.body);
      if (!parsed.success) {
        return write(res, failure(400, parsed.error.issues[0]?.message ?? 'Invalid request'));
      }

      const phoneNum = normalizePhoneDigits(parsed.data.phoneNum);
      const purpose: PublicOtpPurpose = parsed.data.purpose;
      if (phoneNum.length < 8) {
        return write(res, failure(400, 'Invalid phone number'));
      }

      const actor = req.user?.id ?? SYSTEM_ACTOR;
      if (purpose === 'forgot_password') {
        return await this.answerReset(res, phoneNum, actor);
      }
      return await this.answerSignup(res, startedAt, phoneNum, parsed.data.email ?? null, actor);
    } catch (error) {
      logger.error('[OtpController.send] Error:', safeErrorFields(error));
      return write(res, failure(500, SEND_FAILED_MESSAGE));
    }
  }

  /**
   * FORGOT PASSWORD: THE ANSWER COMES FIRST.
   *
   * Every reset outcome already answered the same neutral 200 — but not at the
   * same moment. An unknown number was answered after ONE lookup; a resettable
   * account only after the resend check, two writes, the WhatsApp/SMS/email
   * fan-out and another write, seconds later. The DELAY said which numbers have
   * accounts. Now every number is answered straight after the lookup, and a
   * resettable account's code is minted and sent afterwards, never awaited by
   * the request (`sendResetCode`, handed to `runAfterAnswer`).
   *
   * An account with NO PASSWORD is answered as unknown too: a reset never
   * writes a first password (account-activation.ts). A roster stub is claimed by
   * signing up with its phone, not by "forgetting" a password nobody set.
   */
  private async answerReset(res: Response, phoneNum: string, actor: string) {
    const user = await this.userRepository.getUserByLoginMethod('phone', phoneNum);
    // The ACCOUNT's email, never the body's.
    const account = mayResetPassword(user)
      ? { email: user.email?.trim() || null, name: user.username ?? null }
      : null;
    const answered = write(res, { status: 200, body: otpSendAnswer('forgot_password') });
    if (account) {
      this.afterAnswer('[OtpController.send] reset code', () =>
        this.sendResetCode(phoneNum, account, actor),
      );
    } else {
      this.noteResetStandIn(phoneNum);
    }
    return answered;
  }

  /**
   * A LEGACY RESET "CODE" FOR A NUMBER THAT GOT NONE (security review,
   * 30 Sep 2026).
   *
   * `answerReset` answers every number alike, but only a resettable account's
   * code is minted — so `verify` told them apart afterwards: a guess at a real
   * number's code answered "Invalid code", a guess at any other "No active
   * code for this number". The number is remembered here instead, as a code
   * that exists and that nobody can guess, and `verify` runs a real row's
   * arithmetic on it (`guessResetStandIn`) under the same floor. The resend
   * window is `mint`'s. A real account's code that reached nobody is expired in
   * the database and gets one too, as `/password/forgot`'s `DecoyRequests` does.
   *
   * In memory, per process: a restart forgets them (their numbers then answer
   * "No active code", as a real row does once expired) and two instances each
   * keep their own. Only older app builds reach this flow — current ones use
   * `/auth/password/forgot/*`.
   */
  private noteResetStandIn(phoneNum: string): void {
    const now = this.now();
    const existing = this.resetStandIns.get(phoneNum);
    // Inside the resend window a real number mints nothing new either.
    if (
      existing &&
      existing.open &&
      now < existing.expiresAt &&
      now - existing.createdAt < RESEND_AFTER_SEC * 1000
    ) {
      return;
    }
    this.resetStandIns.delete(phoneNum);
    this.resetStandIns.set(phoneNum, {
      createdAt: now,
      expiresAt: now + EXPIRES_IN_SEC * 1000,
      attempts: 0,
      open: true,
    });
    if (this.resetStandIns.size > MAX_RESET_STAND_INS) {
      // A closed or lapsed stand-in answers what an absent one does.
      for (const [phone, standIn] of this.resetStandIns) {
        if (!standIn.open || now >= standIn.expiresAt) this.resetStandIns.delete(phone);
      }
      for (const phone of this.resetStandIns.keys()) {
        if (this.resetStandIns.size <= MAX_RESET_STAND_INS) break;
        this.resetStandIns.delete(phone);
      }
    }
  }

  /**
   * One guess at a stand-in — `verify`'s arithmetic for a real row: the first
   * MAX_VERIFY_ATTEMPTS wrong guesses are "invalid", the next is "exhausted"
   * (and closes it), and a closed, lapsed or absent one is `null` ("No active
   * code"). A stand-in never accepts a code: there is none to compare.
   */
  private guessResetStandIn(phoneNum: string): 'invalid' | 'exhausted' | null {
    const standIn = this.resetStandIns.get(phoneNum);
    if (!standIn || !standIn.open || this.now() >= standIn.expiresAt) return null;
    if (standIn.attempts >= MAX_VERIFY_ATTEMPTS) {
      standIn.open = false;
      return 'exhausted';
    }
    standIn.attempts += 1;
    return 'invalid';
  }

  /**
   * The reset code, AFTER the answer. Every outcome here used to answer the
   * same neutral 200, which is why none of them may hold the answer now:
   *   · inside the 60 s resend window nothing new is minted — the code already
   *     sent stays the valid one. (A "wait" would have told a real number from
   *     an unknown one, which never has a pending row.)
   *   · a code that reached nobody is expired, so it does not look like a code
   *     on its way, and the failure is logged (`deliverCode` logs each channel).
   * The typed email is never a fallback: a reset code goes only to the
   * account's own contacts — otherwise typing a victim's number and your own
   * inbox would take the account.
   */
  private async sendResetCode(
    phoneNum: string,
    account: { email: string | null; name: string | null },
    actor: string,
  ): Promise<void> {
    const purpose = 'forgot_password';
    const issued = await this.issueCode({ phoneNum, purpose, ...account, actor });
    if (issued.kind === 'too_soon') return;
    if (issued.kind === 'not_created') {
      logger.error('[OtpController.send] reset code row not created — nothing sent', { purpose });
      return;
    }
    if (!issued.delivery.ok) {
      await this.expireCode(issued.rowId, actor);
      // Without a stand-in its early "No active code" would be the difference.
      this.noteResetStandIn(phoneNum);
      logger.warn('[OtpController.send] no channel reached — answered as a send', { purpose });
    }
  }

  /**
   * SIGN-UP: decided in full, then held until the floor (see
   * OTP_SIGNUP_ANSWER_FLOOR_MS). A thrown lookup is padded like everything
   * else: a 500 that came back sooner would be its own tell.
   */
  private async answerSignup(
    res: Response,
    startedAt: number,
    phoneNum: string,
    typedEmail: string | null,
    actor: string,
  ) {
    let answer: OtpAnswer;
    try {
      answer = await this.decideSignup(phoneNum, typedEmail, actor);
    } catch (error) {
      logger.error('[OtpController.send] Error:', safeErrorFields(error));
      answer = failure(500, SEND_FAILED_MESSAGE);
    }
    await this.padFrom(startedAt);
    return write(res, answer);
  }

  /**
   * The sign-up answer. Its delivery stays INSIDE the request, unlike a reset's:
   * a free number with no address withheld owes the person at the wizard the
   * honest 503 when nothing reached them — which is why this answer is padded
   * rather than sent first.
   */
  private async decideSignup(
    phoneNum: string,
    typedEmail: string | null,
    actor: string,
  ): Promise<OtpAnswer> {
    const purpose = 'signup';
    const taken = await this.userRepository.getUserByLoginMethod('phone', phoneNum);
    /*
     * A NUMBER THAT ALREADY HAS AN ACCOUNT GETS ITS CODE TOO — ON THE PHONE
     * ALONE (owner, 29 Sep 2026: "General message, both").
     *
     * An activated account's number used to be answered 409 "That phone
     * number already has an account", to anybody who typed it: a public
     * lookup of which phones are on the platform. It is now treated the way a
     * never-activated roster stub always was (Fix First, 28 Sep 2026): the
     * code goes to the PHONE ALONE and the answer is the one a free number
     * gets. Only whoever holds the phone can read that code, and `registerUser`
     * then either claims the stub or answers SIGNUP_PHONE_HAS_ACCOUNT — to
     * somebody who has just proved the number is theirs.
     *
     * Why never the typed email as well: a receipt verified from an inbox the
     * typist chose would "prove" a phone they do not hold — enough to take
     * over an agency's stub, or to be told a stranger's number has an account.
     * `registerUser` names the phone, and claims a stub, only on a receipt
     * whose `channel` is the phone alone, so this is enforced at both ends.
     */
    let email = typedEmail;
    if (email) {
      /*
       * ⚠️ A sign-up code must never land in the inbox of somebody who
       * already HAS an account — that is mail a stranger can aim. The stub
       * being claimed is not "somebody else": its own address is the one
       * the claim will replace.
       *
       * ⚠️ AND THE CALLER IS NOT TOLD (28 Sep 2026 audit). This used to
       * answer 409 "That email already has an account", which made this
       * public, unauthenticated route an oracle for every address on the
       * platform. The address is now simply left off the send and the
       * answer is the one a free address gets; the code still reaches the
       * phone being verified. Registration refuses the address at the end
       * with the one general sentence (SIGNUP_NOT_COMPLETED), which names no
       * field.
       */
      const emailTaken = await this.userRepository.getUserByLoginMethod('email', email);
      if (emailTaken && emailTaken.id !== taken?.id) email = null;
    }
    // A number with an account — a stub being claimed or an activated one —
    // gets its code on the phone alone, whatever was typed (see above).
    if (taken) email = null;
    // A sign-up address the caller typed and the server deliberately did NOT
    // mail (it belongs to another account, or the number already has one).
    // What a failed send may then say depends on it — see below.
    const typedEmailWithheld = Boolean(typedEmail) && email === null;

    const issued = await this.issueCode({ phoneNum, purpose, email, name: null, actor });
    if (issued.kind === 'too_soon') {
      return failure(429, `Wait ${issued.waitSec}s before requesting another code`);
    }
    if (issued.kind === 'not_created') {
      return failure(500, 'Could not create verification');
    }
    if (issued.delivery.ok) {
      // No `sentTo`: see `otpSendAnswer` — its email half is exactly the fact
      // this route must not reveal.
      return { status: 200, body: otpSendAnswer(purpose) };
    }
    /*
     * WHAT A CODE THAT REACHED NOBODY MAY SAY (29 Sep 2026 follow-up: "503
     * when WhatsApp and SMS both fail, with the email dropped").
     *
     * Every address this route MAY mail was already on the send — the email
     * goes out beside WhatsApp and SMS, not after them — so there is no
     * further channel to fall back to. The addresses it drops are dropped on
     * purpose, and none can be the fallback: a sign-up address held by
     * another account (never mail an account's inbox a stranger aimed), the
     * address typed while claiming a stub (the claim must prove the PHONE),
     * and any address typed on a reset (see `sendResetCode`).
     *
     * What was wrong is the ANSWER. When the phone channels failed, a 503
     * appeared exactly where an address had been withheld, while the same
     * request naming a free address — mailed — got "OTP sent"; and a reset
     * for a registered number answered 503 where an unknown number is always
     * told a code went. Both are the account oracle this route was closed
     * against the day before, re-opened by a provider outage or a number the
     * prober chose to be undeliverable.
     *
     * So the answer depends only on what the caller could see anyway:
     *   · forgot_password — the neutral answer, always, and before any of
     *     this runs (`answerReset`);
     *   · signup with a typed address withheld — the answer the same request
     *     with a free address gets, and the row stays pending so the 60 s
     *     resend wait answers alike too;
     *   · anything else — nothing about any account is at stake, so the
     *     honest 503, and the row expired.
     * The failure is still logged in full (`deliverCode`).
     */
    if (typedEmailWithheld) {
      logger.warn('[OtpController.send] no channel reached — answered as a send', { purpose });
      return { status: 200, body: otpSendAnswer(purpose) };
    }
    // A code that reached nobody must not look like a code on its way.
    await this.expireCode(issued.rowId, actor);
    return failure(503, CODE_DELIVERY_FAILED_MESSAGE);
  }

  /**
   * Mint a code — unless one went out inside the resend window — and hand it
   * to the fan-out. WhatsApp's message id is recorded on the row when the code
   * reached anyone.
   */
  private async issueCode(request: CodeRequest): Promise<Issued> {
    const minted = await this.mint(request);
    if (minted.kind !== 'minted') return minted;
    const delivery = await this.deliver({
      code: minted.code,
      purpose: request.purpose,
      purposeLabel: request.purpose === 'signup' ? 'Register' : 'Password reset',
      validMinutes: EXPIRES_IN_SEC / 60,
      phone: request.phoneNum,
      email: request.email,
      name: request.name,
    });
    if (delivery.ok && delivery.waMessageId) {
      await this.phoneVerificationRepository.update(minted.row.id, {
        waMessageId: delivery.waMessageId,
        updatedBy: request.actor,
      });
    }
    return { kind: 'issued', rowId: minted.row.id, delivery };
  }

  /** A fresh pending row that supersedes any older one — or why there is none. */
  private mint(request: CodeRequest): Promise<Minted> {
    const { phoneNum, purpose, email, actor } = request;
    return this.oneAtATime(`${purpose}:${phoneNum}`, async (): Promise<Minted> => {
      const existing = await this.phoneVerificationRepository.findActivePending(phoneNum, purpose);
      if (existing) {
        const ageSec = (this.now() - existing.createdAt.getTime()) / 1000;
        if (ageSec < RESEND_AFTER_SEC) {
          return { kind: 'too_soon', waitSec: Math.ceil(RESEND_AFTER_SEC - ageSec) };
        }
      }

      const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
      await this.phoneVerificationRepository.expirePendingForPhone(phoneNum, purpose, actor);
      const row = await this.phoneVerificationRepository.create({
        phoneNum,
        codeHash: hashOtpCode(code),
        // What it will actually be TRIED on, not a hardcoded 'whatsapp'.
        channel: channelColumn(plannedChannels({ phone: phoneNum, email })),
        purpose,
        status: 'pending',
        attempts: 0,
        expiresAt: new Date(this.now() + EXPIRES_IN_SEC * 1000),
        verifiedAt: null,
        waMessageId: null,
        createdBy: actor,
        updatedBy: actor,
      });
      return row ? { kind: 'minted', row, code } : { kind: 'not_created' };
    });
  }

  /**
   * ONE MINT AT A TIME PER PURPOSE AND NUMBER. A reset is answered before its
   * code exists, so a second request — a double tap, an impatient retry — can
   * arrive while the first one's row is still being written, where the resend
   * window cannot see it yet, and send a second code. Chaining the mints for
   * one purpose and phone makes the second look only after the first has
   * written its row, so "a request inside the window sends no new code" holds
   * for it too. Only the mint is chained, never the delivery: a slow provider
   * does not queue the next request behind it. Per process — two instances race
   * as two simultaneous requests always could.
   */
  private async oneAtATime<T>(key: string, work: () => Promise<T>): Promise<T> {
    const previous = this.minting.get(key) ?? Promise.resolve();
    const current = previous.then(work);
    const settled = current.then(
      () => undefined,
      () => undefined,
    );
    this.minting.set(key, settled);
    try {
      return await current;
    } finally {
      if (this.minting.get(key) === settled) this.minting.delete(key);
    }
  }

  private async expireCode(rowId: string, actor: string): Promise<void> {
    await this.phoneVerificationRepository.update(rowId, { status: 'expired', updatedBy: actor });
  }

  /**
   * Hand `work` to `runAfterAnswer`, wrapped so that whatever runs it, an error
   * is logged — scrubbed by `safeErrorFields` — and never thrown: the answer is
   * already out, and the log is all that is left to tell.
   */
  private afterAnswer(label: string, work: () => Promise<void>): void {
    this.runAfterAnswer(async () => {
      try {
        await work();
      } catch (error) {
        logger.error(`${label} failed after the answer`, safeErrorFields(error));
      }
    });
  }

  /** Wait out what is left of the sign-up floor, measured from `startedAt`. */
  private async padFrom(startedAt: number): Promise<void> {
    const remaining = this.signupAnswerFloorMs - (this.now() - startedAt);
    if (remaining > 0) await this.sleep(remaining);
  }

  async verify(req: Request, res: Response) {
    // A legacy reset's floor is measured from here.
    const startedAt = this.now();
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
      /*
       * Every refusal after the row lookup. A LEGACY RESET waits out
       * RESET_VERIFY_FLOOR_MS first: its stand-ins make no database write, a
       * real row's wrong guess does, and the delay must not say which it was.
       * A sign-up has no stand-ins — every number gets a real code since
       * 30 Sep — so its answers are not held.
       */
      const refuse = async (status: 400 | 429, message: string) => {
        if (purpose === 'forgot_password') {
          const remaining = this.resetVerifyFloorMs - (this.now() - startedAt);
          if (remaining > 0) await this.sleep(remaining);
        }
        return res.status(status).json({ success: false, message, data: null });
      };

      const row = await this.phoneVerificationRepository.findActivePending(phoneNum, purpose);
      if (!row) {
        // A legacy reset for a number that got no code answers as if it had one.
        const standIn = purpose === 'forgot_password' ? this.guessResetStandIn(phoneNum) : null;
        if (standIn === 'invalid') return refuse(400, 'Invalid code');
        if (standIn === 'exhausted') return refuse(429, 'Too many attempts — request a new code');
        return refuse(400, 'No active code for this number — request a new one');
      }

      if (row.attempts >= MAX_VERIFY_ATTEMPTS) {
        await this.phoneVerificationRepository.update(row.id, {
          status: 'expired',
          updatedBy: SYSTEM_ACTOR,
        });
        return refuse(429, 'Too many attempts — request a new code');
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
          return refuse(429, 'Too many attempts — request a new code');
        }
        // 400, NOT 401. The web client signs a person out on ANY 401, so a
        // mistyped digit used to end the session of anybody signed in while
        // verifying. A wrong code is a bad request, not a bad credential.
        return refuse(400, 'Invalid code');
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
