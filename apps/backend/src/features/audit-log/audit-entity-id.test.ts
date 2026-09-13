import { describe, expect, it } from 'vitest';
import {
  resolveEntityFromPath,
  resolveEntityIdFromPath,
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
