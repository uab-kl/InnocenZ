import path from 'node:path';
import fs from 'node:fs';
import { env } from '@/env';
import {
  ALLOWED_PROFILE_IMAGE_EXTENSIONS,
  ensureProfileImageDir,
  PROFILE_IMAGE_UPLOAD_DIR,
  sanitizePathSegment,
  withProfileImage,
} from '@/util/profile-image';
import {
  isR2ObjectKey,
  r2Configured,
  r2DeleteStoredRef,
  r2PutObject,
} from '@/util/r2';
import { logger } from '@/util/logger';
import { userFolder } from '@/util/user-folder';
import {
  emptyUserProfileResponse,
  toUserProfileResponse,
  UserProfileType,
} from '@/features/user/user-profile/user-profile.model';
import { UserType } from '@/features/user/user.model';

export const USER_ID_DOC_UPLOAD_DIR = path.join(PROFILE_IMAGE_UPLOAD_DIR, 'id-docs');

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

export function ensureUserIdDocDir(): void {
  ensureProfileImageDir();
  fs.mkdirSync(USER_ID_DOC_UPLOAD_DIR, { recursive: true });
}

export function idDocPublicPath(userId: string, side: 'front' | 'back', ext: string): string {
  return `/img/users/id-docs/${userId}-${side}${ext}`;
}

export function isUserIdDocPath(pathname: string | null | undefined): boolean {
  return Boolean(pathname?.startsWith('/img/users/id-docs/'));
}

/** R2 key: user/{userId}/id-docs/{side}-{timestamp}{ext} */
export function idDocObjectKey(
  userId: string,
  side: 'front' | 'back',
  filename: string,
): string {
  const safeName = sanitizePathSegment(filename.replace(/\.[^.]+$/, '')) || `id-${side}`;
  const ext = path.extname(filename).toLowerCase() || '.jpg';
  return `user/${userFolder(userId)}/id-docs/${safeName}${ext}`;
}

function fileBuffer(file: Express.Multer.File): Buffer {
  if (file.buffer?.length) return file.buffer;
  if (file.path) return fs.readFileSync(file.path);
  throw new Error('ID document file has no data');
}

/**
 * Upload an ID front/back photo to Cloudflare R2 and return the **object key**.
 * Clients prepend `R2_PUBLIC_URL`. Falls back to local `/img/…` without R2.
 */
export async function saveUserIdDocFile(
  user: { id: string; fullName?: string | null | undefined },
  side: 'front' | 'back',
  file: Express.Multer.File,
): Promise<string> {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_PROFILE_IMAGE_EXTENSIONS.has(ext)) {
    throw new Error('Only JPG, PNG, and WebP images are allowed');
  }

  const body = fileBuffer(file);
  const contentType =
    file.mimetype && file.mimetype.startsWith('image/')
      ? file.mimetype
      : (CONTENT_TYPE_BY_EXT[ext] ?? 'application/octet-stream');

  if (r2Configured()) {
    const filename = `id-${side}-${Date.now()}${ext}`;
    const key = idDocObjectKey(user.id, side, filename);
    try {
      const storedKey = await r2PutObject({ key, body, contentType });
      if (file.path) {
        try {
          fs.unlinkSync(file.path);
        } catch {
          // ignore
        }
      }
      return storedKey;
    } catch (error) {
      // Configured but refused (e.g. AccessDenied) — fall through to disk. An
      // IC photo lost here cannot be re-derived; the PR would have to re-shoot it.
      logger.error('[user-profile-image] R2 upload failed — falling back to disk', error);
    }
  }

  // Local fallback (no R2_* in env).
  ensureUserIdDocDir();
  const filePath = path.join(USER_ID_DOC_UPLOAD_DIR, `${user.id}-${side}${ext}`);
  fs.writeFileSync(filePath, body);
  if (file.path && file.path !== filePath) {
    try {
      fs.unlinkSync(file.path);
    } catch {
      // ignore
    }
  }
  return idDocPublicPath(user.id, side, ext);
}

export async function deleteUserIdDocFile(
  pathname: string | null | undefined,
): Promise<void> {
  if (!pathname) return;

  if (isR2ObjectKey(pathname) || /^https?:\/\//.test(pathname)) {
    await r2DeleteStoredRef(pathname);
    return;
  }

  if (!isUserIdDocPath(pathname)) return;
  const filePath = path.join(process.cwd(), 'public', pathname.replace(/^\//, ''));
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // ignore cleanup failures
  }
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
  'city',
  'postcode',
  'state',
  'country',
  'idPhotoFront',
  'idPhotoBack',
  // Bank details (migration 0077), added the same day the columns were, because
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
    /** Clients join this with stored object keys (`user/…`) to build image URLs. */
    r2PublicUrl: env.R2_PUBLIC_URL?.replace(/\/$/, '') ?? null,
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
