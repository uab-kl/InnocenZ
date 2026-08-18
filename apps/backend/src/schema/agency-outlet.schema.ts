import { z } from 'zod';
import { agencyOutletApproveStatusValues } from '@/features/agency/agency-outlet.model';

/**
 * An outlet points its agency list at exactly this set.
 *
 * `agencyIds` is the WHOLE desired list, not a delta — the repository diffs it
 * against what exists, so an omitted id means "unlink". An empty array is legal
 * and means "no agencies": a venue may unlink from everyone, it simply cannot
 * then post a shift.
 *
 * `outletId` is optional and, when present, is still checked against the
 * caller's own venues server-side. It exists for operators who hold more than
 * one venue — never as a way to name someone else's.
 */
export const SyncOutletAgenciesSchema = z.object({
  outletId: z.string().uuid('Invalid outlet ID').optional(),
  agencyIds: z.array(z.string().uuid('Invalid agency ID')).max(50, 'Too many agencies'),
});

/**
 * The agency's decision on one venue's request to link.
 *
 * `pending` is deliberately NOT accepted: this endpoint exists to SETTLE a
 * request, and allowing a re-set to pending would let an agency silently undo a
 * decision the venue had already been told about.
 *
 * `ended` is refused too, for a different reason: ending is not a verdict on a
 * request, it is the close of a partnership already agreed. It keeps its own
 * route (`DELETE /links/:outletId`) so it cannot be reached by a client that
 * meant to reject and sent the wrong word — the two look almost the same to a
 * venue and mean opposite things about whether the agency ever said yes.
 */
export const DecideOutletLinkSchema = z.object({
  approveStatus: z.enum(['approved', 'rejected'] as const),
  rejectReason: z.string().trim().max(500).optional(),
});

/**
 * An agency ending a partnership. The body is optional in full.
 *
 * `reason` is free text kept on the EVENT, not on the link row — the row holds
 * the current state, the log holds how it got there. Nothing here names which
 * side ended it: the server fills that in from the authenticated lane, because
 * a caller able to set it could record the other side as the one who left.
 */
export const EndOutletLinkSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

/** Query filter for the Outlet-Linking tab. */
export const ListAgencyOutletLinksQuerySchema = z.object({
  approveStatus: z.enum(agencyOutletApproveStatusValues).optional(),
  search: z.string().trim().max(200).optional(),
});

export type SyncOutletAgenciesInput = z.infer<typeof SyncOutletAgenciesSchema>;
export type DecideOutletLinkInput = z.infer<typeof DecideOutletLinkSchema>;
export type EndOutletLinkInput = z.infer<typeof EndOutletLinkSchema>;
