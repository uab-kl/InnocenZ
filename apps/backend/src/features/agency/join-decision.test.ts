import { describe, expect, it } from 'vitest';
import { decidedMessage, LEAVE_REJECTED_PREFIX, settledDecisionAnswer } from './join-decision';

describe('decidedMessage — a real decision answers a real sentence, never "OK"', () => {
  it('says who is now on — or off — the roster, for each of the four outcomes', () => {
    expect(decidedMessage('join', 'approved')).toBe('Request approved — they are on your roster now.');
    expect(decidedMessage('join', 'rejected')).toBe('Request declined — they were not added to your roster.');
    expect(decidedMessage('departure', 'approved')).toBe(
      'Departure approved — they are no longer on your roster.',
    );
    expect(decidedMessage('departure', 'rejected')).toBe(
      'Departure declined — they stay on your roster, and your reason was sent to them.',
    );
  });

  it('never reads like a repeat — a real decision does not say "Nothing changed"', () => {
    for (const request of ['join', 'departure'] as const) {
      for (const decision of ['approved', 'rejected'] as const) {
        expect(decidedMessage(request, decision)).not.toMatch(/Nothing changed|^OK$/);
      }
    }
  });
});

const row = (approveStatus: Parameters<typeof settledDecisionAnswer>[0]['approveStatus'], rejectReason: string | null = null) => ({
  approveStatus,
  rejectReason,
});

describe('settledDecisionAnswer — only a waiting row is decided', () => {
  it('a waiting join or departure is decided (null = go ahead)', () => {
    for (const decision of ['approved', 'rejected'] as const) {
      expect(settledDecisionAnswer(row('pending'), decision)).toBeNull();
      expect(settledDecisionAnswer(row('leave_pending'), decision)).toBeNull();
    }
  });

  it('the same decision again is a repeat: 200, and it says nothing changed', () => {
    for (const [status, decision] of [
      ['approved', 'approved'],
      ['rejected', 'rejected'],
    ] as const) {
      const answer = settledDecisionAnswer(row(status), decision);
      expect(answer?.status).toBe(200);
      expect(answer?.message).toMatch(/Nothing changed\.$/);
    }
  });

  it('a second "approve" on a departure already approved is a repeat — never a re-join', () => {
    expect(settledDecisionAnswer(row('left'), 'approved')).toEqual({
      status: 200,
      message: expect.stringMatching(/departure was already approved/),
    });
  });

  it('a second "decline" on a departure already declined is a repeat — never a rejection of the member', () => {
    expect(settledDecisionAnswer(row('approved', `${LEAVE_REJECTED_PREFIX}Shift on Friday`), 'rejected')).toEqual({
      status: 200,
      message: expect.stringMatching(/departure was already declined/),
    });
  });

  it('the opposite decision on a decided row is a 409', () => {
    for (const [status, decision] of [
      ['approved', 'rejected'],
      ['rejected', 'approved'],
      ['left', 'rejected'],
    ] as const) {
      const answer = settledDecisionAnswer(row(status), decision);
      expect(answer?.status).toBe(409);
      expect(answer?.message).toMatch(/Nothing changed\.$/);
    }
  });
});
