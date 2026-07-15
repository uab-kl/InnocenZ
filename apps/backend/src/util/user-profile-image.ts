import path from 'node:path';
import fs from 'node:fs';
import {
  ALLOWED_PROFILE_IMAGE_EXTENSIONS,
  ensureProfileImageDir,
  PROFILE_IMAGE_UPLOAD_DIR,
  withProfileImage,
} from '@/util/profile-image';
import {
  emptyUserProfileResponse,
  toUserProfileResponse,
  UserProfileType,
} from '@/features/user/user-profile/user-profile.model';
import { UserType } from '@/features/user/user.model';

export const USER_ID_DOC_UPLOAD_DIR = path.join(PROFILE_IMAGE_UPLOAD_DIR, 'id-docs');

export function ensureUserIdDocDir(): void {
  ensureProfileImageDir();
  fs.mkdirSync(USER_ID_DOC_UPLOAD_DIR, { recursive: true });
}

export function saveUserIdDocFile(
  userId: string,
  side: 'front' | 'back',
  file: Express.Multer.File,
): string {
  ensureUserIdDocDir();
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_PROFILE_IMAGE_EXTENSIONS.has(ext)) {
    throw new Error('Only JPG, PNG, and WebP images are allowed');
  }

  const filename = `${userId}-${side}${ext}`;
  const filePath = path.join(USER_ID_DOC_UPLOAD_DIR, filename);

  if (file.buffer) {
    fs.writeFileSync(filePath, file.buffer);
  } else if (file.path) {
    fs.renameSync(file.path, filePath);
  }

  return `/img/users/id-docs/${filename}`;
}

export function withUserProfile<T extends { id: string; profileImage: string | null }>(
  user: T,
  profile: UserProfileType | null | undefined,
) {
  return {
    ...withProfileImage(user),
    profile: profile ? toUserProfileResponse(profile) : emptyUserProfileResponse(user.id),
  };
}

export function withUserProfiles<T extends { id: string; profileImage: string | null }>(
  users: T[],
  profiles: UserProfileType[],
) {
  const profileByUserId = new Map(profiles.map((profile) => [profile.userId, profile]));
  return users.map((user) => withUserProfile(user, profileByUserId.get(user.id)));
}
