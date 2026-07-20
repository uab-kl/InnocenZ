import multer from 'multer';
import path from 'node:path';
import { Request } from 'express';
import {
  ALLOWED_PROFILE_IMAGE_EXTENSIONS,
} from '@/util/profile-image';
import {
  ensurePortfolioImageDir,
  PORTFOLIO_IMAGE_UPLOAD_DIR,
  portfolioImagePublicPath,
} from '@/util/portfolio-image';
import { paramId } from '@/util/params';

const limits = { fileSize: 5 * 1024 * 1024 };

const fileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_PROFILE_IMAGE_EXTENSIONS.has(ext)) {
    cb(new Error('Only JPG, PNG, and WebP images are allowed'));
    return;
  }
  cb(null, true);
};

const portfolioImageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensurePortfolioImageDir();
    cb(null, PORTFOLIO_IMAGE_UPLOAD_DIR);
  },
  filename: (req: Request, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const userId = paramId(req.params.id);
    const slot = Number(req.params.slot);
    cb(null, `${userId}-${slot}${ext}`);
  },
});

export const uploadPortfolioImage = multer({
  storage: portfolioImageStorage,
  limits,
  fileFilter,
});

export function portfolioImagePathFromFile(
  userId: string,
  slot: number,
  file: Express.Multer.File,
): string {
  const ext = path.extname(file.originalname).toLowerCase();
  return portfolioImagePublicPath(userId, slot, ext);
}
