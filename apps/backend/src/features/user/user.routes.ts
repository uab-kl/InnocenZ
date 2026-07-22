import { Router } from 'express';
import { userController } from '@/composition-root.js';
import { uploadProfileImage } from '@/middlewares/upload-profile-image';
import { uploadPortfolioImage } from '@/middlewares/upload-portfolio-image';
import { uploadComcardImage } from '@/middlewares/upload-comcard-image';

const router = Router();

router.get('', userController.list.bind(userController));
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
router.get('/:id', userController.getById.bind(userController));

export default router;
