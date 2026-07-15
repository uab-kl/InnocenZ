import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_PROFILE_IMAGE = '/img/blank-profile-picture.png';
export const PROFILE_IMAGE_UPLOAD_DIR = path.join(process.cwd(), 'public', 'img', 'users');
export const ALLOWED_PROFILE_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

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

export function profileImagePublicPath(filename: string): string {
  return `/img/users/${filename}`;
}

export function deleteProfileImageFile(profileImage: string | null | undefined): void {
  if (!profileImage || profileImage === DEFAULT_PROFILE_IMAGE) return;
  if (!profileImage.startsWith('/img/users/')) return;

  const filePath = path.join(process.cwd(), 'public', profileImage.replace(/^\//, ''));
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // ignore cleanup failures
  }
}

export function saveProfileImageFile(userId: string, file: Express.Multer.File): string {
  ensureProfileImageDir();
  const ext = path.extname(file.originalname).toLowerCase();
  const filename = `${userId}${ext}`;
  const filePath = path.join(PROFILE_IMAGE_UPLOAD_DIR, filename);

  if (file.buffer) {
    fs.writeFileSync(filePath, file.buffer);
  } else if (file.path) {
    fs.renameSync(file.path, filePath);
  }

  return profileImagePublicPath(filename);
}
