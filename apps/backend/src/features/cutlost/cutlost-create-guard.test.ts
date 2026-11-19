import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * ONE OPEN CUT-LOSS REQUEST PER SHIFT (12 Nov 2026).
 *
 * Only the venue's screen stopped a second request while one was pending.
 * Pinned against a fake transaction (no write gate is probed with a write):
 * the shift row is locked first, a pending request on the shift refuses, the
 * insert rides the same transaction, and the controller answers 409 with a
 * sentence. APPROVED requests on the shift do not block a new one — raising
 * several in sequence is legitimate.
 */

const h = vi.hoisted(() => ({
  steps: [] as string[],
  shift: { id: 'shift-1' } as { id: string } | null,
  pending: null as { id: string } | null,
  inserted: [] as Array<{ table: string; values: unknown }>,
}));

vi.mock('@/db/index', () => ({
  db: {
    transaction: async (cb: (tx: unknown) => Promise<unknown>) => {
      let selects = 0;
      const tx = {
        select: () => {
          selects += 1;
          const which = selects === 1 ? 'shift' : 'pending';
          return {
            from: () => ({
              where: () => ({
                for: async (strength: string) => {
                  h.steps.push(`lock-shift:${strength}`);
                  return h.shift ? [h.shift] : [];
                },
                limit: async () => {
                  h.steps.push(`read-${which}`);
                  return h.pending ? [h.pending] : [];
                },
              }),
            }),
          };
        },
        insert: (table: { [k: symbol]: unknown }) => ({
          values: (values: unknown) => {
            const name = Array.isArray(values) ? 'links' : 'request';
            h.steps.push(`insert-${name}`);
            h.inserted.push({ table: name, values });
            const done = Promise.resolve(undefined);
            return Object.assign(done, {
              returning: async () => [{ id: 'new-request', ...(values as object) }],
            });
          },
        }),
      };
      return cb(tx);
    },
  },
}));
vi.mock('@/util/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/util/org-scope', () => ({
  resolveOrgScope: vi.fn(async () => ({ isAdmin: false, outletIds: ['outlet-1'], agencyId: null })),
  isOutletCaller: vi.fn(() => true),
}));
vi.mock('@/features/notification/notify.js', () => ({ notify: vi.fn(), notifyMany: vi.fn() }));
// The REAL guard by default; the controller test below swaps one answer in.
vi.mock('./cutlost-create-guard', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('./cutlost-create-guard');
  return { ...actual, createCutlostUnlessPending: vi.fn(actual.createCutlostUnlessPending) };
});

import { PENDING_ON_SHIFT_MESSAGE, createCutlostUnlessPending } from './cutlost-create-guard';
import { CutlostControllerClass } from './cutlost.controller';

const request = {
  shiftId: 'shift-1',
  kind: 'release_prs' as const,
  status: 'pending' as const,
  slotsCut: null,
  estimatedSavings: '120.00',
  rationale: null,
  createdBy: 'outlet-owner',
  updatedBy: 'outlet-owner',
};

beforeEach(() => {
  h.steps = [];
  h.shift = { id: 'shift-1' };
  h.pending = null;
  h.inserted = [];
});

describe('createCutlostUnlessPending', () => {
  it('locks the shift FIRST, reads for a pending request, then inserts — one transaction', async () => {
    const out = await createCutlostUnlessPending(request, ['a1', 'a2', 'a1']);

    expect(out.kind).toBe('created');
    expect(h.steps).toEqual(['lock-shift:no key update', 'read-pending', 'insert-request', 'insert-links']);
    // Repeats removed before saving, as the repository always did.
    const links = h.inserted.find((i) => i.table === 'links')?.values as Array<{ assignmentId: string }>;
    expect(links.map((l) => l.assignmentId)).toEqual(['a1', 'a2']);
  });

  it('a pending request on the shift refuses — and nothing is inserted', async () => {
    h.pending = { id: 'open-request' };
    const out = await createCutlostUnlessPending(request, ['a1']);

    expect(out).toEqual({ kind: 'pending_on_shift', pendingRequestId: 'open-request' });
    expect(h.inserted).toEqual([]);
  });

  it('a cut_slots request names nobody and is still guarded by the shift check', async () => {
    h.pending = { id: 'open-cut-slots' };
    const out = await createCutlostUnlessPending({ ...request, kind: 'cut_slots', slotsCut: 2 }, []);
    expect(out.kind).toBe('pending_on_shift');
  });

  it('no assignments → only the request row', async () => {
    await createCutlostUnlessPending({ ...request, kind: 'cut_slots', slotsCut: 1 }, []);
    expect(h.steps).toEqual(['lock-shift:no key update', 'read-pending', 'insert-request']);
  });

  it('a shift deleted in between is reported, not inserted against', async () => {
    h.shift = null;
    const out = await createCutlostUnlessPending(request, []);
    expect(out.kind).toBe('shift_missing');
    expect(h.inserted).toEqual([]);
  });

  it('the refusal sentence says what to do', () => {
    expect(PENDING_ON_SHIFT_MESSAGE).toMatch(/already has a cut-loss request waiting/);
    expect(PENDING_ON_SHIFT_MESSAGE).toMatch(/Nothing was raised/);
  });
});

describe('POST /cutlost — the controller answers the refusal', () => {
  it('409 with the sentence and the open request id; the agency is not notified', async () => {
    vi.mocked(createCutlostUnlessPending).mockResolvedValueOnce({
      kind: 'pending_on_shift',
      pendingRequestId: 'open-request',
    });
    const cutlostRepository = { getById: vi.fn() };
    const controller = new CutlostControllerClass(
      cutlostRepository as never,
      { getById: vi.fn(async () => ({ id: '0b3c4f4e-4d1f-4a3c-9b0e-2a1d3c4b5e6f', outletId: 'outlet-1' })) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const res = {
      statusCode: 0,
      body: null as unknown as { success: boolean; message: string; data: unknown },
      status(code: number) {
        res.statusCode = code;
        return res;
      },
      json(payload: { success: boolean; message: string; data: unknown }) {
        res.body = payload;
        return res;
      },
    };
    await controller.create(
      {
        body: { shiftId: '0b3c4f4e-4d1f-4a3c-9b0e-2a1d3c4b5e6f', kind: 'cut_slots', slotsCut: 1 },
        user: { id: 'outlet-owner' },
      } as unknown as Request,
      res as unknown as Response,
    );

    expect(res.statusCode).toBe(409);
    expect(res.body.message).toBe(PENDING_ON_SHIFT_MESSAGE);
    expect(res.body.data).toEqual({ pendingRequestId: 'open-request' });
    expect(cutlostRepository.getById).not.toHaveBeenCalled();
  });
});
