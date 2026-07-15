import { Request, Response } from 'express';
import { UserRepositoryClass } from './user.repository';
import { UserProfileRepositoryClass } from './user-profile/user-profile.repository';
import { UserFilter, UserSortField } from './user.model';
import { Error } from '@/error/index';
import { paramId } from '@/util/params';
import { getActor } from '@/util/actor';
import {
  deleteProfileImageFile,
  profileImagePublicPath,
} from '@/util/profile-image';
import { withUserProfile, withUserProfiles } from '@/util/user-profile-image';
import { logger } from '@/util/logger';

const SORT_FIELDS: UserSortField[] = ['CREATED_AT', 'UPDATED_AT', 'USERNAME', 'EMAIL', 'STATUS'];

const sortFieldMap: Record<UserSortField, 'email' | 'phoneNum' | 'username' | 'createdAt' | 'updatedAt'> = {
  CREATED_AT: 'createdAt',
  UPDATED_AT: 'updatedAt',
  USERNAME: 'username',
  EMAIL: 'email',
  STATUS: 'createdAt',
};

export class UserControllerClass {
  constructor(
    private userRepository: UserRepositoryClass,
    private userProfileRepository: UserProfileRepositoryClass,
  ) {}

  async list(req: Request, res: Response) {
    try {
      const page = Number(req.query.page ?? 1);
      const pageSize = Number(req.query.pageSize ?? 10);
      const sortField = String(req.query.sortField ?? 'CREATED_AT').toUpperCase() as UserSortField;
      const sortDirection = String(req.query.sortDirection ?? 'DESC').toLowerCase() === 'asc' ? 'asc' : 'desc';

      const filter: UserFilter = {
        email: req.query.email as string | undefined,
        phoneNum: req.query.phoneNum as string | undefined,
        username: req.query.username as string | undefined,
        status: req.query.status as string | undefined,
        roleId: req.query.roleId as string | undefined,
      };

      const { users, totalCount } = await this.userRepository.getUsersPaginated({
        filter,
        sort: {
          field: sortFieldMap[SORT_FIELDS.includes(sortField) ? sortField : 'CREATED_AT'],
          direction: sortDirection,
        },
        page,
        pageSize,
      });

      const profiles = await this.userProfileRepository.getByUserIds(users.map((user) => user.id));
      const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

      res.status(200).json({
        success: true,
        message: 'OK',
        data: withUserProfiles(users, profiles),
        pagination: {
          page,
          pageSize,
          totalCount,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
      });
    } catch (error) {
      logger.error('[UserController.list] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async getById(req: Request, res: Response) {
    try {
      const userId = paramId(req.params.id);
      const user = await this.userRepository.getUserById(userId);
      if (!user) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      const profile = await this.userProfileRepository.getByUserId(userId);

      res.status(200).json({
        success: true,
        message: 'OK',
        data: withUserProfile(user, profile),
      });
    } catch (error) {
      logger.error('[UserController.getById] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async uploadProfileImage(req: Request, res: Response) {
    try {
      const id = paramId(req.params.id);

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Profile image file is required',
          data: null,
        });
      }

      const existingUser = await this.userRepository.getUserById(id);
      if (!existingUser) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      const profileImage = profileImagePublicPath(req.file.filename);
      deleteProfileImageFile(existingUser.profileImage);

      const updatedUser = await this.userRepository.updateUser(
        { profileImage, updatedBy: getActor(req) },
        id,
      );

      if (!updatedUser) {
        return res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
      }

      const profile = await this.userProfileRepository.getByUserId(id);

      res.status(200).json({
        success: true,
        message: 'Profile image updated',
        data: withUserProfile(updatedUser, profile),
      });
    } catch (error) {
      logger.error('[UserController.uploadProfileImage] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }
}
