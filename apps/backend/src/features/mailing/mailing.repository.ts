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
  MailingEmail,
  OrgApprovedNotificationVariables,
  OrgMemberInviteEmailVariables,
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

function portalLoginLink(orgKind: 'outlet' | 'agency'): string {
  const base = env.FRONTEND_URL.replace(/\/$/, '');
  return orgKind === 'agency' ? `${base}/agency` : `${base}/outlet`;
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

  const loginLink = portalLoginLink(input.orgKind);
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
    `You have been invited to join ${input.orgName} (${orgKindLabel}) as ${input.subRoleLabel}.`,
    '',
    'Accept the invitation:',
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
