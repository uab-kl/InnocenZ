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
 * decision the venue had already been told about. Unlinking is a DELETE.
 */
export const DecideOutletLinkSchema = z.object({
  approveStatus: z.enum(['approved', 'rejected'] as const),
  rejectReason: z.string().trim().max(500).optional(),
});

/** Query filter for the Outlet-Linking tab. */
export const ListAgencyOutletLinksQuerySchema = z.object({
  approveStatus: z.enum(agencyOutletApproveStatusValues).optional(),
  search: z.string().trim().max(200).optional(),
});

export type SyncOutletAgenciesInput = z.infer<typeof SyncOutletAgenciesSchema>;
export type DecideOutletLinkInput = z.infer<typeof DecideOutletLinkSchema>;
