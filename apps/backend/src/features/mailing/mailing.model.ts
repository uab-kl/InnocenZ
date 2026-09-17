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

/** Shared footer vars for every HTML template (semutz pattern). */
export type MailBrandVariables = {
  companyAddress: string;
  companyName: string;
  currentYear: string;
  recipientEmail: string;
};

export type OrgApprovedNotificationVariables = MailBrandVariables & {
  name: string;
  orgName: string;
  orgKindLabel: string;
  loginLink: string;
};

export type PasswordResetEmailVariables = MailBrandVariables & {
  name: string;
  resetPasswordLink: string;
  expiryLabel: string;
};

/** `account_code.html` — one-time code for a password reset or contact change. */
export type AccountCodeEmailVariables = MailBrandVariables & {
  name: string;
  code: string;
  purposeLabel: string;
  validityLabel: string;
};

/** `account_change_notice.html` — "your password / email / phone was changed". */
export type AccountChangeNoticeEmailVariables = MailBrandVariables & {
  name: string;
  heading: string;
  message: string;
  changedAt: string;
};

export type OrgMemberInviteEmailVariables = MailBrandVariables & {
  orgName: string;
  orgKindLabel: string;
  subRoleLabel: string;
  acceptLink: string;
};
