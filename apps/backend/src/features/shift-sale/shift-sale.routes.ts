import { Router } from 'express';
import { shiftSaleController } from '@/composition-root.js';
import { requireRole } from '@/middlewares/require-role.js';
import {
  requireAgencyPermissionIfNotOutletMember,
  requireOutletPermissionIfMember,
} from '@/middlewares/require-sub-role.js';

const router = Router();

// Outlets log the floor sales their PRs generate and read their own reports;
// agencies and admins see the same data for the shifts they own. The controller
// pins every caller to its own org, so the shared role never widens visibility.
const canRead = requireRole('admin', 'agency', 'outlet');
const canWrite = requireRole('admin', 'agency', 'outlet');

// /report before the collection routes so it is matched as a literal path.
router.get('/report', canRead, shiftSaleController.report.bind(shiftSaleController));
router.get('/', canRead, shiftSaleController.list.bind(shiftSaleController));
// Logging sales is outletCan('logSales') = `sales:create` for a venue member.
// Agencies share this route and hold no outlet membership, so that check
// refines outlet members only rather than excluding them — and until 28 Sep
// 2026 NOTHING judged the agency caller, so a view-only Director could log a
// PR's floor sales. The second guard asks the lane the caller holds at the
// agency the request acts for (the same agency the handler credits). There is
// no agency `sales` module, so it asks `payment_voucher:create` — the grant the
// agency portal already uses for recording money (`raisePv`): owner, guarantor
// and finance, never director.
router.post(
  '/',
  canWrite,
  requireOutletPermissionIfMember('sales', 'create'),
  requireAgencyPermissionIfNotOutletMember('payment_voucher', 'create'),
  shiftSaleController.create.bind(shiftSaleController),
);

export default router;
