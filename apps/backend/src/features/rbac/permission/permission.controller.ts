import { Request, Response } from 'express';
import { PermissionRepositoryClass } from './permission.repository';
import { PermissionType } from './permission.model';
import { PermissionSchema } from '@/schema/rbac.schema';
import { paramId } from '@/util/params';
import { getActor } from '@/util/actor';
import { Error } from '@/error/index';

function filterPermissions(
  permissions: PermissionType[],
  moduleId?: string,
  status?: string,
): PermissionType[] {
  return permissions.filter((permission) => {
    if (moduleId && permission.moduleId !== moduleId) return false;
    if (status && permission.status !== status) return false;
    return true;
  });
}

export class PermissionControllerClass {
  constructor(private permissionRepository: PermissionRepositoryClass) {}

  async getPermissions(req: Request, res: Response) {
    try {
      const permissions = filterPermissions(
        await this.permissionRepository.getAllPermissions(),
        req.query.moduleId as string | undefined,
        req.query.status as string | undefined,
      );
      res.status(200).json({ success: true, message: 'Successfully fetched permissions data', data: permissions });
    } catch {
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async getPermissionById(req: Request, res: Response) {
    try {
      const row = await this.permissionRepository.getPermissionById(paramId(req.params.id));
      if (!row) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      res.status(200).json({ success: true, message: 'OK', data: row });
    } catch {
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async createPermission(req: Request, res: Response) {
    try {
      const parsed = PermissionSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message });
      const data = await this.permissionRepository.createPermission({
        ...parsed.data,
        createdBy: getActor(req),
        updatedBy: getActor(req),
      });
      res.status(201).json({ success: true, message: 'Permission created', data });
    } catch {
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async updatePermission(req: Request, res: Response) {
    try {
      const parsed = PermissionSchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message });
      const data = await this.permissionRepository.updatePermission(paramId(req.params.id), {
        ...parsed.data,
        updatedBy: getActor(req),
      });
      if (!data) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      res.status(200).json({ success: true, message: 'Permission updated', data });
    } catch {
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async inactivePermission(req: Request, res: Response) {
    try {
      const data = await this.permissionRepository.updatePermission(paramId(req.params.id), {
        status: 'inactive',
        updatedBy: getActor(req),
      });
      if (!data) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      res.status(200).json({ success: true, message: 'Permission deactivated', data });
    } catch {
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }
}
