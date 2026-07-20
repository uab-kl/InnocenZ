import fs from 'node:fs';
import path from 'node:path';

export const PORTFOLIO_SLOT_COUNT = 8;
export const PORTFOLIO_IMAGE_UPLOAD_DIR = path.join(
  process.cwd(),
  'public',
  'img',
  'users',
  'portfolio',
);

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

export function deletePortfolioImageFile(pathname: string | null | undefined): void {
  if (!pathname || !isUserPortfolioImagePath(pathname)) return;
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
