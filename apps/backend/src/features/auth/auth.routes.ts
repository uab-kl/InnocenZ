import { Router } from 'express';
import { authController, agencyRepository, otpController } from '@/composition-root.js';
import { uploadRegisterProfileImage } from '@/middlewares/upload-profile-image';
import authenticateJWT from '@/middlewares/authenticate-jwt.js';
import optionalAuthenticateJWT from '@/middlewares/optional-authenticate-jwt.js';

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

/**
 * WhatsApp OTP send/verify. purpose=signup|forgot_password are public;
 * purpose=change_phone requires a JWT (optionalAuthenticateJWT + controller check).
 */
router.post(
  '/otp/send',
  optionalAuthenticateJWT,
  otpController.send.bind(otpController),
);
router.post('/otp/verify', otpController.verify.bind(otpController));

router.post('/forgot-password', authController.forgotPassword.bind(authController));
router.post('/reset-password', authController.resetPassword.bind(authController));
/** PR mobile: reset password with WhatsApp OTP receipt (purpose=forgot_password). */
router.post(
  '/password/reset-otp',
  authController.resetPasswordWithOtp.bind(authController),
);
router.get('/me', authenticateJWT, authController.me.bind(authController));
router.post(
  '/password/change',
  authenticateJWT,
  authController.changePassword.bind(authController),
);
router.post(
  '/phone/change',
  authenticateJWT,
  authController.changePhoneWithOtp.bind(authController),
);

// TOTP enrolment. Both require a signed-in caller and act only on THEIR OWN
// account — there is no user id in either route, so one user cannot enrol or
// confirm a factor on another's behalf.
router.post('/mfa/enroll', authenticateJWT, authController.enrollMfa.bind(authController));
router.post('/mfa/confirm', authenticateJWT, authController.confirmMfa.bind(authController));
/**
 * Serves two callers: a public sign-up with no token, and an admin creating
 * another admin with one. optionalAuthenticateJWT reads the token when it is
 * there without rejecting when it is not — the controller then decides what the
 * caller is allowed to create. It is not a guard; do not treat it as one.
 */
router.post('/register', optionalAuthenticateJWT, (req, res, next) => {
  uploadRegisterProfileImage.single('profileImage')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, message: err.message, data: null });
    }
    next();
  });
}, authController.registerUser.bind(authController));

export default router;
