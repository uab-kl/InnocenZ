import { describe, expect, it, vi } from 'vitest';

// The rules import AWAITING_ANSWER from the repository, which opens the pool on
// import. Nothing here queries; the fake keeps it that way.
vi.mock('@/db/index.js', () => ({ db: {} }));

import {
  appendRemark,
  type OrphanRow,
  orphanAction,
  orphanNote,
  planOrphans,
} from './_close-orphaned-org-records-rules';

const row = (
  table: OrphanRow['table'],
  status: string,
  id = status,
): OrphanRow => ({
  table,
  id,
  status,
  orgType: 'outlet',
  orgId: '9d79b580-8abc-4d9d-ad6c-f877714f5a9b',
});

describe('orphanAction', () => {
  it('declines a request still awaiting an answer — pending or contacted', () => {
    expect(orphanAction(row('admin_request', 'pending'))).toBe('decline');
    expect(orphanAction(row('admin_request', 'contacted'))).toBe('decline');
  });

  it('leaves every answered request alone — it is the record of a decision', () => {
    for (const status of [
      'resolved',
      'approved',
      'declined',
      'direct',
      'withdrawn',
    ]) {
      expect(orphanAction(row('admin_request', status))).toBe('leave');
    }
  });

  it('cancels a live subscription — active or past_due', () => {
    expect(orphanAction(row('member_subscription', 'active'))).toBe('cancel');
    expect(orphanAction(row('member_subscription', 'past_due'))).toBe('cancel');
  });

  it('leaves a subscription that already ended — the cancelled Onyx KL row stays as it is', () => {
    expect(orphanAction(row('member_subscription', 'cancelled'))).toBe('leave');
    expect(orphanAction(row('member_subscription', 'expired'))).toBe('leave');
  });
});

describe('appendRemark', () => {
  const note = orphanNote('2026-10-22');

  it('writes the note on a row with no remarks', () => {
    expect(appendRemark(null, note)).toBe(note);
    expect(appendRemark('  ', note)).toBe(note);
  });

  it("keeps an admin's own text and adds the note under it", () => {
    expect(appendRemark('Called the owner on 12 Jul.', note)).toBe(
      `Called the owner on 12 Jul.\n${note}`,
    );
  });

  it('adds nothing the second time — a re-run leaves the text as it is', () => {
    const once = appendRemark('Called the owner.', note);
    expect(appendRemark(once, note)).toBe(once);
  });
});

describe('planOrphans', () => {
  it('sorts the 22 Oct rows into 2 declines, 0 cancels and the rest left as history', () => {
    const rows = [
      row('admin_request', 'pending', 'velvet-demo'),
      row('admin_request', 'contacted', 'bear-lounge'),
      row('admin_request', 'resolved', 'urban-soul'),
      row('admin_request', 'approved', 'onyx-kl'),
      row('admin_request', 'direct', 'atlas'),
      row('member_subscription', 'cancelled', 'onyx-kl-premier'),
    ];
    const plan = planOrphans(rows);
    expect(plan.decline.map((r) => r.id)).toEqual([
      'velvet-demo',
      'bear-lounge',
    ]);
    expect(plan.cancel).toEqual([]);
    expect(plan.leave.map((r) => r.id)).toEqual([
      'urban-soul',
      'onyx-kl',
      'atlas',
      'onyx-kl-premier',
    ]);
  });
});
