import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `PATCH /agency/:id/prs/:userId/approval` against recording fakes — no query
 * can reach the shared database, and no gate is probed with a write.
 *
 * Pins the 29 Sep 2026 follow-ups:
 *  - a join is decided ONCE: a repeat (or the losing half of a double-click) is
 *    answered without a second write or a second "You were accepted";
 *  - a second click on a DEPARTURE never falls into join semantics (it used to
 *    put a PR who had left back on the roster, or reject a current member);
 *  - accepting a PR never stores their username as the legal name.
 */

vi.mock('@/db/index', () => ({ db: {} }));
vi.mock('@/db/index.js', () => ({ db: {} }));
vi.mock('@/util/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/util/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/util/r2', () => ({
  r2DeleteStoredRef: vi.fn(),
  r2Configured: vi.fn(() => false),
  r2PutObject: vi.fn(),
  r2GetObject: vi.fn(),
  r2KeyFromSignedUrl: vi.fn(),
  r2KeyFromStoredRef: vi.fn(),
  r2SignedGetUrl: vi.fn(),
  isSensitiveR2Key: vi.fn(() => false),
}));
const h = vi.hoisted(() => ({ notify: vi.fn() }));
vi.mock('@/features/notification/notify', () => ({ notify: h.notify, notifyMany: vi.fn() }));
vi.mock('@/features/notification/notify.js', () => ({ notify: h.notify, notifyMany: vi.fn() }));

import { AgencyControllerClass } from './agency.controller';
import { LEAVE_REJECTED_PREFIX } from './join-decision';

const AGENCY = '11111111-1111-4111-8111-111111111111';
const PR = '33333333-3333-4333-8333-333333333333';

type LinkRow = {
  id: string;
  agencyId: string;
  userId: string;
  approveStatus: string;
  tier: string;
  rejectReason: string | null;
};

/** ONE stored `agency_pr` row whose status the fake conditional write reads and moves. */
function agencyPrRepo(start: Partial<LinkRow>) {
  const stored = {
    row: {
      id: 'link-1',
      agencyId: AGENCY,
      userId: PR,
      approveStatus: 'pending',
      tier: 'tier_2',
      rejectReason: null,
      ...start,
    } as LinkRow,
  };
  return {
    stored,
    listByUser: vi.fn(async () => [{ ...stored.row }]),
    listLeaveBlockers: vi.fn(async () => [] as string[]),
    // The same test the real UPDATE … WHERE approve_status = from applies.
    setApproveStatus: vi.fn(
      async (
        _agencyId: string,
        _userId: string,
        approveStatus: string,
        _actor: string,
        rejectReason?: string | null,
        opts: { from?: string } = {},
      ) => {
        if (opts.from && stored.row.approveStatus !== opts.from) return null;
        stored.row = {
          ...stored.row,
          approveStatus,
          rejectReason: rejectReason !== undefined ? rejectReason?.trim() || null : null,
        };
        return { ...stored.row };
      },
    ),
  };
}

function setup(start: Partial<LinkRow>, profile: { fullName: string | null; idNo: string | null } | null = null) {
  const links = agencyPrRepo(start);
  const prRepository = { ensureOpsBridge: vi.fn(async () => ({ id: PR })) };
  const userRepository = {
    getUserById: vi.fn(async () => ({ id: PR, username: 'Vicky', phoneNum: '60123456789', email: null })),
  };
  const userProfileRepository = { getByUserId: vi.fn(async () => profile) };
  const unused = {} as never;
  const controller = new AgencyControllerClass(
    { getById: vi.fn(async () => ({ id: AGENCY })) } as never,
    unused,
    links as never,
    prRepository as never,
    userRepository as never,
    userProfileRepository as never,
    unused,
    unused,
    unused,
    unused,
    unused,
    unused,
    unused,
  );
  const decide = async (approveStatus: 'approved' | 'rejected', rejectReason?: string) => {
    const out = { status: 0, body: null as null | { success: boolean; message: string } };
    const res = {
      status(code: number) {
        out.status = code;
        return res;
      },
      json(payload: { success: boolean; message: string }) {
        out.body = payload;
        return res;
      },
    } as unknown as Response;
    const req = {
      params: { id: AGENCY, userId: PR },
      body: { approveStatus, ...(rejectReason ? { rejectReason } : {}) },
      user: { id: 'owner-user' },
    } as unknown as Request;
    await controller.setAgencyPrApproval(req, res);
    return out;
  };
  return { links, prRepository, decide };
}

beforeEach(() => {
  h.notify.mockReset();
  h.notify.mockResolvedValue({ id: 'n1' });
});

describe('join decisions are made once', () => {
  it('a pending request is approved: one write, one bridge, one notice', async () => {
    const t = setup({ approveStatus: 'pending' });

    const out = await t.decide('approved');

    expect(out.status).toBe(200);
    expect(t.links.stored.row.approveStatus).toBe('approved');
    expect(t.links.setApproveStatus).toHaveBeenCalledTimes(1);
    expect(t.prRepository.ensureOpsBridge).toHaveBeenCalledTimes(1);
    expect(h.notify).toHaveBeenCalledTimes(1);
    expect(h.notify.mock.calls[0]?.[0]).toMatchObject({ title: 'You were accepted by the agency' });
  });

  it('approving an ALREADY approved member writes nothing and tells nobody (the lead)', async () => {
    const t = setup({ approveStatus: 'approved' });

    const out = await t.decide('approved');

    expect(out.status).toBe(200);
    expect(out.body?.message).toMatch(/^Already approved/);
    expect(t.links.setApproveStatus).not.toHaveBeenCalled();
    expect(t.prRepository.ensureOpsBridge).not.toHaveBeenCalled();
    expect(h.notify).not.toHaveBeenCalled();
  });

  it('a double-click that read `pending` twice approves once and notifies once', async () => {
    const t = setup({ approveStatus: 'pending' });

    const [a, b] = await Promise.all([t.decide('approved'), t.decide('approved')]);

    expect([a.status, b.status]).toEqual([200, 200]);
    // Both clicks tried; the claim let exactly one through.
    expect(t.links.setApproveStatus).toHaveBeenCalledTimes(2);
    expect(t.prRepository.ensureOpsBridge).toHaveBeenCalledTimes(1);
    expect(h.notify).toHaveBeenCalledTimes(1);
    expect([a.body?.message, b.body?.message]).toContain(
      'Request approved — they are on your roster now.',
    );
    expect(b.body?.message ?? '').toMatch(/Already approved/);
  });

  it('declining a request already approved is a 409 — the member is not rejected', async () => {
    const t = setup({ approveStatus: 'approved' });

    const out = await t.decide('rejected', 'changed our mind');

    expect(out.status).toBe(409);
    expect(t.links.stored.row.approveStatus).toBe('approved');
    expect(h.notify).not.toHaveBeenCalled();
  });

  it('approving a declined request is a 409 — they apply again instead', async () => {
    const t = setup({ approveStatus: 'rejected', rejectReason: 'not now' });

    const out = await t.decide('approved');

    expect(out.status).toBe(409);
    expect(t.links.stored.row.approveStatus).toBe('rejected');
    expect(t.prRepository.ensureOpsBridge).not.toHaveBeenCalled();
    expect(h.notify).not.toHaveBeenCalled();
  });
});

describe('departure decisions never fall into join semantics', () => {
  it('a second "approve" after the departure was approved does NOT put them back on the roster', async () => {
    const t = setup({ approveStatus: 'leave_pending' });

    await t.decide('approved');
    const again = await t.decide('approved');

    expect(again.status).toBe(200);
    expect(again.body?.message).toMatch(/departure was already approved/);
    expect(t.links.stored.row.approveStatus).toBe('left');
    expect(t.prRepository.ensureOpsBridge).not.toHaveBeenCalled();
    expect(h.notify).toHaveBeenCalledTimes(1);
    expect(h.notify.mock.calls[0]?.[0]).toMatchObject({ title: 'Your departure from the agency was approved' });
  });

  it('a second "decline" after the departure was declined does NOT reject the member', async () => {
    const t = setup({ approveStatus: 'leave_pending' });

    await t.decide('rejected', 'Shift on Friday');
    const again = await t.decide('rejected', 'Shift on Friday');

    expect(again.status).toBe(200);
    expect(again.body?.message).toMatch(/departure was already declined/);
    expect(t.links.stored.row).toMatchObject({
      approveStatus: 'approved',
      rejectReason: `${LEAVE_REJECTED_PREFIX}Shift on Friday`,
    });
    expect(h.notify).toHaveBeenCalledTimes(1);
  });

  it('a double-click on "approve departure" writes `left` once and notifies once', async () => {
    const t = setup({ approveStatus: 'leave_pending' });

    const [a, b] = await Promise.all([t.decide('approved'), t.decide('approved')]);

    expect([a.status, b.status]).toEqual([200, 200]);
    expect(t.links.stored.row.approveStatus).toBe('left');
    expect(h.notify).toHaveBeenCalledTimes(1);
  });
});

/**
 * 29 Sep 2026 follow-up: "a real join/leave decision still answers 'OK'". The
 * Approvals page prints `message` as its confirmation, so each real decision
 * answers the sentence saying what it did to the roster.
 */
describe('a real decision confirms in words, never "OK"', () => {
  it('approving a join says they are on the roster', async () => {
    const out = await setup({ approveStatus: 'pending' }).decide('approved');
    expect(out).toMatchObject({
      status: 200,
      body: { success: true, message: 'Request approved — they are on your roster now.' },
    });
  });

  it('declining a join says they were not added', async () => {
    const out = await setup({ approveStatus: 'pending' }).decide('rejected', 'Roster is full');
    expect(out).toMatchObject({
      status: 200,
      body: { success: true, message: 'Request declined — they were not added to your roster.' },
    });
  });

  it('approving a departure says they are off the roster', async () => {
    const out = await setup({ approveStatus: 'leave_pending' }).decide('approved');
    expect(out.body?.message).toBe('Departure approved — they are no longer on your roster.');
  });

  it('declining a departure says they stay, and that the reason reached them', async () => {
    const out = await setup({ approveStatus: 'leave_pending' }).decide('rejected', 'Shift on Friday');
    expect(out.body?.message).toBe(
      'Departure declined — they stay on your roster, and your reason was sent to them.',
    );
  });
});

describe('accepting a PR never invents a legal name', () => {
  it('a PR with NO legal name on file: the bridge is not handed the username as one', async () => {
    const t = setup({ approveStatus: 'pending' }, { fullName: null, idNo: null });

    await t.decide('approved');

    const [bridge] = t.prRepository.ensureOpsBridge.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(bridge).not.toHaveProperty('name');
    expect(Object.values(bridge)).not.toContain('PR');
    expect(bridge.tier).toBe('tier_2');
  });

  it('a PR WITH a legal name: it is not re-written either — the approval has no business with it', async () => {
    const t = setup({ approveStatus: 'pending' }, { fullName: '  Test Legal Name ', idNo: 'TEST-IC-0001' });

    await t.decide('approved');

    const [bridge] = t.prRepository.ensureOpsBridge.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(bridge).not.toHaveProperty('name');
  });
});
