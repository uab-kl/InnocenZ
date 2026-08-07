import { Router } from 'express';
import { authController, agencyRepository, otpController, orgMemberInviteController, subscriptionRepository } from '@/composition-root.js';
import { uploadRegisterProfileImage } from '@/middlewares/upload-profile-image';
import authenticateJWT from '@/middlewares/authenticate-jwt.js';
import optionalAuthenticateJWT from '@/middlewares/optional-authenticate-jwt.js';
import { env } from '@/env.js';

const router = Router();

router.post('/login', authController.login.bind(authController));

router.get(
  '/org-member-invite',
  orgMemberInviteController.preview.bind(orgMemberInviteController),
);
router.post(
  '/org-member-invite/accept',
  optionalAuthenticateJWT,
  orgMemberInviteController.accept.bind(orgMemberInviteController),
);

/**
 * Agency names for the PR sign-up wizard. Public by necessity: a PR choosing
 * an agency has no account yet, and `GET /agency` sits below the JWT guard
 * (router/v1.ts:32). Deliberately narrow — only ACTIVE agencies.
 *
 * `logoImage` = R2 key `agency/{id}/logo/…`
 * `logoUrl`   = same-origin proxy `/auth/agencies/:id/logo` (phone Image can
 *               reach the API LAN host; CDN hosts often fail on device).
 */
router.get('/agencies', async (req, res) => {
  try {
    const rows = await agencyRepository.listActiveNames(200);
    const r2PublicUrl = env.R2_PUBLIC_URL?.replace(/\/$/, '') ?? null;
    const origin = `${req.protocol}://${req.get('host')}`;
    const basePath = req.baseUrl; // `/api/v1/auth`
    const data = rows.map((a) => ({
      id: a.id,
      name: a.name,
      logoImage: a.logoImage,
      logoUrl: a.logoImage
        ? `${origin}${basePath}/agencies/${a.id}/logo`
        : null,
    }));
    res.status(200).json({
      success: true,
      message: 'OK',
      data,
      r2PublicUrl,
    });
  } catch {
    res.status(500).json({ success: false, message: 'Could not list agencies', data: null });
  }
});

/**
 * Stream an active agency's logo through this API so mobile RN Image loads
 * from the same host as `/auth/agencies` (not directly from the CDN).
 */
router.get('/agencies/:id/logo', async (req, res) => {
  try {
    const id = String(req.params.id ?? '');
    const agency = await agencyRepository.getById(id);
    if (!agency || agency.status !== 'active' || !agency.logoImage) {
      return res.status(404).end();
    }
    const cdnBase = env.R2_PUBLIC_URL?.replace(/\/$/, '');
    if (!cdnBase) return res.status(503).end();
    const key = agency.logoImage.replace(/^\//, '');
    const upstream = await fetch(`${cdnBase}/${key}`);
    if (!upstream.ok) {
      return res.status(upstream.status === 404 ? 404 : 502).end();
    }
    const contentType = upstream.headers.get('content-type') || 'image/jpeg';
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=600');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    return res.status(200).send(buf);
  } catch {
    return res.status(500).end();
  }
});

/**
 * Package enrollment for outlet/agency signup — active PLAN rows from
 * `main.subscription` (real catalog UUIDs). Not the old marketing slug ids.
 */
router.get('/signup-packages', async (req, res) => {
  try {
    const accountType = String(req.query.accountType ?? '');
    if (accountType !== 'agency' && accountType !== 'outlet') {
      return res.status(400).json({
        success: false,
        message: 'accountType must be agency or outlet',
        data: null,
      });
    }
    const plans = await subscriptionRepository.listSignupPlans(accountType);
    const data = plans.map((p) => ({
      id: p.id,
      name: p.name,
      price: p.price,
      billingCycle: p.billingCycle,
      coverage: p.coverage,
      subscriptionType: p.subscriptionType,
    }));
    res.status(200).json({ success: true, message: 'OK', data });
  } catch {
    res.status(500).json({ success: false, message: 'Could not list packages', data: null });
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
router.post(
  '/register/check',
  authController.checkRegisterAvailability.bind(authController),
);
router.post('/register', optionalAuthenticateJWT, (req, res, next) => {
  uploadRegisterProfileImage.single('profileImage')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, message: err.message, data: null });
    }
    next();
  });
}, authController.registerUser.bind(authController));

export default router;
