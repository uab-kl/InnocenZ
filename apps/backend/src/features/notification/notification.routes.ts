import { Router } from 'express';
import { notificationController } from '@/composition-root.js';

const router = Router();

/**
 * Every signed-in role has an inbox, so there is no requireRole here. What
 * keeps one user out of another's notifications is that no route on this
 * router accepts a user id — the controller reads req.user.id and the
 * repository puts it in the WHERE.
 *
 * Mounts BELOW authenticateJWT in router/v1.ts, so req.user is always set.
 */

// One segment, and it must precede any '/:id' route added later — otherwise
// "unread-count" gets read as a notification id.
router.get('/unread-count', notificationController.unreadCount.bind(notificationController));

router.get('/', notificationController.listMine.bind(notificationController));

router.post('/:id/read', notificationController.markRead.bind(notificationController));

export default router;
