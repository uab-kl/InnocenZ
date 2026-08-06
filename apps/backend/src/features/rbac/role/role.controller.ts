import { Request, Response } from 'express';
import { RoleRepositoryClass } from './role.repository';
import { RoleType } from './role.model';
import { RoleSchema } from '@/schema/rbac.schema';
import { paramId } from '@/util/params';
import { getActor } from '@/util/actor';
import { Error } from '@/error/index';

function filterRoles(roles: RoleType[], roleName?: string, status?: string): RoleType[] {
  return roles.filter((role) => {
    if (roleName && !role.roleName.toLowerCase().includes(roleName.toLowerCase())) return false;
    if (status && role.status !== status) return false;
    return true;
  });
}

const DUPLICATE_ROLE_MESSAGE =
  'A role with this name already exists in this portal. Use a different name, or pick another portal.';

export class RoleControllerClass {
  constructor(private roleRepository: RoleRepositoryClass) {}

  async getRoles(req: Request, res: Response) {
    try {
      const roles = filterRoles(
        await this.roleRepository.getAllRoles(),
        req.query.roleName as string | undefined,
        req.query.status as string | undefined,
      );
      res.status(200).json({ success: true, message: 'OK', data: roles });
    } catch {
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async getRoleById(req: Request, res: Response) {
    try {
      const role = await this.roleRepository.getRoleById(paramId(req.params.id));
      if (!role) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      res.status(200).json({ success: true, message: 'OK', data: role });
    } catch {
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async createRole(req: Request, res: Response) {
    try {
      const parsed = RoleSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message });
      }

      const portalId = parsed.data.portalId ?? null;
      const clash = await this.roleRepository.findByNameAndPortal(
        parsed.data.roleName,
        portalId,
      );
      if (clash) {
        return res.status(409).json({
          success: false,
          message: DUPLICATE_ROLE_MESSAGE,
          data: null,
        });
      }

      const data = await this.roleRepository.createRole({
        ...parsed.data,
        portalId,
        createdBy: getActor(req),
        updatedBy: getActor(req),
      });
      res.status(201).json({ success: true, message: 'Role created', data });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return res.status(409).json({
          success: false,
          message: DUPLICATE_ROLE_MESSAGE,
          data: null,
        });
      }
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async updateRole(req: Request, res: Response) {
    try {
      const parsed = RoleSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message });
      }

      const roleId = paramId(req.params.id);
      const existing = await this.roleRepository.getRoleById(roleId);
      if (!existing) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      const nextName = parsed.data.roleName ?? existing.roleName;
      const nextPortalId =
        parsed.data.portalId !== undefined ? parsed.data.portalId : existing.portalId;

      const clash = await this.roleRepository.findByNameAndPortal(
        nextName,
        nextPortalId,
        roleId,
      );
      if (clash) {
        return res.status(409).json({
          success: false,
          message: DUPLICATE_ROLE_MESSAGE,
          data: null,
        });
      }

      const data = await this.roleRepository.updateRole(roleId, {
        ...parsed.data,
        updatedBy: getActor(req),
      });
      if (!data) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      res.status(200).json({ success: true, message: 'Role updated', data });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return res.status(409).json({
          success: false,
          message: DUPLICATE_ROLE_MESSAGE,
          data: null,
        });
      }
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async inactiveRole(req: Request, res: Response) {
    try {
      const data = await this.roleRepository.updateRole(paramId(req.params.id), {
        status: 'inactive',
        updatedBy: getActor(req),
      });
      if (!data) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      res.status(200).json({ success: true, message: 'Role deactivated', data });
    } catch {
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '23505'
  );
}
