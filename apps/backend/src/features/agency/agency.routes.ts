import { Router } from 'express';
import { agencyController } from '@/composition-root.js';
import { requireAdmin } from '@/middlewares/require-role.js';

const router = Router();

router.get('/', agencyController.list.bind(agencyController));
router.get('/memberships', agencyController.listMemberships.bind(agencyController));
// Before '/:id' so the literal path is not captured as an agency id.
router.get('/pr-links', agencyController.listPrLinks.bind(agencyController));
router.get('/:id', agencyController.getById.bind(agencyController));
router.post('/', agencyController.create.bind(agencyController));
router.put('/:id', agencyController.update.bind(agencyController));
router.patch('/:id/approve', requireAdmin, agencyController.approve.bind(agencyController));
router.patch('/:id/suspend', requireAdmin, agencyController.suspend.bind(agencyController));

router.get('/:id/prs', agencyController.listAgencyPrs.bind(agencyController));
router.get('/:id/members', agencyController.listMembers.bind(agencyController));
router.post('/:id/members', agencyController.addMember.bind(agencyController));
router.put('/:id/members/:memberId', agencyController.updateMember.bind(agencyController));
router.delete('/:id/members/:memberId', agencyController.removeMember.bind(agencyController));

export default router;
