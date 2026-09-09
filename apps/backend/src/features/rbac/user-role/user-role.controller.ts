import { Request, Response } from 'express';
import { ensurePersonCode } from '@/util/member-code';
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

  /**
   * Take a role back from an account.
   *
   * `POST` had no counterpart, so a role could only ever be granted. Combined
   * with there being no way to delete or disable an account, that meant an admin
   * created by mistake — or by someone who should not have — was permanent.
   *
   * Two guards, both about the same failure: locking everybody out.
   *  - You cannot revoke your OWN role. An admin who demotes themselves cannot
   *    undo it, because the endpoint that would undo it is the one they just
   *    lost.
   *  - You cannot remove the LAST holder of a role. Emptying `admin` leaves a
   *    platform nobody can administer, with no endpoint left to repair it.
   */
  async revokeUserRole(req: Request, res: Response) {
    try {
      const userId = typeof req.body?.userId === 'string' ? req.body.userId : '';
      const roleId = typeof req.body?.roleId === 'string' ? req.body.roleId : '';
      if (!userId || !roleId) {
        return res
          .status(400)
          .json({ success: false, message: 'userId and roleId are required', data: null });
      }

      if (req.user?.id === userId) {
        return res.status(409).json({
          success: false,
          message: 'You cannot remove your own role — ask another admin to do it.',
          data: null,
        });
      }

      const holders = await this.userRoleRepository.countUsersWithRole(roleId);
      if (holders <= 1) {
        return res.status(409).json({
          success: false,
          message:
            'That is the last account holding this role — grant it to someone else before removing it.',
          data: null,
        });
      }

      const revoked = await this.userRoleRepository.revokeRole(userId, roleId);
      if (!revoked) {
        return res
          .status(404)
          .json({ success: false, message: 'That account does not hold that role', data: null });
      }
      return res.status(200).json({ success: true, message: 'Role removed', data: null });
    } catch {
      return res
        .status(500)
        .json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
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

      // Promotion creates no user row, so no creation hook fires — this is the
      // only place a newly-made admin can be given an id.
      await ensurePersonCode(parsed.data.userId);

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
