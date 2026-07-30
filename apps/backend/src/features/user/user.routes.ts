import { Router, type Request, type Response, type NextFunction } from 'express';
import { userController } from '@/composition-root.js';
import { requireRole } from '@/middlewares/require-role.js';
import { uploadProfileImage } from '@/middlewares/upload-profile-image';
import { uploadPortfolioImage } from '@/middlewares/upload-portfolio-image';
import { uploadComcardImage } from '@/middlewares/upload-comcard-image';

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

router.get('', canListUsers, userController.list.bind(userController));
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

router.get('/:id', canReadUser, userController.getById.bind(userController));

export default router;
