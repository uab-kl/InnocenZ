import { Router } from 'express';
import { authController, agencyRepository } from '@/composition-root.js';
import { uploadRegisterProfileImage } from '@/middlewares/upload-profile-image';
import authenticateJWT from '@/middlewares/authenticate-jwt.js';

const router = Router();

router.post('/login', authController.login.bind(authController));

/**
 * Agency names for the PR sign-up wizard. Public by necessity: a PR choosing
 * an agency has no account yet, and `GET /agency` sits below the JWT guard
 * (router/v1.ts:32). Deliberately narrow — only ACTIVE agencies, and only
 * `id` + `name`, never agencyCode / ssmNo / contact details.
 */
router.get('/agencies', async (_req, res) => {
  try {
    const { agencies } = await agencyRepository.listPaginated({
      filter: { status: 'active' },
      page: 1,
      pageSize: 200,
    });
    const data = agencies
      .map((a) => ({ id: a.id, name: a.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    res.status(200).json({ success: true, message: 'OK', data });
  } catch {
    res.status(500).json({ success: false, message: 'Could not list agencies', data: null });
  }
});
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
