import { env } from '@/env.js';
import { logger } from '@/util/logger.js';

/**
 * THE SMS SEAM.
 *
 * No SMS provider is contracted yet, so this is the shape one plugs into rather
 * than a client for any particular one. A provider is an adapter registered by
 * name; `SMS_PROVIDER` picks which registered adapter sends. Nothing else in the
 * codebase talks to an SMS API.
 *
 *   registerSmsProvider({ name: 'acme', send: async ({ to, text }) => … })
 *   SMS_PROVIDER=acme
 *
 * Behaviour with NO provider set:
 *  • outside production — the SMS text is LOGGED (status `logged`), so a
 *    developer can finish a code flow from the backend log;
 *  • in production — the SMS is SKIPPED with a warning (status `skipped`), and
 *    the text, which carries a code, is never written to the log.
 *
 * A provider NAMED but not registered is `failed`, not `skipped`: that is a
 * misconfiguration, and reporting it as a quiet skip would hide it.
 */

export type SmsProviderSendResult =
  | { ok: true; messageId?: string | null }
  | { ok: false; error: string };

export type SmsProvider = {
  /** Matched case-insensitively against `SMS_PROVIDER`. */
  name: string;
  /** `to` is digits only, international form without '+' (e.g. 60123456789). */
  send(input: { to: string; text: string }): Promise<SmsProviderSendResult>;
};

export type SmsSendResult =
  | { status: 'sent'; messageId: string | null }
  | { status: 'logged' }
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; error: string };

const providers = new Map<string, SmsProvider>();

function providerKey(name: string): string {
  return name.trim().toLowerCase();
}

export function registerSmsProvider(provider: SmsProvider): void {
  providers.set(providerKey(provider.name), provider);
}

/** Test seam: forget every registered provider. */
export function clearSmsProviders(): void {
  providers.clear();
}

/** True when SMS_PROVIDER names an adapter that is actually registered. */
export function smsConfigured(): boolean {
  const name = env.SMS_PROVIDER?.trim();
  return Boolean(name && providers.has(providerKey(name)));
}

export async function sendSms(input: {
  /** Any phone form; only its digits are sent. */
  to: string;
  text: string;
  /** For the log line only (e.g. `reset_password`). */
  purpose?: string;
}): Promise<SmsSendResult> {
  const to = (input.to ?? '').replace(/\D/g, '');
  if (to.length < 8 || to.length > 15) {
    return { status: 'failed', error: 'Invalid phone number' };
  }

  const production = env.NODE_ENV === 'production';
  const name = env.SMS_PROVIDER?.trim();

  if (!name) {
    if (production) {
      logger.warn('[sms] SMS_PROVIDER is not set — SMS skipped', {
        purpose: input.purpose,
      });
      return { status: 'skipped', reason: 'SMS provider is not configured' };
    }
    // Local development only: the text may carry a code, which is the point.
    logger.warn('[sms] No SMS provider — SMS logged for local dev only', {
      to,
      purpose: input.purpose,
      text: input.text,
    });
    return { status: 'logged' };
  }

  const provider = providers.get(providerKey(name));
  if (!provider) {
    logger.error('[sms] SMS_PROVIDER names a provider that is not registered', {
      provider: name,
      purpose: input.purpose,
    });
    return { status: 'failed', error: `SMS provider "${name}" is not registered` };
  }

  try {
    const result = await provider.send({ to, text: input.text });
    if (result.ok) {
      return { status: 'sent', messageId: result.messageId ?? null };
    }
    logger.warn('[sms] send failed', {
      provider: provider.name,
      purpose: input.purpose,
      error: result.error,
    });
    return { status: 'failed', error: result.error };
  } catch (error) {
    logger.error('[sms] send error', {
      provider: provider.name,
      purpose: input.purpose,
      error: error instanceof Error ? error.message : String(error),
    });
    return { status: 'failed', error: 'Could not reach the SMS provider' };
  }
}
