import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request } from 'express';

/*
 * The audit writer reads its repositories from the composition root. Faked so
 * the row `logRestMutation` would INSERT can be read back, and so no database
 * is reached: an anonymous request resolves no actor without a query.
 */
const audit = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[] }));
const compositionRoot = vi.hoisted(() => ({
  auditLogRepository: {
    createAuditLog: async (row: Record<string, unknown>) => {
      audit.rows.push(row);
      return row;
    },
  },
  authRepository: { getUserDataByToken: async () => null },
  agencyMemberRepository: { listByUser: async () => [] },
  outletMemberRepository: { listByUser: async () => [] },
  userRoleRepository: { getUserRoles: async () => [] },
  agencyRepository: {},
  outletRepository: {},
  moduleRepository: {},
  permissionRepository: {},
  rolePermissionRepository: {},
  roleRepository: {},
  userRepository: {},
}));
vi.mock('@/composition-root', () => compositionRoot);
vi.mock('@/composition-root.js', () => compositionRoot);
vi.mock('@/db/index', () => ({ db: {} }));
vi.mock('@/util/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  entityIdFromResponse,
  firstUuidParam,
  logRestMutation,
  resolveEntityFromPath,
  resolveEntityIdFromPath,
  resolveEntityIdFromRequest,
} from './audit-log.wrapper';

/**
 * `audit_logs.old_data` was NULL for 100% of UPDATE rows on EVERY entity, and
 * the cause was one line: the old-data fetchers read `req.params.id` while
 * running inside `platformAuditMiddleware`, which is mounted with
 * `v1Router.use(...)` — BEFORE any route matches, so `req.params` is `{}`.
 *
 * These test the path reader that replaced it, and the pairing that matters:
 * the entity and its id must come from the SAME segment of the same path, or a
 * fetcher is handed another resource's key.
 */
describe('resolveEntityIdFromPath', () => {
  const uuid = '3f1a2b4c-5d6e-4f70-8a91-b2c3d4e5f607';

  it('reads the id after a plain entity segment', () => {
    expect(resolveEntityIdFromPath(`/api/v1/outlet/${uuid}`)).toBe(uuid);
  });

  it('reads it under the rbac prefix, where the entity is one segment deeper', () => {
    expect(resolveEntityIdFromPath(`/api/v1/rbac/role/${uuid}`)).toBe(uuid);
  });

  it('pairs with resolveEntityFromPath on the same path', () => {
    // The property that matters: same path in, matching entity and id out.
    const path = `/api/v1/rbac/module/${uuid}`;
    expect(resolveEntityFromPath(path)).toBe('Module');
    expect(resolveEntityIdFromPath(path)).toBe(uuid);
  });

  it('refuses a sub-resource word so it is not fetched as a primary key', () => {
    // `PATCH /user/me/locale` must not look up a user whose id is "me".
    expect(resolveEntityIdFromPath('/api/v1/user/me/locale')).toBeNull();
    expect(resolveEntityIdFromPath('/api/v1/payment-voucher/mine')).toBeNull();
  });

  it('returns null on a collection write, which has no id', () => {
    expect(resolveEntityIdFromPath('/api/v1/outlet')).toBeNull();
    expect(resolveEntityIdFromPath('/api/v1/rbac/role')).toBeNull();
  });

  it('accepts a numeric id', () => {
    expect(resolveEntityIdFromPath('/api/v1/outlet/42')).toBe('42');
  });

  it('returns null when the path is not a v1 API path', () => {
    expect(resolveEntityIdFromPath(`/health/${uuid}`)).toBeNull();
    expect(resolveEntityIdFromPath('')).toBeNull();
  });

  it('ignores a trailing sub-resource after the id', () => {
    // `POST /payment-voucher/:id/export-ticket` still audits the VOUCHER.
    expect(resolveEntityIdFromPath(`/api/v1/payment-voucher/${uuid}/export-ticket`)).toBe(uuid);
  });
});

/**
 * 10,176 of 12,923 audit rows (79%) carried no `entity_id`, for two reasons the
 * route reader could not see: a param named anything but the five it knew
 * (`:voucherId`, `:receiptId`, `:disputeId`, `:outletId`), and a CREATE, whose
 * new id exists only in the response.
 */
describe('firstUuidParam — any param name', () => {
  const voucher = '3f1a2b4c-5d6e-4f70-8a91-b2c3d4e5f607';
  const line = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

  it('reads the ids the old name list missed', () => {
    expect(firstUuidParam({ voucherId: voucher })).toBe(voucher);
    expect(firstUuidParam({ receiptId: voucher })).toBe(voucher);
    expect(firstUuidParam({ outletId: voucher })).toBe(voucher);
  });

  it('takes the FIRST one, which on a nested path is the parent', () => {
    // `/payment-voucher/:id/lines/:lineId` is filed under the voucher.
    expect(firstUuidParam({ id: voucher, lineId: line })).toBe(voucher);
  });

  it('skips a param that is not a uuid', () => {
    expect(firstUuidParam({ kind: 'mine', voucherId: voucher })).toBe(voucher);
    expect(firstUuidParam({ id: 'me' })).toBeNull();
  });

  it('stores the lower-case form every existing entity_id already uses', () => {
    expect(firstUuidParam({ id: voucher.toUpperCase() })).toBe(voucher);
  });

  it('copes with no params at all, and an array param', () => {
    expect(firstUuidParam(undefined)).toBeNull();
    expect(firstUuidParam({})).toBeNull();
    expect(firstUuidParam({ id: [voucher] })).toBe(voucher);
  });
});

describe('resolveEntityIdFromRequest', () => {
  const id = '3f1a2b4c-5d6e-4f70-8a91-b2c3d4e5f607';
  const req = (over: Partial<Request>) => ({ params: {}, body: {}, ...over }) as Request;

  it('a uuid in any param wins', () => {
    expect(resolveEntityIdFromRequest(req({ params: { disputeId: id } }))).toBe(id);
  });

  it('keeps the old named-param answer for a non-uuid value', () => {
    // Numeric ids and the like must not lose the id they always had.
    expect(resolveEntityIdFromRequest(req({ params: { id: '42' } }))).toBe('42');
  });

  it('falls back to the body, as before', () => {
    expect(resolveEntityIdFromRequest(req({ body: { userId: id } }))).toBe(id);
  });

  it('survives req.params being undefined after routing unwinds', () => {
    expect(
      resolveEntityIdFromRequest({ params: undefined, body: undefined } as unknown as Request),
    ).toBeNull();
  });
});

describe('entityIdFromResponse — the id a CREATE only has afterwards', () => {
  const id = '3f1a2b4c-5d6e-4f70-8a91-b2c3d4e5f607';

  it('reads data.id from the standard envelope', () => {
    expect(entityIdFromResponse({ success: true, data: { id, status: 'open' } })).toBe(id);
  });

  it('reads id from a bare object response', () => {
    expect(entityIdFromResponse({ id })).toBe(id);
  });

  it('never picks one row out of a list', () => {
    expect(entityIdFromResponse({ success: true, data: [{ id }] })).toBeNull();
  });

  it('refuses an id that is not a uuid', () => {
    expect(entityIdFromResponse({ data: { id: 7 } })).toBeNull();
    expect(entityIdFromResponse({ data: { id: 'pending' } })).toBeNull();
    expect(entityIdFromResponse(null)).toBeNull();
  });
});

describe('logRestMutation files the row under the right id', () => {
  const created = '11111111-2222-4333-8444-555555555555';
  const voucher = '3f1a2b4c-5d6e-4f70-8a91-b2c3d4e5f607';

  beforeEach(() => {
    audit.rows = [];
  });

  function request(method: string, url: string, params: Record<string, string> = {}): Request {
    return {
      method,
      originalUrl: url,
      params,
      body: {},
      headers: { 'user-agent': 'vitest' },
      ip: '127.0.0.1',
    } as unknown as Request;
  }

  it('a successful CREATE takes the id from its response', async () => {
    await logRestMutation(request('POST', '/api/v1/shift'), 201, {}, {
      success: true,
      data: { id: created },
    });
    expect(audit.rows[0]).toMatchObject({ action: 'CREATE', entity: 'shift', entityId: created });
  });

  it('a refused CREATE does not — its response names no row it made', async () => {
    await logRestMutation(request('POST', '/api/v1/shift'), 400, {}, {
      success: false,
      data: { id: created },
    });
    expect(audit.rows[0]).toMatchObject({ action: 'CREATE_FAILED', entityId: null });
  });

  it('a route id wins over whatever the response returns', async () => {
    // `/mine/:voucherId/sign` answers with the voucher — and a sub-resource
    // route may answer with a line; the path's id is what the row is about.
    await logRestMutation(
      request('POST', `/api/v1/payment-voucher/mine/${voucher}/sign`, { voucherId: voucher }),
      200,
      {},
      { success: true, data: { id: created } },
    );
    expect(audit.rows[0]).toMatchObject({ entity: 'payment-voucher', entityId: voucher });
  });
});
