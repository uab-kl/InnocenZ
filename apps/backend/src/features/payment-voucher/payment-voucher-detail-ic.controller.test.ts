import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * GET /payment-voucher/:id (agency + admin detail) — `prIcMatchesProfile`.
 *
 * PV-000009 was issued with "950312-14-8821" while its PR's profile now reads
 * "960312-14-8820". The detail read says whether the two still agree so the
 * screen can warn, and pins that it does so WITHOUT shipping the profile's IC:
 * the only IC on this route stays the voucher's own `prIc`.
 *
 * `@/db/index` is stubbed and every repository is a fake — nothing here can
 * reach the shared database.
 */
vi.mock('@/db/index', () => ({ db: {} }));
vi.mock('@/db/index.js', () => ({ db: {} }));
vi.mock('@/util/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/util/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/features/notification/notify.js', () => ({
  notify: vi.fn(),
  notifyMany: vi.fn(),
}));
vi.mock('@/features/notification/notify', () => ({
  notify: vi.fn(),
  notifyMany: vi.fn(),
}));

import { PaymentVoucherControllerClass } from './payment-voucher.controller';

const VOUCHER = '7bf3962e-591e-452f-b781-edbe1cbe6ef0';
const PAYEE = 'a8a8a8a8-1111-4222-8333-944455556666';
const VOUCHER_IC = '950312-14-8821';
const PROFILE_IC = '960312-14-8820';

function voucher(overrides: Record<string, unknown> = {}) {
  return {
    id: VOUCHER,
    voucherNo: 'PV-000009',
    agencyId: 'agency-1',
    prId: PAYEE,
    userId: PAYEE,
    prName: 'Payee',
    prIc: VOUCHER_IC,
    status: 'signed',
    lines: [],
    ...overrides,
  };
}

const repo = {
  getById: vi.fn(),
  listReceipts: vi.fn(),
  listDayReviews: vi.fn(),
  getProfileIdNo: vi.fn(),
};

/** Which agencies' rosters the payee is on (`agency_pr`, any status). */
const prRepo = {
  listMembershipAgencyIds: vi.fn(),
};

const controller = new PaymentVoucherControllerClass(
  repo as never,
  {
    listByUser: vi.fn(async () => [{ agencyId: 'agency-1', status: 'active' }]),
  } as never,
  { getRolesForUserIds: vi.fn(async () => [{ roleName: 'agency' }]) } as never,
  prRepo as never,
  {} as never,
  {} as never,
);

async function getDetail() {
  const req = {
    params: { id: VOUCHER },
    body: {},
    user: { id: 'agency-user' },
    headers: {},
    header: () => undefined,
    query: {},
  } as unknown as Request;
  const out: {
    status: number;
    body: { data: Record<string, unknown> | null } | null;
  } = {
    status: 0,
    body: null,
  };
  const res = {
    status(code: number) {
      out.status = code;
      return this;
    },
    json(payload: never) {
      out.body = payload;
      return this;
    },
  } as unknown as Response;
  await controller.getById(req, res);
  return out;
}

beforeEach(() => {
  vi.clearAllMocks();
  repo.listReceipts.mockResolvedValue([]);
  repo.listDayReviews.mockResolvedValue([]);
  // By default the payee is on the voucher's own agency's roster.
  prRepo.listMembershipAgencyIds.mockResolvedValue(['agency-1']);
});

describe('voucher detail — prIcMatchesProfile', () => {
  it('is false when the issued IC differs from the profile (the PV-000009 case)', async () => {
    repo.getById.mockResolvedValue(voucher());
    repo.getProfileIdNo.mockResolvedValue(PROFILE_IC);

    const out = await getDetail();

    expect(out.status).toBe(200);
    expect(out.body?.data?.prIcMatchesProfile).toBe(false);
    expect(repo.getProfileIdNo).toHaveBeenCalledWith(PAYEE);
  });

  it('never puts the profile IC in the response', async () => {
    repo.getById.mockResolvedValue(voucher());
    repo.getProfileIdNo.mockResolvedValue(PROFILE_IC);

    const out = await getDetail();

    expect(JSON.stringify(out.body)).not.toContain(PROFILE_IC);
    // The voucher's own IC is still there, exactly as before.
    expect(out.body?.data?.prIc).toBe(VOUCHER_IC);
  });

  it('is true when only the formatting differs', async () => {
    repo.getById.mockResolvedValue(voucher({ prIc: '960312148820' }));
    repo.getProfileIdNo.mockResolvedValue(PROFILE_IC);

    const out = await getDetail();

    expect(out.body?.data?.prIcMatchesProfile).toBe(true);
  });

  it('is null when the profile has no IC — cannot tell, not "matches"', async () => {
    repo.getById.mockResolvedValue(voucher());
    repo.getProfileIdNo.mockResolvedValue(null);

    const out = await getDetail();

    expect(out.body?.data?.prIcMatchesProfile).toBeNull();
  });

  it('falls back to the legacy pr_id when user_id is missing, and is null with neither', async () => {
    repo.getById.mockResolvedValue(voucher({ userId: null }));
    repo.getProfileIdNo.mockResolvedValue(VOUCHER_IC);
    expect((await getDetail()).body?.data?.prIcMatchesProfile).toBe(true);
    expect(repo.getProfileIdNo).toHaveBeenCalledWith(PAYEE);

    repo.getProfileIdNo.mockClear();
    repo.getById.mockResolvedValue(voucher({ userId: null, prId: null }));
    expect((await getDetail()).body?.data?.prIcMatchesProfile).toBeNull();
    expect(repo.getProfileIdNo).not.toHaveBeenCalled();
  });

  it('does not read the profile for a voucher outside the caller’s agency', async () => {
    repo.getById.mockResolvedValue(voucher({ agencyId: 'agency-2' }));

    const out = await getDetail();

    expect(out.status).toBe(404);
    expect(repo.getProfileIdNo).not.toHaveBeenCalled();
  });
});

/**
 * The IC oracle. `prId` and `prIc` are both client-supplied on create/update,
 * so an agency could aim its OWN voucher at another agency's PR and guess ICs
 * until the flag turned true. The flag is only computed for a payee on the
 * voucher's agency's roster.
 */
describe('voucher detail — prIcMatchesProfile is scoped to the agency’s roster', () => {
  it('is null for a PR on another agency’s roster, even when the ICs match', async () => {
    repo.getById.mockResolvedValue(voucher({ prIc: PROFILE_IC }));
    repo.getProfileIdNo.mockResolvedValue(PROFILE_IC);
    prRepo.listMembershipAgencyIds.mockResolvedValue(['agency-2']);

    const out = await getDetail();

    expect(out.status).toBe(200);
    expect(out.body?.data?.prIcMatchesProfile).toBeNull();
    expect(prRepo.listMembershipAgencyIds).toHaveBeenCalledWith(PAYEE);
    // The stranger's profile is never even read.
    expect(repo.getProfileIdNo).not.toHaveBeenCalled();
  });

  it('is null for a payee on no roster at all', async () => {
    repo.getById.mockResolvedValue(voucher({ prIc: PROFILE_IC }));
    repo.getProfileIdNo.mockResolvedValue(PROFILE_IC);
    prRepo.listMembershipAgencyIds.mockResolvedValue([]);

    expect((await getDetail()).body?.data?.prIcMatchesProfile).toBeNull();
    expect(repo.getProfileIdNo).not.toHaveBeenCalled();
  });

  it('is true / false as before for the agency’s own PR, on any roster status', async () => {
    // A PR who has LEFT still has her agency_pr row, and still gets vouchers
    // for past weeks — the roster read counts every status.
    prRepo.listMembershipAgencyIds.mockResolvedValue(['agency-2', 'agency-1']);
    repo.getProfileIdNo.mockResolvedValue(PROFILE_IC);

    repo.getById.mockResolvedValue(voucher({ prIc: PROFILE_IC }));
    expect((await getDetail()).body?.data?.prIcMatchesProfile).toBe(true);

    repo.getById.mockResolvedValue(voucher());
    expect((await getDetail()).body?.data?.prIcMatchesProfile).toBe(false);
  });

  it('is null, not a 500, when the roster read fails', async () => {
    repo.getById.mockResolvedValue(voucher({ prIc: PROFILE_IC }));
    repo.getProfileIdNo.mockResolvedValue(PROFILE_IC);
    prRepo.listMembershipAgencyIds.mockRejectedValue(new Error('db down'));

    const out = await getDetail();

    expect(out.status).toBe(200);
    expect(out.body?.data?.prIcMatchesProfile).toBeNull();
    expect(repo.getProfileIdNo).not.toHaveBeenCalled();
  });
});
