import { Router } from 'express';
import { authController, agencyRepository, otpController, orgMemberInviteController, outletRepository, subscriptionRepository } from '@/composition-root.js';
import { uploadRegisterProfileImage } from '@/middlewares/upload-profile-image';
import authenticateJWT from '@/middlewares/authenticate-jwt.js';
import optionalAuthenticateJWT from '@/middlewares/optional-authenticate-jwt.js';
import { env } from '@/env.js';
import {
  forgotPasswordLimiter,
  forgotPasswordPerEmailLimiter,
  loginLimiter,
  otpSendLimiter,
  otpSendPerPhoneLimiter,
  otpVerifyLimiter,
  otpVerifyPerPhoneLimiter,
  registerCheckLimiter,
  registerLimiter,
  resetPasswordLimiter,
} from '@/middlewares/rate-limit.js';

const router = Router();

router.post('/login', loginLimiter, authController.login.bind(authController));

/*
 * The endpoint the refresh token was minted for and never had. Rate-limited
 * like login: it is an unauthenticated POST that issues a credential, which is
 * the same shape, and `loginLimiter` is deliberately generous enough for a
 * venue's staff behind one NAT address.
 */
router.post('/refresh', loginLimiter, authController.refresh.bind(authController));

router.get(
  '/org-member-invite',
  orgMemberInviteController.preview.bind(orgMemberInviteController),
);
router.post(
  '/org-member-invite/accept',
  /*
   * Still `optional`, even though `accept` now REQUIRES a session and 401s
   * without one. The difference matters for the message: a hard guard here
   * would answer a bare "Unauthorized" to somebody arriving from the emailed
   * link, while the handler can say what to actually do — sign in first,
   * because invitations only go to accounts that already exist.
   */
  optionalAuthenticateJWT,
  orgMemberInviteController.accept.bind(orgMemberInviteController),
);

/**
 * ASK TO JOIN ANOTHER ORGANISATION — the third way onto a team.
 *
 * ⚠️ `authenticateJWT`, NOT `optional`. Accept is optional-auth so it can
 * explain itself to somebody arriving cold from an email; this endpoint has no
 * such reader — it is only ever reached from inside the app by somebody who is
 * already signed in, and WHO is asking is the one thing it must not take from
 * the body. A hard guard is the honest shape here.
 *
 * It grants nothing: the row is written `pending`, which every scope resolver
 * and role guard reads as no access at all. Only an owner approving it, through
 * `updateMember`, turns it into access.
 */
router.post(
  '/org-join-request',
  authenticateJWT,
  orgMemberInviteController.requestJoin.bind(orgMemberInviteController),
);

/**
 * The invitations waiting for the signed-in person — the profile-settings
 * panel. `/mine`: the email comes from the session, never the request.
 */
router.get(
  '/org-member-invite/mine',
  authenticateJWT,
  orgMemberInviteController.listMine.bind(orgMemberInviteController),
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
  otpSendLimiter,
  otpSendPerPhoneLimiter,
  optionalAuthenticateJWT,
  otpController.send.bind(otpController),
);
// Limited like /otp/send above — verify was the ONLY auth endpoint with no
// limiter, and it is the one whose success mints a password-reset proof.
router.post(
  '/otp/verify',
  otpVerifyLimiter,
  otpVerifyPerPhoneLimiter,
  otpController.verify.bind(otpController),
);

/**
 * Rate limits run BEFORE the handler, so a throttled caller never reaches the
 * account lookup. That ordering is what keeps the neutral "if that email is
 * registered…" answer meaningful: the limiter must not become the side channel
 * that the response body carefully avoids being.
 */
router.post(
  '/forgot-password',
  forgotPasswordLimiter,
  forgotPasswordPerEmailLimiter,
  authController.forgotPassword.bind(authController),
);
router.post(
  '/reset-password',
  resetPasswordLimiter,
  authController.resetPassword.bind(authController),
);
/** PR mobile: reset password with WhatsApp OTP receipt (purpose=forgot_password). */
router.post(
  '/password/reset-otp',
  resetPasswordLimiter,
  authController.resetPasswordWithOtp.bind(authController),
);
router.get('/me', authenticateJWT, authController.me.bind(authController));
/**
 * Remember the caller's UI language, so the pick survives sign-out and follows
 * the account to another device. Takes no user id — the controller reads it off
 * the verified token — so this is self-only and needs no role guard.
 */
router.patch(
  '/me/locale',
  authenticateJWT,
  authController.updateLocale.bind(authController),
);
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
  // An existence oracle with no account and, until now, no limit.
  registerCheckLimiter,
  authController.checkRegisterAvailability.bind(authController),
);
/*
 * The limiter runs BEFORE multer, so a throttled caller never gets their
 * profile photo parsed and written. Putting it after the upload would hand the
 * expensive half away for free.
 */
router.post('/register', registerLimiter, optionalAuthenticateJWT, (req, res, next) => {
  uploadRegisterProfileImage.single('profileImage')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, message: err.message, data: null });
    }
    next();
  });
}, authController.registerUser.bind(authController));

/**
 * Active VENUES for the member sign-up picker — the twin of `/agencies` above,
 * and public for the same stated reason: somebody choosing which venue to ask
 * to join has no account yet. Deliberately narrower than the agency list —
 * id and name only, no logo, no address, no contacts.
 */
router.get('/outlets', async (_req, res) => {
  try {
    const rows = await outletRepository.listActiveNames(200);
    return res.status(200).json({ success: true, message: 'OK', data: rows });
  } catch {
    return res
      .status(500)
      .json({ success: false, message: 'Could not load venues', data: [] });
  }
});

/**
 * PUBLIC team-member sign-up. Creates a person, and optionally a PENDING
 * request to join one organisation — never a role. See
 * `OrgMemberInviteController.registerMember` for why that makes a public
 * endpoint safe.
 */
router.post(
  '/register-member',
  // Before multer, for the same reason as `/register`. This one also writes a
  // PENDING JOIN REQUEST against a named organisation, which lands in that
  // owner's approvals queue — so an unlimited version floods a real person.
  registerLimiter,
  /*
   * MULTIPART, like `/register` above — the form carries a profile photo, and
   * a team member's face is the one thing that lets an owner recognise who
   * they are admitting to their organisation. Multer puts the file on
   * `req.file` and every other field on `req.body` as a STRING, which is why
   * the handler re-parses `join`.
   */
  (req, res, next) => {
    uploadRegisterProfileImage.single('profileImage')(req, res, (err) => {
      if (err) {
        return res
          .status(400)
          .json({ success: false, message: err.message, data: null });
      }
      next();
    });
  },
  orgMemberInviteController.registerMember.bind(orgMemberInviteController),
);

export default router;
