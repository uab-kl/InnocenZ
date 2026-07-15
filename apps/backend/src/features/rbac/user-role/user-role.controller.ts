import { Request, Response } from 'express';
import { UserRoleRepositoryClass } from './user-role.repository';
import { UserRoleSchema, UpdateUserRoleSchema } from '@/schema/rbac.schema';
import { getActor } from '@/util/actor';
import { Error } from '@/error/index';

export class UserRoleControllerClass {
  constructor(private userRoleRepository: UserRoleRepositoryClass) {}

  async listUserRoles(req: Request, res: Response) {
    try {
      const userId = req.query.userId as string | undefined;
      const roleId = req.query.roleId as string | undefined;

      if (userId) {
        const data = await this.userRoleRepository.getUserRoles(userId);
        return res.status(200).json({ success: true, message: 'OK', data });
      }

      if (roleId) {
        const data = await this.userRoleRepository.getUserIdsByRoleId(roleId);
        return res.status(200).json({ success: true, message: 'OK', data });
      }

      return res.status(400).json({
        success: false,
        message: 'userId or roleId query parameter is required',
        data: null,
      });
    } catch {
      return res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async createUserRole(req: Request, res: Response) {
    try {
      const parsed = UserRoleSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }

      const actor = getActor(req);
      const data = await this.userRoleRepository.assignRoleToUser({
        ...parsed.data,
        createdBy: actor,
        updatedBy: actor,
      });

      return res.status(201).json({ success: true, message: 'Role assigned to user', data });
    } catch {
      return res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async updateUserRole(req: Request, res: Response) {
    try {
      const parsed = UpdateUserRoleSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }

      const { userId, previousRoleId, roleId } = parsed.data;
      const actor = getActor(req);

      const removed = await this.userRoleRepository.removeRoleFromUser(userId, previousRoleId);
      if (!removed) {
        return res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
      }

      const data = await this.userRoleRepository.assignRoleToUser({
        userId,
        roleId,
        createdBy: actor,
        updatedBy: actor,
      });

      return res.status(200).json({ success: true, message: 'User role updated', data });
    } catch {
      return res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }
}
