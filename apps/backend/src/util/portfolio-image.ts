import fs from 'node:fs';
import path from 'node:path';
import {
  ALLOWED_PROFILE_IMAGE_EXTENSIONS,
  sanitizePathSegment,
} from '@/util/profile-image';
import {
  isR2ObjectKey,
  r2Configured,
  r2DeleteStoredRef,
  r2PutObject,
} from '@/util/r2';
import { logger } from '@/util/logger';
import { userFolder } from '@/util/user-folder';

export const PORTFOLIO_SLOT_COUNT = 8;
export const PORTFOLIO_IMAGE_UPLOAD_DIR = path.join(
  process.cwd(),
  'public',
  'img',
  'users',
  'portfolio',
);

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

export function ensurePortfolioImageDir(): void {
  fs.mkdirSync(PORTFOLIO_IMAGE_UPLOAD_DIR, { recursive: true });
}

export function portfolioImagePublicPath(
  userId: string,
  slot: number,
  ext: string,
): string {
  return `/img/users/portfolio/${userId}-${slot}${ext}`;
}

export function isUserPortfolioImagePath(pathname: string | null | undefined): boolean {
  return Boolean(pathname?.startsWith('/img/users/portfolio/'));
}

/** R2 key: user/{userId}/portfolio/{filename} */
export function portfolioImageObjectKey(
  userId: string,
  filename: string,
): string {
  const safeName = sanitizePathSegment(filename.replace(/\.[^.]+$/, '')) || 'photo';
  const ext = path.extname(filename).toLowerCase() || '.jpg';
  return `user/${userFolder(userId)}/portfolio/${safeName}${ext}`;
}

function fileBuffer(file: Express.Multer.File): Buffer {
  if (file.buffer?.length) return file.buffer;
  if (file.path) return fs.readFileSync(file.path);
  throw new Error('Portfolio image file has no data');
}

/**
 * Upload a portfolio slot image to Cloudflare R2 and return the **object key**.
 * Clients prepend `R2_PUBLIC_URL`. Falls back to local `/img/…` without R2.
 */
export async function savePortfolioImageFile(
  user: { id: string; fullName: string | null | undefined },
  slot: number,
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
    // Unique object name so mobile/CDN caches invalidate on replace.
    const filename = `slot-${slot}-${Date.now()}${ext}`;
    const key = portfolioImageObjectKey(user.id, filename);
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
      // Configured but refused (e.g. AccessDenied). Falling through to disk
      // keeps the photo; letting this throw loses it — the bytes exist only in
      // this request's buffer.
      logger.error('[portfolio-image] R2 upload failed — falling back to disk', error);
    }
  }

  ensurePortfolioImageDir();
  const localName = `${user.id}-${slot}${ext}`;
  const filePath = path.join(PORTFOLIO_IMAGE_UPLOAD_DIR, localName);
  fs.writeFileSync(filePath, body);
  if (file.path && file.path !== filePath) {
    try {
      fs.unlinkSync(file.path);
    } catch {
      // ignore
    }
  }
  return portfolioImagePublicPath(user.id, slot, ext);
}

export async function deletePortfolioImageFile(
  pathname: string | null | undefined,
): Promise<void> {
  if (!pathname) return;

  if (isR2ObjectKey(pathname) || /^https?:\/\//.test(pathname)) {
    await r2DeleteStoredRef(pathname);
    return;
  }

  if (!isUserPortfolioImagePath(pathname)) return;
  const filePath = path.join(process.cwd(), 'public', pathname.replace(/^\//, ''));
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // ignore cleanup failures
  }
}

export function normalizePortfolioSlots(
  photos: (string | null)[] | string[] | null | undefined,
): (string | null)[] {
  const slots: (string | null)[] = Array.from({ length: PORTFOLIO_SLOT_COUNT }, () => null);
  if (!photos?.length) return slots;
  for (let i = 0; i < Math.min(photos.length, PORTFOLIO_SLOT_COUNT); i++) {
    const value = photos[i];
    slots[i] = value && String(value).trim() ? String(value).trim() : null;
  }
  return slots;
}

export function portfolioSlotsToJson(slots: (string | null)[]): (string | null)[] {
  return normalizePortfolioSlots(slots);
}
