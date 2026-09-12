import { Router } from 'express';
import { shiftSaleController } from '@/composition-root.js';
import { requireRole } from '@/middlewares/require-role.js';
import { requireOutletPermissionIfMember } from '@/middlewares/require-sub-role.js';

const router = Router();

// Outlets log the floor sales their PRs generate and read their own reports;
// agencies and admins see the same data for the shifts they own. The controller
// pins every caller to its own org, so the shared role never widens visibility.
const canRead = requireRole('admin', 'agency', 'outlet');
const canWrite = requireRole('admin', 'agency', 'outlet');

// /report before the collection routes so it is matched as a literal path.
router.get('/report', canRead, shiftSaleController.report.bind(shiftSaleController));
router.get('/', canRead, shiftSaleController.list.bind(shiftSaleController));
// Logging sales is outletCan('logSales'), which Outlet Finance does not hold.
// Agencies share this route and hold no outlet membership, so the sub-role check
// refines outlet members only rather than excluding them.
router.post('/', canWrite, requireOutletPermissionIfMember('sales', 'create'), shiftSaleController.create.bind(shiftSaleController));

export default router;
