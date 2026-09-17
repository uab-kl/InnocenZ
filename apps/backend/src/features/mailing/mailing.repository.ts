/**
 * Feature-facing mail helpers.
 * Pattern: semutz-sj-backend-2 `features/mailing/mailling.repository.ts`
 *   — HTML files under `templates/` with `{{var:key}}` placeholders,
 *     named send* helpers call `brevo.repository.sendEmail`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '@/env.js';
import {
  emailConfigured,
  sendEmail as brevoSendEmail,
} from '@/features/brevo/brevo.repository.js';
import type {
  AccountChangeNoticeEmailVariables,
  AccountCodeEmailVariables,
  MailingEmail,
  OrgApprovedNotificationVariables,
  OrgMemberInviteEmailVariables,
  PasswordResetEmailVariables,
  SendEmailInput,
  SendEmailResult,
} from '@/features/mailing/mailing.model.js';
import { logger } from '@/util/logger.js';

export { emailConfigured };
export type { MailingEmail, SendEmailInput, SendEmailResult };

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function templatesDir(): string {
  // Dev (tsx): templates sit next to this file.
  // Prod (esbuild bundle): copied beside dist/main.js as dist/templates.
  const besideSource = join(__dirname, 'templates');
  if (existsSync(besideSource)) return besideSource;
  const besideBundle = join(__dirname, 'templates');
  return besideBundle;
}

/** Load an HTML file and replace `{{var:key}}` placeholders (semutz style). */
export function renderTemplate(
  templateFile: string,
  variables: Record<string, string | number | boolean | null | undefined>,
): string {
  const templatePath = join(templatesDir(), templateFile);
  let html = readFileSync(templatePath, 'utf-8');
  for (const [key, value] of Object.entries(variables)) {
    const raw = String(value ?? '');
    // Links stay raw for href=; everything else is escaped (org names, etc.).
    const rendered = URL_VAR_KEYS.has(key) ? raw : escapeHtml(raw);
    html = html.replace(new RegExp(`\\{\\{var:${key}\\}\\}`, 'g'), rendered);
  }
  return html;
}

const URL_VAR_KEYS = new Set([
  'loginLink',
  'acceptLink',
  'resetPasswordLink',
  'verificationLink',
]);

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function brandDefaults(recipientEmail: string) {
  return {
    companyName: 'InnocenZ',
    companyAddress: 'Malaysia',
    currentYear: String(new Date().getFullYear()),
    recipientEmail,
  };
}

function portalLoginLink(
  orgKind: 'outlet' | 'agency',
  recipientEmail: string,
): string {
  const base = env.FRONTEND_URL.replace(/\/$/, '');
  const params = new URLSearchParams();
  const email = recipientEmail.trim();
  if (email) params.set('email', email);
  // After sign-in, login already routes by role; hint helps dual-portal users.
  params.set('next', orgKind === 'agency' ? '/agency' : '/outlet');
  return `${base}/login?${params.toString()}`;
}

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
 * Example named helper (semutz style). Call sites:
 * `await sendProbeEmail({ recipientEmail: '…' })`.
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

/** Admin approved an outlet or agency — email the owner. */
export async function sendOrgApprovedNotificationEmail(input: {
  recipientEmail: string;
  name: string;
  orgName: string;
  orgKind: 'outlet' | 'agency';
}): Promise<SendEmailResult | null> {
  if (!emailConfigured()) {
    logger.warn(
      '[mailing] Email not configured — skipped org approved notification',
      { orgName: input.orgName, to: input.recipientEmail },
    );
    return null;
  }

  const loginLink = portalLoginLink(input.orgKind, input.recipientEmail);
  const orgKindLabel = input.orgKind === 'agency' ? 'agency' : 'outlet';
  const variables: OrgApprovedNotificationVariables = {
    ...brandDefaults(input.recipientEmail),
    name: input.name.trim() || 'there',
    orgName: input.orgName,
    orgKindLabel,
    loginLink,
  };
  const html = renderTemplate('org_approved_notification.html', variables);
  const subject = `[InnocenZ] ${input.orgName} has been approved`;
  const text = [
    `Hello ${variables.name},`,
    '',
    `Great news — ${input.orgName} has been approved by InnocenZ admin.`,
    `Your ${orgKindLabel} portal is now active.`,
    '',
    `Open portal: ${loginLink}`,
  ].join('\n');

  return brevoSendEmail({
    to: input.recipientEmail,
    subject,
    text,
    html,
  });
}

/**
 * Forgot-password reset link.
 *
 * Returns `null` when SMTP is not configured so the caller can still answer
 * neutrally — but the caller MUST NOT hand the link back over HTTP in that
 * case: a reset link in an API response is an account takeover for anyone who
 * knows an email address.
 */
export async function sendPasswordResetEmail(input: {
  recipientEmail: string;
  name: string;
  resetPasswordLink: string;
  expiryLabel: string;
}): Promise<SendEmailResult | null> {
  if (!emailConfigured()) {
    logger.warn(
      '[mailing] Email not configured — skipped password reset email',
      { to: input.recipientEmail },
    );
    return null;
  }

  const variables: PasswordResetEmailVariables = {
    ...brandDefaults(input.recipientEmail),
    name: input.name,
    resetPasswordLink: input.resetPasswordLink,
    expiryLabel: input.expiryLabel,
  };
  const html = renderTemplate('password_reset.html', variables);
  const subject = '[InnocenZ] Reset your password';
  const text = [
    `Hello ${input.name},`,
    '',
    'We received a request to reset the password for your InnocenZ account.',
    'Open this link to choose a new one:',
    input.resetPasswordLink,
    '',
    `This link expires in ${input.expiryLabel}.`,
    'If you did not ask for this, ignore this email — your password stays unchanged.',
  ].join('\n');

  return brevoSendEmail({
    to: input.recipientEmail,
    subject,
    text,
    html,
  });
}

/**
 * A ONE-TIME CODE by email — forgot password, or a contact change (a code to
 * the current email to prove ownership, or to the new one to prove it works).
 *
 * Returns `null` when SMTP is not configured; the caller (the account-code
 * delivery orchestrator) decides whether that is a dev log or a skipped
 * channel. It throws on a transport failure, which the orchestrator reports as
 * `failed` for this channel only.
 */
export async function sendAccountCodeEmail(input: {
  recipientEmail: string;
  name?: string | null;
  code: string;
  purposeLabel: string;
  validMinutes: number;
}): Promise<SendEmailResult | null> {
  if (!emailConfigured()) {
    logger.warn('[mailing] Email not configured — skipped account code email', {
      purposeLabel: input.purposeLabel,
    });
    return null;
  }

  const validityLabel = `${input.validMinutes} minute${input.validMinutes === 1 ? '' : 's'}`;
  const name = input.name?.trim() || 'there';
  const variables: AccountCodeEmailVariables = {
    ...brandDefaults(input.recipientEmail),
    name,
    code: input.code,
    purposeLabel: input.purposeLabel,
    validityLabel,
  };
  const html = renderTemplate('account_code.html', variables);
  const text = [
    `Hello ${name},`,
    '',
    `Your InnocenZ verification code for ${input.purposeLabel} is: ${input.code}`,
    '',
    `This code is valid for ${validityLabel}. Never share it with anyone.`,
    'If you did not ask for this code, ignore this email. Nothing changes on your account without it.',
  ].join('\n');

  return brevoSendEmail({
    to: input.recipientEmail,
    subject: '[InnocenZ] Your verification code',
    text,
    html,
  });
}

/**
 * "Your password / email / phone was changed" — sent AFTER the change, to the
 * contact that can still reach the real owner (the OLD email for an email
 * change). Best-effort by contract: the caller never fails a request on it.
 */
export async function sendAccountChangeNoticeEmail(input: {
  recipientEmail: string;
  name?: string | null;
  subject: string;
  heading: string;
  message: string;
  changedAt?: Date;
}): Promise<SendEmailResult | null> {
  if (!emailConfigured()) {
    logger.warn('[mailing] Email not configured — skipped account change notice', {
      subject: input.subject,
    });
    return null;
  }

  const name = input.name?.trim() || 'there';
  const changedAt = (input.changedAt ?? new Date()).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  const variables: AccountChangeNoticeEmailVariables = {
    ...brandDefaults(input.recipientEmail),
    name,
    heading: input.heading,
    message: input.message,
    changedAt,
  };
  const html = renderTemplate('account_change_notice.html', variables);
  const text = [
    `Hello ${name},`,
    '',
    input.message,
    `Changed at: ${changedAt}`,
    '',
    'If this was you, there is nothing more to do. If it was NOT you, contact InnocenZ support immediately.',
  ].join('\n');

  return brevoSendEmail({
    to: input.recipientEmail,
    subject: input.subject,
    text,
    html,
  });
}

/** Team invite — accept link in HTML template. */
export async function sendOrgMemberInviteMail(input: {
  recipientEmail: string;
  orgName: string;
  orgKind: 'outlet' | 'agency';
  subRoleLabel: string;
  acceptLink: string;
}): Promise<SendEmailResult | null> {
  if (!emailConfigured()) {
    logger.warn(
      '[mailing] Email not configured — skipped org member invite email',
      { orgName: input.orgName, to: input.recipientEmail },
    );
    return null;
  }

  const orgKindLabel = input.orgKind === 'agency' ? 'agency' : 'outlet';
  const variables: OrgMemberInviteEmailVariables = {
    ...brandDefaults(input.recipientEmail),
    orgName: input.orgName,
    orgKindLabel,
    subRoleLabel: input.subRoleLabel,
    acceptLink: input.acceptLink,
  };
  const html = renderTemplate('org_member_invite.html', variables);
  const subject = `[InnocenZ] Invitation to join ${input.orgName}`;
  const text = [
    `You have been invited to join ${input.orgName} as ${input.subRoleLabel}.`,
    '',
    /*
     * ⚠️ THIS EMAIL MUST NOT PROMISE ACCOUNT SETUP.
     *
     * It used to read "set up your account (name, email, password)", which was
     * true of a flow that no longer exists: accepting once CREATED the account
     * and wrote a password onto whatever address the invite named. That was an
     * account-takeover path — an owner could invite an admin's address and set
     * a password on it — so accept now requires the caller to be signed in AS
     * the invited email, and writes no credential at all.
     *
     * The code changed and this sentence did not, so the email was still
     * telling people to expect a form that would never appear, and sending
     * somebody who has no account down a path that can only refuse them.
     */
    'Sign in with this email address to accept — invitations only go to accounts that already exist:',
    input.acceptLink,
    '',
    'This link expires in 7 days.',
  ].join('\n');

  return brevoSendEmail({
    to: input.recipientEmail,
    subject,
    text,
    html,
  });
}
