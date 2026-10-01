import { beforeEach, describe, expect, it, vi } from 'vitest';

const logger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }));
const transport = vi.hoisted(() => ({ sendMail: vi.fn() }));
/** Every options object `createTransport` was handed — a plain array, so clearAllMocks keeps it. */
const created = vi.hoisted(() => [] as unknown[]);
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
vi.mock('nodemailer', () => ({
  default: {
    createTransport: (options: unknown) => {
      created.push(options);
      return transport;
    },
  },
}));

import { inspect } from 'node:util';
import {
  BREVO_CONNECTION_TIMEOUT_MS,
  BREVO_DNS_TIMEOUT_MS,
  BREVO_GREETING_TIMEOUT_MS,
  BREVO_SOCKET_TIMEOUT_MS,
  sendEmail,
} from './brevo.repository';

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

/**
 * 30 Sep 2026: the transport set no timeouts, so a hung relay was waited on at
 * nodemailer 7's defaults — 30 s of DNS, 2 min to connect, 30 s for the greeting
 * and 10 min of silence.
 */
describe('brevo transport — every SMTP stage is bounded', () => {
  it('is created with the named timeouts, each far below the library default', async () => {
    transport.sendMail.mockResolvedValueOnce({ messageId: 'm-3', accepted: [ADDRESS], rejected: [] });

    await sendEmail({ to: ADDRESS, subject: 's', text: 'x' });

    // One transport per process, built on the first send.
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      dnsTimeout: BREVO_DNS_TIMEOUT_MS,
      connectionTimeout: BREVO_CONNECTION_TIMEOUT_MS,
      greetingTimeout: BREVO_GREETING_TIMEOUT_MS,
      socketTimeout: BREVO_SOCKET_TIMEOUT_MS,
    });
    const defaults: Array<[number, number]> = [
      [BREVO_DNS_TIMEOUT_MS, 30_000],
      [BREVO_CONNECTION_TIMEOUT_MS, 120_000],
      [BREVO_GREETING_TIMEOUT_MS, 30_000],
      [BREVO_SOCKET_TIMEOUT_MS, 600_000],
    ];
    for (const [bound, libraryDefault] of defaults) {
      // Above zero: nodemailer reads each as `option || DEFAULT`, so a 0 would
      // quietly put the library default back.
      expect(bound).toBeGreaterThan(0);
      expect(bound).toBeLessThan(libraryDefault);
    }
  });
});
