import { Router } from 'express';
import { userController } from '@/composition-root.js';
import { requireAdmin } from '@/middlewares/require-role.js';
import { uploadProfileImage } from '@/middlewares/upload-profile-image';
import { uploadPortfolioImage } from '@/middlewares/upload-portfolio-image';
import { uploadComcardImage } from '@/middlewares/upload-comcard-image';

const router = Router();

// Reading OTHER people's accounts is admin-only: the only callers are the admin
// portal's user-management tables. The writes below stay ungated on purpose —
// each controller already enforces self-only, and the PR mobile app saves its
// own profile / avatar / portfolio through them.
router.get('', requireAdmin, userController.list.bind(userController));
router.patch('/:id', userController.updateProfile.bind(userController));
router.post('/:id/profile-image', (req, res, next) => {
  uploadProfileImage.single('profileImage')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, message: err.message, data: null });
    }
    next();
  });
}, userController.uploadProfileImage.bind(userController));
router.post('/:id/portfolio/:slot', (req, res, next) => {
  uploadPortfolioImage.single('portfolioPhoto')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, message: err.message, data: null });
    }
    next();
  });
}, userController.uploadPortfolioPhoto.bind(userController));
router.post('/:id/comcard-image', (req, res, next) => {
  uploadComcardImage.single('comcardImage')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, message: err.message, data: null });
    }
    next();
  });
}, userController.uploadComcardImage.bind(userController));
router.get('/:id', requireAdmin, userController.getById.bind(userController));

export default router;
