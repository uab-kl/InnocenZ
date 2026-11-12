import { Request, Response } from 'express';
import { eq, inArray } from 'drizzle-orm';
import { RolePermissionRepositoryClass } from './role-permission.repository';
import { RolePermissionSchema, SyncRolePermissionSchema } from '@/schema/rbac.schema';
import { paramId } from '@/util/params';
import { getActor } from '@/util/actor';
import { Error } from '@/error/index';
import { db } from '@/db/index';
import { RoleTable } from '@/features/rbac/role/role.model';
import { PortalTable } from '@/features/rbac/portal/portal.model';
import { PermissionTable } from '@/features/rbac/permission/permission.model';
import { ModuleTable } from '@/features/rbac/module/module.model';
import { RolePermissionTable } from './role-permission.model';

/**
 * What the portal guard needs to know about one grant request.
 *
 * `role` is null when the id names no role. `permissions` holds only the ids
 * that exist; `alreadyHeld` is the role's current grant set.
 */
export type GrantPortalFacts = {
  role: { portalId: string | null; portalCode: string | null } | null;
  permissions: ReadonlyArray<{
    permissionId: string;
    moduleKey: string;
    modulePortalId: string | null;
    modulePortalCode: string | null;
  }>;
  alreadyHeld: ReadonlySet<string>;
};

export type GrantRefusal = { status: 400 | 404; message: string };

/**
 * MAY THIS ROLE BE GIVEN THESE PERMISSIONS? Null when yes, else the refusal.
 *
 * ⚠️ An agency or outlet role may only hold permissions on its OWN portal's
 * modules. `settings`, `dashboard`, `history`, `billing` and `special_service`
 * are each a separate module row per portal, so the admin role-sheet's
 * client-side portal filter was the only thing keeping an outlet `settings`
 * grant off an agency role — and the API took one straight from a request.
 * `roleHasPermission` and `/auth/me` both ignore such a grant, so it could
 * only ever be a row that looks like access and is not.
 *
 * Two kinds of role are exempt, because their cross-portal grants are BY
 * DESIGN (36 admin + 4 PR rows live): the admin-portal role (booking and
 * rating on outlet modules, roster and payment_voucher on agency ones) and a
 * portal-less role such as the mobile PR role.
 *
 * Only NEWLY added grants are judged. The sync endpoint replaces the whole set
 * and the role-sheet deliberately carries grants it does not render
 * (`outsidePortalIds`) — refusing one of those would make the role unsavable
 * from the screen with no box the admin could untick.
 */
export function crossPortalGrantRefusal(
  facts: GrantPortalFacts,
  requestedIds: readonly string[],
): GrantRefusal | null {
  const { role } = facts;
  if (!role) return { status: 404, message: 'Role not found.' };

  const known = new Map(facts.permissions.map((p) => [p.permissionId, p]));
  const unknown = [...new Set(requestedIds)].filter((id) => !known.has(id));
  if (unknown.length > 0) {
    return {
      status: 400,
      message: `No such permission: ${unknown.join(', ')}. Reload the role and try again.`,
    };
  }

  if (role.portalId === null || role.portalCode === 'admin') return null;

  const foreign = [
    ...new Set(
      requestedIds
        .filter((id) => !facts.alreadyHeld.has(id))
        .map((id) => known.get(id)!)
        .filter((p) => p.modulePortalId !== role.portalId)
        .map((p) => `${p.moduleKey} (${p.modulePortalCode ?? 'no portal'})`),
    ),
  ];
  if (foreign.length === 0) return null;

  const portal = role.portalCode ?? 'this';
  const article = /^[aeiou]/i.test(portal) ? 'An' : 'A';
  return {
    status: 400,
    message: `${article} ${portal} role can only be given ${portal} modules — ${foreign.join(', ')} belong${foreign.length === 1 ? 's' : ''} to another portal.`,
  };
}

/** Reads the facts `crossPortalGrantRefusal` judges. Read-only. */
export async function loadGrantPortalFacts(
  roleId: string,
  permissionIds: readonly string[],
): Promise<GrantPortalFacts> {
  const [role] = await db
    .select({ portalId: RoleTable.portalId, portalCode: PortalTable.code })
    .from(RoleTable)
    .leftJoin(PortalTable, eq(PortalTable.id, RoleTable.portalId))
    .where(eq(RoleTable.id, roleId))
    .limit(1);
  if (!role) return { role: null, permissions: [], alreadyHeld: new Set() };

  const ids = [...new Set(permissionIds)];
  const permissions =
    ids.length === 0
      ? []
      : await db
          .select({
            permissionId: PermissionTable.id,
            moduleKey: ModuleTable.moduleKey,
            modulePortalId: ModuleTable.portalId,
            modulePortalCode: PortalTable.code,
          })
          .from(PermissionTable)
          .innerJoin(ModuleTable, eq(ModuleTable.id, PermissionTable.moduleId))
          .leftJoin(PortalTable, eq(PortalTable.id, ModuleTable.portalId))
          .where(inArray(PermissionTable.id, ids));
  const held = await db
    .select({ permissionId: RolePermissionTable.permissionId })
    .from(RolePermissionTable)
    .where(eq(RolePermissionTable.roleId, roleId));

  return {
    role,
    permissions,
    alreadyHeld: new Set(held.map((h) => h.permissionId)),
  };
}

export class RolePermissionControllerClass {
  constructor(
    private rolePermissionRepository: RolePermissionRepositoryClass,
    private loadFacts: typeof loadGrantPortalFacts = loadGrantPortalFacts,
  ) {}

  async getRolePermissions(req: Request, res: Response) {
    try {
      const roleId = req.query.roleId as string | undefined;
      if (!roleId) {
        return res.status(400).json({
          success: false,
          message: 'roleId query parameter is required',
          data: null,
        });
      }

      const data = await this.rolePermissionRepository.getRolePermissions(roleId);
      res.status(200).json({ success: true, message: 'OK', data });
    } catch {
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async assignPermissionsToRole(req: Request, res: Response) {
    try {
      const parsed = RolePermissionSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message });
      const refusal = crossPortalGrantRefusal(
        await this.loadFacts(parsed.data.roleId, [parsed.data.permissionId]),
        [parsed.data.permissionId],
      );
      if (refusal) {
        return res.status(refusal.status).json({ success: false, message: refusal.message, data: null });
      }
      const actor = getActor(req);
      const data = await this.rolePermissionRepository.assignPermissionsToRole({
        ...parsed.data,
        createdBy: actor,
        updatedBy: actor,
      });
      res.status(201).json({ success: true, message: 'Permissions assigned to role', data });
    } catch {
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async updateRolePermissions(req: Request, res: Response) {
    try {
      const parsed = SyncRolePermissionSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message });
      const roleId = paramId(req.params.roleId);
      // Judged BEFORE the sync, which deletes first: a refused request must
      // leave the role's grants exactly as they were.
      const refusal = crossPortalGrantRefusal(
        await this.loadFacts(roleId, parsed.data.permissionIds),
        parsed.data.permissionIds,
      );
      if (refusal) {
        return res.status(refusal.status).json({ success: false, message: refusal.message, data: null });
      }
      const actor = getActor(req);
      const data = await this.rolePermissionRepository.updateRolePermission(
        roleId,
        parsed.data.permissionIds,
        actor,
        actor,
      );
      res.status(200).json({ success: true, message: 'Role permissions synced', data });
    } catch {
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async removeAllPermissionsFromRole(req: Request, res: Response) {
    try {
      const roleId = paramId(req.params.roleId);
      const data = await this.rolePermissionRepository.removeAllPermissionsFromRole(roleId);
      res.status(200).json({ success: true, message: 'All permissions removed from role', data });
    } catch {
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }
}
