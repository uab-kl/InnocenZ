import { beforeEach, describe, expect, it, vi } from 'vitest';

const logger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }));
const transport = vi.hoisted(() => ({ sendMail: vi.fn() }));
vi.mock('@/util/logger.js', () => ({ logger }));
vi.mock('@/env.js', () => ({
  env: {
    SENDER_EMAIL: 'no-reply@innocenz.test',
    BREVO_SMTP_HOST: 'smtp.test',
    BREVO_SMTP_PORT: 587,
    BREVO_SMTP_USER: 'user',
    BREVO_SMTP_KEY: 'key',
  },
}));
vi.mock('nodemailer', () => ({ default: { createTransport: () => transport } }));

import { inspect } from 'node:util';
import { sendEmail } from './brevo.repository';

/**
 * The `[brevo] sent` line fires on EVERY mail — each reset link, code and
 * invite — and logged every recipient in plain text (Fix First, 28 Sep 2026).
 */

const ADDRESS = 'owner@atlas-agency.my';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('brevo sendEmail — recipients are masked in the log', () => {
  it('logs a sent mail with the address masked, in to / accepted', async () => {
    transport.sendMail.mockResolvedValueOnce({ messageId: 'm-1', accepted: [ADDRESS], rejected: [] });

    await sendEmail({ to: ADDRESS, subject: 'Reset your password', text: 'x' });

    const line = inspect(logger.info.mock.calls, { depth: 8 });
    expect(line).toContain('o••••@atlas-agency.my');
    expect(line).not.toContain(ADDRESS);
  });

  it('a total rejection throws without quoting the address', async () => {
    transport.sendMail.mockResolvedValueOnce({ messageId: 'm-2', accepted: [], rejected: [ADDRESS] });

    await expect(sendEmail({ to: ADDRESS, subject: 's', text: 'x' })).rejects.toThrow(
      'sendEmail: all recipients rejected (o••••@atlas-agency.my)',
    );
    expect(inspect(logger.info.mock.calls, { depth: 8 })).not.toContain(ADDRESS);
  });
});
