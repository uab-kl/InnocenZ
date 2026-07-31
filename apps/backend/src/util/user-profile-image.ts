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

/**
 * Columns that must never leave the server on a user-shaped response.
 *
 * `passwordHash` is the one that matters. Until 30 Jul 2026 `GET /user` served
 * every account's bcrypt hash — the platform admin's included — to any signed-in
 * role, because `list()` and `getById()` both spread the raw row straight into
 * the payload. A live sweep on a PR token returned 10 accounts and 10 hashes.
 *
 * Stripped HERE rather than in the repository on purpose: `auth` still needs the
 * hash to verify a login, so the projection belongs at the response boundary and
 * not in the query. Both leaking endpoints funnel through this one helper, so
 * this covers the payload for the `/user/:id` route mobile uses as well.
 *
 * The lockout columns ride along because no client reads them (checked across
 * apps/web and apps/mobile) and they describe how an account is defended rather
 * than anything needed to render it.
 */
const PRIVATE_USER_FIELDS = [
  'passwordHash',
  'failedLoginAttempts',
  'lockedUntil',
  'blockedReason',
] as const;

type PublicUser<T> = Omit<T, (typeof PRIVATE_USER_FIELDS)[number]>;

function stripPrivateUserFields<T extends object>(user: T): PublicUser<T> {
  const copy = { ...user } as unknown as Record<string, unknown>;
  for (const field of PRIVATE_USER_FIELDS) {
    delete copy[field];
  }
  return copy as PublicUser<T>;
}

/**
 * Identity documents — what an outlet must not receive about the staff working
 * its venue (owner decision, 30 Jul 2026).
 *
 * Blanked rather than deleted. A venue screen reading `profile.idNo` gets null
 * and renders an empty field; deleting the keys would make the same screen
 * render `undefined` or throw on a destructure, and a privacy fix that breaks a
 * roster is a privacy fix that gets reverted.
 *
 * `fullName`, `nationality`, `gender`, `race`, `languages` and the comcard/
 * portfolio images deliberately stay: they are the profile a venue books from.
 * The line is drawn at documents that identify a person off the job.
 */
const IDENTITY_DOC_FIELDS = [
  'idType',
  'idNo',
  'dob',
  'addressLine1',
  'addressLine2',
  'postcode',
  'state',
  'country',
  'idPhotoFront',
  'idPhotoBack',
  // Bank details (migration 0076), added the same day the columns were, because
  // this list blanks what it NAMES — a sensitive field it does not name is a
  // sensitive field handed to every venue that resolves a PR's name here.
  // Where someone is paid is further off the job than their home address, not
  // nearer to it.
  'bankName',
  'bankAccountNo',
] as const;

function redactIdentityDocs<T extends object>(profile: T): T {
  const copy = { ...profile } as unknown as Record<string, unknown>;
  for (const field of IDENTITY_DOC_FIELDS) {
    copy[field] = null;
  }
  return copy as T;
}

export type UserProfileVisibility = {
  /** Blank the identity documents — set for outlet-only callers. */
  redactIdentityDocs?: boolean;
};

export function withUserProfile<T extends { id: string; profileImage: string | null }>(
  user: T,
  profile: UserProfileType | null | undefined,
  visibility: UserProfileVisibility = {},
) {
  const response = profile ? toUserProfileResponse(profile) : emptyUserProfileResponse(user.id);
  return {
    ...stripPrivateUserFields(withProfileImage(user)),
    profile: visibility.redactIdentityDocs ? redactIdentityDocs(response) : response,
  };
}

export function withUserProfiles<T extends { id: string; profileImage: string | null }>(
  users: T[],
  profiles: UserProfileType[],
  visibility: UserProfileVisibility = {},
) {
  const profileByUserId = new Map(profiles.map((profile) => [profile.userId, profile]));
  return users.map((user) => withUserProfile(user, profileByUserId.get(user.id), visibility));
}
