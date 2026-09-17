import { logger } from '@/util/logger.js';
import { maskContactText, safeErrorFields } from '@/features/auth/query-error-redaction.js';
import type { PhoneVerificationPurpose } from '@/features/auth/phone-verification.model.js';

/**
 * WhatsApp Cloud API (Meta Graph) — send OTP for PR phone verification.
 *
 * Expected template body (one template for all purposes), e.g.:
 *   OTP Code: {{1}}. This is your OTP code for {{2}}. For your security, do not share this code.
 * where {{1}} = 6-digit code, {{2}} = purpose label (Register / Password reset / Change phone).
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

/**
 * Human label for template {{2}} — matches app purpose.
 *
 * The contact-change purposes default to a neutral label; their callers pass a
 * sharper one ("Change email" / "Change phone") through `sendWhatsAppOtp`'s
 * `purposeLabel`, because the row's purpose alone does not say WHICH contact
 * is being changed.
 */
export function otpPurposeLabel(purpose: PhoneVerificationPurpose): string {
  switch (purpose) {
    case 'forgot_password':
    case 'reset_password':
      return 'Password reset';
    case 'change_phone':
      return 'Change phone';
    case 'contact_change_identity':
      return 'Confirm account change';
    case 'contact_change_new':
      return 'Verify new contact';
    case 'signup':
    default:
      return 'Register';
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
  const forgot = process.env.META_WHATSAPP_OTP_TEMPLATE_FORGOT_PASSWORD?.trim();
  const changePhone = process.env.META_WHATSAPP_OTP_TEMPLATE_CHANGE_PHONE?.trim();
  const contactChange =
    process.env.META_WHATSAPP_OTP_TEMPLATE_CONTACT_CHANGE?.trim() || changePhone;
  const byPurpose: Record<PhoneVerificationPurpose, string | undefined> = {
    signup: process.env.META_WHATSAPP_OTP_TEMPLATE_SIGNUP?.trim(),
    forgot_password: forgot,
    change_phone: changePhone,
    // The account-code purposes reuse the nearest existing template when no
    // dedicated one is approved, and all of them fall back to the one shared
    // template below — a new purpose must never need a Meta approval to work.
    reset_password:
      process.env.META_WHATSAPP_OTP_TEMPLATE_RESET_PASSWORD?.trim() || forgot,
    contact_change_identity: contactChange,
    contact_change_new: contactChange,
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
  /** Overrides the template's {{2}}; defaults to `otpPurposeLabel(purpose)`. */
  purposeLabel?: string,
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
  const purposeText = purposeLabel?.trim() || otpPurposeLabel(purpose);

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
        // Graph API refusals can quote the recipient number.
        message: maskContactText(message),
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
    logger.error('[whatsapp] send error', safeErrorFields(error));
    return { ok: false, error: 'Could not reach WhatsApp Cloud API' };
  }
}
