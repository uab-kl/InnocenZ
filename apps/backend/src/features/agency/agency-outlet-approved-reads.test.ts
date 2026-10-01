import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A FAILED READ OF A PARTNERSHIP IS NOT "NO PARTNERSHIP" (1 Oct 2026).
 *
 * `listApprovedAgencyIdsForOutlet` and `listApprovedOutletIdsForAgency` used to
 * answer `[]` when their query threw — the very value that means "no approved
 * link" — so every gate reading them refused with the WRONG reason ("link an
 * agency in Settings first", "not linked to this outlet") and the venue's PR
 * list came back empty. They now throw, and each caller's catch answers 500.
 * Every controller test mocks this repository, so only this file can see it
 * start swallowing again.
 */

const h = vi.hoisted(() => ({
  fail: false,
  rows: [] as Record<string, string>[],
}));

vi.mock('@/db/index', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: async () => {
          if (h.fail) throw new Error('connection reset');
          return h.rows;
        },
      }),
    }),
  },
}));
vi.mock('@/util/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { AgencyOutletRepository } from './agency-outlet.repository';

const OUTLET = '11111111-1111-4111-8111-111111111111';
const AGENCY = '44444444-4444-4444-8444-444444444444';

beforeEach(() => {
  h.fail = false;
  h.rows = [];
});

describe('a venue’s approved agencies — a failed read is an error, never "none"', () => {
  it('the ids when the read works, and [] when the venue genuinely has none', async () => {
    const repo = new AgencyOutletRepository();
    h.rows = [{ agencyId: AGENCY }];
    await expect(repo.listApprovedAgencyIdsForOutlet(OUTLET)).resolves.toEqual([AGENCY]);
    h.rows = [];
    await expect(repo.listApprovedAgencyIdsForOutlet(OUTLET)).resolves.toEqual([]);
  });

  it('a FAILED read throws — it must not read as "no approved agency"', async () => {
    h.fail = true;
    await expect(
      new AgencyOutletRepository().listApprovedAgencyIdsForOutlet(OUTLET),
    ).rejects.toThrow('connection reset');
  });
});

describe('an agency’s approved venues — the mirror read, the same rule', () => {
  it('the ids when the read works, and [] when the agency genuinely has none', async () => {
    const repo = new AgencyOutletRepository();
    h.rows = [{ outletId: OUTLET }];
    await expect(repo.listApprovedOutletIdsForAgency(AGENCY)).resolves.toEqual([OUTLET]);
    h.rows = [];
    await expect(repo.listApprovedOutletIdsForAgency(AGENCY)).resolves.toEqual([]);
  });

  it('a FAILED read throws — it must not read as "not linked to this outlet"', async () => {
    h.fail = true;
    await expect(
      new AgencyOutletRepository().listApprovedOutletIdsForAgency(AGENCY),
    ).rejects.toThrow('connection reset');
  });
});
