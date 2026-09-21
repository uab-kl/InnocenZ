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
  otpSendPerEmailLimiter,
  otpSendPerPhoneLimiter,
  otpVerifyLimiter,
  otpVerifyPerPhoneLimiter,
  registerCheckLimiter,
  registerLimiter,
  resetPasswordLimiter,
} from '@/middlewares/rate-limit.js';
import {
  contactChangeController,
  forgotPasswordController,
  passwordChangeController,
} from '@/features/account-code/index.js';
import {
  contactChangeCheckUserLimiter,
  contactChangePasswordUserLimiter,
  contactChangeSendUserLimiter,
  forgotCompleteIpLimiter,
  forgotStartIdentifierLimiter,
  forgotStartIpLimiter,
  passwordChangeCheckUserLimiter,
  passwordChangeSendUserLimiter,
  passwordChangeUserLimiter,
} from '@/features/account-code/limiters.js';

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
 * OTP send/verify — purpose=signup|forgot_password only. `change_phone` is no
 * longer accepted (see /contact-change/*), and the account-code purposes never
 * were. optionalAuthenticateJWT stays so a signed-in caller is still attributed
 * as the row's actor.
 *
 * ⚠️ Since 21 Sep 2026 `send` takes an OPTIONAL `email` and puts the SAME code
 * on WhatsApp, SMS and that address. `otpSendPerEmailLimiter` is stacked for
 * it: this endpoint is public and unauthenticated, so the recipient is the one
 * dimension an attacker cannot rotate, and it is the one that must be bounded.
 * The per-IP and per-phone budgets do not bound a victim's inbox.
 */
router.post(
  '/otp/send',
  otpSendLimiter,
  otpSendPerPhoneLimiter,
  otpSendPerEmailLimiter,
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
/**
 * LEGACY PR-app reset with a WhatsApp OTP receipt (purpose=forgot_password).
 * Restricted to accounts whose ONLY role is PR — everyone else is told to use
 * the code flow below, which sends to every contact on file.
 */
router.post(
  '/password/reset-otp',
  resetPasswordLimiter,
  authController.resetPasswordWithOtp.bind(authController),
);

/**
 * FORGOT PASSWORD BY CODE — logged out, every role, web and app. One code by
 * WhatsApp + SMS to the phone on file and by email to the email on file. The
 * limiters run BEFORE the lookup, so throttling cannot leak what the neutral
 * answer hides. See features/account-code/forgot-password.controller.ts.
 */
router.post(
  '/password/forgot/start',
  forgotStartIpLimiter,
  forgotStartIdentifierLimiter,
  forgotPasswordController.start.bind(forgotPasswordController),
);
router.post(
  '/password/forgot/complete',
  forgotCompleteIpLimiter,
  forgotPasswordController.complete.bind(forgotPasswordController),
);

/**
 * CHANGE SIGN-IN EMAIL / PHONE — signed in, every role. authenticateJWT FIRST,
 * so the per-user limiters key on the verified account; the shared per-IP OTP
 * limiters stack on top. See features/account-code/contact-change.controller.ts.
 */
router.post(
  '/contact-change/start',
  authenticateJWT,
  // The PASSWORD budget, not the send budget — see limiters.ts for why a wrong
  // password must not spend the owner's codes.
  contactChangePasswordUserLimiter,
  otpSendLimiter,
  contactChangeController.start.bind(contactChangeController),
);
router.post(
  '/contact-change/resend',
  authenticateJWT,
  contactChangeSendUserLimiter,
  otpSendLimiter,
  contactChangeController.resend.bind(contactChangeController),
);
router.post(
  '/contact-change/confirm',
  authenticateJWT,
  contactChangeCheckUserLimiter,
  otpVerifyLimiter,
  contactChangeController.confirm.bind(contactChangeController),
);
/*
 * The two-code change's `/verify-identity` and `/resend-new` are GONE, not
 * retired behind a message (owner, 21 Sep 2026: "no error page no show this").
 * Both clients ship in this same change and neither calls them, so there is
 * nothing left to tell.
 */

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
/**
 * SIGNED-IN PASSWORD CHANGE — two steps and a code (owner, 21 Sep 2026:
 * "Current password + a code"). `start` takes the current password and sends
 * ONE code to the phone AND the email on file; `confirm` writes the new
 * password, cuts every other session and re-issues the caller's token pair.
 * authenticateJWT FIRST, so the per-user limiters key on the verified account;
 * the shared per-IP OTP limiters stack on top.
 *
 * ⚠️ The one-step `POST /auth/password/change` is GONE, not retired behind a
 * message (owner: "no error page no show this"). Both clients ship in this same
 * change and neither calls it, so there is nothing left to tell.
 */
router.post(
  '/password/change/start',
  authenticateJWT,
  // The PASSWORD budget, not the send budget — see limiters.ts for why a wrong
  // password must not spend the owner's codes.
  passwordChangeUserLimiter,
  otpSendLimiter,
  passwordChangeController.start.bind(passwordChangeController),
);
router.post(
  '/password/change/resend',
  authenticateJWT,
  passwordChangeSendUserLimiter,
  otpSendLimiter,
  passwordChangeController.resend.bind(passwordChangeController),
);
router.post(
  '/password/change/confirm',
  authenticateJWT,
  passwordChangeCheckUserLimiter,
  otpVerifyLimiter,
  passwordChangeController.confirm.bind(passwordChangeController),
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
