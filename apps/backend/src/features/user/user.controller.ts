import { Request, Response } from 'express';
import { UserRepositoryClass } from './user.repository';
import { UserProfileRepositoryClass } from './user-profile/user-profile.repository';
import { UserFilter, UserSortField, UserStatus } from './user.model';
import { Error } from '@/error/index';
import { paramId } from '@/util/params';
import { getActor } from '@/util/actor';
import {
  deleteProfileImageFile,
  profileImagePublicPath,
} from '@/util/profile-image';
import {
  deletePortfolioImageFile,
  normalizePortfolioSlots,
  PORTFOLIO_SLOT_COUNT,
  portfolioSlotsToJson,
} from '@/util/portfolio-image';
import { portfolioImagePathFromFile } from '@/middlewares/upload-portfolio-image';
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
        status: req.query.status as UserStatus | undefined,
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

  async updateProfile(req: Request, res: Response) {
    try {
      const id = paramId(req.params.id);
      const actorId = req.user?.id;

      // Users may only edit their own account from the profile page for now.
      if (!actorId || actorId !== id) {
        return res.status(403).json({
          success: false,
          message: Error.UNAUTHORIZED,
          data: null,
        });
      }

      const username =
        typeof req.body?.username === 'string' ? req.body.username.trim() : '';
      if (!username || username.length < 2 || username.length > 100) {
        return res.status(400).json({
          success: false,
          message: 'Display name must be between 2 and 100 characters',
          data: null,
        });
      }

      const fullName =
        typeof req.body?.fullName === 'string' ? req.body.fullName.trim() : undefined;
      const email =
        typeof req.body?.email === 'string' ? req.body.email.trim() : undefined;

      if (fullName !== undefined && (fullName.length < 1 || fullName.length > 255)) {
        return res.status(400).json({
          success: false,
          message: 'Legal full name must be between 1 and 255 characters',
          data: null,
        });
      }
      if (email !== undefined && email.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({
          success: false,
          message: 'Enter a valid email address',
          data: null,
        });
      }

      const existingUser = await this.userRepository.getUserById(id);
      if (!existingUser) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      const actor = getActor(req);
      const updatedUser = await this.userRepository.updateUser(
        {
          username,
          ...(email !== undefined ? { email: email || null } : {}),
          updatedBy: actor,
        },
        id,
      );

      if (!updatedUser) {
        return res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
      }

      if (fullName !== undefined) {
        await this.userProfileRepository.update(id, {
          fullName,
          updatedBy: actor,
        });
      }

      const portfolioPhotos = parsePortfolioPhotosBody(req.body?.portfolioPhotos);
      const comcardHeightCm = parseOptionalInt(req.body?.comcardHeightCm);
      const comcardWeightKg = parseOptionalInt(req.body?.comcardWeightKg);

      if (
        portfolioPhotos !== undefined ||
        comcardHeightCm !== undefined ||
        comcardWeightKg !== undefined
      ) {
        let existingProfile = await this.userProfileRepository.getByUserId(id);
        if (!existingProfile) {
          existingProfile = await this.userProfileRepository.createEmpty(id, actor);
        }

        if (portfolioPhotos !== undefined) {
          const previous = normalizePortfolioSlots(existingProfile.portfolioPhotos);
          const next = normalizePortfolioSlots(portfolioPhotos);
          for (let i = 0; i < PORTFOLIO_SLOT_COUNT; i++) {
            if (previous[i] && previous[i] !== next[i]) {
              deletePortfolioImageFile(previous[i]);
            }
          }
        }

        await this.userProfileRepository.update(id, {
          ...(portfolioPhotos !== undefined
            ? { portfolioPhotos: portfolioSlotsToJson(portfolioPhotos) }
            : {}),
          ...(comcardHeightCm !== undefined ? { comcardHeightCm } : {}),
          ...(comcardWeightKg !== undefined ? { comcardWeightKg } : {}),
          updatedBy: actor,
        });
      }

      const profile = await this.userProfileRepository.getByUserId(id);

      res.status(200).json({
        success: true,
        message: 'Profile updated',
        data: withUserProfile(updatedUser, profile),
      });
    } catch (error) {
      logger.error('[UserController.updateProfile] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async uploadProfileImage(req: Request, res: Response) {
    try {
      const id = paramId(req.params.id);
      const actorId = req.user?.id;

      if (!actorId || actorId !== id) {
        return res.status(403).json({
          success: false,
          message: Error.UNAUTHORIZED,
          data: null,
        });
      }

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

  async uploadPortfolioPhoto(req: Request, res: Response) {
    try {
      const id = paramId(req.params.id);
      const actorId = req.user?.id;

      if (!actorId || actorId !== id) {
        return res.status(403).json({
          success: false,
          message: Error.UNAUTHORIZED,
          data: null,
        });
      }

      const slot = Number(req.params.slot);
      if (!Number.isInteger(slot) || slot < 0 || slot >= PORTFOLIO_SLOT_COUNT) {
        return res.status(400).json({
          success: false,
          message: `Portfolio slot must be between 0 and ${PORTFOLIO_SLOT_COUNT - 1}`,
          data: null,
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Portfolio image file is required',
          data: null,
        });
      }

      const existingUser = await this.userRepository.getUserById(id);
      if (!existingUser) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      const actor = getActor(req);
      let profile = await this.userProfileRepository.getByUserId(id);
      if (!profile) {
        profile = await this.userProfileRepository.createEmpty(id, actor);
      }

      const slots = normalizePortfolioSlots(profile.portfolioPhotos);
      deletePortfolioImageFile(slots[slot]);

      const publicPath = portfolioImagePathFromFile(id, slot, req.file);
      slots[slot] = publicPath;

      await this.userProfileRepository.update(id, {
        portfolioPhotos: portfolioSlotsToJson(slots),
        updatedBy: actor,
      });

      profile = await this.userProfileRepository.getByUserId(id);

      res.status(200).json({
        success: true,
        message: 'Portfolio photo updated',
        data: withUserProfile(existingUser, profile),
      });
    } catch (error) {
      logger.error('[UserController.uploadPortfolioPhoto] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }
}

function parseOptionalInt(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 999) return undefined;
  return Math.round(n);
}

function parsePortfolioPhotosBody(
  value: unknown,
): (string | null)[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return undefined;
  if (value.length > PORTFOLIO_SLOT_COUNT) return undefined;
  const slots: (string | null)[] = Array.from({ length: PORTFOLIO_SLOT_COUNT }, () => null);
  for (let i = 0; i < value.length; i++) {
    const item = value[i];
    if (item === null || item === '') {
      slots[i] = null;
      continue;
    }
    if (typeof item !== 'string') return undefined;
    const trimmed = item.trim();
    if (!trimmed.startsWith('/img/')) return undefined;
    slots[i] = trimmed;
  }
  return slots;
}
