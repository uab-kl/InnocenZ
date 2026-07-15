import { Request, Response } from 'express';
import { RolePermissionRepositoryClass } from './role-permission.repository';
import { RolePermissionSchema, SyncRolePermissionSchema } from '@/schema/rbac.schema';
import { paramId } from '@/util/params';
import { getActor } from '@/util/actor';
import { Error } from '@/error/index';
import { RolePermissionFilter } from './role-permission.model';

export class RolePermissionControllerClass {
  constructor(private rolePermissionRepository: RolePermissionRepositoryClass) {}

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
      const actor = getActor(req);
      const data = await this.rolePermissionRepository.updateRolePermission(
        paramId(req.params.roleId),
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
