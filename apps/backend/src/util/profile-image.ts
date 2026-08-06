import fs from 'node:fs';
import path from 'node:path';
import {
  isR2ObjectKey,
  r2Configured,
  r2DeleteStoredRef,
  r2PutObject,
} from '@/util/r2';

export const DEFAULT_PROFILE_IMAGE = '/img/blank-profile-picture.png';
export const PROFILE_IMAGE_UPLOAD_DIR = path.join(process.cwd(), 'public', 'img', 'users');
export const ALLOWED_PROFILE_IMAGE_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
]);

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

export function ensureProfileImageDir(): void {
  fs.mkdirSync(PROFILE_IMAGE_UPLOAD_DIR, { recursive: true });
}

export function resolveProfileImage(profileImage: string | null | undefined): string {
  return profileImage || DEFAULT_PROFILE_IMAGE;
}

export function withProfileImage<T extends { profileImage: string | null }>(
  user: T,
): Omit<T, 'profileImage'> & { profileImage: string } {
  return { ...user, profileImage: resolveProfileImage(user.profileImage) };
}

/** @deprecated Prefer saveProfileImageFile — kept for callers that only need a path shape. */
export function profileImagePublicPath(filename: string): string {
  return `/img/users/${filename}`;
}

/** Sanitize username for an R2 path segment (no slashes / weird chars). */
export function sanitizePathSegment(value: string): string {
  const cleaned = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return cleaned || 'user';
}

/**
 * R2 key for any account's avatar (admin / agency / outlet / PR):
 *   user/{userId}_{name}/profile/{filename}
 */
export function profileImageObjectKey(
  userId: string,
  fullName: string,
  filename: string,
): string {
  const folder = `${userId}_${sanitizePathSegment(fullName)}`;
  const safeName = sanitizePathSegment(filename.replace(/\.[^.]+$/, '')) || 'avatar';
  const ext = path.extname(filename).toLowerCase() || '.jpg';
  return `user/${folder}/profile/${safeName}${ext}`;
}

function fileBuffer(file: Express.Multer.File): Buffer {
  if (file.buffer?.length) return file.buffer;
  if (file.path) return fs.readFileSync(file.path);
  throw new Error('Profile image file has no data');
}

/**
 * Upload a profile image to Cloudflare R2 and return the **object key**.
 * Same path for every role. Clients prepend `R2_PUBLIC_URL`.
 * Falls back to local `/img/…` when R2 is not configured.
 */
export async function saveProfileImageFile(
  user: { id: string; fullName: string | null | undefined },
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
    // Unique name so clients don't keep showing a cached previous avatar.
    const filename = `avatar-${Date.now()}${ext}`;
    const key = profileImageObjectKey(user.id, user.fullName ?? 'user', filename);
    const storedKey = await r2PutObject({ key, body, contentType });
    // Clean up multer temp file if disk storage was used.
    if (file.path) {
      try {
        fs.unlinkSync(file.path);
      } catch {
        // ignore
      }
    }
    return storedKey;
  }

  // Local fallback (no R2_* in env).
  ensureProfileImageDir();
  const filename = `${user.id}${ext}`;
  const filePath = path.join(PROFILE_IMAGE_UPLOAD_DIR, filename);
  fs.writeFileSync(filePath, body);
  if (file.path && file.path !== filePath) {
    try {
      fs.unlinkSync(file.path);
    } catch {
      // ignore
    }
  }
  return profileImagePublicPath(filename);
}

export async function deleteProfileImageFile(
  profileImage: string | null | undefined,
): Promise<void> {
  if (!profileImage || profileImage === DEFAULT_PROFILE_IMAGE) return;

  // R2 object key or legacy full public URL.
  if (isR2ObjectKey(profileImage) || /^https?:\/\//.test(profileImage)) {
    await r2DeleteStoredRef(profileImage);
    return;
  }

  // Legacy local path /img/users/<file>
  if (!profileImage.startsWith('/img/users/')) return;
  const filePath = path.join(process.cwd(), 'public', profileImage.replace(/^\//, ''));
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // ignore cleanup failures
  }
}
