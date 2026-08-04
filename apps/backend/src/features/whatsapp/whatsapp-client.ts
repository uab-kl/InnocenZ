import { logger } from '@/util/logger.js';
import type { PhoneVerificationPurpose } from '@/features/auth/phone-verification.model.js';

/**
 * WhatsApp Cloud API (Meta Graph) — send OTP for PR phone verification.
 *
 * Expected template body (one template for all purposes), e.g.:
 *   OTP Code: {{1}}. This is your OTP code for {{2}}. For your security, do not share this code.
 * where {{1}} = 6-digit code, {{2}} = purpose label (Login / Password reset / Change phone).
 *
 * Env:
 *   META_WHATSAPP_TOKEN
 *   META_WHATSAPP_PHONE_NUMBER_ID
 *   META_WHATSAPP_API_VERSION              — default v21.0
 *   META_WHATSAPP_OTP_TEMPLATE             — approved template name
 *   META_WHATSAPP_OTP_TEMPLATE_LANG        — e.g. en / en_US (must match Meta)
 *   META_WHATSAPP_OTP_HAS_BUTTON           — "true" (default) sends Copy-code button param;
 *                                           set "false" if the template has no button
 *
 * Optional per-purpose template names still fall back to META_WHATSAPP_OTP_TEMPLATE.
 */

export type WhatsAppSendResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string };

/** Human label for template {{2}} — matches app purpose. */
export function otpPurposeLabel(purpose: PhoneVerificationPurpose): string {
  switch (purpose) {
    case 'forgot_password':
      return 'Password reset';
    case 'change_phone':
      return 'Change phone';
    case 'signup':
    default:
      return 'Login';
  }
}

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

export function resolveOtpTemplateName(
  purpose: PhoneVerificationPurpose = 'signup',
): string | undefined {
  const byPurpose: Record<PhoneVerificationPurpose, string | undefined> = {
    signup: process.env.META_WHATSAPP_OTP_TEMPLATE_SIGNUP?.trim(),
    forgot_password: process.env.META_WHATSAPP_OTP_TEMPLATE_FORGOT_PASSWORD?.trim(),
    change_phone: process.env.META_WHATSAPP_OTP_TEMPLATE_CHANGE_PHONE?.trim(),
  };
  return byPurpose[purpose] || process.env.META_WHATSAPP_OTP_TEMPLATE?.trim() || undefined;
}

function templateLanguage(): string {
  return process.env.META_WHATSAPP_OTP_TEMPLATE_LANG?.trim() || 'en_US';
}

function templateHasButton(): boolean {
  const raw = process.env.META_WHATSAPP_OTP_HAS_BUTTON?.trim().toLowerCase();
  if (raw === 'false' || raw === '0' || raw === 'no') return false;
  return true;
}

/** E.164 without '+' — Meta's `to` field wants digits only. */
export async function sendWhatsAppOtp(
  phoneDigits: string,
  code: string,
  purpose: PhoneVerificationPurpose = 'signup',
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

  // Always 6 digits for the app + Meta variable {{1}}.
  const otp = code.replace(/\D/g, '').padStart(6, '0').slice(-6);
  const purposeText = otpPurposeLabel(purpose);

  const template = resolveOtpTemplateName(purpose);
  const lang = templateLanguage();
  const components: Array<Record<string, unknown>> = [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: otp },
        { type: 'text', text: purposeText },
      ],
    },
  ];
  if (templateHasButton()) {
    components.push({
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: otp }],
    });
  }

  const body = template
    ? {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: template,
          language: { code: lang },
          components,
        },
      }
    : {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: {
          preview_url: false,
          body: `OTP Code: ${otp}. This is your OTP code for ${purposeText}. For your security, do not share this code.`,
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
        purpose,
        purposeText,
        template: template || '(plain text)',
        lang: template ? lang : undefined,
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
