import { Router, type Request, type Response, type NextFunction } from 'express';
import { userController } from '@/composition-root.js';
import { requireRole } from '@/middlewares/require-role.js';
import { uploadProfileImage } from '@/middlewares/upload-profile-image';
import { uploadPortfolioImage } from '@/middlewares/upload-portfolio-image';
import { uploadComcardImage } from '@/middlewares/upload-comcard-image';
import { uploadIdDoc } from '@/middlewares/upload-id-doc';
import { redactIdentityDocsForOutlet } from '@/middlewares/redact-identity-docs';

/** Explicit annotation — TS4023 if left inferred (nested express-serve-static-core). */
const router: ReturnType<typeof Router> = Router();

// ⚠️ MERGE NOTE, 31 Jul 2026. `origin/main` independently tightened this file to
// `requireAdmin` on both reads, with the rationale "the only callers are the
// admin portal's user-management tables". That is true of THAT branch and false
// of this one: `services/pr/prs.ts` feeds the outlet Today/History screens and
// the agency portal reads it for PR names, so admin-only blanks live screens for
// two roles. This side was live-verified on 30 Jul (outlet sees 0 of 17 rows
// carrying identity docs with all 17 names intact) and is the owner's decision
// D3, so it is kept — the redaction below is the narrowing jk's gate was
// reaching for, done as a response SHAPE rather than a gate. Raise it with jk
// rather than assuming: their tightening is deliberate work, not a stray edit.
//
// Enumerating user accounts is a staff function. A PR is excluded outright: it
// has no screen that lists other people, and on a PR token this route returned
// every account in the system until 30 Jul 2026.
//
// Outlet is NOT excluded even though it looks like it should be — the venue
// Today and History screens resolve PR display names through this list
// (use-outlet-today / use-outlet-history via services/pr/prs.ts), so gating to
// admin+agency alone would blank the names on two live outlet screens.
// Narrowing what a venue may read here is a shape-level job, not a gate.
const canListUsers = requireRole('admin', 'agency', 'outlet');

// ...and that shape-level job, decided 30 Jul 2026: an outlet keeps the list but
// loses the identity documents on every row of it. See redact-identity-docs.ts.
router.get('', canListUsers, redactIdentityDocsForOutlet, userController.list.bind(userController));
// The caller's own signature on file (migration 0111) — read and written with
// NO id in the path, so neither can be aimed at somebody else. Both sit BEFORE
// every `/:id` route below, or `me` is parsed as a user id and 404s.
//
// No role guard on purpose: this is the caller's own signature, and every role
// that signs anything needs it. The scope is the JWT, which is the strongest
// scope available here — an admin cannot read another person's signature
// through this route either, which is deliberate for a forgeable artefact.
router.get('/me/signature', userController.getMySignature.bind(userController));
router.put('/me/signature', userController.saveMySignature.bind(userController));

router.patch('/:id/status', requireRole('admin'), userController.setStatus.bind(userController));
// Self soft-delete (Play / App Store). POST avoids DELETE+body flakiness on mobile.
router.post('/:id/delete', userController.deleteOwnAccount.bind(userController));
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
/** Auto-build 2×2 portfolio comcard (same layout as Profile preview) → R2 + DB key. */
router.post('/:id/comcard/generate', userController.generateComcard.bind(userController));
router.post('/:id/id-photo/:side', (req, res, next) => {
  uploadIdDoc.single('idPhoto')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, message: err.message, data: null });
    }
    next();
  });
}, userController.uploadIdDoc.bind(userController));
// Reading your OWN record stays open to every role — this is the call mobile's
// profile screen makes for the signed-in PR. Reading someone else's is the same
// staff action as listing: until 30 Jul 2026 any account could fetch any other
// account's identity documents just by knowing its id.
const canReadUser = (req: Request, res: Response, next: NextFunction) =>
  req.user?.id === req.params.id ? next() : canListUsers(req, res, next);

// Own record is exempt from the redaction as well as from the gate — an outlet
// manager opening their OWN profile must still see their own IC. Skipping the
// middleware entirely (rather than letting it run and clear the flag) keeps the
// two exemptions expressed in one place.
const redactUnlessOwnRecord = (req: Request, res: Response, next: NextFunction) =>
  req.user?.id === req.params.id ? next() : redactIdentityDocsForOutlet(req, res, next);

router.get(
  '/:id',
  canReadUser,
  redactUnlessOwnRecord,
  userController.getById.bind(userController),
);

export default router;
