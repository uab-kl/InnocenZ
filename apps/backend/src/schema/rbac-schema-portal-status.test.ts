import { describe, expect, it } from 'vitest';
import {
  MODULE_PORTAL_REQUIRED,
  ModuleSchema,
  PermissionSchema,
  RoleSchema,
  UpdateModuleSchema,
  UpdatePermissionSchema,
  UpdateRoleSchema,
} from '@/schema/rbac.schema';

/**
 * The RBAC catalogue schemas (risks #25 and #26).
 *
 *  - A module MUST name its portal. `m_module_portal_key_uidx` is UNIQUE
 *    (portal_id, module_key) and NULLs never collide, so a portal-less module
 *    could twin `settings` / `dashboard` / … and be granted where it answers
 *    nobody. A PATCH may leave the portal alone but never clear it.
 *  - `status` is `active` | `inactive` and nothing else. Every server read asks
 *    for exactly `'active'`, so a typo was stored and silently switched a grant
 *    off. Create still defaults to `active`; update never invents a status.
 */

const PORTAL = '11111111-1111-4111-8111-111111111111';
const MODULE = '22222222-2222-4222-8222-222222222222';

describe('ModuleSchema — the portal is required', () => {
  it('refuses a module with no portal, in a sentence that says what to do', () => {
    const parsed = ModuleSchema.safeParse({ moduleName: 'Roster' });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe(MODULE_PORTAL_REQUIRED);
  });

  it('refuses portalId: null — what the admin form used to send for "no portal"', () => {
    const parsed = ModuleSchema.safeParse({ moduleName: 'Roster', portalId: null });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe(MODULE_PORTAL_REQUIRED);
  });

  it('refuses a portal that is not a uuid', () => {
    const parsed = ModuleSchema.safeParse({ moduleName: 'Roster', portalId: 'agency' });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe(MODULE_PORTAL_REQUIRED);
  });

  it('accepts a module on a portal, and defaults it to active', () => {
    const parsed = ModuleSchema.safeParse({
      moduleName: 'Roster',
      moduleKey: 'Roster',
      portalId: PORTAL,
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual({
      moduleName: 'Roster',
      moduleKey: 'roster',
      portalId: PORTAL,
      status: 'active',
    });
  });
});

describe('UpdateModuleSchema — may keep the portal, never clear it', () => {
  it('accepts a PATCH that does not mention the portal', () => {
    const parsed = UpdateModuleSchema.safeParse({ moduleName: 'Roster v2' });
    expect(parsed.success).toBe(true);
    expect(parsed.data).not.toHaveProperty('portalId');
    expect(parsed.data).not.toHaveProperty('status');
  });

  it('refuses portalId: null', () => {
    const parsed = UpdateModuleSchema.safeParse({ portalId: null });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe(MODULE_PORTAL_REQUIRED);
  });

  it('accepts moving a module to another portal', () => {
    expect(UpdateModuleSchema.safeParse({ portalId: PORTAL }).success).toBe(true);
  });
});

describe('status — active or inactive, nothing else', () => {
  const creates = [
    ['RoleSchema', RoleSchema, { roleName: 'Floor Manager', portalId: PORTAL }],
    ['ModuleSchema', ModuleSchema, { moduleName: 'Roster', portalId: PORTAL }],
    [
      'PermissionSchema',
      PermissionSchema,
      { moduleId: MODULE, permissionType: 'read', description: 'read Roster' },
    ],
  ] as const;

  for (const [name, schema, body] of creates) {
    it(`${name} defaults status to active on create`, () => {
      const parsed = schema.safeParse(body);
      expect(parsed.success).toBe(true);
      expect((parsed.data as { status: string }).status).toBe('active');
    });

    it(`${name} accepts inactive`, () => {
      const parsed = schema.safeParse({ ...body, status: 'inactive' });
      expect(parsed.success).toBe(true);
      expect((parsed.data as { status: string }).status).toBe('inactive');
    });

    for (const typo of ['Active', 'enabled', 'disabled', '']) {
      it(`${name} refuses status '${typo}' with a sentence naming both values`, () => {
        const parsed = schema.safeParse({ ...body, status: typo });
        expect(parsed.success).toBe(false);
        expect(parsed.error?.issues[0]?.message).toBe(
          "Status must be 'active' or 'inactive'.",
        );
      });
    }
  }

  const updates = [
    ['UpdateRoleSchema', UpdateRoleSchema],
    ['UpdateModuleSchema', UpdateModuleSchema],
    ['UpdatePermissionSchema', UpdatePermissionSchema],
  ] as const;

  for (const [name, schema] of updates) {
    it(`${name} never invents a status`, () => {
      const parsed = schema.safeParse({});
      expect(parsed.success).toBe(true);
      expect(parsed.data).not.toHaveProperty('status');
    });

    it(`${name} accepts a deactivation`, () => {
      const parsed = schema.safeParse({ status: 'inactive' });
      expect(parsed.success).toBe(true);
      expect(parsed.data).toEqual({ status: 'inactive' });
    });

    it(`${name} refuses a status typo`, () => {
      const parsed = schema.safeParse({ status: 'Inactive' });
      expect(parsed.success).toBe(false);
      expect(parsed.error?.issues[0]?.message).toBe(
        "Status must be 'active' or 'inactive'.",
      );
    });
  }
});

describe('RoleSchema — a portal-less role is still allowed', () => {
  it('accepts portalId: null (the mobile PR role has no portal by design)', () => {
    const parsed = RoleSchema.safeParse({ roleName: 'pr', portalId: null });
    expect(parsed.success).toBe(true);
  });
});
