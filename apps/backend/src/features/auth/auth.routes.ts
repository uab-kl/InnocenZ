import { Router } from 'express';
import { authController } from '@/composition-root.js';
import { uploadRegisterProfileImage } from '@/middlewares/upload-profile-image';
import authenticateJWT from '@/middlewares/authenticate-jwt.js';

const router = Router();

router.post('/login', authController.login.bind(authController));
router.post('/forgot-password', authController.forgotPassword.bind(authController));
router.post('/reset-password', authController.resetPassword.bind(authController));
router.get('/me', authenticateJWT, authController.me.bind(authController));
router.post('/register', (req, res, next) => {
  uploadRegisterProfileImage.single('profileImage')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, message: err.message, data: null });
    }
    next();
  });
}, authController.registerUser.bind(authController));

export default router;
