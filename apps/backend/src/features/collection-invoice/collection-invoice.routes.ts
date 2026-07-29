import { Router } from 'express';
import { collectionInvoiceController } from '@/composition-root.js';
import { requireRole } from '@/middlewares/require-role.js';

const router = Router();

/**
 * Reading is open to all three org roles and scoped in the controller: an
 * agency sees its own receivables, an outlet sees what it has been billed
 * (drafts filtered out — those are not issued to anyone yet).
 */
router.get(
  '/',
  requireRole('admin', 'agency', 'outlet'),
  collectionInvoiceController.list.bind(collectionInvoiceController),
);

/**
 * Both transitions belong to the agency that raised the invoice. An outlet must
 * NOT be able to mark its own bill settled — that is the one party with an
 * interest in saying it was paid, and this app cannot check.
 */
const canManage = requireRole('admin', 'agency');

router.post('/:id/issue', canManage, collectionInvoiceController.issue.bind(collectionInvoiceController));
router.post('/:id/settle', canManage, collectionInvoiceController.settle.bind(collectionInvoiceController));

export default router;
