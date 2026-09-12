import { Router } from 'express';
import { paymentMethodController } from '@/composition-root.js';
import { requireAdmin, requireRole } from '@/middlewares/require-role.js';
import { orgOwnerPaysOnly } from '@/middlewares/require-sub-role.js';

const router = Router();

/**
 * A subscriber's OWN card. Not behind requireAdmin — the venue/agency is asking
 * about itself — and the owner is resolved from the session, so no organisation
 * id is accepted from the body. `/mine` sits before the admin list for the same
 * reason it does on admin-request: a literal path must not be shadowed.
 */
/*
 * ⚠️ `requirePermission`, not `requireRole` alone — READING the card is now as
 * restricted as replacing it.
 *
 * Owner, 11 Sep 2026: "only the owner can make payment and SEE the payment
 * method in the organisation." The portals were changed to hide the section
 * from anyone without `settings:update`, but this endpoint still answered every
 * member, so the brand, last four, expiry and holder were one fetch away from
 * somebody the screen deliberately hides them from. A UI-only rule is not a
 * rule.
 *
 * ⚠️ THE OWNER ALONE — not the guarantor, who passes every OTHER owner gate.
 *
 * Owner, 12 Sep 2026: "guarantor no payment made like other member just see
 * paid and unpaid, owner make payment fpx and the payment method continue."
 * So the stand-in reads which invoices are settled, like any member, and never
 * sees or replaces the instrument the organisation pays with.
 *
 * This was `requirePermission('settings','update')`, which is owner AND
 * guarantor on both portals — right for the org's address, wrong for its
 * money. `orgOwnerPaysOnly` asks per portal and passes `foldGuarantor: false`,
 * so it is the one gate that draws the line the owner drew.
 */
router.get(
  '/mine',
  requireRole('outlet', 'agency', 'admin'),
  orgOwnerPaysOnly,
  paymentMethodController.getMine.bind(paymentMethodController),
);
/**
 * The FPX bank roster for the picker. Any signed-in payer may read it — it is a
 * public list of banks, not anyone's data.
 */
router.get(
  '/banks',
  requireRole('outlet', 'agency', 'admin'),
  paymentMethodController.banks.bind(paymentMethodController),
);
/** The e-wallet roster, on the same terms as `/banks`: a public list, not data. */
router.get(
  '/wallets',
  requireRole('outlet', 'agency', 'admin'),
  paymentMethodController.wallets.bind(paymentMethodController),
);
/** Every rail the org holds — same reading rule as `/mine` above. */
router.get(
  '/mine/all',
  requireRole('outlet', 'agency', 'admin'),
  orgOwnerPaysOnly,
  paymentMethodController.listMine.bind(paymentMethodController),
);
router.put(
  '/mine',
  requireRole('outlet', 'agency', 'admin'),
  // The org billing method is a settings write. requireRole alone admitted any
  // member of either portal, so a view-only Director could replace it. The
  // module is seeded on BOTH portals and userHasPermission resolves each
  // caller against their own, so one guard covers agency and outlet correctly.
  orgOwnerPaysOnly,
  paymentMethodController.upsertMine.bind(paymentMethodController),
);
// Choosing which instrument is charged, and retiring one, are the same class of
// settings write as saving one — same guard, deliberately.
router.put(
  '/mine/:id/default',
  requireRole('outlet', 'agency', 'admin'),
  orgOwnerPaysOnly,
  paymentMethodController.setDefaultMine.bind(paymentMethodController),
);
router.delete(
  '/mine/:id',
  requireRole('outlet', 'agency', 'admin'),
  orgOwnerPaysOnly,
  paymentMethodController.removeMine.bind(paymentMethodController),
);

router.get('/', requireAdmin, paymentMethodController.list.bind(paymentMethodController));

export default router;
