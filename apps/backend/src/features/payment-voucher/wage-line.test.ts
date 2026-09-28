import { describe, expect, it, vi } from 'vitest';

vi.mock('@/db/index', () => ({ db: {} }));
vi.mock('@/util/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { isWageLineFor, sealWageLine, wageLineRef, type WageSealDeps } from './wage-line.js';
import {
  checkOutProofRefusal,
  lineNeedsProof,
  linesMissingProof,
  shiftDayWindow,
  type ProofCheckLine,
} from './checkout-proof.js';

const ID = '4ff48fdd-1111-4222-8333-944455556666';
const OTHER = '9b48cae3-1111-4222-8333-944455556666';

describe('wage line identity', () => {
  it('packs the same ref the phone writes', () => {
    expect(wageLineRef(ID, 700)).toBe(`wages|checkin|700.00|${ID}|`);
  });

  it('recognises the phone line and the generator line for the same shift', () => {
    expect(isWageLineFor({ ref: wageLineRef(ID, 700), component: 'wages' }, ID)).toBe(true);
    expect(isWageLineFor({ ref: ID, component: 'wages' }, ID)).toBe(true);
  });

  it('never mistakes the same shift’s overtime, or another shift’s wage, for it', () => {
    expect(isWageLineFor({ ref: `others|checkin|0.00|${ID}-ot|`, component: 'ot' }, ID)).toBe(false);
    expect(isWageLineFor({ ref: wageLineRef(OTHER, 700), component: 'wages' }, ID)).toBe(false);
  });
});

/** Fakes that record calls — no database is touched. */
function fakeDeps(opts: {
  context?: unknown;
  draftOk?: boolean;
  lineExists?: boolean;
}): { deps: WageSealDeps; added: unknown[] } {
  const added: unknown[] = [];
  const deps = {
    shiftAssignmentRepository: {
      getOvertimeContext: vi.fn().mockResolvedValue(opts.context ?? null),
    },
    prRepository: {
      getById: vi.fn().mockResolvedValue({ id: 'u1', userId: 'u1', name: 'Vicky', icNo: null }),
    },
    paymentVoucherRepository: {
      getOrCreateCurrentWeekDraft: vi.fn().mockResolvedValue(
        opts.draftOk === false
          ? { ok: false, reason: 'already sent', existing: {} }
          : { ok: true, voucher: { id: 'v1' } },
      ),
      addLineOnce: vi.fn().mockImplementation(async (_id: string, line: unknown) => {
        added.push(line);
        return { line, created: !opts.lineExists, signatureVoided: false };
      }),
    },
  } as unknown as WageSealDeps;
  return { deps, added };
}

const completed = (over: Record<string, unknown> = {}) => ({
  assignment: {
    id: ID,
    prId: 'u1',
    userId: 'u1',
    agencyId: 'a1',
    status: 'completed',
    payAmount: '520.00',
    payRule: 'pro_rata',
    ...over,
  },
  // A Saturday shift checked out after midnight on Sunday: the line must be
  // dated Saturday and filed on Saturday's week, never Sunday's.
  shiftDate: '2026-09-26',
  slot: null,
  outletName: 'UAB Emhub',
});

describe('sealWageLine', () => {
  it('writes the sealed amount on the SHIFT’s date and week', async () => {
    const { deps, added } = fakeDeps({ context: completed() });
    const out = await sealWageLine(deps, { assignmentId: ID, actor: 'test' });
    expect(out).toMatchObject({ outcome: 'sealed', amount: '520.00' });
    expect(added[0]).toMatchObject({ lineDate: '2026-09-26', amount: '520.00', ref: wageLineRef(ID, 520) });
    expect(deps.paymentVoucherRepository.getOrCreateCurrentWeekDraft).toHaveBeenCalledWith(
      expect.objectContaining({ weekStart: '2026-09-20', weekEnd: '2026-09-26', agencyId: 'a1' }),
    );
  });

  it('answers "already" when the wage is on the voucher, writing nothing new', async () => {
    const { deps } = fakeDeps({ context: completed(), lineExists: true });
    expect(await sealWageLine(deps, { assignmentId: ID, actor: 't' })).toMatchObject({ outcome: 'already' });
  });

  it('skips a shift that is not completed, or has no figure check-out sealed', async () => {
    for (const over of [{ status: 'confirmed' }, { payRule: null }, { payAmount: '0.00' }]) {
      const { deps, added } = fakeDeps({ context: completed(over) });
      expect((await sealWageLine(deps, { assignmentId: ID, actor: 't' })).outcome).toBe('skipped');
      expect(added).toHaveLength(0);
    }
  });

  it('reports a closed week as refused, so the caller can say the money is not filed', async () => {
    const { deps } = fakeDeps({ context: completed(), draftOk: false });
    expect(await sealWageLine(deps, { assignmentId: ID, actor: 't' })).toMatchObject({ outcome: 'refused' });
  });

  it('never throws — a lookup failure is an outcome', async () => {
    const { deps } = fakeDeps({ context: completed() });
    (deps.shiftAssignmentRepository.getOvertimeContext as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('db down'),
    );
    expect(await sealWageLine(deps, { assignmentId: ID, actor: 't' })).toMatchObject({ outcome: 'refused' });
  });
});

const line = (over: Partial<ProofCheckLine>): ProofCheckLine => ({
  id: 'l1',
  ref: 'drinks|manual|120.00||',
  component: 'drink_commission',
  proofPhotos: null,
  receiptPhotos: null,
  ...over,
});

describe('check-out proof rule', () => {
  it('asks a picture of every drink or tip the PR logged', () => {
    expect(linesMissingProof([line({ id: 'd' }), line({ id: 't', ref: 'tips|scan|50.00||', component: 'tip_commission' })])).toEqual(['d', 't']);
  });

  it('accepts the line’s own picture or its receipt’s', () => {
    expect(linesMissingProof([line({ proofPhotos: ['user/x/receipts/a.jpg'] })])).toEqual([]);
    expect(linesMissingProof([line({ receiptPhotos: ['user/x/receipts/a.jpg'] })])).toEqual([]);
  });

  it('never asks for one on the wage, the overtime, a fine, or the check-in stamp', () => {
    expect(lineNeedsProof(line({ ref: wageLineRef(ID, 700), component: 'wages' }))).toBe(false);
    expect(lineNeedsProof(line({ ref: `others|checkin|0.00|${ID}-ot|`, component: 'ot' }))).toBe(false);
    expect(lineNeedsProof(line({ ref: `others|manual|0.00|${ID}-pen|`, component: 'deduction' }))).toBe(false);
    expect(lineNeedsProof(line({ ref: 'others|checkin|0.00||', component: 'other' }))).toBe(false);
  });

  it('spans the check-in day through today, in Kuala Lumpur time', () => {
    // 22:00 KL Saturday → 01:30 KL Sunday.
    expect(shiftDayWindow(new Date('2026-09-26T14:00:00Z'), new Date('2026-09-26T17:30:00Z'))).toEqual({
      fromDate: '2026-09-26',
      toDate: '2026-09-27',
    });
  });

  it('words the refusal for one and for many', () => {
    expect(checkOutProofRefusal(0)).toBeNull();
    expect(checkOutProofRefusal(1)).toMatch(/^1 logged item has no receipt picture/);
    expect(checkOutProofRefusal(3)).toMatch(/^3 logged items have/);
  });
});
