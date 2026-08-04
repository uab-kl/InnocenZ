import { logger } from '@/util/logger.js';

/**
 * WhatsApp Cloud API (Meta Graph) — send OTP for PR phone verification.
 *
 * Env:
 *   META_WHATSAPP_TOKEN            — permanent / system-user access token
 *   META_WHATSAPP_PHONE_NUMBER_ID  — phone number id from Meta app dashboard
 *   META_WHATSAPP_API_VERSION      — default v21.0
 *   META_WHATSAPP_OTP_TEMPLATE     — optional approved auth template name
 *                                    (e.g. login_code); if unset, sends plain
 *                                    text (allow-listed numbers / unpublished app)
 *   META_WHATSAPP_OTP_TEMPLATE_LANG — template language code (e.g. en_US for
 *                                    English US). Must match Meta exactly.
 */

export type WhatsAppSendResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string };

function graphBase(): string {
  const version = process.env.META_WHATSAPP_API_VERSION?.trim() || 'v21.0';
  return `https://graph.facebook.com/${version}`;
}

export function whatsappSendConfigured(): boolean {
  return Boolean(
    process.env.META_WHATSAPP_TOKEN?.trim() &&
      process.env.META_WHATSAPP_PHONE_NUMBER_ID?.trim(),
  );
}

/** E.164 without '+' — Meta's `to` field wants digits only. */
export async function sendWhatsAppOtp(
  phoneDigits: string,
  code: string,
): Promise<WhatsAppSendResult> {
  const token = process.env.META_WHATSAPP_TOKEN?.trim();
  const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (!token || !phoneNumberId) {
    return { ok: false, error: 'WhatsApp Cloud API is not configured' };
  }

  const to = phoneDigits.replace(/\D/g, '');
  if (to.length < 8) {
    return { ok: false, error: 'Invalid phone number' };
  }

  const template = process.env.META_WHATSAPP_OTP_TEMPLATE?.trim();
  const body = template
    ? {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: template,
          language: {
            code: process.env.META_WHATSAPP_OTP_TEMPLATE_LANG?.trim() || 'en_US',
          },
          components: [
            {
              type: 'body',
              parameters: [{ type: 'text', text: code }],
            },
            {
              type: 'button',
              sub_type: 'url',
              index: '0',
              parameters: [{ type: 'text', text: code }],
            },
          ],
        },
      }
    : {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: {
          preview_url: false,
          body: `InnocenZ verification code: ${code}\n\nValid for 5 minutes. Do not share this code.`,
        },
      };

  try {
    const res = await fetch(`${graphBase()}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as {
      messages?: Array<{ id?: string }>;
      error?: { message?: string };
    };

    if (!res.ok) {
      const message = json.error?.message ?? `WhatsApp API HTTP ${res.status}`;
      logger.warn('[whatsapp] send failed', {
        status: res.status,
        message,
        phoneNumberId,
        template: template || '(plain text)',
        lang: template
          ? process.env.META_WHATSAPP_OTP_TEMPLATE_LANG?.trim() || 'en_US'
          : undefined,
      });
      return { ok: false, error: message };
    }

    const messageId = json.messages?.[0]?.id ?? '';
    return { ok: true, messageId };
  } catch (error) {
    logger.error('[whatsapp] send error', error);
    return { ok: false, error: 'Could not reach WhatsApp Cloud API' };
  }
}
