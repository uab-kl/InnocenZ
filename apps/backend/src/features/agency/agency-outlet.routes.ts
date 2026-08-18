import { Router } from 'express';
import { agencyOutletController } from '@/composition-root.js';
import { requireRole } from '@/middlewares/require-role.js';

const router = Router();

/**
 * Agency ↔ outlet linking.
 *
 * Two lanes that never cross:
 *   /mine    — the OUTLET's view: which agencies I work with / want to
 *   /links   — the AGENCY's view: which venues work with me / are asking to
 *
 * Both derive the caller's org from the session, so neither takes an org id in
 * the URL and neither can be pointed at somebody else's. `:outletId` on the
 * agency lane names the venue being decided about; the deciding agency always
 * comes from the token.
 */

// ── OUTLET LANE ──────────────────────────────────────────────────────────────
// `outlet` only. Admin is deliberately excluded rather than waved through:
// these routes resolve "my venue" from the caller's own outlet memberships and
// an admin has none, so `isOutletCaller` is false for them and they would get a
// confusing 403 from inside the controller. Admin-side linking, if ever wanted,
// belongs on its own explicit route that names the outlet — not on `/mine`.
const canManageOwnLinks = requireRole('outlet');

// The choices a venue may pick from. Kept adjacent to `/mine` so the outlet
// lane reads in the order the screen uses it: list the options, then read and
// save this venue's own selection.
router.get(
  '/directory',
  canManageOwnLinks,
  agencyOutletController.directory.bind(agencyOutletController),
);
router.get('/mine', canManageOwnLinks, agencyOutletController.listMine.bind(agencyOutletController));
router.put('/mine', canManageOwnLinks, agencyOutletController.syncMine.bind(agencyOutletController));

// ── ADMIN LANE ───────────────────────────────────────────────────────────────
// Reads ANY venue's links by id, so it is admin-only. Mounted before the agency
// lane's `/links/:outletId` purely for readability — the two prefixes (`/outlet`
// vs `/links`) cannot shadow each other.
router.get(
  '/outlet/:outletId',
  requireRole('admin'),
  agencyOutletController.listForOutlet.bind(agencyOutletController),
);

// ── AGENCY LANE ──────────────────────────────────────────────────────────────
// `agency` only. An outlet must not read this: it would enumerate which OTHER
// venues an agency serves — the agency's commercial information, and none of
// the venue's business.
const canDecideLinks = requireRole('agency');

router.get(
  '/links',
  canDecideLinks,
  agencyOutletController.listForMyAgency.bind(agencyOutletController),
);
// Declared BEFORE `/links/:outletId` — Express matches in declaration order, so
// a bare `:outletId` listed first would happily swallow the literal segment
// "history" as an outlet id and 404 with nothing to explain why.
router.get(
  '/links/:outletId/history',
  canDecideLinks,
  agencyOutletController.history.bind(agencyOutletController),
);
router.patch(
  '/links/:outletId',
  canDecideLinks,
  agencyOutletController.decide.bind(agencyOutletController),
);
// DELETE by verb, `ended` by effect (0127): the row survives, carrying the
// history of a partnership that really happened. See the controller.
router.delete(
  '/links/:outletId',
  canDecideLinks,
  agencyOutletController.unlink.bind(agencyOutletController),
);

export default router;
