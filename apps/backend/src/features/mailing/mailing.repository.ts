/**
 * Feature-facing mail helpers.
 * Pattern: semutz-sj-backend-2 `features/mailing/mailling.repository.ts`
 *   — templates + named send* functions call `brevo.repository.sendEmail`.
 *
 * Add HTML templates under `features/mailing/templates/` and export send*
 * helpers here as product emails are wired (reset password, invites, OTP, …).
 */
import { env } from '@/env.js';
import {
  emailConfigured,
  sendEmail as brevoSendEmail,
} from '@/features/brevo/brevo.repository.js';
import type {
  MailingEmail,
  SendEmailInput,
  SendEmailResult,
} from '@/features/mailing/mailing.model.js';

export { emailConfigured };
export type { MailingEmail, SendEmailInput, SendEmailResult };

/** Low-level send — prefer named helpers below when a template exists. */
export async function sendEmail(
  input: SendEmailInput,
): Promise<SendEmailResult> {
  return brevoSendEmail(input);
}

/** Plain notification to ADMIN_EMAIL (or SENDER_EMAIL fallback). */
export async function sendAdminEmail(input: {
  subject: string;
  text?: string;
  html?: string;
}): Promise<SendEmailResult> {
  const to = env.ADMIN_EMAIL || env.SENDER_EMAIL;
  if (!to) {
    throw new Error('sendAdminEmail: ADMIN_EMAIL / SENDER_EMAIL not set');
  }
  return brevoSendEmail({ to, ...input });
}

/**
 * Example named helper (semutz style). Expand with real templates later.
 * Call sites: `await sendProbeEmail({ recipientEmail: '…' })`.
 */
export async function sendProbeEmail(
  mailingData: MailingEmail,
): Promise<SendEmailResult> {
  const subject =
    mailingData.subject?.trim() || '[InnocenZ] Brevo SMTP probe';
  const when = new Date().toISOString();
  return brevoSendEmail({
    to: mailingData.recipientEmail,
    subject,
    text: `Hello — Brevo SMTP probe at ${when}.\nIf you got this, mailing works.`,
    html: `<p>Hello — Brevo SMTP probe at <code>${when}</code>.</p><p>If you got this, mailing works.</p>`,
  });
}
