import type { SendMailOptions } from 'nodemailer';

/** Generic send payload (Brevo SMTP). */
export type SendEmailInput = {
  to: string | string[];
  subject: string;
  /** Plain-text body (recommended always). */
  text?: string;
  /** HTML body. */
  html?: string;
  /** Override From (defaults to SENDER_EMAIL). */
  from?: string;
  replyTo?: string;
  cc?: string | string[];
  bcc?: string | string[];
  attachments?: SendMailOptions['attachments'];
};

export type SendEmailResult = {
  messageId: string;
  accepted: string[];
  rejected: string[];
};

/**
 * Named-recipient shape used by mailing.repository helpers
 * (same idea as semutz `MailjetEmail`).
 */
export type MailingEmail = {
  recipientEmail: string;
  recipient?: string;
  cc?: Array<{ email: string; name?: string }>;
  subject?: string;
  variables?: Record<string, string | number | boolean | null | undefined>;
};
