import { Request, Response } from 'express';
import { UserRepositoryClass } from './user.repository';
import { UserProfileRepositoryClass } from './user-profile/user-profile.repository';
import { UserFilter, UserSortField, UserStatus, userStatusValues } from './user.model';
import { Error } from '@/error/index';
import { paramId } from '@/util/params';
import { getActor } from '@/util/actor';
import {
  deleteProfileImageFile,
  saveProfileImageFile,
} from '@/util/profile-image';
import {
  deletePortfolioImageFile,
  normalizePortfolioSlots,
  PORTFOLIO_SLOT_COUNT,
  portfolioSlotsToJson,
  savePortfolioImageFile,
} from '@/util/portfolio-image';
import { deleteComcardImageFile, saveComcardImageFile } from '@/util/comcard-image';
import { generateAndStoreComcard } from '@/util/comcard-generate';
import { saveUserIdDocFile, withUserProfile, withUserProfiles } from '@/util/user-profile-image';
import { logger } from '@/util/logger';
import { r2Configured } from '@/util/r2';

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
        // An outlet-only caller gets names and booking details, never identity
        // documents — see redact-identity-docs.ts for why this is a shape and
        // not a gate.
        data: withUserProfiles(users, profiles, {
          redactIdentityDocs: req.redactIdentityDocs,
        }),
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
        data: withUserProfile(user, profile, {
          redactIdentityDocs: req.redactIdentityDocs,
        }),
      });
    } catch (error) {
      logger.error('[UserController.getById] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /**
   * Turn an account off (or back on). Admin only.
   *
   * There was no way to do this: `updateProfile` below is self-edit only, and no
   * delete route exists anywhere, so an account — including one holding admin —
   * could never be removed or disabled once created. This is the soft-disable
   * half of that fix; `DELETE /rbac/user-role` is the other.
   *
   * It works because login ALREADY refuses a non-active account
   * (auth.controller.ts:79). Nothing else was needed to make it bite, which is
   * also why the gap was easy to miss: the enforcement was there the whole time,
   * with no way to reach the switch.
   *
   * Deliberately NOT a delete. `audit_logs`, `user_profile`, `admin_mfa` and
   * `user_role` all reference a user, and the audit trail should outlive the
   * person it describes.
   */
  async setStatus(req: Request, res: Response) {
    try {
      const id = paramId(req.params.id);
      const status = typeof req.body?.status === 'string' ? req.body.status : '';
      if (!(userStatusValues as readonly string[]).includes(status)) {
        return res.status(400).json({
          success: false,
          message: `status must be one of: ${userStatusValues.join(', ')}`,
          data: null,
        });
      }

      // An admin who disables themselves cannot re-enable themselves: the
      // endpoint that would do it is the one they just locked out of.
      if (req.user?.id === id) {
        return res.status(409).json({
          success: false,
          message: 'You cannot change your own account status — ask another admin.',
          data: null,
        });
      }

      // NOTE the argument order: this repository takes (patch, id), not (id, patch).
      const updated = await this.userRepository.updateUser(
        { status: status as UserStatus, updatedBy: getActor(req) },
        id,
      );
      if (!updated) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      logger.warn(`[UserController.setStatus] ${getActor(req)} set account ${id} to ${status}`);
      return res.status(200).json({
        success: true,
        message:
          status === 'active'
            ? 'Account re-enabled'
            : 'Account disabled — it can no longer sign in',
        data: { id, status },
      });
    } catch (error) {
      logger.error('[UserController.setStatus] Error:', error);
      return res
        .status(500)
        .json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
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
      const comcardBustCm = parseOptionalInt(req.body?.comcardBustCm);
      const comcardWaistCm = parseOptionalInt(req.body?.comcardWaistCm);
      const comcardHipCm = parseOptionalInt(req.body?.comcardHipCm);
      const languages = parseLanguagesBody(req.body?.languages);

      // Bank details (migration 0077) — the fields that decide whether the
      // payment voucher can actually be acted on by a bank.
      //
      // This route is SELF-EDIT ONLY (the 403 above), which is the property that
      // matters here: nobody can redirect someone else's pay. Clearing a field is
      // a legitimate edit, so an empty string stores NULL rather than being
      // ignored — otherwise a wrong account number could never be removed, only
      // overwritten.
      const bankNameResult = parseOptionalText(req.body?.bankName, 255, 'Bank name');
      if (!bankNameResult.ok) {
        return res.status(400).json({ success: false, message: bankNameResult.message, data: null });
      }
      const bankAccountResult = parseOptionalText(
        req.body?.bankAccountNo,
        50,
        'Bank account number',
      );
      if (!bankAccountResult.ok) {
        return res
          .status(400)
          .json({ success: false, message: bankAccountResult.message, data: null });
      }
      const bankName = bankNameResult.value;
      const bankAccountNo = bankAccountResult.value;

      if (
        portfolioPhotos !== undefined ||
        comcardHeightCm !== undefined ||
        comcardWeightKg !== undefined ||
        comcardBustCm !== undefined ||
        comcardWaistCm !== undefined ||
        comcardHipCm !== undefined ||
        languages !== undefined ||
        bankName !== undefined ||
        bankAccountNo !== undefined
      ) {
        let existingProfile = await this.userProfileRepository.getByUserId(id);
        if (!existingProfile) {
          existingProfile = await this.userProfileRepository.createEmpty(id, actor);
        }

        if (portfolioPhotos !== undefined) {
          const previous = normalizePortfolioSlots(existingProfile.portfolioPhotos);
          const next = normalizePortfolioSlots(portfolioPhotos);
          // Compare by SET, never slot by slot: a reorder moves the same file to a
          // different index, and a per-index diff reads that as "replaced" and
          // deletes both sides of a swap — the stored paths then point at objects
          // that no longer exist. Only a path that has left the gallery entirely
          // is a real removal.
          const stillReferenced = new Set(next.filter((p): p is string => Boolean(p)));
          const alreadyDeleted = new Set<string>();
          for (const previousPath of previous) {
            if (!previousPath || stillReferenced.has(previousPath)) continue;
            if (alreadyDeleted.has(previousPath)) continue;
            alreadyDeleted.add(previousPath);
            await deletePortfolioImageFile(previousPath);
          }
        }

        await this.userProfileRepository.update(id, {
          ...(portfolioPhotos !== undefined
            ? { portfolioPhotos: portfolioSlotsToJson(portfolioPhotos) }
            : {}),
          ...(comcardHeightCm !== undefined ? { comcardHeightCm } : {}),
          ...(comcardWeightKg !== undefined ? { comcardWeightKg } : {}),
          ...(comcardBustCm !== undefined ? { comcardBustCm } : {}),
          ...(comcardWaistCm !== undefined ? { comcardWaistCm } : {}),
          ...(comcardHipCm !== undefined ? { comcardHipCm } : {}),
          ...(languages !== undefined ? { languages } : {}),
          ...(bankName !== undefined ? { bankName } : {}),
          ...(bankAccountNo !== undefined ? { bankAccountNo } : {}),
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

      if (!r2Configured()) {
        return res.status(503).json({
          success: false,
          message: 'Image storage (R2) is not configured on this server',
          data: null,
        });
      }

      const existingUser = await this.userRepository.getUserById(id);
      if (!existingUser) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      const profile = await this.userProfileRepository.getByUserId(id);
      const previousImage = existingUser.profileImage;
      const profileImage = await saveProfileImageFile(
        {
          id: existingUser.id,
          fullName: profile?.fullName ?? existingUser.username,
        },
        req.file,
      );
      // Only remove the previous object when the key changed (e.g. .jpg → .png).
      // Same key is overwritten by PutObject — deleting after would wipe the new file.
      if (previousImage && previousImage !== profileImage) {
        await deleteProfileImageFile(previousImage);
      }

      const updatedUser = await this.userRepository.updateUser(
        { profileImage, updatedBy: getActor(req) },
        id,
      );

      if (!updatedUser) {
        return res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
      }

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

      if (!r2Configured()) {
        return res.status(503).json({
          success: false,
          message: 'Image storage (R2) is not configured on this server',
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
      const previousPath = slots[slot];
      const publicPath = await savePortfolioImageFile(
        { id, fullName: profile.fullName },
        slot,
        req.file,
      );
      // Only delete when the key/URL changed (e.g. .jpg → .png). Same key is overwritten.
      if (previousPath && previousPath !== publicPath) {
        await deletePortfolioImageFile(previousPath);
      }
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

  async uploadComcardImage(req: Request, res: Response) {
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
          message: 'Comcard image file is required',
          data: null,
        });
      }

      if (!r2Configured()) {
        return res.status(503).json({
          success: false,
          message: 'Image storage (R2) is not configured on this server',
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

      const previousImage = profile.comcardImage;
      const publicPath = await saveComcardImageFile(
        { id, fullName: profile.fullName },
        req.file,
      );
      if (previousImage && previousImage !== publicPath) {
        await deleteComcardImageFile(previousImage);
      }

      await this.userProfileRepository.update(id, {
        comcardImage: publicPath,
        updatedBy: actor,
      });

      profile = await this.userProfileRepository.getByUserId(id);

      res.status(200).json({
        success: true,
        message: 'Comcard image updated',
        data: withUserProfile(existingUser, profile),
      });
    } catch (error) {
      logger.error('[UserController.uploadComcardImage] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /** Build comcard from portfolio slots + overlay; store object key on profile. */
  async generateComcard(req: Request, res: Response) {
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

      if (!r2Configured()) {
        return res.status(503).json({
          success: false,
          message: 'Image storage (R2) is not configured on this server',
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
      if (!slots.some(Boolean)) {
        return res.status(400).json({
          success: false,
          message: 'Add portfolio photos before generating a comcard',
          data: null,
        });
      }

      const previousImage = profile.comcardImage;
      const storedKey = await generateAndStoreComcard({
        userId: id,
        fullName: profile.fullName,
        displayName: existingUser.username || profile.fullName || 'PR',
        dob: profile.dob,
        heightCm: profile.comcardHeightCm,
        weightKg: profile.comcardWeightKg,
        portfolioPhotos: slots,
      });
      if (previousImage && previousImage !== storedKey) {
        await deleteComcardImageFile(previousImage);
      }

      await this.userProfileRepository.update(id, {
        comcardImage: storedKey,
        updatedBy: actor,
      });

      profile = await this.userProfileRepository.getByUserId(id);

      res.status(200).json({
        success: true,
        message: 'Comcard generated',
        data: withUserProfile(existingUser, profile),
      });
    } catch (error) {
      logger.error('[UserController.generateComcard] Error:', error);
      const detail = error instanceof globalThis.Error ? error.message : '';
      const status = /sharp|R2|not configured/i.test(detail) ? 503 : 500;
      res.status(status).json({
        success: false,
        message: status === 503 && detail ? detail : Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
    }
  }

  async uploadIdDoc(req: Request, res: Response) {
    try {
      const id = paramId(req.params.id);
      const actorId = req.user?.id;
      const side = req.params.side === 'back' ? 'back' : req.params.side === 'front' ? 'front' : null;

      if (!actorId || actorId !== id) {
        return res.status(403).json({
          success: false,
          message: Error.UNAUTHORIZED,
          data: null,
        });
      }
      if (!side) {
        return res.status(400).json({
          success: false,
          message: 'ID photo side must be front or back',
          data: null,
        });
      }
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'ID photo file is required',
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

      const publicPath = saveUserIdDocFile(id, side, req.file);
      await this.userProfileRepository.update(id, {
        ...(side === 'front' ? { idPhotoFront: publicPath } : { idPhotoBack: publicPath }),
        updatedBy: actor,
      });

      profile = await this.userProfileRepository.getByUserId(id);

      res.status(200).json({
        success: true,
        message: `ID ${side} photo updated`,
        data: withUserProfile(existingUser, profile),
      });
    } catch (error) {
      logger.error('[UserController.uploadIdDoc] Error:', error);
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

/**
 * An optional free-text field: `undefined` = not supplied (leave alone),
 * `null` = explicitly cleared, a string = the trimmed value.
 *
 * Returns an Error rather than throwing or silently coercing, because the two
 * failure modes this replaces are both worse. `parseOptionalInt` above returns
 * `undefined` for an out-of-range number, i.e. it silently DISCARDS bad input —
 * acceptable for a comcard height, not for a bank account number, where quietly
 * ignoring the edit would leave the PR believing they had been paid into an
 * account they never saved.
 */
type OptionalText =
  | { ok: true; value: string | null | undefined }
  | { ok: false; message: string };

function parseOptionalText(value: unknown, maxLength: number, label: string): OptionalText {
  // NOTE: a result object, not a thrown/returned Error — `Error` in this module
  // is the project's message enum (`@/error/index`), not the global class.
  if (value === undefined) return { ok: true, value: undefined };
  if (value === null) return { ok: true, value: null };
  if (typeof value !== 'string') return { ok: false, message: `${label} must be text` };
  const trimmed = value.trim();
  if (trimmed === '') return { ok: true, value: null }; // clearing is a legitimate edit
  if (trimmed.length > maxLength) {
    return { ok: false, message: `${label} must be ${maxLength} characters or fewer` };
  }
  return { ok: true, value: trimmed };
}

/** Accepts an array of non-empty language names; caps length and dedupes. */
function parseLanguagesBody(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return undefined;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed || trimmed.length > 40) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
    if (out.length >= 20) break;
  }
  return out;
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
    // Local `/img/…`, R2 object keys `user/…`, or legacy full public URLs.
    const ok =
      trimmed.startsWith('/img/') ||
      trimmed.startsWith('user/') ||
      /^https?:\/\//.test(trimmed);
    if (!ok) return undefined;
    slots[i] = trimmed;
  }
  return slots;
}
