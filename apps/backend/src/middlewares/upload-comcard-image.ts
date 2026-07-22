import multer from 'multer';
import path from 'node:path';
import { Request } from 'express';
import { ALLOWED_PROFILE_IMAGE_EXTENSIONS } from '@/util/profile-image';
import {
  COMCARD_IMAGE_UPLOAD_DIR,
  comcardImagePublicPath,
  ensureComcardImageDir,
} from '@/util/comcard-image';
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

const comcardImageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureComcardImageDir();
    cb(null, COMCARD_IMAGE_UPLOAD_DIR);
  },
  filename: (req: Request, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const userId = paramId(req.params.id);
    cb(null, `${userId}${ext}`);
  },
});

export const uploadComcardImage = multer({
  storage: comcardImageStorage,
  limits,
  fileFilter,
});

export function comcardImagePathFromFile(
  userId: string,
  file: Express.Multer.File,
): string {
  const ext = path.extname(file.originalname).toLowerCase();
  return comcardImagePublicPath(userId, ext);
}
