import { env } from '@/env.js';
import { logger } from '@/util/logger.js';
import type { PhoneVerificationPurpose } from '@/features/auth/phone-verification.model.js';
import {
  sendWhatsAppOtp,
  whatsappSendConfigured,
  type WhatsAppSendResult,
} from '@/features/whatsapp/whatsapp-client.js';
import { sendSms, type SmsSendResult } from '@/features/sms/sms.js';
import { smsCodeText } from '@/features/sms/sms-text.js';
import { emailConfigured, sendAccountCodeEmail } from '@/features/mailing/mailing.repository.js';
import { maskContactText, safeErrorFields } from '@/features/auth/query-error-redaction.js';
import { maskEmail, maskPhone } from './masks.js';
import { toWhatsAppDigits } from './phone.js';

/**
 * ONE CODE, SEVERAL CHANNELS AT ONCE.
 *
 * The owner's instruction: "send the otp via whatapps, email and the sms". A
 * code goes to every usable destination in parallel, and the answer reports
 * each channel separately, so the screen can say exactly where to look:
 *
 *   { channel: 'whatsapp' | 'sms' | 'email', to: <masked>, status }
 *
 *   sent     the provider accepted it
 *   logged   NOT sent — written to the backend log (development only)
 *   skipped  NOT sent — the channel is not configured (production)
 *   failed   the provider refused it, or it could not be reached
 *
 * `ok` is the request's verdict. In PRODUCTION at least one channel must be
 * `sent`; otherwise the caller expires the row and answers 503 — a code that
 * reached nobody must not look like a code on its way. Outside production a
 * `logged` channel is enough, because the log is how a developer reads it.
 *
 * `OTP_DELIVERY_LOG_ONLY` holds channels BACK, one at a time: `sms` logs the
 * SMS while WhatsApp and email really send, `true` holds all three, unset holds
 * none. Honoured only when NODE_ENV !== 'production', so a production process
 * ignores it and real delivery can never be switched off for a customer.
 *
 * ⚠️ The code itself is written to the log ONLY on a non-production `logged`
 * path. Every production log line here carries the channel and purpose, never
 * the code.
 */

export type DeliveryChannel = 'whatsapp' | 'sms' | 'email';
export type DeliveryStatus = 'sent' | 'logged' | 'skipped' | 'failed';
export type ChannelDelivery = { channel: DeliveryChannel; to: string; status: DeliveryStatus };

export const CODE_DELIVERY_FAILED_MESSAGE = 'Could not send the code — try again later';

export type DeliverCodeInput = {
  code: string;
  purpose: PhoneVerificationPurpose;
  /** Human purpose for the message ("Password reset", "Change email"). */
  purposeLabel: string;
  validMinutes: number;
  /** WhatsApp + SMS go here when it normalises to a real number. */
  phone?: string | null;
  /** Email goes here when present. */
  email?: string | null;
  /** Greeting name for the email. */
  name?: string | null;
};

export type DeliverCodeResult = {
  sentTo: ChannelDelivery[];
  ok: boolean;
  /** WhatsApp message id when that channel was sent, for `wa_message_id`. */
  waMessageId: string | null;
};

/** The transports, injectable so the orchestrator's rules can be tested alone. */
export type CodeSenders = {
  whatsappConfigured(): boolean;
  sendWhatsApp(
    digits: string,
    code: string,
    purpose: PhoneVerificationPurpose,
    purposeLabel: string,
  ): Promise<WhatsAppSendResult>;
  sendSms(input: { to: string; text: string; purpose?: string }): Promise<SmsSendResult>;
  emailConfigured(): boolean;
  sendEmail(input: {
    recipientEmail: string;
    name?: string | null;
    code: string;
    purposeLabel: string;
    validMinutes: number;
  }): Promise<unknown>;
};

export const defaultCodeSenders: CodeSenders = {
  whatsappConfigured: whatsappSendConfigured,
  sendWhatsApp: (digits, code, purpose, purposeLabel) =>
    sendWhatsAppOtp(digits, code, purpose, purposeLabel),
  sendSms,
  emailConfigured,
  sendEmail: sendAccountCodeEmail,
};

export function isProduction(): boolean {
  return env.NODE_ENV === 'production';
}

const ALL_CHANNELS: readonly DeliveryChannel[] = ['whatsapp', 'sms', 'email'];

function isChannel(value: string): value is DeliveryChannel {
  return (ALL_CHANNELS as readonly string[]).includes(value);
}

/**
 * WHICH CHANNELS ARE HELD BACK — `OTP_DELIVERY_LOG_ONLY`, now per channel.
 *
 *   unset / false    nothing is held back; every configured channel really sends
 *   true             every channel is logged instead (what it used to mean)
 *   sms              only SMS is logged; WhatsApp and email really send
 *   sms,email        a comma list, in any order
 *
 * Per channel since 21 Sep 2026, because all-or-nothing forced a choice nobody
 * wanted: either no real code at all, or a real SMS through a provider that
 * does not exist yet. An unrecognised word is IGNORED rather than read as
 * "hold everything" — a typo in this setting must never silently stop codes
 * from reaching people.
 *
 * ⚠️ Ignored entirely in production, so it can never turn real delivery off for
 * a live customer.
 */
export function logOnlyChannels(): ReadonlySet<DeliveryChannel> {
  if (isProduction()) return new Set();
  const raw = env.OTP_DELIVERY_LOG_ONLY?.trim().toLowerCase();
  if (!raw || raw === 'false') return new Set();
  if (raw === 'true') return new Set(ALL_CHANNELS);
  return new Set(
    raw
      .split(',')
      .map((part) => part.trim())
      .filter(isChannel),
  );
}

/** With a channel: is THAT one held back. Without: is anything held back at all. */
export function deliveryLogOnly(channel?: DeliveryChannel): boolean {
  const held = logOnlyChannels();
  return channel ? held.has(channel) : held.size > 0;
}

/**
 * Which channels a set of destinations WILL be tried on, in the fixed order
 * whatsapp, sms, email. Written to `phone_verification.channel` before sending.
 */
export function plannedChannels(input: {
  phone?: string | null;
  email?: string | null;
}): DeliveryChannel[] {
  const channels: DeliveryChannel[] = [];
  if (toWhatsAppDigits(input.phone)) channels.push('whatsapp', 'sms');
  if (input.email?.trim()) channels.push('email');
  return channels;
}

/** `channel` column value: comma list, fits varchar(20) ('whatsapp,sms,email' = 18). */
export function channelColumn(channels: DeliveryChannel[]): string {
  return channels.join(',').slice(0, 20) || 'none';
}

function devLogCode(
  channel: DeliveryChannel,
  to: string,
  input: DeliverCodeInput,
  why: string,
): void {
  // Non-production only — callers guarantee it. The CODE is the point of this
  // line; the destination is not, so it is masked like everywhere else — the
  // country code and last four digits (or first letter and domain) are enough
  // to tell two developers' test accounts apart.
  logger.warn(`[account-code] ${why} — code logged for local dev only`, {
    channel,
    to: channel === 'email' ? maskEmail(to) : maskPhone(to),
    purpose: input.purpose,
    code: input.code,
  });
}

export async function deliverCode(
  input: DeliverCodeInput,
  senders: CodeSenders = defaultCodeSenders,
): Promise<DeliverCodeResult> {
  const production = isProduction();
  const heldBack = logOnlyChannels();
  const digits = toWhatsAppDigits(input.phone);
  const email = input.email?.trim().toLowerCase() || null;
  let waMessageId: string | null = null;

  const tasks: Array<Promise<ChannelDelivery>> = [];

  if (digits) {
    const to = maskPhone(digits);

    tasks.push(
      (async (): Promise<ChannelDelivery> => {
        const channel = 'whatsapp' as const;
        if (heldBack.has(channel)) {
          devLogCode(channel, digits, input, 'OTP_DELIVERY_LOG_ONLY');
          return { channel, to, status: 'logged' };
        }
        if (!senders.whatsappConfigured()) {
          if (production) {
            logger.warn('[account-code] WhatsApp not configured — channel skipped', {
              purpose: input.purpose,
            });
            return { channel, to, status: 'skipped' };
          }
          devLogCode(channel, digits, input, 'WhatsApp not configured');
          return { channel, to, status: 'logged' };
        }
        try {
          const sent = await senders.sendWhatsApp(digits, input.code, input.purpose, input.purposeLabel);
          if (sent.ok) {
            waMessageId = sent.messageId || null;
            return { channel, to, status: 'sent' };
          }
          logger.warn('[account-code] WhatsApp send failed', {
            purpose: input.purpose,
            // A provider's refusal can quote the number it refused.
            error: maskContactText(sent.error),
          });
          return { channel, to, status: 'failed' };
        } catch (error) {
          logger.error('[account-code] WhatsApp send error', {
            purpose: input.purpose,
            ...safeErrorFields(error),
          });
          return { channel, to, status: 'failed' };
        }
      })(),
    );

    tasks.push(
      (async (): Promise<ChannelDelivery> => {
        const channel = 'sms' as const;
        if (heldBack.has(channel)) {
          devLogCode(channel, digits, input, 'OTP_DELIVERY_LOG_ONLY');
          return { channel, to, status: 'logged' };
        }
        try {
          const result = await senders.sendSms({
            to: digits,
            text: smsCodeText(input.code, input.validMinutes),
            purpose: input.purpose,
          });
          return { channel, to, status: result.status };
        } catch (error) {
          logger.error('[account-code] SMS send error', {
            purpose: input.purpose,
            ...safeErrorFields(error),
          });
          return { channel, to, status: 'failed' };
        }
      })(),
    );
  }

  if (email) {
    const to = maskEmail(email);
    tasks.push(
      (async (): Promise<ChannelDelivery> => {
        const channel = 'email' as const;
        if (heldBack.has(channel)) {
          devLogCode(channel, email, input, 'OTP_DELIVERY_LOG_ONLY');
          return { channel, to, status: 'logged' };
        }
        if (!senders.emailConfigured()) {
          if (production) {
            logger.warn('[account-code] Email not configured — channel skipped', {
              purpose: input.purpose,
            });
            return { channel, to, status: 'skipped' };
          }
          devLogCode(channel, email, input, 'Email not configured');
          return { channel, to, status: 'logged' };
        }
        try {
          const result = await senders.sendEmail({
            recipientEmail: email,
            name: input.name,
            code: input.code,
            purposeLabel: input.purposeLabel,
            validMinutes: input.validMinutes,
          });
          // `null` = not configured after all (a race with env); not a send.
          if (result === null) return { channel, to, status: production ? 'skipped' : 'failed' };
          return { channel, to, status: 'sent' };
        } catch (error) {
          logger.warn('[account-code] Email send failed', {
            purpose: input.purpose,
            // SMTP refusals quote the recipient address.
            ...safeErrorFields(error),
          });
          return { channel, to, status: 'failed' };
        }
      })(),
    );
  }

  const sentTo = await Promise.all(tasks);
  const anySent = sentTo.some((d) => d.status === 'sent');
  const anyLogged = sentTo.some((d) => d.status === 'logged');
  const ok = anySent || (!production && anyLogged);

  if (!ok) {
    logger.error('[account-code] code reached no channel', {
      purpose: input.purpose,
      production,
      statuses: sentTo.map((d) => `${d.channel}:${d.status}`),
    });
  }

  return { sentTo, ok, waMessageId };
}
