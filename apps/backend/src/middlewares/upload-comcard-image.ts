import multer from 'multer';
import path from 'node:path';
import { ALLOWED_PROFILE_IMAGE_EXTENSIONS } from '@/util/profile-image';

const limits = { fileSize: 5 * 1024 * 1024 };

const fileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_PROFILE_IMAGE_EXTENSIONS.has(ext)) {
    cb(new Error('Only JPG, PNG, and WebP images are allowed'));
    return;
  }
  cb(null, true);
};

/** Memory storage — buffer is uploaded to Cloudflare R2 in the controller. */
export const uploadComcardImage = multer({
  storage: multer.memoryStorage(),
  limits,
  fileFilter,
});
