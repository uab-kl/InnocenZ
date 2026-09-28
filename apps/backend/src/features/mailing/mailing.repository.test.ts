import { beforeEach, describe, expect, it, vi } from 'vitest';

const logger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }));
vi.mock('@/util/logger.js', () => ({ logger }));
vi.mock('@/env.js', () => ({ env: { FRONTEND_URL: 'https://app.innocenz.test' } }));
vi.mock('@/features/brevo/brevo.repository.js', () => ({
  emailConfigured: () => false,
  sendEmail: vi.fn(),
}));

import { inspect } from 'node:util';
import {
  sendOrgApprovedNotificationEmail,
  sendOrgMemberInviteMail,
  sendPasswordResetEmail,
} from './mailing.repository';

/**
 * Fix First, 28 Sep 2026: every "email not configured" line here used to log
 * the recipient in plain text, and the reset one sits on the password-reset
 * path. Addresses are masked (first letter + domain); the reset LINK — which
 * carries the raw token — is never logged by this file at all.
 */

const ADDRESS = 'owner@atlas-agency.my';
const LINK = 'https://app.innocenz.test/reset-password?token=0123456789abcdef';

function logged(): string {
  return inspect([...logger.info.mock.calls, ...logger.warn.mock.calls, ...logger.error.mock.calls], {
    depth: 8,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('mailing — nothing configured, nothing leaked', () => {
  it('password reset: masks the address and never logs the link or its token', async () => {
    const sent = await sendPasswordResetEmail({
      recipientEmail: ADDRESS,
      name: 'Owner',
      resetPasswordLink: LINK,
      expiryLabel: '1 hour',
    });

    expect(sent).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('skipped password reset'), {
      to: 'o••••@atlas-agency.my',
    });
    expect(logged()).not.toContain(ADDRESS);
    expect(logged()).not.toContain('0123456789abcdef');
  });

  it('org approved and member invite mask the address too', async () => {
    await sendOrgApprovedNotificationEmail({
      recipientEmail: ADDRESS,
      name: 'Owner',
      orgName: 'Atlas Agency',
      orgKind: 'agency',
    });
    await sendOrgMemberInviteMail({
      recipientEmail: ADDRESS,
      orgName: 'Atlas Agency',
      orgKind: 'agency',
      subRoleLabel: 'Finance',
      acceptLink: 'https://app.innocenz.test/invite/org-member?token=x',
    });

    expect(logger.warn).toHaveBeenCalledTimes(2);
    expect(logged()).toContain('o••••@atlas-agency.my');
    expect(logged()).not.toContain(ADDRESS);
  });
});
