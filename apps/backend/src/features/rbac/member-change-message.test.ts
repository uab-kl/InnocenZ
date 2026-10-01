import { describe, expect, it } from 'vitest';
import {
  memberRemovalMessage,
  memberUpdateMessage,
} from '@/features/rbac/member-change-message';

/**
 * The confirmation the Approvals pane and the Team screen print (28 Sep 2026
 * audit: reactivate and deactivate "show no confirmation"). The portal shows
 * this sentence verbatim, so it has to say what happened.
 */
describe('memberUpdateMessage', () => {
  it('names the role a removed member is restored with', () => {
    expect(
      memberUpdateMessage({
        org: 'agency',
        previousStatus: 'inactive',
        previousSubRole: 'director',
        wasMember: true,
        nextStatus: 'active',
        nextSubRole: 'director',
      }),
    ).toBe('Member reactivated as Director.');
  });

  it('calls a first admission an approval, not a reactivation', () => {
    expect(
      memberUpdateMessage({
        org: 'outlet',
        previousStatus: 'pending',
        previousSubRole: 'finance',
        wasMember: false,
        nextStatus: 'active',
        nextSubRole: 'operations_head',
      }),
    ).toBe('Request approved — they join as Ops Head.');
  });

  it('says a role changed, and to what', () => {
    expect(
      memberUpdateMessage({
        org: 'agency',
        previousStatus: 'active',
        previousSubRole: 'finance',
        wasMember: true,
        nextSubRole: 'director',
      }),
    ).toBe('Role changed to Director.');
  });

  it('says a status write that switches someone off is a deactivation', () => {
    expect(
      memberUpdateMessage({
        org: 'agency',
        previousStatus: 'active',
        previousSubRole: 'finance',
        wasMember: true,
        nextStatus: 'inactive',
      }),
    ).toBe('Member deactivated — they no longer have access.');
  });

  it('falls back to the plain sentence when nothing it can name changed', () => {
    expect(
      memberUpdateMessage({
        org: 'agency',
        previousStatus: 'active',
        previousSubRole: 'finance',
        wasMember: true,
        nextSubRole: 'finance',
      }),
    ).toBe('Member updated');
  });
});

describe('memberRemovalMessage', () => {
  it('a removal of somebody never admitted is a decline', () => {
    expect(memberRemovalMessage('rejected')).toBe(
      'Request declined — they were not added to the team.',
    );
  });

  it('a removal of a member is a deactivation', () => {
    expect(memberRemovalMessage('inactive')).toBe(
      'Member deactivated — they no longer have access.',
    );
  });
});
