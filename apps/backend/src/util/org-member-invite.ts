import { createHash, randomBytes } from 'node:crypto';
import { env } from '@/env.js';
import {
  emailConfigured,
  sendOrgMemberInviteMail,
} from '@/features/mailing/mailing.repository.js';
import { logger } from '@/util/logger.js';

/** Membership status until the invitee accepts — kept for UI labels only. */
export const ORG_MEMBER_PENDING = 'pending';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function createOrgMemberInviteSecret(): {
  rawToken: string;
  tokenHash: string;
  expiresAt: Date;
} {
  const rawToken = randomBytes(32).toString('hex');
  const tokenHash = hashOrgMemberInviteToken(rawToken);
  return {
    rawToken,
    tokenHash,
    expiresAt: new Date(Date.now() + INVITE_TTL_MS),
  };
}

export function hashOrgMemberInviteToken(rawToken: string): string {
  return createHash('sha256').update(rawToken.trim()).digest('hex');
}

export function normalizeInviteEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function orgMemberInviteAcceptUrl(rawToken: string): string {
  const base = env.FRONTEND_URL.replace(/\/$/, '');
  return `${base}/invite/org-member?token=${encodeURIComponent(rawToken)}`;
}

export async function sendOrgMemberInviteEmail(input: {
  to: string;
  orgKind: 'outlet' | 'agency';
  orgName: string;
  subRole: string;
  rawToken: string;
}): Promise<{ emailed: boolean; acceptUrl: string }> {
  const acceptUrl = orgMemberInviteAcceptUrl(input.rawToken);

  if (!emailConfigured()) {
    return { emailed: false, acceptUrl };
  }

  // The invite row is already committed by the time we get here, so a rejected
  // recipient or a bad SMTP key must not throw: that turns a saved invitation
  // into a 500 and tells the owner it failed. Report emailed:false instead and
  // let the caller hand over the accept link.
  try {
    const result = await sendOrgMemberInviteMail({
      recipientEmail: input.to,
      orgName: input.orgName,
      orgKind: input.orgKind,
      subRoleLabel: input.subRole,
      acceptLink: acceptUrl,
    });
    return { emailed: Boolean(result), acceptUrl };
  } catch (error) {
    logger.error('[org-member-invite] Could not send invite email:', error);
    return { emailed: false, acceptUrl };
  }
}
