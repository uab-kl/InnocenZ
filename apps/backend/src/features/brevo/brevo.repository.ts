/**
 * Low-level Brevo SMTP transport (nodemailer).
 * Pattern: semutz-sj-backend-2 `features/brevo/brevo.repository.ts`.
 * Prefer `features/mailing` for feature call sites — templates live there.
 */
import nodemailer from 'nodemailer';
import type { SendMailOptions, Transporter } from 'nodemailer';
import { env } from '@/env.js';
import { logger } from '@/util/logger.js';
import { isEmail } from '@/util/email.js';
import type { SendEmailInput, SendEmailResult } from '@/features/mailing/mailing.model.js';

let transporter: Transporter | null = null;

export function emailConfigured(): boolean {
  return Boolean(
    env.SENDER_EMAIL &&
      env.BREVO_SMTP_HOST &&
      env.BREVO_SMTP_USER &&
      env.BREVO_SMTP_KEY,
  );
}

function getTransporter(): Transporter {
  if (!emailConfigured()) {
    throw new Error(
      'Email is not configured (need SENDER_EMAIL, BREVO_SMTP_HOST, BREVO_SMTP_USER, BREVO_SMTP_KEY)',
    );
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.BREVO_SMTP_HOST,
      port: env.BREVO_SMTP_PORT,
      secure: env.BREVO_SMTP_PORT === 465,
      auth: {
        user: env.BREVO_SMTP_USER!,
        pass: env.BREVO_SMTP_KEY!,
      },
    });
  }
  return transporter;
}

/** Send one message through Brevo SMTP. Throws if misconfigured or all recipients rejected. */
export async function sendEmail(
  input: SendEmailInput,
): Promise<SendEmailResult> {
  const toList = (Array.isArray(input.to) ? input.to : [input.to]).map((s) =>
    s.trim(),
  );
  if (toList.length === 0 || toList.some((t) => !isEmail(t))) {
    throw new Error('sendEmail: invalid "to" address');
  }
  if (!input.text && !input.html) {
    throw new Error('sendEmail: provide text and/or html body');
  }

  const from = input.from?.trim() || env.SENDER_EMAIL!;
  const mail: SendMailOptions = {
    from,
    to: toList.join(', '),
    subject: input.subject,
    text: input.text,
    html: input.html,
    replyTo: input.replyTo,
    cc: input.cc,
    bcc: input.bcc,
    attachments: input.attachments,
  };

  const info = await getTransporter().sendMail(mail);

  const accepted = (info.accepted ?? []).map(String);
  const rejected = (info.rejected ?? []).map(String);

  logger.info('[brevo] sent', {
    messageId: info.messageId,
    to: toList,
    subject: input.subject,
    accepted,
    rejected,
  });

  if (rejected.length > 0 && accepted.length === 0) {
    throw new Error(`sendEmail: all recipients rejected (${rejected.join(', ')})`);
  }

  return {
    messageId: String(info.messageId ?? ''),
    accepted,
    rejected,
  };
}
