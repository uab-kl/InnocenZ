import { Router, type Request, type Response, type NextFunction } from 'express';
import { userController } from '@/composition-root.js';
import { requireRole } from '@/middlewares/require-role.js';
import { uploadProfileImage } from '@/middlewares/upload-profile-image';
import { uploadPortfolioImage } from '@/middlewares/upload-portfolio-image';
import { uploadComcardImage } from '@/middlewares/upload-comcard-image';
import { redactIdentityDocsForOutlet } from '@/middlewares/redact-identity-docs';

const router = Router();

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
// Disabling an account is the one thing nobody could do — `PATCH /:id` below is
// self-edit only, and there is no delete route anywhere, so an account (admin
// included) was permanent once created. Registered BEFORE '/:id' so "status" is
// never read as a user id. Admin only, and login already refuses a non-active
// account, so this switch bites the moment it is thrown.
router.patch('/:id/status', requireRole('admin'), userController.setStatus.bind(userController));
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
