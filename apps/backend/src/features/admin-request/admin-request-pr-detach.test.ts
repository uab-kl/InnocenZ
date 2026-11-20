import { describe, expect, it, vi } from 'vitest';

vi.mock('@/db/index.js', () => ({ db: {} }));
vi.mock('@/db/index', () => ({ db: {} }));
vi.mock('@/util/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/util/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import type { Request, Response } from 'express';
import type { AdminRequest } from './admin-request.model';
import { AdminRequestControllerClass } from './admin-request.controller';
import type { PrDetachRequestService } from '@/features/pr-personnel/pr-detach-request';
import {
  ANSWER_WITH_APPROVE_OR_DECLINE,
  FILE_FROM_MANAGE_PR,
} from '@/features/pr-personnel/pr-detach-rules';

/**
 * The admin inbox's doors for a `pr_detach` request (owner, 20 Nov 2026):
 * Approve and Decline hand it to the PR detach service (which moves the
 * membership and tells the agency — proved in pr-detach-request.test.ts);
 * every other door refuses it in words, because each would either skip the
 * filing rules or mark it answered while detaching nobody.
 */

const REQUEST_ID = '7a1b2c3d-4e5f-4a60-8b71-c2d3e4f5a6b7';

function detachRow(overrides: Partial<AdminRequest> = {}): AdminRequest {
  return {
    id: REQUEST_ID,
    type: 'pr_detach',
    subscriberType: 'agency',
    subscriberId: '11111111-1111-4111-8111-111111111111',
    subscriberName: 'Atlas Agency',
    subjectUserId: '33333333-3333-4333-8333-333333333333',
    contactName: null,
    contactEmail: null,
    contactPhone: null,
    currentPlanId: null,
    requestedPlanId: null,
    message: null,
    remarks: null,
    status: 'pending',
    quotedAmount: null,
    contactedAt: null,
    contactedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'owner',
    updatedBy: 'owner',
    ...overrides,
  } as AdminRequest;
}

function setup(stored: AdminRequest) {
  const repository = {
    getById: vi.fn(async () => ({ ...stored })),
    claimAwaitingAnswer: vi.fn(async () => null),
    update: vi.fn(async () => ({ ...stored })),
  };
  const prDetach = {
    approve: vi.fn(async () => ({
      ok: true,
      status: 200,
      message: 'Vicky Tan is detached from Atlas Agency.',
      data: stored,
    })),
    decline: vi.fn(async () => ({
      ok: true,
      status: 200,
      message: 'Detach request declined — Vicky Tan stays on Atlas Agency.',
      data: stored,
    })),
  };
  const controller = new AdminRequestControllerClass(
    repository as never,
    { listPaginated: vi.fn(async () => ({ records: [], totalCount: 0 })) } as never,
    {} as never,
    {} as never,
    {} as never,
    prDetach as unknown as PrDetachRequestService,
  );
  return { controller, repository, prDetach };
}

type FakeRes = Response & { statusCode: number; body: { success: boolean; message: string } };

function fakeRes(): FakeRes {
  const res = {
    statusCode: 0,
    body: null as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  };
  return res as unknown as FakeRes;
}

function req(body: unknown = {}): Request {
  return { params: { id: REQUEST_ID }, body, user: { id: 'admin-1' } } as unknown as Request;
}

describe('pr_detach on the admin inbox', () => {
  it('Approve goes to the detach service and answers with its sentence', async () => {
    const ctx = setup(detachRow());
    const res = fakeRes();
    await ctx.controller.approve(req(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe('Vicky Tan is detached from Atlas Agency.');
    expect(ctx.prDetach.approve).toHaveBeenCalledTimes(1);
    // The plan-change path (and its ledger) is never touched.
    expect(ctx.repository.claimAwaitingAnswer).not.toHaveBeenCalled();
  });

  it('Decline goes to the detach service, not the generic decline', async () => {
    const ctx = setup(detachRow());
    const res = fakeRes();
    await ctx.controller.decline(req(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toMatch(/stays on Atlas Agency/);
    expect(ctx.prDetach.decline).toHaveBeenCalledTimes(1);
    expect(ctx.repository.claimAwaitingAnswer).not.toHaveBeenCalled();
  });

  it('Resolve is refused — it would mark it answered and detach nobody', async () => {
    const ctx = setup(detachRow());
    const res = fakeRes();
    await ctx.controller.resolve(req(), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe(ANSWER_WITH_APPROVE_OR_DECLINE);
    expect(ctx.repository.claimAwaitingAnswer).not.toHaveBeenCalled();
    expect(ctx.prDetach.approve).not.toHaveBeenCalled();
  });

  it('re-typing a detach request into something else is refused', async () => {
    const ctx = setup(detachRow());
    const res = fakeRes();
    await ctx.controller.update(req({ type: 'contact' }), res);
    expect(res.statusCode).toBe(400);
    expect(ctx.repository.update).not.toHaveBeenCalled();
  });

  it('re-typing a contact request INTO a detach is refused', async () => {
    const ctx = setup(detachRow({ type: 'contact', subjectUserId: null }));
    const res = fakeRes();
    await ctx.controller.update(req({ type: 'pr_detach' }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe(FILE_FROM_MANAGE_PR);
    expect(ctx.repository.update).not.toHaveBeenCalled();
  });

  it('the generic create refuses type pr_detach — it is filed from Manage PR only', async () => {
    const ctx = setup(detachRow());
    const res = fakeRes();
    await ctx.controller.create(req({ type: 'pr_detach', subscriberName: 'Atlas Agency' }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe(FILE_FROM_MANAGE_PR);
  });
});
