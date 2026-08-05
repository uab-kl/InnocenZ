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

export const COMCARD_IMAGE_UPLOAD_DIR = path.join(
  process.cwd(),
  'public',
  'img',
  'users',
  'comcard',
);

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

export function ensureComcardImageDir(): void {
  fs.mkdirSync(COMCARD_IMAGE_UPLOAD_DIR, { recursive: true });
}

export function comcardImagePublicPath(userId: string, ext: string): string {
  return `/img/users/comcard/${userId}${ext}`;
}

export function isUserComcardImagePath(pathname: string | null | undefined): boolean {
  return Boolean(pathname?.startsWith('/img/users/comcard/'));
}

/** R2 key: user/pr/{userId}_{fullName}/comcard/{filename} */
export function comcardImageObjectKey(
  userId: string,
  fullName: string,
  filename: string,
): string {
  const folder = `${userId}_${sanitizePathSegment(fullName)}`;
  const safeName = sanitizePathSegment(filename.replace(/\.[^.]+$/, '')) || 'comcard';
  const ext = path.extname(filename).toLowerCase() || '.jpg';
  return `user/pr/${folder}/comcard/${safeName}${ext}`;
}

function fileBuffer(file: Express.Multer.File): Buffer {
  if (file.buffer?.length) return file.buffer;
  if (file.path) return fs.readFileSync(file.path);
  throw new Error('Comcard image file has no data');
}

/**
 * Upload a comcard image to Cloudflare R2 and return the **object key**.
 * Clients prepend `R2_PUBLIC_URL`. Falls back to local `/img/…` without R2.
 */
export async function saveComcardImageFile(
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
    const filename = `comcard-${Date.now()}${ext}`;
    const key = comcardImageObjectKey(user.id, user.fullName ?? 'user', filename);
    const storedKey = await r2PutObject({ key, body, contentType });
    if (file.path) {
      try {
        fs.unlinkSync(file.path);
      } catch {
        // ignore
      }
    }
    return storedKey;
  }

  ensureComcardImageDir();
  const localName = `${user.id}${ext}`;
  const filePath = path.join(COMCARD_IMAGE_UPLOAD_DIR, localName);
  fs.writeFileSync(filePath, body);
  if (file.path && file.path !== filePath) {
    try {
      fs.unlinkSync(file.path);
    } catch {
      // ignore
    }
  }
  return comcardImagePublicPath(user.id, ext);
}

export async function deleteComcardImageFile(
  pathname: string | null | undefined,
): Promise<void> {
  if (!pathname) return;

  if (isR2ObjectKey(pathname) || /^https?:\/\//.test(pathname)) {
    await r2DeleteStoredRef(pathname);
    return;
  }

  if (!isUserComcardImagePath(pathname)) return;
  const filePath = path.join(process.cwd(), 'public', pathname.replace(/^\//, ''));
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // ignore cleanup failures
  }
}
