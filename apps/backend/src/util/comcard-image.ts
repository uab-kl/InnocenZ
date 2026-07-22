import fs from 'node:fs';
import path from 'node:path';

export const COMCARD_IMAGE_UPLOAD_DIR = path.join(
  process.cwd(),
  'public',
  'img',
  'users',
  'comcard',
);

export function ensureComcardImageDir(): void {
  fs.mkdirSync(COMCARD_IMAGE_UPLOAD_DIR, { recursive: true });
}

export function comcardImagePublicPath(userId: string, ext: string): string {
  return `/img/users/comcard/${userId}${ext}`;
}

export function isUserComcardImagePath(pathname: string | null | undefined): boolean {
  return Boolean(pathname?.startsWith('/img/users/comcard/'));
}

export function deleteComcardImageFile(pathname: string | null | undefined): void {
  if (!pathname || !isUserComcardImagePath(pathname)) return;
  const filePath = path.join(process.cwd(), 'public', pathname.replace(/^\//, ''));
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // ignore cleanup failures
  }
}
